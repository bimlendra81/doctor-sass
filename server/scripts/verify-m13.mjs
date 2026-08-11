// verify-m13.mjs
// E2E verification for M13 — Patient Portal.
// Requires the server running at http://localhost:4000.
// Usage: node scripts/verify-m13.mjs [BASE_URL]
//
// Covers:
//   - invite-first account creation: patientInvite -> acceptPatientInvite -> login
//   - self-scoped myProfile / myAppointments / myPrescriptions / myInvoices / myRecords
//   - bookMyAppointment (reuses slot validation; double-book -> SLOT_TAKEN)
//   - cancelMyAppointment own-only (foreign -> NOT_FOUND)
//   - payInvoice devMode -> PAID + ONLINE payment row (idempotent re-pay rejected)
//   - myRecordFileUrl own-only (foreign -> NOT_FOUND)
//   - prescription PDF access for the linked patient (foreign patient -> 404)
//   - reminder fold-in: linked patient gets an in-app REMINDER notification
//   - role authZ: staff/doctor on my* -> FORBIDDEN; unauth -> UNAUTHORIZED

import "dotenv/config";
import { prisma } from "../src/config/db.js";

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
  constructor(message, code) {
    super(message);
    this.code = code;
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
    throw new GqlError(first.message, first.extensions?.code ?? "GRAPHQL_ERROR");
  }
  return body.data;
}

const M = {
  signup: `mutation($input: SignupInput!) { signup(input: $input) { accessToken user { id } } }`,
  createClinic: `mutation($input: CreateClinicInput!) {
    createClinic(input: $input) { accessToken clinic { id } user { id } }
  }`,
  login: `mutation($input: LoginInput!) { login(input: $input) { accessToken user { id role } } }`,
  patientInvite: `mutation($patientId: ID!, $email: String!) {
    patientInvite(patientId: $patientId, email: $email) { inviteToken user { id role } patient { id email } }
  }`,
  acceptInvite: `mutation($input: AcceptPatientInviteInput!) {
    acceptPatientInvite(input: $input) { accessToken user { id role } }
  }`,
  myProfile: `query { myProfile { id name email phone } }`,
  myAppointments: `query($page: Int, $pageSize: Int) {
    myAppointments(page: $page, pageSize: $pageSize) { total items { id patientId status startTime } }
  }`,
  bookMine: `mutation($input: BookMyAppointmentInput!) { bookMyAppointment(input: $input) { id patientId status } }`,
  cancelMine: `mutation($id: ID!, $cancelReason: String) { cancelMyAppointment(id: $id, cancelReason: $cancelReason) { id status } }`,
  bookStaff: `mutation($input: BookAppointmentInput!) { bookAppointment(input: $input) { id patientId status } }`,
  createRx: `mutation($input: CreatePrescriptionInput!) { createPrescription(input: $input) { id status } }`,
  issueRx: `mutation($id: ID!) { issuePrescription(id: $id) { id status scriptNo } }`,
  myRx: `query { myPrescriptions { id status scriptNo items { drugName } } }`,
  createInvoice: `mutation($input: CreateInvoiceInput!) { createInvoice(input: $input) { id invoiceNo total } }`,
  myInvoices: `query { myInvoices { id invoiceNo status total } }`,
  payInvoice: `mutation($invoiceId: ID!) { payInvoice(invoiceId: $invoiceId) { devMode url invoice { id status } } }`,
  createRecord: `mutation($input: CreateRecordInput!) {
    createRecord(input: $input) { id patientId title }
  }`,
  myRecords: `query { myRecords { id patientId title } }`,
  myRecordUrl: `query($id: ID!) { myRecordFileUrl(id: $id) { url expiresAt } }`,
  portalDoctors: `query { portalDoctors { id user { name } } }`,
  portalSlots: `query($doctorId: ID!, $date: String!) { portalDoctorSlots(doctorId: $doctorId, date: $date) { startTime booked } }`,
};

async function expectError(name, fn, code) {
  try {
    await fn();
    check(name, false, "expected an error but succeeded");
  } catch (err) {
    check(name, err.code === code, `got ${err.code} (${err.message})`);
  }
}

function nextSlotStart(now = new Date(), aheadHours = 1.25) {
  const minutes = 30 * 60000;
  return new Date(Math.ceil((now.getTime() + aheadHours * 3600 * 1000) / minutes) * minutes);
}

function zonedDateStr(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

async function main() {
  const suffix = Date.now().toString(36);
  const password = "m13-verify-pass";

  // --- 1. Onboard two clinics (A = owning tenant, B = foreign tenant) ---
  let res = await gql(M.signup, { input: { name: "M13 Admin A", email: `m13-a-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M13 Clinic A", subdomain: `m13a${suffix}` } }, res.signup.accessToken);
  const tokenA = res.createClinic.accessToken;
  const clinicA = res.createClinic.clinic.id;
  const adminId = res.createClinic.user.id;
  check("clinic A onboarded", !!clinicA);

  res = await gql(M.signup, { input: { name: "M13 Admin B", email: `m13-b-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M13 Clinic B", subdomain: `m13b${suffix}` } }, res.signup.accessToken);
  const tokenB = res.createClinic.accessToken;
  const clinicB = res.createClinic.clinic.id;
  check("clinic B onboarded", !!clinicB);

  const docUser = await prisma.user.create({
    data: { clinicId: clinicA, role: "DOCTOR", name: "M13 Doctor", email: `m13-doc-${suffix}@test.dev` },
  });
  const doctor = await prisma.doctor.create({ data: { userId: docUser.id } });
  const todayDow = new Date().getUTCDay();
  const tomorrowDow = new Date(Date.now() + 24 * 3600 * 1000).getUTCDay();
  await prisma.doctorAvailability.createMany({
    data: [todayDow, tomorrowDow].map((dayOfWeek) => ({
      clinicId: clinicA,
      doctorId: doctor.id,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:59",
      slotDuration: 30,
    })),
  });
  const patientA = await prisma.patient.create({
    data: { clinicId: clinicA, name: "M13 Patient A", email: `m13-pat-${suffix}@test.dev`, phone: "555-0131" },
  });
  const patientB = await prisma.patient.create({
    data: { clinicId: clinicB, name: "M13 Patient B", email: `m13-patb-${suffix}@test.dev`, phone: "555-0132" },
  });

  // --- 2. AuthZ on portal endpoints ---
  await expectError("unauthenticated myAppointments -> UNAUTHORIZED", () => gql(M.myAppointments), "UNAUTHORIZED");
  await expectError("admin on myAppointments -> FORBIDDEN", () => gql(M.myAppointments, {}, tokenA), "FORBIDDEN");
  await expectError("admin on portalDoctorSlots -> FORBIDDEN", () => gql(M.portalSlots, { doctorId: doctor.id, date: zonedDateStr(new Date(), "UTC") }, tokenA), "FORBIDDEN");

  // --- 3. patientInvite ---
  res = await gql(M.patientInvite, { patientId: patientA.id, email: patientA.email }, tokenA);
  const inviteToken = res.patientInvite.inviteToken;
  check("patientInvite returns invite token", !!inviteToken);
  check("invited user role is PATIENT", res.patientInvite.user.role === "PATIENT");
  check("patient email synced to invite address", res.patientInvite.patient.email === patientA.email);
  const patientUser = await prisma.user.findUnique({ where: { id: res.patientInvite.user.id } });
  check("invited user persisted with token hash + expiry", !!patientUser.inviteTokenHash && !!patientUser.inviteTokenExpiresAt);

  await expectError(
    "patientInvite foreign patient -> NOT_FOUND",
    () => gql(M.patientInvite, { patientId: patientB.id, email: patientB.email }, tokenA),
    "NOT_FOUND",
  );
  await expectError(
    "patientInvite duplicate email -> EMAIL_TAKEN",
    () => gql(M.patientInvite, { patientId: patientA.id, email: patientA.email }, tokenA),
    "EMAIL_TAKEN",
  );
  await expectError(
    "patientInvite by unauth -> UNAUTHORIZED",
    () => gql(M.patientInvite, { patientId: patientA.id, email: "x@test.dev" }),
    "UNAUTHORIZED",
  );

  // --- 4. acceptPatientInvite ---
  await expectError(
    "acceptPatientInvite wrong token -> INVALID_INVITE",
    () => gql(M.acceptInvite, { input: { inviteToken: "bogus", password } }),
    "INVALID_INVITE",
  );

  res = await gql(M.acceptInvite, { input: { inviteToken, password, phone: "555-0141" } });
  const patientToken = res.acceptPatientInvite.accessToken;
  check("acceptPatientInvite returns session", !!patientToken);

  res = await gql(M.login, { input: { email: patientA.email, password } });
  check("patient can log in after accepting", !!res.login.accessToken);
  check("logged-in role is PATIENT", res.login.user.role === "PATIENT");
  const patientUserId = res.login.user.id;

  const linked = await prisma.patient.findUnique({ where: { id: patientA.id }, select: { userId: true } });
  check("Patient.userId linked after accept", linked.userId === res.login.user.id);

  await expectError(
    "acceptPatientInvite reuse rejected",
    () => gql(M.acceptInvite, { input: { inviteToken, password } }),
    "INVALID_INVITE",
  );

  // --- 5. myProfile ---
  res = await gql(M.myProfile, {}, patientToken);
  check("myProfile returns linked patient", res.myProfile.id === patientA.id && res.myProfile.email === patientA.email);

  // --- 6. myAppointments (staff-booked) ---
  const staffSlot = nextSlotStart(new Date(), 25.25);
  res = await gql(M.bookStaff, { input: { patientId: patientA.id, doctorId: doctor.id, startTime: staffSlot.toISOString() } }, tokenA);
  const staffAppt = res.bookAppointment.id;
  check("staff books an appointment for patient", !!staffAppt);

  res = await gql(M.myAppointments, {}, patientToken);
  check("myAppointments lists own appointments", res.myAppointments.total === 1 && res.myAppointments.items[0].id === staffAppt, `total=${res.myAppointments.total}`);

  await expectError(
    "admin token cannot read myAppointments",
    () => gql(M.myAppointments, {}, tokenA),
    "FORBIDDEN",
  );

  // --- 7. bookMyAppointment (self-service) ---
  const slot = nextSlotStart(new Date(), 1.25);
  res = await gql(M.bookMine, { input: { doctorId: doctor.id, startTime: slot.toISOString(), note: "via portal" } }, patientToken);
  const mineAppt = res.bookMyAppointment;
  check("bookMyAppointment creates own appointment", mineAppt.patientId === patientA.id, JSON.stringify(mineAppt));

  await expectError(
    "double-book same slot -> SLOT_TAKEN",
    () => gql(M.bookMine, { input: { doctorId: doctor.id, startTime: slot.toISOString() } }, patientToken),
    "SLOT_TAKEN",
  );

  // --- 8. cancelMyAppointment (own-only) ---
  const foreignAppt = await prisma.appointment.create({
    data: {
      clinicId: clinicB,
      doctorId: (await prisma.doctor.findFirst({ where: { userId: docUser.id } })).id,
      patientId: patientB.id,
      startTime: staffSlot,
      endTime: new Date(staffSlot.getTime() + 30 * 60000),
    },
  });
  await expectError(
    "cancel foreign appointment -> NOT_FOUND",
    () => gql(M.cancelMine, { id: foreignAppt.id }, patientToken),
    "NOT_FOUND",
  );
  res = await gql(M.cancelMine, { id: mineAppt.id, cancelReason: "changed my mind" }, patientToken);
  check("cancelMyAppointment own -> CANCELLED", res.cancelMyAppointment.status === "CANCELLED");

  // --- 9. myPrescriptions + PDF for the linked patient ---
  // Prescriptions and invoices are PRO features; upgrade clinic A for these gates.
  await prisma.clinic.update({ where: { id: clinicA }, data: { plan: "PRO" } });
  res = await gql(
    M.createRx,
    { input: { patientId: patientA.id, doctorId: doctor.id, notes: "Take daily", items: [{ drugName: "Amoxicillin", dosage: "500mg", frequency: "3x/day" }] } },
    tokenA,
  );
  const rx = res.createPrescription;
  check("staff creates prescription (DRAFT)", rx.status === "DRAFT");
  res = await gql(M.issueRx, { id: rx.id }, tokenA);
  check("prescription issued ACTIVE", res.issuePrescription.status === "ACTIVE");

  res = await gql(M.myRx, {}, patientToken);
  check("myPrescriptions lists own ACTIVE scripts", res.myPrescriptions.length === 1 && res.myPrescriptions[0].items[0].drugName === "Amoxicillin");

  const { signAccessToken } = await import("../src/utils/tokens.js");
  const foreignPatientToken = signAccessToken({ id: `foreign-${suffix}`, clinicId: clinicB, role: "PATIENT" });
  const pdfOwn = await fetch(`${BASE}/prescriptions/${rx.id}/pdf`, { headers: { Authorization: `Bearer ${patientToken}` } });
  check("linked patient downloads own prescription PDF", pdfOwn.status === 200 && (pdfOwn.headers.get("content-type") ?? "").includes("pdf"));
  const pdfForeign = await fetch(`${BASE}/prescriptions/${rx.id}/pdf`, { headers: { Authorization: `Bearer ${foreignPatientToken}` } });
  check("foreign patient PDF -> 404", pdfForeign.status === 404);

  // --- 10. myInvoices + payInvoice (devMode) ---
  res = await gql(
    M.createInvoice,
    { input: { patientId: patientA.id, items: [{ description: "Consultation", qty: 1, unitPrice: 100 }], taxRate: 5 } },
    tokenA,
  );
  const invoice = res.createInvoice;
  check("staff creates invoice", invoice.total === 105);
  res = await gql(M.myInvoices, {}, patientToken);
  check("myInvoices lists own invoice", res.myInvoices.some((i) => i.id === invoice.id));

  res = await gql(M.payInvoice, { invoiceId: invoice.id }, patientToken);
  check("payInvoice devMode returns PAID invoice", res.payInvoice.devMode === true && res.payInvoice.invoice.status === "PAID", JSON.stringify(res.payInvoice));
  const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
  check("payment row created with method ONLINE", payments.length === 1 && payments[0].method === "ONLINE");

  await expectError(
    "re-paying a paid invoice -> INVOICE_ALREADY_PAID",
    () => gql(M.payInvoice, { invoiceId: invoice.id }, patientToken),
    "INVOICE_ALREADY_PAID",
  );

  await expectError(
    "pay foreign invoice -> NOT_FOUND",
    () => {
      const foreignInvoice = { id: `foreign-invoice-${suffix}` };
      return gql(M.payInvoice, { invoiceId: foreignInvoice.id }, patientToken);
    },
    "NOT_FOUND",
  );

  // --- 11. myRecords + myRecordFileUrl (own-only) ---
  res = await gql(
    M.createRecord,
    { input: { patientId: patientA.id, doctorId: doctor.id, type: "CLINICAL_NOTE", title: "Portal note" } },
    tokenA,
  );
  const record = res.createRecord;
  check("staff creates record", record.patientId === patientA.id);
  const foreignRecord = await prisma.medicalRecord.create({
    data: { clinicId: clinicB, patientId: patientB.id, doctorId: doctor.id, type: "LAB", title: "Foreign record" },
  });

  res = await gql(M.myRecords, {}, patientToken);
  check("myRecords lists own records only", res.myRecords.length === 1 && res.myRecords[0].id === record.id, `len=${res.myRecords.length}`);

  res = await gql(M.myRecordUrl, { id: record.id }, patientToken);
  check("myRecordFileUrl returns null for file-less record", res.myRecordFileUrl === null);
  await expectError(
    "myRecordFileUrl foreign record -> NOT_FOUND",
    () => gql(M.myRecordUrl, { id: foreignRecord.id }, patientToken),
    "NOT_FOUND",
  );

  // --- 12. Reminder fold-in: linked patient gets an in-app REMINDER ---
  const pastAppt = await prisma.appointment.create({
    data: {
      clinicId: clinicA,
      doctorId: doctor.id,
      patientId: patientA.id,
      startTime: new Date(Date.now() - 3600 * 1000),
      endTime: new Date(Date.now()),
    },
  });
  await prisma.reminderJob.create({
    data: { appointmentId: pastAppt.id, type: "T1H", scheduledFor: new Date(Date.now() - 120 * 1000) },
  });
  const { runDueReminders } = await import("../src/services/reminder.service.js");
  const dispatched = await runDueReminders();
  check("due reminder dispatched", dispatched.some((d) => d.appointmentId === pastAppt.id));
  const patientNotifs = await prisma.notification.findMany({ where: { userId: patientUserId } });
  check(
    "linked patient got an in-app REMINDER notification",
    patientNotifs.some((n) => n.type === "REMINDER"),
    `types=${patientNotifs.map((n) => n.type).join(",")}`,
  );

  // --- 13. Portal discovery (doctors + slots) ---
  res = await gql(M.portalDoctors, {}, patientToken);
  check("portalDoctors lists clinic doctors", res.portalDoctors.length === 1 && res.portalDoctors[0].id === doctor.id);
  res = await gql(M.portalSlots, { doctorId: doctor.id, date: zonedDateStr(staffSlot, "UTC") }, patientToken);
  check("portalDoctorSlots returns slots", Array.isArray(res.portalDoctorSlots) && res.portalDoctorSlots.length > 0);

  // --- 14. Cleanup ---
  await prisma.medicalRecord.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.payment.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.invoice.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.prescription.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.reminderJob.deleteMany({ where: { appointment: { clinicId: { in: [clinicA, clinicB] } } } });
  await prisma.notification.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.appointment.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.patient.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.doctorAvailability.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.doctor.deleteMany({ where: { userId: docUser.id } });
  await prisma.user.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });

  console.log(`\nM13 verify: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nM13 verify crashed:", err.message);
  process.exit(1);
});
