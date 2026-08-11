// seed-demo.mjs
// Idempotent demo data so the README credentials work out of the box.
// Usage: node scripts/seed-demo.mjs   (npm run db:seed runs drugs + demo)
//
// Demo accounts (password for all: "Password123!"):
//   admin@demo.clinic   CLINIC_ADMIN
//   doctor@demo.clinic  DOCTOR
//   patient@demo.clinic PATIENT (portal access)

import { prisma } from "../src/config/db.js";
import { hashPassword } from "../src/utils/password.js";

const DEMO_PASSWORD = "Password123!";
const DEMO_SUBDOMAIN = "demo";

function daysFromNow(days, hour = 10, minute = 0) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

async function nextScriptNo(clinicId) {
  const last = await prisma.prescription.findFirst({
    where: { clinicId, scriptNo: { not: null } },
    orderBy: { scriptNo: "desc" },
    select: { scriptNo: true },
  });
  return (last?.scriptNo ?? 0) + 1;
}

async function nextInvoiceNo(clinicId) {
  const last = await prisma.invoice.findFirst({
    where: { clinicId },
    orderBy: { invoiceNo: "desc" },
    select: { invoiceNo: true },
  });
  return (last?.invoiceNo ?? 0) + 1;
}

// --- Clinic (PRO so prescriptions + invoices are unlocked) ---
let clinic = await prisma.clinic.findUnique({ where: { subdomain: DEMO_SUBDOMAIN } });
if (!clinic) {
  clinic = await prisma.clinic.create({
    data: {
      name: "Demo Care Clinic",
      subdomain: DEMO_SUBDOMAIN,
      plan: "PRO",
      currency: "usd",
    },
  });
} else if (clinic.plan !== "PRO") {
  clinic = await prisma.clinic.update({ where: { id: clinic.id }, data: { plan: "PRO" } });
}
console.log(`clinic: ${clinic.name} (${clinic.subdomain}) plan=${clinic.plan}`);

const passwordHash = await hashPassword(DEMO_PASSWORD);

async function ensureUser(email, name, role, phone) {
  return prisma.user.upsert({
    where: { email },
    update: { clinicId: clinic.id, role, name, phone },
    create: { clinicId: clinic.id, role, name, email, phone, passwordHash, emailVerified: true },
  });
}

const admin = await ensureUser("admin@demo.clinic", "Demo Admin", "CLINIC_ADMIN", "+1 555-0100");
const doctorUser = await ensureUser("doctor@demo.clinic", "Dr. Sarah Chen", "DOCTOR", "+1 555-0101");
const patientUser = await ensureUser("patient@demo.clinic", "Riley Patel", "PATIENT", "+1 555-0102");

// --- Doctor + weekly availability (Mon-Sat 09:00-17:00, 30 min slots) ---
let doctor = await prisma.doctor.findUnique({ where: { userId: doctorUser.id } });
if (!doctor) {
  doctor = await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      specialization: "Family Medicine",
      licenseNo: "LIC-DEMO-001",
      bio: "Demo family physician.",
    },
  });
}
for (let day = 1; day <= 6; day += 1) {
  const existing = await prisma.doctorAvailability.findFirst({
    where: { clinicId: clinic.id, doctorId: doctor.id, dayOfWeek: day },
  });
  if (!existing) {
    await prisma.doctorAvailability.create({
      data: { clinicId: clinic.id, doctorId: doctor.id, dayOfWeek: day, startTime: "09:00", endTime: "17:00", slotDuration: 30 },
    });
  }
}
console.log(`doctor: ${doctorUser.name}`);

// --- Patient row linked to the portal account ---
let patient = await prisma.patient.findUnique({ where: { userId: patientUser.id } });
if (!patient) {
  patient = await prisma.patient.create({
    data: {
      clinicId: clinic.id,
      userId: patientUser.id,
      name: "Riley Patel",
      email: "patient@demo.clinic",
      phone: "+1 555-0102",
      bloodGroup: "O+",
    },
  });
}
console.log(`patient: ${patient.name} (portal enabled)`);

// --- Upcoming confirmed appointment (falls inside availability) ---
const upcomingStart = daysFromNow(1, 10, 0);
const existingAppt = await prisma.appointment.findFirst({
  where: { clinicId: clinic.id, patientId: patient.id, doctorId: doctor.id, startTime: upcomingStart },
});
if (!existingAppt) {
  await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      doctorId: doctor.id,
      patientId: patient.id,
      startTime: upcomingStart,
      endTime: new Date(upcomingStart.getTime() + 30 * 60 * 1000),
      status: "CONFIRMED",
      type: "IN_PERSON",
      note: "Demo follow-up visit.",
    },
  });
  console.log("appointment: created upcoming confirmed visit");
}

// --- Active prescription with a couple of items ---
const rxCount = await prisma.prescription.count({ where: { clinicId: clinic.id } });
if (rxCount === 0) {
  await prisma.prescription.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      doctorId: doctor.id,
      status: "ACTIVE",
      scriptNo: await nextScriptNo(clinic.id),
      issuedAt: new Date(),
      notes: "Take as directed. Follow up in 2 weeks.",
      items: {
        create: [
          { sortOrder: 0, drugName: "Amoxicillin", dosage: "500mg", frequency: "3x daily", duration: "7 days", quantity: 21, refills: 0 },
          { sortOrder: 1, drugName: "Ibuprofen", dosage: "400mg", frequency: "As needed", duration: "5 days", quantity: 20, refills: 0 },
        ],
      },
    },
  });
  console.log("prescription: created ACTIVE script");
}

// --- One OPEN and one PAID invoice ---
const invCount = await prisma.invoice.count({ where: { clinicId: clinic.id } });
if (invCount === 0) {
  const open = await prisma.invoice.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      invoiceNo: await nextInvoiceNo(clinic.id),
      subtotal: 120,
      tax: 6,
      total: 126,
      currency: "usd",
      status: "OPEN",
      dueDate: daysFromNow(14),
      items: {
        create: [
          { sortOrder: 0, description: "Office consultation", qty: 1, unitPrice: 100, amount: 100 },
          { sortOrder: 1, description: "Basic metabolic panel", qty: 1, unitPrice: 20, amount: 20 },
        ],
      },
    },
  });
  await prisma.invoice.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      invoiceNo: await nextInvoiceNo(clinic.id),
      subtotal: 50,
      tax: 2.5,
      total: 52.5,
      currency: "usd",
      status: "PAID",
      items: {
        create: [{ sortOrder: 0, description: "Follow-up visit", qty: 1, unitPrice: 50, amount: 50 }],
      },
      payments: {
        create: [{ clinicId: clinic.id, amount: 52.5, method: "CASH", note: "Paid at reception (demo)" }],
      },
    },
  });
  console.log(`invoices: created OPEN #${open.invoiceNo} + PAID`);
}

// --- A medical record ---
const recCount = await prisma.medicalRecord.count({ where: { clinicId: clinic.id } });
if (recCount === 0) {
  await prisma.medicalRecord.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      doctorId: doctor.id,
      type: "CLINICAL_NOTE",
      title: "Initial consultation",
      notes: "Patient reports fatigue over the past two weeks. Baseline labs ordered; vitals within normal range.",
    },
  });
  console.log("record: created clinical note");
}

await prisma.$disconnect();
console.log("seed-demo: done. Logins: admin@demo.clinic / doctor@demo.clinic / patient@demo.clinic (password: Password123!)");
