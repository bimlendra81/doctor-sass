// verify-m12.mjs
// E2E verification for M12 — Medical Records & Documents.
// Requires the server running at http://localhost:4000.
// Usage: node scripts/verify-m12.mjs [BASE_URL]
//
// Covers:
//   - recordUploadUrl contract (url/method/fileKey/expiresAt; local driver URL is
//     relative and includes an expiry window)
//   - authenticated PUT upload to /files, then createRecord metadata + fileExists check
//   - createRecord without a file (text-only record)
//   - mime-type allowlist + sizeBytes cap validation
//   - records query (patientId filter, type filter, pagination)
//   - recordFileUrl -> authenticated GET download, bytes match upload
//   - URL expiry (URL_EXPIRED) + path traversal guard (INVALID_KEY)
//   - cross-clinic isolation (NOT_FOUND) and patient-role authZ (FORBIDDEN)
//   - updateRecord (title/notes only) and deleteRecord soft-delete + file cleanup

import "dotenv/config";
import path from "path";
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
  uploadUrl: `mutation($patientId: ID!, $fileName: String!, $mimeType: String!) {
    recordUploadUrl(patientId: $patientId, fileName: $fileName, mimeType: $mimeType) {
      url method fileKey expiresAt
    }
  }`,
  createRecord: `mutation($input: CreateRecordInput!) {
    createRecord(input: $input) { id patientId doctorId type title notes fileKey fileName mimeType sizeBytes }
  }`,
  updateRecord: `mutation($id: ID!, $input: UpdateRecordInput!) {
    updateRecord(id: $id, input: $input) { id title notes }
  }`,
  deleteRecord: `mutation($id: ID!) { deleteRecord(id: $id) }`,
  records: `query($patientId: ID, $type: RecordType, $page: Int, $pageSize: Int) {
    records(patientId: $patientId, type: $type, page: $page, pageSize: $pageSize) {
      total page pageSize items { id patientId type title notes fileKey fileName mimeType sizeBytes }
    }
  }`,
  record: `query($id: ID!) { record(id: $id) { id title } }`,
  fileUrl: `query($id: ID!) { recordFileUrl(id: $id) { url expiresAt } }`,
};

async function expectError(name, fn, code) {
  try {
    await fn();
    check(name, false, "expected an error but succeeded");
  } catch (err) {
    check(name, err.code === code, `got ${err.code} (${err.message})`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const suffix = Date.now().toString(36);
  const password = "m12-verify-pass";

  // --- 1. Onboard two clinics (A = owning tenant, B = foreign tenant) ---
  let res = await gql(M.signup, { input: { name: "M12 Admin A", email: `m12-a-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M12 Clinic A", subdomain: `m12a${suffix}` } }, res.signup.accessToken);
  const tokenA = res.createClinic.accessToken;
  const clinicA = res.createClinic.clinic.id;
  check("clinic A onboarded", !!clinicA);

  res = await gql(M.signup, { input: { name: "M12 Admin B", email: `m12-b-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M12 Clinic B", subdomain: `m12b${suffix}` } }, res.signup.accessToken);
  const tokenB = res.createClinic.accessToken;
  const clinicB = res.createClinic.clinic.id;
  check("clinic B onboarded", !!clinicB);

  const docUser = await prisma.user.create({
    data: { clinicId: clinicA, role: "DOCTOR", name: "M12 Doctor", email: `m12-doc-${suffix}@test.dev` },
  });
  const doctor = await prisma.doctor.create({ data: { userId: docUser.id } });
  const patient = await prisma.patient.create({
    data: { clinicId: clinicA, name: "M12 Patient A", phone: "555-0121" },
  });
  const foreignPatient = await prisma.patient.create({
    data: { clinicId: clinicB, name: "M12 Patient B", phone: "555-0122" },
  });

  const { signAccessToken } = await import("../src/utils/tokens.js");
  const patientUser = await prisma.user.create({
    data: { clinicId: clinicA, role: "PATIENT", name: "M12 Patient Role", email: `m12-pat-${suffix}@test.dev` },
  });
  const patientToken = signAccessToken({ id: patientUser.id, clinicId: clinicA, role: "PATIENT" });

  // --- 2. AuthZ ---
  await expectError("anonymous records -> UNAUTHORIZED", () => gql(M.records), "UNAUTHORIZED");
  await expectError("PATIENT role records -> FORBIDDEN", () => gql(M.records, {}, patientToken), "FORBIDDEN");

  // --- 3. Upload URL contract ---
  res = await gql(M.uploadUrl, { patientId: patient.id, fileName: "blood-report.pdf", mimeType: "application/pdf" }, tokenA);
  const upload = res.recordUploadUrl;
  check("recordUploadUrl method PUT", upload.method === "PUT", upload.method);
  check("recordUploadUrl fileKey namespaced", upload.fileKey.startsWith(`clinic/${clinicA}/records/`), upload.fileKey);
  check("recordUploadUrl expiresAt in future", Date.parse(upload.expiresAt) > Date.now());

  const fileKey = upload.fileKey;

  // --- 4. Authenticated PUT upload to /files ---
  const content = Buffer.from("M12 fake blood report contents");
  const putUrl = upload.url.startsWith("/") ? `${BASE}${upload.url}` : upload.url;
  const putHeaders = { "Content-Type": "application/pdf" };
  if (upload.url.startsWith("/")) putHeaders.Authorization = `Bearer ${tokenA}`;
  const putRes = await fetch(putUrl, { method: "PUT", headers: putHeaders, body: content });
  check("PUT upload succeeds", putRes.ok, `status ${putRes.status}`);

  // --- 5. createRecord validation ---
  await expectError(
    "createRecord with unknown fileKey -> FILE_NOT_FOUND",
    () =>
      gql(
        M.createRecord,
        {
          input: {
            patientId: patient.id,
            doctorId: doctor.id,
            type: "LAB",
            title: "Orphan",
            fileKey: `clinic/${clinicA}/records/does-not-exist.pdf`,
            fileName: "x.pdf",
            mimeType: "application/pdf",
            sizeBytes: 10,
          },
        },
        tokenA,
      ),
    "FILE_NOT_FOUND",
  );

  await expectError(
    "recordUploadUrl rejects disallowed mime",
    () => gql(M.uploadUrl, { patientId: patient.id, fileName: "x.exe", mimeType: "application/x-msdownload" }, tokenA),
    "VALIDATION_ERROR",
  );

  await expectError(
    "createRecord rejects oversized file metadata",
    () =>
      gql(
        M.createRecord,
        {
          input: {
            patientId: patient.id,
            doctorId: doctor.id,
            type: "LAB",
            title: "Huge",
            fileKey,
            fileName: "big.pdf",
            mimeType: "application/pdf",
            sizeBytes: 26 * 1024 * 1024,
          },
        },
        tokenA,
      ),
    "VALIDATION_ERROR",
  );

  // --- 6. createRecord (file-backed) + text-only record ---
  res = await gql(
    M.createRecord,
    {
      input: {
        patientId: patient.id,
        doctorId: doctor.id,
        type: "LAB",
        title: "Blood report",
        notes: "All clear",
        fileKey,
        fileName: "blood-report.pdf",
        mimeType: "application/pdf",
        sizeBytes: content.length,
      },
    },
    tokenA,
  );
  const record = res.createRecord;
  check("createRecord persists metadata", record.fileKey === fileKey && record.title === "Blood report", JSON.stringify(record));
  check("createRecord resolves doctor", record.doctorId === doctor.id);

  res = await gql(
    M.createRecord,
    { input: { patientId: patient.id, doctorId: doctor.id, type: "CLINICAL_NOTE", title: "Follow-up note", notes: "No file attached" } },
    tokenA,
  );
  const textRecord = res.createRecord;
  check("text-only record created", textRecord.fileKey === null && textRecord.title === "Follow-up note");

  await expectError(
    "createRecord without doctorId for non-doctor -> DOCTOR_REQUIRED",
    () => gql(M.createRecord, { input: { patientId: patient.id, type: "CLINICAL_NOTE", title: "Orphan" } }, tokenA),
    "DOCTOR_REQUIRED",
  );

  // --- 7. records query: filters + pagination ---
  res = await gql(M.records, { patientId: patient.id, page: 1, pageSize: 50 }, tokenA);
  check("records query filters by patient", res.records.total === 2 && res.records.items.every((r) => r.patientId === patient.id), `total=${res.records.total}`);

  res = await gql(M.records, { type: "LAB" }, tokenA);
  check("records query filters by type", res.records.items.every((r) => r.type === "LAB"));

  res = await gql(M.records, { page: 1, pageSize: 1 }, tokenA);
  check("records pagination pageSize honored", res.records.items.length === 1 && res.records.pageSize === 1);

  // --- 8. recordFileUrl -> authenticated GET download, bytes match ---
  res = await gql(M.fileUrl, { id: record.id }, tokenA);
  const download = res.recordFileUrl;
  check("recordFileUrl returns url", !!download.url && !!download.expiresAt);
  const dlUrl = download.url.startsWith("/") ? `${BASE}${download.url}` : download.url;
  const dlHeaders = {};
  if (download.url.startsWith("/")) dlHeaders.Authorization = `Bearer ${tokenA}`;
  const dlRes = await fetch(dlUrl, { headers: dlHeaders });
  check("GET download succeeds", dlRes.ok, `status ${dlRes.status}`);
  const dlBody = Buffer.from(await dlRes.arrayBuffer());
  check("downloaded bytes match upload", dlBody.equals(content), `len=${dlBody.length}`);

  const dlNoAuth = await fetch(dlUrl);
  check("download without auth -> 401", dlNoAuth.status === 401);

  // --- 9. URL expiry + traversal guards ---
  const expiredUrl = `${BASE}/files?clinicId=${clinicA}&key=${encodeURIComponent(fileKey)}&expires=1`;
  const expRes = await fetch(expiredUrl, { headers: { Authorization: `Bearer ${tokenA}` } });
  check("expired download URL -> 403 URL_EXPIRED", expRes.status === 403);

  const evilUrl = `${BASE}/files?clinicId=${clinicA}&key=..%2F..%2F..%2F.env&expires=${Date.now() + 60000}`;
  const evilRes = await fetch(evilUrl, { headers: { Authorization: `Bearer ${tokenA}` } });
  check("path traversal key rejected", evilRes.status === 400);

  // --- 10. Cross-clinic + role isolation ---
  await expectError("foreign clinic getRecord -> NOT_FOUND", () => gql(M.record, { id: record.id }, tokenB), "NOT_FOUND");
  await expectError("foreign clinic recordFileUrl -> NOT_FOUND", () => gql(M.fileUrl, { id: record.id }, tokenB), "NOT_FOUND");
  await expectError(
    "upload for foreign patient -> NOT_FOUND",
    () => gql(M.uploadUrl, { patientId: foreignPatient.id, fileName: "x.pdf", mimeType: "application/pdf" }, tokenA),
    "NOT_FOUND",
  );

  // --- 11. updateRecord (title/notes only) ---
  res = await gql(M.updateRecord, { id: record.id, input: { title: "Blood report v2", notes: "Reviewed" } }, tokenA);
  check("updateRecord updates title+notes", res.updateRecord.title === "Blood report v2" && res.updateRecord.notes === "Reviewed");

  // --- 12. deleteRecord soft-deletes + cleans up file ---
  res = await gql(M.deleteRecord, { id: record.id }, tokenA);
  check("deleteRecord returns true", res.deleteRecord === true);
  await expectError("deleted record getRecord -> NOT_FOUND", () => gql(M.record, { id: record.id }, tokenA), "NOT_FOUND");
  res = await gql(M.records, { patientId: patient.id }, tokenA);
  check("soft-deleted record excluded from list", res.records.total === 1, `total=${res.records.total}`);

  const uploadedPath = path.join(process.cwd(), "uploads", fileKey);
  let fileGone = false;
  for (let i = 0; i < 10; i++) {
    try {
      const { stat } = await import("fs/promises");
      await stat(uploadedPath);
      await sleep(250);
    } catch {
      fileGone = true;
      break;
    }
  }
  check("orphan file cleaned up after delete", fileGone);

  // --- 13. Cleanup ---
  await prisma.medicalRecord.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.appointment.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.patient.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });
  await prisma.doctor.deleteMany({ where: { userId: docUser.id } });
  await prisma.user.deleteMany({ where: { clinicId: { in: [clinicA, clinicB] } } });

  console.log(`\nM12 verify: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nM12 verify crashed:", err.message);
  process.exit(1);
});
