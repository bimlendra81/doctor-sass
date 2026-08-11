// verify-m7.mjs
// E2E verification for M7 — Clinic Settings & Branding (timezone + branding).
// Requires the server running at http://localhost:4000/graphql.
// Usage: node scripts/verify-m7.mjs [API_URL]
//
// Covers:
//   - clinicSettings defaults + updateClinicSettings (brand/timezone/contact/currency)
//   - doctorSlots generated in the clinic's timezone (wall-clocks stay put, ISO shifts)
//   - day-scoped queries (appointments/dashboard) interpret the day clinic-locally
//   - negative paths: STAFF blocked from update, invalid timezone/currency, empty→null

const API = process.argv[2] ?? "http://localhost:4000/graphql";

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

function wallClock(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour").value.padStart(2, "0");
  const m = parts.find((p) => p.type === "minute").value.padStart(2, "0");
  return `${h}:${m}`;
}

function zonedDateStr(utcDate, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(utcDate);
  const p = {};
  for (const part of parts) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}`;
}

// Next Monday computed from UTC (safe for forward zones like Auckland).
function nextMondayStr() {
  const now = new Date();
  const day = now.getUTCDay();
  const delta = (1 - day + 7) % 7 || 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + delta));
  return monday.toISOString().slice(0, 10);
}

const M = {
  signup: `mutation($input: SignupInput!) { signup(input: $input) { accessToken refreshToken user { id role clinicId } } }`,
  login: `mutation($input: LoginInput!) { login(input: $input) { accessToken refreshToken user { id role clinicId } } }`,
  createClinic: `mutation($input: CreateClinicInput!) {
    createClinic(input: $input) { accessToken refreshToken clinic { id } user { id role clinicId } }
  }`,
  clinicSettings: `query { clinicSettings {
    id name subdomain timezone brandName logoUrl contactEmail contactPhone currency plan subscriptionStatus
  } }`,
  updateSettings: `mutation($input: UpdateClinicSettingsInput!) {
    updateClinicSettings(input: $input) { settings {
      name timezone brandName logoUrl contactEmail contactPhone currency
    } }
  }`,
  invite: `mutation($input: InviteInput!) { inviteStaff(input: $input) { inviteToken } }`,
  acceptInvite: `mutation($input: AcceptInviteInput!) {
    acceptInvite(input: $input) { accessToken refreshToken user { id role clinicId } }
  }`,
  upsertProfile: `mutation($input: DoctorProfileInput!) { upsertDoctorProfile(input: $input) { id } }`,
  setAvailability: `mutation($input: AvailabilityInput!) {
    setAvailability(input: $input) { id dayOfWeek startTime endTime slotDuration }
  }`,
  doctors: `query { doctors { id user { name } } }`,
  doctorSlots: `query($doctorId: ID!, $date: String!) { doctorSlots(doctorId: $doctorId, date: $date) {
    startTime endTime booked appointmentId status
  } }`,
  createPatient: `mutation($input: CreatePatientInput!) { createPatient(input: $input) { id name } }`,
  book: `mutation($input: BookAppointmentInput!) { bookAppointment(input: $input) { id status startTime } }`,
  appointments: `query($date: String) { appointments(date: $date) { id startTime status } }`,
  dashboard: `query($date: String) { dashboard(date: $date) { date total byStatus { status count } } }`,
};

async function main() {
  const suffix = Date.now().toString(36);
  const adminEmail = `m7-admin-${suffix}@test.dev`;
  const password = "m7-verify-pass";
  const subdomain = `m7${suffix}`;
  const monday = nextMondayStr();
  const sunday = new Date(new Date(`${monday}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

  console.log(`\nM7 verify \u2014 clinic ${subdomain}, next Monday ${monday}\n`);

  // --- 1. Onboard a clinic owner ---
  let res = await gql(M.signup, { input: { name: "M7 Admin", email: adminEmail, password } });
  const adminTokens = res.signup.accessToken;
  check("signup creates CLINIC_ADMIN", res.signup.user.role === "CLINIC_ADMIN");

  res = await gql(
    M.createClinic,
    { input: { name: "M7 Clinic", subdomain } },
    adminTokens,
  );
  check("createClinic attaches tenant", !!res.createClinic.clinic.id && res.createClinic.user.clinicId === res.createClinic.clinic.id);
  const token = res.createClinic.accessToken;

  // --- 2. Defaults ---
  res = await gql(M.clinicSettings, {}, token);
  const defaults = res.clinicSettings;
  check("default timezone is UTC", defaults.timezone === "UTC");
  check("default currency is usd", defaults.currency === "usd");

  // --- 3. Branding + timezone update ---
  res = await gql(
    M.updateSettings,
    {
      input: {
        brandName: "M7 Clinic & Co",
        logoUrl: "https://example.com/logo.png",
        contactEmail: "front@m7.dev",
        contactPhone: "+15551234567",
        timezone: "Pacific/Auckland",
        currency: "nzd",
      },
    },
    token,
  );
  const branded = res.updateClinicSettings.settings;
  check("brandName persisted", branded.brandName === "M7 Clinic & Co");
  check("logoUrl persisted", branded.logoUrl === "https://example.com/logo.png");
  check("contactEmail persisted", branded.contactEmail === "front@m7.dev");
  check("contactPhone persisted", branded.contactPhone === "+15551234567");
  check("timezone persisted (Auckland)", branded.timezone === "Pacific/Auckland");
  check("currency persisted (nzd)", branded.currency === "nzd");

  // --- 4. Doctor availability + slots in clinic timezone ---
  res = await gql(
    M.invite,
    { input: { name: "M7 Doctor", email: `m7-doc-${suffix}@test.dev`, role: "DOCTOR" } },
    token,
  );
  const doctorInvite = res.inviteStaff.inviteToken;

  res = await gql(M.acceptInvite, {
    input: { inviteToken: doctorInvite, name: "M7 Doctor", password },
  });
  const doctorToken = res.acceptInvite.accessToken;
  check("doctor activated into clinic", res.acceptInvite.user.clinicId === defaults.id);

  await gql(M.upsertProfile, { input: {} }, doctorToken);
  await gql(
    M.setAvailability,
    { input: { dayOfWeek: 1, startTime: "09:00", endTime: "10:00", slotDuration: 30 } },
    doctorToken,
  );

  res = await gql(M.doctors, {}, token);
  const doctorId = res.doctors[0].id;

  res = await gql(M.doctorSlots, { doctorId, date: monday }, token);
  const aucklandSlots = res.doctorSlots;
  check("Auckland Monday yields 2 slots", aucklandSlots.length === 2, `got ${aucklandSlots.length}`);
  check(
    "Auckland slot wall-clocks are 09:00/09:30",
    aucklandSlots.map((s) => wallClock(s.startTime, "Pacific/Auckland")).join(",") === "09:00,09:30",
    `got ${aucklandSlots.map((s) => wallClock(s.startTime, "Pacific/Auckland")).join(",")}`,
  );

  // --- 5. Changing timezone moves the instants, not the wall-clocks ---
  await gql(M.updateSettings, { input: { timezone: "Asia/Tokyo" } }, token);
  res = await gql(M.doctorSlots, { doctorId, date: monday }, token);
  const tokyoSlots = res.doctorSlots;
  check(
    "Tokyo slot wall-clocks are still 09:00/09:30",
    tokyoSlots.map((s) => wallClock(s.startTime, "Asia/Tokyo")).join(",") === "09:00,09:30",
  );
  check(
    "timezone change shifted the slot instants",
    tokyoSlots[0].startTime !== aucklandSlots[0].startTime,
    `same instant for both zones: ${tokyoSlots[0].startTime}`,
  );
  check(
    "Tokyo slot is 00:00Z (UTC+9)",
    new Date(tokyoSlots[0].startTime).toISOString() === `${monday}T00:00:00.000Z`,
    tokyoSlots[0].startTime,
  );

  // --- 6. Book on a clinic-local slot; day queries use clinic-local day ---
  res = await gql(
    M.createPatient,
    { input: { name: "M7 Patient", phone: "555-0100" } },
    token,
  );
  const patientId = res.createPatient.id;

  res = await gql(
    M.book,
    { input: { patientId, doctorId, startTime: tokyoSlots[0].startTime } },
    token,
  );
  check("bookAppointment succeeded", res.bookAppointment.status === "PENDING");

  res = await gql(M.dashboard, { date: monday }, token);
  check("dashboard(monday) counts the booking in Tokyo tz", res.dashboard.total === 1, `got ${res.dashboard.total}`);

  res = await gql(M.appointments, { date: monday }, token);
  check("appointments(monday) returns the booking in Tokyo tz", res.appointments.length === 1);

  // --- 7. West-of-UTC clinic: the same instant lands on a different clinic-local day ---
  await gql(M.updateSettings, { input: { timezone: "America/Los_Angeles" } }, token);
  await gql(
    M.setAvailability,
    { input: { dayOfWeek: 1, startTime: "23:00", endTime: "23:30", slotDuration: 30 } },
    doctorToken,
  );
  res = await gql(M.doctorSlots, { doctorId, date: monday }, token);
  check(
    "LA Monday 23:00 rule yields one slot at 23:00 local",
    res.doctorSlots.length === 1 && wallClock(res.doctorSlots[0].startTime, "America/Los_Angeles") === "23:00",
  );

  res = await gql(M.appointments, { date: monday }, token);
  check(
    "Tokyo booking is NOT on LA Monday (day-boundary re-interpretation)",
    res.appointments.length === 0,
  );
  res = await gql(M.appointments, { date: sunday }, token);
  check(
    "Tokyo booking IS on LA Sunday (2026-08-17T00:00Z = LA Sun 17:00)",
    res.appointments.length === 1,
    `expected 1 on ${sunday}, got ${res.appointments.length}`,
  );

  res = await gql(M.dashboard, {}, token);
  check(
    "dashboard() defaults to clinic-local today",
    res.dashboard.date === zonedDateStr(new Date(), "America/Los_Angeles"),
    `got ${res.dashboard.date}`,
  );

  // --- 8. Staff: can read settings, cannot update them ---
  res = await gql(
    M.invite,
    { input: { name: "M7 Staff", email: `m7-staff-${suffix}@test.dev`, role: "STAFF" } },
    token,
  );
  res = await gql(M.acceptInvite, {
    input: { inviteToken: res.inviteStaff.inviteToken, name: "M7 Staff", password },
  });
  const staffToken = res.acceptInvite.accessToken;

  res = await gql(M.clinicSettings, {}, staffToken);
  check("STAFF can read clinicSettings", res.clinicSettings.timezone === "America/Los_Angeles");

  let forbidden = false;
  try {
    await gql(M.updateSettings, { input: { brandName: "Nope" } }, staffToken);
  } catch (err) {
    forbidden = err.code === "FORBIDDEN";
  }
  check("STAFF blocked from updateClinicSettings (FORBIDDEN)", forbidden);

  // --- 9. Validation + normalization ---
  let invalidTz = false;
  try {
    await gql(M.updateSettings, { input: { timezone: "Mars/Olympus" } }, token);
  } catch (err) {
    invalidTz = err.code === "VALIDATION_ERROR";
  }
  check("invalid timezone rejected (VALIDATION_ERROR)", invalidTz);

  let invalidCur = false;
  try {
    await gql(M.updateSettings, { input: { currency: "btc" } }, token);
  } catch (err) {
    invalidCur = err.code === "VALIDATION_ERROR";
  }
  check("invalid currency rejected (VALIDATION_ERROR)", invalidCur);

  res = await gql(M.updateSettings, { input: { contactEmail: "" } }, token);
  check("empty contactEmail clears to null", res.updateClinicSettings.settings.contactEmail === null);

  res = await gql(M.updateSettings, { input: { name: "M7 Clinic" } }, token);
  check("partial update leaves other fields intact", res.updateClinicSettings.settings.timezone === "America/Los_Angeles");

  console.log(`\nM7 verify: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nM7 verify crashed:", err.message);
  process.exit(1);
});
