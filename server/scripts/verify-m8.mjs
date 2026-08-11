// verify-m8.mjs
// E2E verification for M8 — E-Prescriptions.
// Requires the server running at http://localhost:4000.
// Usage: node scripts/verify-m8.mjs [BASE_URL]
//
// Covers:
//   - drugSearch autocomplete (Fuse.js over the shipped drug dict)
//   - createPrescription -> draft, updatePrescription (draft only), items round-trip
//   - issuePrescription -> ACTIVE with clinic-local scriptNo + issuedAt
//   - update/issue guards on non-draft prescriptions
//   - voidPrescription (with reason) skips the PDF
//   - GET /prescriptions/:id/pdf -> branded PDF, tenant-scoped (cross-clinic 404)
//   - authZ: unauthenticated + cross-tenant NOT_FOUND

const BASE = process.argv[2] ?? "http://localhost:4000";
const API = `${BASE}/graphql`;

let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.error(`  \u2717 ${name}${extra ? ` \u2014 ${extra}` : ""}`);
  }
}

class GqlError extends Error {
  constructor(message, code, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

async function gql(query, variables, token) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) {
    const first = body.errors[0];
    throw new GqlError(first.message, first.extensions?.code ?? "GRAPHQL_ERROR", body.data);
  }
  return body.data;
}

async function fetchPdf(id, token) {
  const res = await fetch(`${BASE}/prescriptions/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const contentType = res.headers.get("content-type") ?? "";
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, contentType, buf };
}

const M = {
  signup: `mutation($input: SignupInput!) { signup(input: $input) { accessToken refreshToken user { id role clinicId } } }`,
  createClinic: `mutation($input: CreateClinicInput!) {
    createClinic(input: $input) { accessToken refreshToken clinic { id } user { id role clinicId } }
  }`,
  createPatient: `mutation($input: CreatePatientInput!) { createPatient(input: $input) { id name dob } }`,
  invite: `mutation($input: InviteInput!) { inviteStaff(input: $input) { inviteToken } }`,
  acceptInvite: `mutation($input: AcceptInviteInput!) {
    acceptInvite(input: $input) { accessToken refreshToken user { id role clinicId } }
  }`,
  upsertProfile: `mutation($input: DoctorProfileInput!) { upsertDoctorProfile(input: $input) { id } }`,
  doctors: `query { doctors { id user { name } } }`,
  drugSearch: `query($q: String!) { drugSearch(q: $q) { id name category strength } }`,
  createRx: `mutation($input: CreatePrescriptionInput!) { createPrescription(input: $input) {
    id status scriptNo issuedAt notes items { id drugName dosage frequency quantity refills } } }`,
  updateRx: `mutation($id: ID!, $input: UpdatePrescriptionInput!) { updatePrescription(id: $id, input: $input) {
    id status notes items { id drugName dosage frequency } } }`,
  issueRx: `mutation($id: ID!) { issuePrescription(id: $id) { id status scriptNo issuedAt } }`,
  voidRx: `mutation($id: ID!, $reason: String!) { voidPrescription(id: $id, reason: $reason) {
    id status voidReason voidedAt } }`,
  getRx: `query($id: ID!) { prescription(id: $id) {
    id status scriptNo issuedAt notes voidReason patient { id name } doctor { id } items { drugName } } }`,
  listRx: `query($status: PrescriptionStatus) { prescriptions(status: $status) { id status } }`,
  login: `mutation($input: LoginInput!) { login(input: $input) { accessToken refreshToken user { id role clinicId } } }`,
  settings: `mutation($input: UpdateClinicSettingsInput!) { updateClinicSettings(input: $input) { settings { brandName contactPhone contactEmail currency timezone } } }`,
};

async function main() {
  const suffix = Date.now().toString(36);
  const password = "m8-verify-pass";

  // --- 1. Onboard clinic A (with branding, to check PDF letterhead) ---
  let res = await gql(M.signup, { input: { name: "M8 Admin", email: `m8-a-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M8 Clinic A", subdomain: `m8a${suffix}` } }, res.signup.accessToken);
  const tokenA = res.createClinic.accessToken;
  const clinicA = res.createClinic.clinic.id;
  check("clinic A onboarded", !!clinicA);

  await gql(
    M.settings,
    { input: { brandName: "M8 Clinic A & Co", contactEmail: "front@m8a.dev", contactPhone: "+15550001111", currency: "usd", timezone: "Asia/Kolkata" } },
    tokenA,
  );

  // --- 2. Drug autocomplete ---
  res = await gql(M.drugSearch, { q: "amox" }, tokenA);
  check("drugSearch('amox') returns amoxicillin", res.drugSearch.some((d) => d.name.toLowerCase().includes("amoxicillin")));
  check("drugSearch returns category + strength", res.drugSearch.length > 0 && res.drugSearch[0].category && res.drugSearch[0].strength);

  // --- 3. Patient + doctor for clinic A ---
  res = await gql(M.createPatient, { input: { name: "M8 Patient A", phone: "555-0201" } }, tokenA);
  const patientA = res.createPatient.id;
  check("patient A created", !!patientA);

  res = await gql(M.invite, { input: { name: "M8 Doc A", email: `m8-doca-${suffix}@test.dev`, role: "DOCTOR" } }, tokenA);
  res = await gql(M.acceptInvite, { input: { inviteToken: res.inviteStaff.inviteToken, name: "M8 Doc A", password } });
  const tokenDocA = res.acceptInvite.accessToken;
  await gql(M.upsertProfile, { input: { specialization: "Cardiology", licenseNo: "RX-LIC-0001" } }, tokenDocA);
  res = await gql(M.doctors, {}, tokenA);
  const doctorA = res.doctors[0].id;
  check("doctor A found", !!doctorA);

  // --- 4. Create draft ---
  res = await gql(
    M.createRx,
    {
      input: {
        patientId: patientA,
        doctorId: doctorA,
        notes: "Take with food.",
        items: [
          { drugName: "Amoxicillin", dosage: "500mg", frequency: "3x/day", duration: "7 days", quantity: 21, refills: 0 },
          { drugName: "Ibuprofen", dosage: "400mg", frequency: "PRN", quantity: 30, refills: 1 },
        ],
      },
    },
    tokenDocA,
  );
  const rx1 = res.createPrescription;
  check("createPrescription starts as DRAFT", rx1.status === "DRAFT");
  check("draft has no scriptNo/issuedAt", rx1.scriptNo === null && rx1.issuedAt === null);
  check("2 items created", rx1.items.length === 2);
  check("item fields round-trip", rx1.items[0].drugName === "Amoxicillin" && rx1.items[0].quantity === 21);

  // --- 5. Edit the draft ---
  res = await gql(
    M.updateRx,
    {
      id: rx1.id,
      input: {
        notes: "Take after food.",
        items: [
          { drugName: "Azithromycin", dosage: "250mg", frequency: "1x/day", duration: "3 days", quantity: 3, refills: 0 },
          { drugName: "Paracetamol (Acetaminophen)", dosage: "500mg", frequency: "PRN", quantity: 10, refills: 0 },
        ],
      },
    },
    tokenDocA,
  );
  const edited = res.updatePrescription;
  check("draft edit replaces items", edited.items.length === 2 && edited.items[0].drugName === "Azithromycin");
  check("draft edit persists notes", edited.notes === "Take after food.");

  // --- 6. Issue ---
  res = await gql(M.issueRx, { id: rx1.id }, tokenDocA);
  const issued = res.issuePrescription;
  check("issue -> ACTIVE", issued.status === "ACTIVE");
  check("issue stamps scriptNo", issued.scriptNo === 1);
  check("issue stamps issuedAt", !!issued.issuedAt);

  // --- 7. Guard: edit/issue/void after issue ---
  let editAfterIssue = false;
  try {
    await gql(M.updateRx, { id: rx1.id, input: { notes: "too late" } }, tokenDocA);
  } catch (err) {
    editAfterIssue = err.code === "INVALID_STATUS";
  }
  check("editing ACTIVE prescription rejected (INVALID_STATUS)", editAfterIssue);

  let reissue = false;
  try {
    await gql(M.issueRx, { id: rx1.id }, tokenDocA);
  } catch (err) {
    reissue = err.code === "INVALID_STATUS";
  }
  check("re-issuing ACTIVE rejected", reissue);

  // --- 8. PDF: tenant-scoped, branded, printable ---
  let pdf = await fetchPdf(rx1.id, tokenDocA);
  check("PDF 200 for clinic A doctor", pdf.status === 200);
  check("PDF content-type is application/pdf", pdf.contentType === "application/pdf", pdf.contentType);
  check("PDF starts with %PDF magic", pdf.buf.subarray(0, 4).toString() === "%PDF");
  check("PDF is non-trivial size", pdf.buf.length > 2000, `${pdf.buf.length} bytes`);

  // --- 9. Void flow (second prescription) skips PDF ---
  res = await gql(
    M.createRx,
    {
      input: {
        patientId: patientA,
        doctorId: doctorA,
        items: [{ drugName: "Metformin", dosage: "500mg", frequency: "2x/day", quantity: 60 }],
      },
    },
    tokenDocA,
  );
  const rx2 = res.createPrescription;
  res = await gql(M.voidRx, { id: rx2.id, reason: "Duplicate order" }, tokenDocA);
  check("void -> VOID with reason", res.voidPrescription.status === "VOID" && res.voidPrescription.voidReason === "Duplicate order");

  pdf = await fetchPdf(rx2.id, tokenDocA);
  check("voided prescription has no PDF (404)", pdf.status === 404);

  let doubleVoid = false;
  try {
    await gql(M.voidRx, { id: rx2.id, reason: "again" }, tokenDocA);
  } catch (err) {
    doubleVoid = err.code === "INVALID_STATUS";
  }
  check("re-voiding rejected", doubleVoid);

  // --- 10. Cross-tenant isolation ---
  res = await gql(M.signup, { input: { name: "M8 Admin B", email: `m8-b-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M8 Clinic B", subdomain: `m8b${suffix}` } }, res.signup.accessToken);
  const tokenB = res.createClinic.accessToken;
  check("clinic B onboarded", !!res.createClinic.clinic.id);

  let crossTenant = false;
  try {
    await gql(M.getRx, { id: rx1.id }, tokenB);
  } catch (err) {
    crossTenant = err.code === "NOT_FOUND";
  }
  check("cross-clinic prescription(id) -> NOT_FOUND", crossTenant);

  pdf = await fetchPdf(rx1.id, tokenB);
  check("cross-clinic PDF -> 404", pdf.status === 404);

  // --- 11. AuthZ + listing ---
  let anonSearch = false;
  try {
    await gql(M.drugSearch, { q: "amox" });
  } catch (err) {
    anonSearch = err.code === "UNAUTHORIZED";
  }
  check("unauthenticated drugSearch -> UNAUTHORIZED", anonSearch);

  let anonPdf = await fetchPdf(rx1.id);
  check("unauthenticated PDF -> 401", anonPdf.status === 401);

  res = await gql(M.listRx, { status: "ACTIVE" }, tokenA);
  check("listPrescriptions(status: ACTIVE) returns rx1", res.prescriptions.length === 1 && res.prescriptions[0].id === rx1.id);

  res = await gql(M.listRx, {}, tokenB);
  check("clinic B sees no prescriptions", res.prescriptions.length === 0);

  res = await gql(M.getRx, { id: rx1.id }, tokenDocA);
  check("prescription(id) returns patient + items", res.prescription.patient.id === patientA && res.prescription.items.length === 2);

  // --- 12. Validation ---
  let noItems = false;
  try {
    await gql(M.createRx, { input: { patientId: patientA, doctorId: doctorA, items: [] } }, tokenDocA);
  } catch (err) {
    noItems = err.code === "VALIDATION_ERROR";
  }
  check("empty items rejected (VALIDATION_ERROR)", noItems);

  let crossPatient = false;
  try {
    await gql(
      M.createRx,
      { input: { patientId: "does-not-exist", doctorId: doctorA, items: [{ drugName: "Aspirin" }] } },
      tokenDocA,
    );
  } catch (err) {
    crossPatient = err.code === "NOT_FOUND";
  }
  check("unknown patient -> NOT_FOUND", crossPatient);

  console.log(`\nM8 verify: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nM8 verify crashed:", err.message);
  process.exit(1);
});
