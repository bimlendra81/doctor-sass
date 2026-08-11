# Progress Log

Tracks completed work and next steps for the Doctor SaaS platform build.
Source plan: `doctor-saas-platform-plan.md` · Milestone roadmap: `phase1.md`
Stack: React (Vite) · Node.js (Express) · MySQL (Prisma) · GraphQL (Apollo) — **plain JavaScript**
Rules: `rule.md` (project) · `global-rule.md` (generic)

---

## Milestone 1 — Foundation

### Done

- [x] **Root workspace scaffold**
  - npm workspaces (`server`, `client`) in root `package.json`
  - `.gitignore`, `.env.example`, `README.md`, optional `docker-compose.yml` (MySQL 8 + Redis)
- [x] **Database (Prisma, MySQL)**
  - `server/prisma/schema.prisma` — tables: `Clinic`, `User`, `Doctor`, `DoctorAvailability`, `Patient`, `Appointment` + enums (`Role`, `Plan`, `AppointmentStatus`, `AppointmentType`)
  - Init migration `20260810092913_init` applied to local MariaDB (`doctor_saas` on port 3307)
  - Prisma Client generated
- [x] **Server (Express + Apollo Server, JS/ESM)**
  - `src/config/env.js` (env loader), `src/config/db.js` (Prisma singleton)
  - `src/app.js` — Express app: CORS, JSON body, auth middleware, `/health` route, Apollo mounted at `/graphql`
  - `src/index.js` — bootstrap with `node --watch` dev runner
  - Middlewares: `auth.js` (JWT decode skeleton, `requireAuth`), `tenant.js` (tenant-scope stub), `error.js` (global error handler)
  - `src/utils/errors.js` — `AppError`, `notFound`, `unauthorized`, `forbidden`
- [x] **GraphQL core (schema-first)**
  - TypeDefs per module: `base.graphql` (ping, DateTime, @auth directive), `auth.graphql`, `clinics.graphql`, `patients.graphql`, `appointments.graphql`
  - Resolver stubs: `auth`, `clinics`, `patients`, `appointments` + merged resolver map
  - `context.js` — builds per-request context (user, clinicId, prisma, DataLoaders for clinic/user/doctor/patient)
  - `dataloaders/index.js` — DataLoader scaffold (N+1 prevention)
- [x] **Client scaffold (Vite + React JS)**
  - `client/package.json` — React 18, Apollo Client, react-router-dom, Tailwind v3, Vite 5
  - `index.html`, `vite.config.js` (with `/graphql` proxy), `tailwind.config.js`, `postcss.config.js`, `src/index.css`
  - `src/main.jsx`, `src/App.jsx`, `src/apollo/client.js`, `src/routes/index.jsx`, `src/pages/Home.jsx` (health-check page)
- [x] **Coding rules & shared workspace**
  - `rule.md` — project coding rules (reusability/DRY, named exports, service layer, no magic strings)
  - `global-rule.md` — generic version (no project references)
  - `shared/` workspace `@doctor-sass/shared` — source-of-truth enums (`Role`, `Plan`, `AppointmentStatus`, `AppointmentType`); imported by server + client
  - Existing code refactored to named exports (app code); config files keep required default exports

### Verified

- [x] Server boots; `/health` → `{"status":"ok"}`
- [x] GraphQL `{ ping }` → `{"data":{"ping":"pong"}}` on `POST /graphql`
- [x] Migration applied cleanly; 7 tables created
- [x] Client serves `GET /` → HTTP 200
- [x] End-to-end round-trip: `POST /graphql` via Vite proxy (`:5173` → `:4000`) → `{"data":{"ping":"pong"}}`
- [x] `@doctor-sass/shared` imports resolve in Node (server) and bundler (client)

### Milestone 1 — COMPLETE ✅

### Next (M2)

- M2 — Auth & RBAC: signup/login/refresh, bcrypt, email verify stub, `@auth` guards, service layer + Zod validation per rule.md

---

## Milestone 2 — Auth & RBAC

### Done

- [x] **Schema**: `RefreshToken` + `EmailVerificationToken` tables; migration `20260810111243_add_refresh_and_verify_tokens` applied
- [x] **Deps**: `bcrypt@6.0.0` (native, scripts approved), `zod@4.4.3`, `@graphql-tools/utils` (server); `@reduxjs/toolkit` + `react-redux` + `zustand` (client)
- [x] **Utils**: `utils/password.js` (bcrypt), `utils/tokens.js` (JWT access + opaque hashed refresh, sha256), `utils/time.js` (`ttlToMs`), `utils/validate.js` (Zod → `AppError`)
- [x] **Validators**: `validators/auth.validator.js` (signup/login/refresh/verifyEmail)
- [x] **Service**: `services/auth.service.js` — signup (role CLINIC_ADMIN), login, refresh rotation (reuse rejection), logout (revoke), verifyEmail; opaque refresh tokens stored hashed
- [x] **GraphQL**: `signup`/`login`/`refreshToken`/`logout`/`verifyEmail` mutations + `AuthPayload`/`SignupPayload`; `@auth(requires: Role)` directive (role hierarchy) in `graphql/directives/auth.js`; `me` guarded
- [x] **Errors**: `formatError` maps `AppError` → `extensions.code` (client drives refresh on `UNAUTHORIZED`)
- [x] **Client state**: Redux Toolkit `store/` + `features/auth/authSlice` (tokens+user persisted in localStorage); zustand `stores/uiStore` for transient UI (sidebar toggle) — Redux = server/global state, zustand = ephemeral UI
- [x] **Apollo link**: Bearer header + silent refresh-on-401 with single-flight queue (`apollo/client.js`)
- [x] **UI**: `useAuth` hook; shared UI kit (`components/ui` Button/Input); `AppLayout` (header/sidebar/logout); Login + Signup pages; `RequireAuth` route guard; Home shows session info
- [x] **PM2**: `ecosystem.config.js` added — `pm2 start ecosystem.config.js` runs server + client

### Verified

- [x] signup → tokens + verificationToken; duplicate email → `EMAIL_TAKEN`
- [x] login → tokens; wrong password → `UNAUTHORIZED`
- [x] `me` with token → user; without/invalid token → `Authentication required` (extensions.code `UNAUTHORIZED`)
- [x] refresh rotation: old token rejected after use; logout-revoked token rejected
- [x] verifyEmail → `emailVerified: true`
- [x] Client `vite build` clean; end-to-end via PM2 + Vite proxy (:5173 → :4000)

### Milestone 2 — COMPLETE ✅

### Next (M3)

- M3 — Clinic Onboarding: `createClinic` (transactional, CLINIC_ADMIN owner, subdomain normalization), invite doctor/staff, setup wizard UI

---

## Milestone 3 — Clinic Onboarding

### Done

- [x] **Schema**: `User.passwordHash` nullable + `inviteTokenHash`/`inviteTokenExpiresAt`; migration `20260810140000_clinic_onboarding_invites` (generated via `migrate diff`, applied via `migrate deploy`)
- [x] **Service**: `services/clinic.service.js` — `createClinic` (transactional: clinic + owner assignment, re-issues session), `getMyClinic`, `getClinicUsers`, `normalizeSubdomain` (lowercase, reserved words, format rules)
- [x] **Service**: `services/invite.service.js` — `inviteStaff` (DOCTOR/STAFF only, CLINIC_ADMIN guard, invite token), `acceptInvite` (set password, activate, issue session)
- [x] **GraphQL**: `createClinic`/`inviteStaff`/`acceptInvite` mutations + `clinic`/`clinicUsers` queries with `@auth` guards; `CreateClinicPayload`/`InvitePayload`
- [x] **Client**: `features/clinic/api.js`; `SetupClinic` page (name/subdomain/plan); `Team` page (invite form + members list); `RequireAuth` redirects to `/setup` until a clinic exists; sidebar nav (Overview/Team)

### Verified

- [x] signup (CLINIC_ADMIN, no clinic) → createClinic normalizes subdomain, sets `clinicId`, re-issues token
- [x] invite → acceptInvite: STAFF/DOCTOR activated, clinicId set, can query own clinic
- [x] Role guards: STAFF blocked from `clinicUsers` (FORBIDDEN); invite before clinic → NO_CLINIC
- [x] Subdomain rules: reserved → SUBDOMAIN_RESERVED; invalid chars → INVALID_SUBDOMAIN; duplicate → SUBDOMAIN_TAKEN
- [x] Client `vite build` clean

### Milestone 3 — COMPLETE ✅

### Next (M4)

- M4 — Patient CRUD: `Patient` gains `name`/`email`/`phone` (walk-in records), tenant-scoped create/read/update/search, soft delete, list + form UI

---

## Milestone 4 — Patient CRUD

### Done

- [x] **Schema**: `Patient` gains `name`/`email`/`phone` + `updatedAt`/`deletedAt`; migration `20260810180000_add_patient_walkin_fields` (0 rows → NOT NULL `name` safe; `migrate diff` → manual BOM-free file → `migrate deploy`)
- [x] **Service**: `services/patient.service.js` — `listPatients` (tenant-scoped, search on name/phone/email, paginated `PatientConnection`), `getPatient`, `createPatient`, `updatePatient` (patch only provided fields — fixed partial-schema null-clobber bug), `deletePatient` (soft delete via `deletedAt`)
- [x] **Validators**: `validators/patient.validator.js` — `createPatientSchema` / `updatePatientSchema` (Zod, email normalized, empty-string → null)
- [x] **GraphQL**: `patients.graphql` — `Patient` gains `updatedAt`, inputs, `PatientConnection`, queries `patients`/`patient`, mutations `createPatient`/`updatePatient`/`deletePatient`, all `@auth(requires: STAFF)`
- [x] **Client**: `features/patients/api.js` (fragment + queries); `pages/Patients.jsx` (search, create/edit form, soft-delete, list table); route `/patients`; sidebar link

### Verified

- [x] createPatient under tenant; list/pagination `{total, page, pageSize, items}`
- [x] search "alice" matches name; update patches only sent fields (phone-only edit preserved name)
- [x] deletePatient soft-deletes → excluded from list + `patient(id)` returns NOT_FOUND
- [x] Client `vite build` clean

### Milestone 4 — COMPLETE ✅

### Next (M5)

- M5 — Appointments: recurring weekly availability, one-day template override, slot generation, book/confirm/cancel/no-show flows, appointment calendar

---

## Milestone 5 — Appointments

### Done

- [x] **Schema**: `DoctorAvailability.slotDuration` (default 30); `ScheduleOverride` model (unique `doctorId_date`, `@db.Date`); `Appointment` gains `note`/`cancelReason`/`cancelledAt`/`updatedAt`; status enum + `NO_SHOW`; migration `20260810190000_appointments_schedule_overrides`
- [x] **Services**: `availability.service.js` — `upsertDoctorProfile` (DOCTOR self), `listDoctors`/`getDoctor` (clinic-scoped via user), `setAvailability`/`deleteAvailability` (weekly rules; DOCTOR self or CLINIC_ADMIN for others), `createScheduleOverride`/`deleteScheduleOverride`, `getDoctorAvailability`, `doctorSlots` (weekly rules OR same-day override, local-time slot generation, past-slot exclusion, booked flags from non-cancelled appointments); `appointment.service.js` — `bookAppointment` (slot-validated conflict check), `confirm`/`complete`/`cancel`/`markNoShow`, `listAppointments` (day/doctor/status filters)
- [x] **Validators**: `availability.validator.js`, `appointment.validator.js` (fix: `startTime` arrives as `Date` via DateTime scalar → `z.coerce.date()`)
- [x] **GraphQL**: `doctors.graphql` (Doctor/AvailabilityRule/ScheduleOverride/TimeSlot + queries `doctors`/`doctor`/`doctorAvailability`/`doctorSlots` + availability mutations, `@auth` guards); `appointments.graphql` rewritten (status/type enums, booking/status mutations, `appointments` query); type-level resolvers registered in index (bug: `Appointment.patient`/`ScheduleOverride.date` were declared but never wired)
- [x] **Client**: `features/appointments/api.js`; `pages/Schedule.jsx` (day navigation, doctor filter, status pills + confirm/complete/cancel/no-show actions); `pages/Booking.jsx` (patient/doctor/date/type → slot grid → book); `pages/Availability.jsx` (weekly rules editor + one-day overrides; doctor auto-selects self, admin picks); routes + sidebar links

### Verified (e2e via API)

- [x] Invite→accept DOCTOR → doctor profile → weekly rules; slots generated for next Monday (6× 30-min)
- [x] bookAppointment PENDING; slot flips `booked` with `appointmentId`; double-book → `SLOT_TAKEN`
- [x] confirm→CONFIRMED, complete→COMPLETED, cancel→CANCELLED (frees the slot), markNoShow→NO_SHOW
- [x] `appointments(date)` lists day's appointments with `patient`/`doctor` resolved
- [x] Client `vite build` clean; proxy round-trip on :5173

### Milestone 5 — COMPLETE ✅

### Next (M6)

- M6 — Doctor dashboard: today's schedule, patient queue, basic stats

---

## Milestone 6 — Doctor Dashboard

### Done

- [x] **Server**: `dashboard(date)` query — tenant-scoped day stats (`total` + `byStatus` PENDING/CONFIRMED/COMPLETED/CANCELLED/NO_SHOW); `DashboardStats`/`StatusCount` types; `@auth(requires: STAFF)`; returns the requested date verbatim (fixed local→UTC date shift)
- [x] **Client**: `features/appointments/api.js` + `DASHBOARD_QUERY`; `pages/Home.jsx` rewritten as the dashboard (greeting, 5 stat cards, today's queue split into "Upcoming" / "Earlier today", Book-appointment CTA)

### Verified

- [x] `dashboard(date)` returns correct date + counts for the doctor session (reyes@demo.com, Beta clinic)
- [x] Client `vite build` clean
- [x] Proxy round-trip on :5173 (ping + HTTP 200)

### Milestone 6 — COMPLETE ✅

## Phase 1 — MVP COMPLETE ✅

**Exit criteria met:** A doctor can log in, see their clinic's patients, book/confirm appointments, and view today's schedule — all tenant-isolated (verified end-to-end via API for M2–M6).

Next: `phase2.md` — post-MVP roadmap (Phase 2: M7 prescriptions · M8 invoicing · M9 Stripe subscriptions; Phase 3: M10 notifications · M11 patient portal · M12 teleconsultation; Phase 4: M13 analytics/admin · M14 hardening).

---

# Phase 2 — Practice Ops

## Milestone 7 — Clinic Settings & Branding

### Done

- [x] **Schema**: `Clinic` gains `timezone` (IANA, default `"UTC"`), `brandName`/`logoUrl`/`contactEmail`/`contactPhone` (nullable), `currency` (default `"usd"`); migration `20260811090000_m7_clinic_settings_and_branding` (diff → manual BOM-free file → `migrate deploy`; defaults backfill existing rows)
- [x] **Shared**: `IANA_ZONES` (curated list) + `Currency`/`CURRENCIES` in `@doctor-sass/shared`
- [x] **Timezone util**: `utils/timezone.js` — `zonedTimeToUtc` (convergent Intl algorithm, DST-safe), `zonedDayBounds`, `zonedDayOfWeek`, `zonedTodayStr`, `zonedDateStr`
- [x] **Service**: `getClinicTimezone` (clinic.service.js); `availability.service.js` `doctorSlots` refactored to generate slots in the clinic's timezone (removed dead `parseHm`/`localDayStart`/`localDayEnd`); `appointment.service.js` `listAppointments`/`dashboardStats`/`bookAppointment` now interpret the day clinic-locally (booking derives its date via the clinic zone)
- [x] **Service**: `settings.service.js` — `clinicSettings` (STAFF+) + `updateClinicSettings` (CLINIC_ADMIN, patch-only, empty-string → null)
- [x] **Validators**: `validators/settings.validator.js` — timezone/currency validated against shared lists, URL for logo, email normalize
- [x] **GraphQL**: `settings.graphql` (`ClinicSettings`/`UpdateClinicSettingsInput`/`UpdateClinicSettingsPayload`, `clinicSettings` + `updateClinicSettings`); `settings.resolver.js` registered in `resolvers/index.js`
- [x] **Client**: `features/settings/api.js`; `pages/Settings.jsx` (branding, timezone picker from `IANA_ZONES`, currency, contact, clinic name); route `/settings` + sidebar link

### Verified (e2e via `server/scripts/verify-m7.mjs`, 29 checks)

- [x] Defaults: `timezone "UTC"`, `currency "usd"` on a fresh clinic
- [x] Branding/timezone/contact/currency persist via `updateClinicSettings` (partial patches intact)
- [x] `doctorSlots` generated in clinic tz: Auckland Monday → 09:00/09:30 wall-clock; changing tz to Tokyo shifts the ISO instants but keeps wall-clocks (day-of-week lookup is clinic-local)
- [x] Day-scoped queries are clinic-local: Tokyo 09:00 Monday booking (`2026-08-17T00:00Z`) counted by `dashboard(monday)`; after switching the clinic to LA the same instant is no longer on LA Monday but IS on LA Sunday — day-boundary re-interpretation proven
- [x] `dashboard()` with no date defaults to clinic-local today
- [x] Negative: STAFF can read `clinicSettings` but is `FORBIDDEN` from `updateClinicSettings`; invalid timezone/currency → `VALIDATION_ERROR`; empty `contactEmail` clears to null
- [x] Client `vite build` clean; Vite proxy round-trip on :5173

### Milestone 7 — COMPLETE ✅

### Milestone 8 — COMPLETE ✅

- [x] **Schema**: `PrescriptionStatus` enum (`DRAFT`/`ACTIVE`/`VOID`); `Drug` (name/category/dosageForm), `Prescription` (scriptNo, issuedAt, voidReason, voidedAt), `PrescriptionItem` (`sortOrder`); back-relations on Clinic/Doctor/Patient/Appointment
- [x] **Migrations**: `20260811120000_m8_prescriptions`, `20260811140000_m8_prescription_item_order` (applied)
- [x] **Drugs**: curated `drugs.json` (68 entries); `seed-drugs.mjs` → 68 rows; Fuse.js fuzzy search (`drugSearch`) with DB merge
- [x] **Workflow**: create draft → edit draft only → issue → `ACTIVE` (clinic-local scriptNo max+1, issuedAt) → void (reason required; double-void → `INVALID_STATUS`); no delete — void with reason
- [x] **PDF**: `GET /prescriptions/:id/pdf` — 4×6 in branded PDF (M7 clinic branding/currency, script no chip, patient/doctor/date grid, items by sortOrder); `VOID` → 404; clinic-timezone dates; logo fetch tolerates remote failure
- [x] **Tenant isolation**: cross-clinic reads & PDF → `NOT_FOUND`; duplicate appointment → `PRESCRIPTION_EXISTS` (409); unauth → 401 `UNRECOGNIZED`
- [x] **GraphQL**: `prescriptions`/`prescription`/`drugSearch` queries; create/update/issue/void mutations; all `@auth(requires: STAFF)`
- [x] **Verified**: `verify-m8.mjs` → 33 passed, 0 failed (onboarding, drug search, CRUD, PDF binary/%PDF, void 404, cross-tenant 404, filters, validation); `verify-m7.mjs` regression 29/29
- [x] **Client**: `features/prescriptions/api.js`; `pages/Prescriptions.jsx` (status filters, drug autocomplete, edit draft, issue/void/PDF actions, `?patientId=` deep-link); route `/prescriptions` + sidebar link; Schedule COMPLETED → Rx link; Vite proxy `/prescriptions`; `vite build` clean

### Milestone 9 — COMPLETE ✅

- [x] **Schema**: `InvoiceStatus` enum (`DRAFT`/`OPEN`/`PAID`/`VOID`); `PaymentMethod` enum (`CASH`/`CARD`/`ONLINE`); `Invoice` (`invoiceNo` unique per clinic, subtotal/tax/total as `Decimal(10,2)`, currency snapshot, dueDate, voidReason/voidedAt), `InvoiceItem` (`sortOrder`, description, qty, unitPrice, amount), `Payment` (amount, method, stripePaymentId, note, recordedById); back-relations on Clinic/Patient/Appointment/User
- [x] **Migration**: `20260811160000_m9_invoicing` (applied; created via `migrate diff` + `migrate deploy`, BOM-free)
- [x] **Service** (`billing.service.js`): `createInvoice` (line items + optional taxRate; **subtotal/tax/total computed server-side**, client-trusted math rejected by construction; per-clinic `invoiceNo` max+1; currency from `Clinic.currency`); `recordPayment` (partial → `OPEN`, full → `PAID`, overpayment → `OVERPAYMENT`, tracks `Payment` rows with method/stripePaymentId/recordedBy); `voidInvoice` (DRAFT/OPEN → `VOID` with reason, paid invoices cannot be voided, payments preserved as audit trail); `listInvoices` (patientId/status/clinic-local `date`)/`getInvoice` — all tenant-scoped `NOT_FOUND`
- [x] **Validators**: `billing.validator.js` (items min 1/max 50, qty/unitPrice bounds, taxRate 0–100, positive payment, void reason required, method enum)
- [x] **GraphQL**: `billing.graphql` — `Invoice`/`InvoiceItem`/`Payment` types + `balanceDue`, queries `invoices`/`invoice`, mutations `createInvoice`/`voidInvoice`/`recordPayment`, all `@auth(requires: STAFF)`; Decimal→Float converted in `billing.resolver.js`; type resolvers registered in `resolvers/index.js`
- [x] **Verified**: `verify-m9.mjs` → 40 passed, 0 failed (server totals 250/25/275, invoiceNo 1→2, currency eur, partial→OPEN/full→PAID, balanceDue 175→0, overpayment/pay-paid/pay-void/void-paid/double-void guards, void audit trail, cross-tenant `NOT_FOUND`, empty clinic B, unauth `UNAUTHORIZED`, validation); M8 33/33 + M7 29/29 regression
- [x] **Client**: `features/billing/api.js` (INVOICE_FIELDS + queries/mutations); `pages/Invoices.jsx` (status filters, create form with line items + tax rate + totals preview, record-payment panel with method, void, branded **print view** via print-CSS window using `Clinic.brandName`/contact/currency); route `/invoices` + sidebar link; Schedule COMPLETED → Invoice deep-link; `vite build` clean

### Milestone 10 — COMPLETE ✅

- [x] **Schema**: `Clinic.stripeCustomerId`/`stripeSubscriptionId` (both `@unique`); `WebhookEvent` model (`eventId` unique, type, createdAt); migration `20260811170000_m10_subscription` (applied via `migrate diff` + `migrate deploy`, BOM-free)
- [x] **Deps**: `stripe@^22.5.0`, `@sentry/node` (server); `STRIPE_*`/`WEBAPP_URL`/`SENTRY_DSN` added to `.env.example`
- [x] **Service** (`subscription.service.js`): `PLANS` config (FREE 50/20, PRO 500/100, ENTERPRISE ∞; feature flags for prescriptions/invoices); `assertPlanLimit(ctx, feature)` → `PLAN_LIMIT_EXCEEDED` (HTTP 402) enforced in `createPatient`/`bookAppointment`/`createPrescription`/`createInvoice` (feature gates on creation mutations only, reads ungated); `createCheckoutSession` (PRO/ENTERPRISE only, `devMode: true` fallback when Stripe unconfigured, price from `STRIPE_PRICE_<PLAN>`); `subscriptionInfo` (plan/status/limits/usage); `processStripeEvent` — idempotent via `WebhookEvent` (P2002-safe), `checkout.session.completed` (plan + customer/subscription ids from metadata), `customer.subscription.updated` (status map), `customer.subscription.deleted` (→ FREE + canceled), unknown types recorded-but-ignored
- [x] **Webhook route**: `POST /webhooks/stripe` with `express.raw` registered **before** `express.json()`; `constructEvent` signature check; 503 `STRIPE_NOT_CONFIGURED` when unconfigured
- [x] **Observability**: `utils/logger.js` (JSON structured logs), optional Sentry init (`config/sentry.js`, DSN-gated), error middleware logs + captures unhandled errors
- [x] **GraphQL**: `subscriptions.graphql` — `subscriptionInfo` query (@STAFF), `createCheckoutSession(plan: Plan!)` (@CLINIC_ADMIN); resolver registered in `resolvers/index.js`
- [x] **Verified**: `verify-m10.mjs` → **41 passed, 0 failed** (FREE defaults, patient cap 50/50, appointment cap 20/20, rx/invoice gates, checkout devMode + INVALID_PLAN, simulated checkout→PRO upgrade, idempotent replay (1 WebhookEvent row), post-upgrade unlocks, `subscription.updated` past_due + unknown-sub ignored, `subscription.deleted` → FREE/canceled, re-gated after downgrade, malformed event, authZ UNAUTHORIZED/FORBIDDEN/STAFF-read); M9 40/40 + M8 33/33 + M7 29/29 regression (verify-m8/m9 now upgrade their clinic to PRO before rx/invoice creation)
- [x] **Client**: `features/subscription/api.js`; `pages/Billing.jsx` (usage meters with near-limit warnings, feature list, plan cards with upgrade → Checkout redirect / dev-mode notice, refresh); route `/billing` + sidebar link; plan badge in `AppLayout` header (from `CLINIC_SETTINGS_QUERY`); `vite build` clean
- [x] **Docs**: `README.md` gained Features, Plans & limits table, and a Stripe billing setup section (webhook URL, env keys, devMode behavior)

### Milestone 11 — COMPLETE ✅

- [x] **Schema**: `Notification` (type, title, body, isRead, readAt, channels JSON) + `NotificationPreference` (per-user per-channel EMAIL/SMS/IN_APP, default on) + `ReminderJob` (appointmentId+type unique, scheduledFor, sentAt); migrations `20260811180000_m11_notifications`/`20260811183000_m11_reminder_jobs` (applied)
- [x] **Service** (`notification.service.js` + `notifier.service.js` + `reminder.service.js`): fan-out on book/confirm/cancel/no-show with actor exclusion + per-channel preference gate; `runDueReminders` dispatch (T24H/T1H) → email + in-app; `myNotifications`/`unreadNotificationCount`/`markNotificationRead`/`markAllNotificationsRead`/`myNotificationPreferences`/`setNotificationPreference`
- [x] **Auth**: `requestPasswordReset` (dev token) → `resetPassword` (single-use) → `changePassword` (requires current password, `INVALID_PASSWORD`)
- [x] **GraphQL**: `notifications.graphql` + `notifications.resolver.js` (all `@auth`), `changePassword` added to `auth.graphql`
- [x] **Verified**: `verify-m11.mjs` → **34 passed, 0 failed** (fan-out types, actor exclusion, T24H/T1H ledger rows, idempotent double-schedule P2002, due dispatch + sent mark, read/unread, preference gates, status-transition notifications, password reset + change, single-use token, authZ); M10/M9/M8/M7 regression green
- [x] **Client**: `pages/Notifications.jsx` (inbox: unread dots, click-to-read, mark-all-read, pagination, EMAIL/SMS/IN_APP toggles), `features/notifications/api.js`, `/notifications` route + sidebar link, password-change card in `Settings.jsx`; `vite build` clean
- [x] **Commit**: all M11 work committed as `f1bd5fd` (26 files, +1319) — automation actor committed the milestone

## Phase 3 — Patient Experience

## Milestone 12 — Medical Records & Documents

### Done

- [x] **Schema**: `RecordType` enum (`LAB`/`IMAGING`/`CLINICAL_NOTE`/`REFERRAL`/`OTHER`) + `MedicalRecord` (clinicId/patientId/doctorId/type/title/notes/fileKey/fileName/mimeType/sizeBytes, soft-delete `deletedAt`, `@@index([patientId])` + `@@index([clinicId, createdAt])`); back-relations on Clinic/Doctor/Patient; migration `20260812000000_m12_records` (applied; diff via `--from-schema-datasource`, BOM-free)
- [x] **Deps**: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (server)
- [x] **Storage** (`services/storage.service.js`): env-driven driver — `s3` when `S3_ACCESS_KEY && S3_BUCKET`, else `local`; S3 presigned PUT/GET (TTL `S3_PRESIGN_TTL_SECONDS` default 900, keys `clinic/<id>/records/<uuid>.<ext>`); local driver PUT `GET /files` authenticated routes with `expires` window + path-traversal guard; 25 MB cap, mime allowlist; `deleteObject`/`objectExists`; `env.js` gains `storage`/`uploadDir`/`webappUrl`/`jitsiBaseUrl`
- [x] **Routes** (`app.js`): `PUT /files` (local upload) + `GET /files` (authenticated download, tenant-scoped)
- [x] **Service** (`record.service.js`): `listRecords` (patient/type filters, pagination), `getRecord`/`recordFileUrl` tenant-scoped (`NOT_FOUND` cross-clinic), `recordUploadUrl`, `createRecord` (file-exists check → `FILE_NOT_FOUND`, mime/size validation; doctorId required for non-doctor staff → `DOCTOR_REQUIRED`), `updateRecord` (title/notes only), `deleteRecord` soft-delete + async file cleanup
- [x] **GraphQL**: `records.graphql` (`MedicalRecord`/`RecordType`/`UploadUrl`/`DownloadUrl`/`MedicalRecordConnection` + `records`/`record`/`recordFileUrl` queries + `recordUploadUrl`/`createRecord`/`updateRecord`/`deleteRecord` mutations, all `@auth(requires: STAFF)`); `records.resolver.js` registered
- [x] **Verified**: `verify-m12.mjs` → **32 passed, 0 failed** (upload-url contract, authenticated PUT upload + byte-exact download, file-exists gate, mime/size validation, text-only records, filters + pagination, URL expiry 403, path traversal 400, cross-clinic NOT_FOUND, patient-role FORBIDDEN, update, soft-delete + orphan-file cleanup, 401 without auth); M11 34/34 + M10 41/41 + M9 40/40 + M8 33/33 + M7 29/29 regression
- [x] **Client**: `features/records/api.js`; `pages/Records.jsx` (patient picker + `?patientId=` deep-link, type filter, file upload via PUT with auth header, text-only records, edit, download via blob for the local driver / direct open for S3, delete); route `/records` + sidebar link; Schedule COMPLETED → Record link; `vite build` clean

### Next (M13)

- M13 — Patient Portal: invite-first patient accounts (`Patient.userId`), `myAppointments`/`bookMyAppointment`/`cancelMyAppointment`, `myPrescriptions` + PDF, `myInvoices` + `payInvoice` (Stripe Checkout + devMode), `myRecords`, `myProfile`; `/portal` client pages + `RequirePatient` guard

---

## Environment Notes

- Node v24.18.0, npm 11.16.0
- MySQL: XAMPP MariaDB 10.4.32 on `127.0.0.1:3307` (root, no password) — DB `doctor_saas`
- npm blocked install scripts (esbuild/prisma); approved via `npm approve-scripts`
- `.env` is gitignored; local copy created from `server/.env.example`
