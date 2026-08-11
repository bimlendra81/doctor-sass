// verify-m11.mjs
// E2E verification for M11 — Notifications & Reminders.
// Requires the server running at http://localhost:4000.
// Usage: node scripts/verify-m11.mjs [BASE_URL]
//
// Covers:
//   - in-app notifications on appointment book/confirm/cancel/no-show
//   - ReminderJob ledger rows (T24H/T1H) created for future appointments,
//     idempotent under double-scheduling
//   - runDueReminders dispatches only due jobs and marks them sent
//   - myNotifications / unreadNotificationCount / markNotificationRead /
//     markAllNotificationsRead
//   - notification preferences default-on, setNotificationPreference disables
//     the IN_APP channel (fan-out skips it)
//   - password reset flow (requestPasswordReset -> resetPassword -> login)
//   - changePassword (requires current password; UNAUTHORIZED when anonymous)

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
  book: `mutation($input: BookAppointmentInput!) { bookAppointment(input: $input) { id status startTime } }`,
  confirm: `mutation($id: ID!) { confirmAppointment(id: $id) { id status } }`,
  cancel: `mutation($id: ID!, $cancelReason: String) { cancelAppointment(id: $id, cancelReason: $cancelReason) { id status } }`,
  noShow: `mutation($id: ID!) { markNoShow(id: $id) { id status } }`,
  myNotifications: `query($unreadOnly: Boolean) {
    myNotifications(unreadOnly: $unreadOnly) { total items { id type title isRead } }
  }`,
  unread: `query { unreadNotificationCount }`,
  markRead: `mutation($id: ID!) { markNotificationRead(id: $id) { id isRead } }`,
  markAll: `mutation { markAllNotificationsRead }`,
  prefs: `query { myNotificationPreferences { channel enabled } }`,
  setPref: `mutation($channel: String!, $enabled: Boolean!) { setNotificationPreference(channel: $channel, enabled: $enabled) }`,
  requestReset: `mutation($email: String!) { requestPasswordReset(email: $email) { sent token } }`,
  reset: `mutation($input: ResetPasswordInput!) { resetPassword(input: $input) }`,
  changePw: `mutation($input: ChangePasswordInput!) { changePassword(input: $input) }`,
  login: `mutation($input: LoginInput!) { login(input: $input) { accessToken } }`,
};

function nextSlotStart(now = new Date(), aheadHours = 1.25) {
  const minutes = 30 * 60000;
  return new Date(Math.ceil((now.getTime() + aheadHours * 3600 * 1000) / minutes) * minutes);
}

async function main() {
  const suffix = Date.now().toString(36);
  const password = "m11-verify-pass";
  const newPassword = "m11-new-password";

  // --- 1. Onboard clinic + doctor + patient ---
  let res = await gql(M.signup, { input: { name: "M11 Admin", email: `m11-a-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M11 Clinic A", subdomain: `m11a${suffix}` } }, res.signup.accessToken);
  const token = res.createClinic.accessToken;
  const clinicA = res.createClinic.clinic.id;
  const adminId = res.createClinic.user.id;
  check("clinic onboarded", !!clinicA);

  const docUser = await prisma.user.create({
    data: { clinicId: clinicA, role: "DOCTOR", name: "M11 Doctor", email: `m11-doc-${suffix}@test.dev` },
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
  const patient = await prisma.patient.create({
    data: { clinicId: clinicA, name: "M11 Patient A", phone: "555-0111" },
  });

  // --- 2. AuthZ ---
  let anon = false;
  try {
    await gql(`query { myNotifications { total } }`);
  } catch (err) {
    anon = err.code === "UNAUTHORIZED";
  }
  check("unauthenticated myNotifications -> UNAUTHORIZED", anon);

  let anonPw = false;
  try {
    await gql(M.changePw, { input: { currentPassword: "x", newPassword } });
  } catch (err) {
    anonPw = err.code === "UNAUTHORIZED";
  }
  check("unauthenticated changePassword -> UNAUTHORIZED", anonPw);

  // --- 3. Booking produces notifications + ReminderJob rows ---
  const slot = nextSlotStart(new Date(), 25.25);
  res = await gql(M.book, { input: { patientId: patient.id, doctorId: doctor.id, startTime: slot.toISOString() } }, token);
  const apptId = res.bookAppointment.id;
  check("appointment booked", !!apptId);

  const doctorNotifs = await prisma.notification.findMany({ where: { userId: docUser.id } });
  check(
    "staff (doctor) got an APPOINTMENT_BOOKED notification",
    doctorNotifs.some((n) => n.type === "APPOINTMENT_BOOKED" && n.isRead === false),
    `types=${doctorNotifs.map((n) => n.type).join(",")}`,
  );
  const adminNotifs = await prisma.notification.findMany({ where: { userId: adminId } });
  check("actor (admin) excluded from own fan-out", adminNotifs.length === 0, `got ${adminNotifs.length}`);

  const reminderJobs = await prisma.reminderJob.findMany({ where: { appointmentId: apptId } });
  const jobTypes = reminderJobs.map((j) => j.type).sort();
  check("ReminderJob T24H+T1H rows created", jobTypes.join(",") === "T1H,T24H", `got ${jobTypes.join(",")}`);
  const t24 = reminderJobs.find((j) => j.type === "T24H");
  check(
    "T24H scheduled 24h before start",
    Math.abs(t24.scheduledFor.getTime() - (slot.getTime() - 24 * 3600 * 1000)) < 1000,
  );
  check("jobs not yet sent", reminderJobs.every((j) => j.sentAt === null));

  // --- 4. Double-scheduling is idempotent (unique appointmentId+type) ---
  let dupBlocked = false;
  try {
    await prisma.reminderJob.create({
      data: { appointmentId: apptId, type: "T24H", scheduledFor: new Date(slot.getTime() - 24 * 3600 * 1000) },
    });
  } catch (err) {
    dupBlocked = err.code === "P2002";
  }
  check("duplicate reminder job rejected (P2002)", dupBlocked);

  // --- 5. Due reminders dispatch and mark sent ---
  const past = new Date(Date.now() - 2 * 3600 * 1000);
  const dueAppt = await prisma.appointment.create({
    data: {
      clinicId: clinicA,
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: new Date(Date.now() - 3600 * 1000),
      endTime: new Date(Date.now()),
    },
  });
  await prisma.reminderJob.create({
    data: { appointmentId: dueAppt.id, type: "T1H", scheduledFor: past },
  });

  const dispatched = await runDueRemindersNow();
  check("due reminder dispatched", dispatched.some((d) => d.appointmentId === dueAppt.id), JSON.stringify(dispatched));
  const sentJob = await prisma.reminderJob.findUnique({
    where: { appointmentId_type: { appointmentId: dueAppt.id, type: "T1H" } },
  });
  check("due reminder marked sent", sentJob.sentAt !== null);

  // --- 6. Mark read / unread count (via the doctor, who received notifications) ---
  const { signAccessToken } = await import("../src/utils/tokens.js");
  const doctorToken = signAccessToken({ id: docUser.id, clinicId: clinicA, role: "DOCTOR" });

  res = await gql(M.unread, {}, doctorToken);
  check("doctor unread count > 0", res.unreadNotificationCount > 0);

  const someId = doctorNotifs[0].id;
  res = await gql(M.markRead, { id: someId }, doctorToken);
  check("markNotificationRead flips isRead", res.markNotificationRead.isRead === true);

  let foreignRead = false;
  try {
    await gql(M.markRead, { id: "does-not-exist" }, doctorToken);
  } catch (err) {
    foreignRead = err.code === "NOT_FOUND";
  }
  check("marking a foreign notification -> NOT_FOUND", foreignRead);

  res = await gql(M.markAll, {}, doctorToken);
  check("markAllNotificationsRead succeeds", res.markAllNotificationsRead === true);
  res = await gql(M.unread, {}, doctorToken);
  check("unread count drops to 0", res.unreadNotificationCount === 0, `got ${res.unreadNotificationCount}`);

  // --- 7. Preferences gate the IN_APP channel ---
  res = await gql(M.prefs, {}, token);
  const prefMap = Object.fromEntries(res.myNotificationPreferences.map((p) => [p.channel, p.enabled]));
  check("all channels default on", prefMap.EMAIL === true && prefMap.SMS === true && prefMap.IN_APP === true);

  res = await gql(M.setPref, { channel: "IN_APP", enabled: false }, token);
  check("IN_APP preference updated", res.setNotificationPreference === true);

  const adminBefore = await prisma.notification.count({ where: { userId: adminId } });
  const slot2 = nextSlotStart(new Date(), 1.25);
  res = await gql(M.book, { input: { patientId: patient.id, doctorId: doctor.id, startTime: slot2.toISOString() } }, doctorToken);
  check("second appointment booked", !!res.bookAppointment.id);

  const adminAfter = await prisma.notification.count({ where: { userId: adminId } });
  check(
    "booking while admin IN_APP disabled creates no in-app notification for admin",
    adminAfter === adminBefore,
    `before=${adminBefore} after=${adminAfter}`,
  );

  res = await gql(M.setPref, { channel: "IN_APP", enabled: true }, token);
  check("IN_APP preference re-enabled", res.setNotificationPreference === true);

  // --- 8. Status transitions notify ---
  res = await gql(M.confirm, { id: apptId }, token);
  check("appointment confirmed", res.confirmAppointment.status === "CONFIRMED");
  res = await gql(M.myNotifications, {}, doctorToken);
  check(
    "APPOINTMENT_CONFIRMED notified",
    res.myNotifications.items.some((n) => n.type === "APPOINTMENT_CONFIRMED"),
  );

  res = await gql(M.cancel, { id: dueAppt.id, cancelReason: "test cancel" }, token);
  check("appointment cancelled", res.cancelAppointment.status === "CANCELLED");
  res = await gql(M.myNotifications, {}, doctorToken);
  check(
    "APPOINTMENT_CANCELLED notified",
    res.myNotifications.items.some((n) => n.type === "APPOINTMENT_CANCELLED"),
  );

  // --- 9. Password reset flow ---
  res = await gql(M.requestReset, { email: `m11-a-${suffix}@test.dev` });
  check("requestPasswordReset sent", res.requestPasswordReset.sent === true, JSON.stringify(res.requestPasswordReset));
  const resetToken = res.requestPasswordReset.token;
  check("dev reset token returned", !!resetToken);

  res = await gql(M.reset, { input: { token: resetToken, newPassword } });
  check("resetPassword succeeds", res.resetPassword === true);

  let oldPwRejected = false;
  try {
    await gql(M.login, { input: { email: `m11-a-${suffix}@test.dev`, password } });
  } catch (err) {
    oldPwRejected = err.code === "UNAUTHORIZED";
  }
  check("old password rejected after reset", oldPwRejected);

  res = await gql(M.login, { input: { email: `m11-a-${suffix}@test.dev`, password: newPassword } });
  const newToken = res.login.accessToken;
  check("login with new password works", !!newToken);

  let badCurrent = false;
  try {
    await gql(M.changePw, { input: { currentPassword: "wrong-current", newPassword } }, newToken);
  } catch (err) {
    badCurrent = err.code === "INVALID_PASSWORD";
  }
  check("changePassword with wrong current -> INVALID_PASSWORD", badCurrent);

  res = await gql(M.changePw, { input: { currentPassword: newPassword, newPassword: "m11-final-pass" } }, newToken);
  check("changePassword succeeds", res.changePassword === true);

  let badReset = false;
  try {
    await gql(M.reset, { input: { token: resetToken, newPassword } });
  } catch (err) {
    badReset = err.code === "INVALID_RESET_TOKEN";
  }
  check("reset token single-use (reuse rejected)", badReset);

  // --- 10. Cleanup ---
  await prisma.appointment.deleteMany({ where: { clinicId: clinicA } });
  await prisma.reminderJob.deleteMany({ where: { appointment: { clinicId: clinicA } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [adminId, docUser.id] } } });

  console.log(`\nM11 verify: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

async function runDueRemindersNow() {
  const { runDueReminders } = await import("../src/services/reminder.service.js");
  return runDueReminders();
}

main().catch((err) => {
  console.error("\nM11 verify crashed:", err.message);
  process.exit(1);
});
