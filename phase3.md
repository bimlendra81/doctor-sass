# Phase 3 — Patient Experience: Milestone Roadmap

Source plan: `doctor-saas-platform-plan.md` · Phase 2 roadmap: `phase2.md`
Stack: React (Vite) · Node.js (Express) · MySQL · GraphQL (Apollo Server)
Multi-tenancy: single DB, shared schema, `clinic_id` on every tenant table.
Build order: **backend-first** (same as Phase 1/2).

Phase 1 (M1–M6) and Phase 2 (M7–M10) are **COMPLETE**; M11 Notifications & Reminders is done (committed `f1bd5fd`, `verify-m11` 34/34). **M12 Medical Records & Documents is COMPLETE** (`verify-m12` 32/32, client build clean — not yet committed). See `progress.md`.

> **Numbering note:** this project's actual milestone numbers differ from `phase2.md`'s doc table. M11 = Notifications is taken, so Phase 3 here is **M12 Medical Records · M13 Patient Portal · M14 Teleconsultation**. (phase2.md listed records as "M11" and notifications as "M12" — treat those labels as stale.)

---

## 1. Milestone Roadmap (Phase 3)

| Milestone | Deliverables | Est. |
|---|---|---|
| **M12 — Medical Records & Documents** | Record schema + storage driver (S3 if keys present, else local disk), upload/download via expiring URLs, records page | 3–4 days |
| **M13 — Patient Portal** | Patient accounts (invite-first, linked via `Patient.userId`), self-service book/cancel, prescriptions, records, invoices + pay online, profile | 5–7 days |
| **M14 — Teleconsultation** | Jitsi Meet room per appointment, join links, SCHEDULED/LIVE/ENDED lifecycle, GraphQL subscriptions | 4–6 days |

**Phase 3 exit criteria:** a patient receives a reminder, books + joins a video appointment, views their prescription + records, and pays an invoice online — all self-scoped with no cross-patient data access.

---

## 2. M12 — Medical Records & Documents

> **STATUS: COMPLETE** — implemented as specified below (service `record.service.js`, storage `storage.service.js`, `verify-m12.mjs` 32/32, regressions m7–m11 green, `vite build` clean).

### Storage driver (configurable, no S3 → local)

New `server/src/services/storage.service.js`. Driver auto-selected at boot:
**`S3_ACCESS_KEY && S3_BUCKET` present → S3 driver; otherwise → local-disk driver.** Env-driven platform config; a super-admin toggle can surface this later (M15).

Interface (identical for both drivers so the client never branches):
- `createUploadUrl({ clinicId, mimeType, sizeBytes }) -> { url, method: "PUT", fileKey, expiresAt }`
- `getDownloadUrl({ clinicId, fileKey }) -> { url, expiresAt }`
- `deleteObject({ fileKey })`
- `driverName` → `"s3" | "local"`

- **S3 driver** (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`): presigned PUT upload, presigned GET download (15-min expiry), keys `clinic/<id>/records/<uuid>.<ext>`. Bucket policy deny-public; keys only in env, never logged.
- **Local driver** (dev): `PUT /files` authenticated route streams the raw body to `server/uploads/<clinicId>/<uuid>.<ext>` (dir gitignored); download via authenticated `GET /files/:clinicId/:key` verifying JWT + tenant. Same PUT-to-URL client contract as S3.

### Schema

`RecordType` enum (`LAB`/`IMAGING`/`CLINICAL_NOTE`/`REFERRAL`/`OTHER`) + `MedicalRecord` model; migration `20260812XXXX_m12_records` (diff → BOM-free file → `migrate deploy`). Back-relations on Clinic/Patient/Doctor.

### Service (`records.service.js`)

- `listRecords(patientId)` — tenant-scoped, paginated
- `getRecord(id)` / `recordFileUrl(id)` — tenant-scoped → cross-clinic `NOT_FOUND`
- `createRecord(input)` — metadata only; validates `fileKey` is in the clinic's namespace
- `updateRecord(id, { title, notes })` — metadata only
- `deleteRecord(id)` — soft delete (`deletedAt` tombstone) + fire-and-forget `deleteObject`
- `@auth(requires: STAFF)` throughout

### Validators (`records.validator.js`)

Type enum, title 1–200, mimeType allowlist, `sizeBytes ≤ 25 MB`.

### GraphQL (`records.graphql` + resolver registered in `resolvers/index.js`)

Queries `records`/`record`/`recordFileUrl`; mutations `recordUploadUrl`/`createRecord`/`updateRecord`/`deleteRecord`; all `@auth(requires: STAFF)`.

### Client

`features/records/api.js`; `pages/Records.jsx` (patient picker + `?patientId=` deep-link, file pick → PUT to signed URL → createRecord, timeline, download, delete, type filter); route `/records` + sidebar link; Schedule COMPLETED → "Add record" link.

### Exit check (verify-m12.mjs)

upload→create→download→expiry path (both drivers where keys exist), update title only, soft-delete tombstone + list exclusion, cross-clinic `record(id)`/download → NOT_FOUND, authZ (unauth/STAFF), validation errors; regressions verify-m7…m11.

---

## 3. M13 — Patient Portal

Schema is already portal-ready: `Role.PATIENT` exists, `Patient.userId @unique`, `User.patient` back-relation. **No structural schema change beyond M12.**

### Accounts (invite-first, per phase2.md §3.2)

- `patientInvite(patientId, email)` (CLINIC_ADMIN/STAFF): create `User` (role `PATIENT`, clinicId, invite token via existing invite infra) → real email link via `notifier` (dev: `jsonTransport` logs the link).
- `acceptPatientInvite(token, password)`: set password, `emailVerified`, link `Patient.userId` (patient matched by clinic + email).
- Self-registration deferred (follow-up).

### Service (`portal.service.js`) — self-scoped, `@auth(requires: PATIENT)`, no clinic/patientId args

- `myAppointments` (upcoming/past, paginated)
- `bookMyAppointment(input)` — reuses `doctorSlots` + slot validation; respects the appointment plan cap (existing `assertPlanLimit` in `bookAppointment`)
- `cancelMyAppointment(id, reason)` — own, PENDING/CONFIRMED → CANCELLED, frees slot
- `myPrescriptions` (ACTIVE) + PDF access for own patient (extend `GET /prescriptions/:id/pdf` auth: staff OR linked patient)
- `myInvoices` (balanceDue) + `payInvoice` via Stripe Checkout (symmetry with M10: session → `checkout.session.completed` webhook → `recordPayment` method `ONLINE`), **devMode fallback** when Stripe unconfigured (simulated payment → PAID)
- `myRecords` (read-only M12 records + `recordFileUrl` for own patient; local download route allows the linked patient)
- `myProfile` + existing `changePassword`

**Fold-in:** reminder dispatch (M11) targets the patient's linked `User` when one exists, else falls back to email/SMS.

### GraphQL (`patient.graphql`)

`my*` queries + `bookMyAppointment`/`cancelMyAppointment`/`payInvoice`/`acceptPatientInvite`; `patientInvite` @STAFF. Resolvers derive the patient solely from `ctx.user.patient`.

### Client

`features/portal/api.js`; `RequirePatient` guard (extends `RequireAuth.jsx`); portal pages under `/portal` — PortalHome (my visits + status actions), PortalBook (doctor + slot grid), PortalPrescriptions (+PDF), PortalRecords, PortalInvoices (+pay), Profile; AppLayout shows portal links only for `role === 'PATIENT'`; "Invite patient" action on the Patients/Team page.

### Exit check (verify-m13.mjs)

invite→accept→login→linked patient; myAppointments own-only; book/cancel own (double-book → `SLOT_TAKEN`); payInvoice devMode → PAID + ONLINE payment row; myRecords own-only; crafted foreign `appointmentId`/`recordId`/`invoiceId` → NOT_FOUND; doctor/staff on `my*` → error; unauth → UNAUTHORIZED; regressions m7–m12.

---

## 4. M14 — Teleconsultation (Jitsi Meet)

### Schema

Extend `Appointment` with `telehealthUrl String?` + `TelehealthStatus` enum (`SCHEDULED`/`LIVE`/`ENDED`); migration `20260814XXXX_m14_telehealth`.

### Subscriptions infra (first in repo)

Add `graphql-ws` + `ws`; rewire `src/index.js`/`src/app.js` with `httpServer` + `WebSocketServer` + Apollo drain plugins. In-memory PubSub (EventEmitter) — single-instance fine; Redis pubsub deferred to M16.

### Service (`telehealth.service.js`)

- `videoRoom(appointmentId)` → `{ url: "https://meet.jit.si/<clinic-slug>-<appointmentId>", status }`; authorized for the clinic's doctor/staff **or** the appointment's linked patient (foreign → `NOT_FOUND`)
- `startVisit` — guard: within `[startTime, endTime + grace]`, SCHEDULED→LIVE, doctor/staff only
- `endVisit` — LIVE→ENDED; join after ENDED rejected
- `visitStatus(appointmentId)` query + `visitStatusChanged(appointmentId)` subscription

### GraphQL (`telehealth.graphql` + resolver)

`videoRoom`/`visitStatus` queries; `startVisit`/`endVisit` mutations; `visitStatusChanged` subscription.

### Client

`pages/VideoRoom.jsx` (Jitsi iframe embed); join buttons on Schedule (doctor) + portal visits (patient); WS split-link in `apollo/client.js`; status via subscription + End Visit.

### Exit check (verify-m14.mjs)

room URL + SCHEDULED; foreign patient/doctor → NOT_FOUND; start before window → guard error; doctor starts → LIVE; endVisit → ENDED; join after ENDED rejected; unauth → UNAUTHORIZED; regressions m7–m13.

---

## 5. Schema Additions

```prisma
enum RecordType {
  LAB
  IMAGING
  CLINICAL_NOTE
  REFERRAL
  OTHER
}

// M12 — medical records
model MedicalRecord {
  id        String     @id @default(uuid())
  clinicId  String
  clinic    Clinic     @relation(...)
  patientId String
  patient   Patient    @relation(...)
  doctorId  String
  doctor    Doctor     @relation(...)
  type      RecordType
  title     String
  notes     String?
  fileKey   String?    // storage key: clinic/<id>/records/<uuid>.<ext>
  fileName  String?
  mimeType  String?
  sizeBytes Int?
  deletedAt DateTime?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@index([patientId])
  @@index([clinicId, createdAt])
}

// M14 — teleconsultation (extend Appointment)
model Appointment {
  // ...existing
  telehealthUrl    String?
  telehealthStatus TelehealthStatus? // SCHEDULED | LIVE | ENDED
}
```

`Patient.userId @unique` and `Role.PATIENT` already exist (M13 portal) — no change needed.

---

## 6. Cross-Cutting

- **New deps**: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (S3 driver), `graphql-ws`, `ws` (subscriptions). No Jitsi SDK (iframe embed).
- **`server/uploads/`** added to `.gitignore`.
- **Env**: `S3_*` (endpoint/bucket/keys), `JITSI_BASE_URL` (default `https://meet.jit.si`), `WEBAPP_URL` + SMTP/SendGrid for real invite/reset emails.
- **Docs**: `progress.md` entries for M12–M14; `phase2.md` exit-check + numbering note; README storage-driver + Jitsi + portal sections.

---

## 7. Sequencing Notes

- **Order dependency**: M12 (records) → M13 (portal; consumes records + M11 email/reminders). M14 is independent and can run in parallel with either.
- **Effort**: ≈ 1.5–2 weeks total at the current pace.

---

## 8. Risks & Mitigations

- **Storage misconfig**: missing S3 keys silently drop to local disk. Mitigate: log the active `driverName` at boot; `storageConfig` query exposes it (no secrets).
- **Email deliverability**: portal invites are core; dev `jsonTransport` hides this until real SMTP/SendGrid. Mitigate: document env setup in README; keep dev link logging.
- **Subscriptions scale**: in-memory PubSub breaks across instances. Mitigate: single-instance for now; Redis pubsub at M16.
- **Patient data leak**: portal relies entirely on self-scoping from context. Mitigate: verify-m13 foreign-ID negative paths; no clinic/patientId args anywhere in `my*`.
- **N+1** in portal lists (appointments→doctor): DataLoader deferred to M16; accept for now.

---

## 9. Definition of Done (each milestone)

- **Server**: service + validators + GraphQL schema/resolvers wired and registered (`resolvers/index.js`), `@auth` scoping verified.
- **Schema/migration**: `prisma migrate` applied with a `verify-mN` e2e script exercising happy path + ≥1 negative path (cross-tenant NOT_FOUND, auth denial).
- **Client**: page + route + sidebar link; `vite build` clean; Vite-proxy smoke test.
- **Docs**: `progress.md` milestone entry complete; `phase2.md`/`phase3.md` exit check updated.

---

## 10. Out of Scope / Backlog

- Redis/BullMQ (kept the M11 in-process scheduler), Redis pubsub
- Patient self-registration (invite-first only for now)
- Super-admin storage-toggle UI (env-driven config for now; M15 panel)
- DataLoader, vitest/supertest codification, concurrency-safe booking (M16)
- Jitsi self-hosting, room recording, waiting-room queue
