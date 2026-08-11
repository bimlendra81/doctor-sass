import PDFDocument from "pdfkit";
import { prisma } from "../../config/db.js";
import { notFound } from "../../utils/errors.js";
import { getClinicTimezone } from "../clinic.service.js";
import { zonedDateStr } from "../../utils/timezone.js";

const PAGE_W = 288;
const PAGE_H = 432;
const MARGIN = 16;

function clean(value) {
  return value == null ? "" : String(value).replace(/[\u0000-\u001f]/g, " ");
}

async function tryFetchImage(url) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/^image\/(png|jpe?g)/i.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length < 64 ? null : buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getPrescriptionPdf(user, id) {
  const prescription = await prisma.prescription.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      patient: true,
      doctor: { include: { user: true } },
    },
  });
  if (!prescription) {
    throw notFound("Prescription not found");
  }
  if (prescription.status === "VOID") {
    throw notFound("Voided prescriptions have no PDF");
  }
  const clinic = await prisma.clinic.findUnique({ where: { id: prescription.clinicId } });
  const timeZone = await getClinicTimezone(prescription.clinicId);
  return buildPrescriptionPdf({ prescription, clinic, doctor: prescription.doctor, patient: prescription.patient, timeZone });
}

export async function buildPrescriptionPdf({ prescription, clinic, doctor, patient, timeZone }) {
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: false,
  });

  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const brandName = clean(clinic.brandName || clinic.name);
  const clinicName = clean(clinic.name);
  const contact = [clinic.contactPhone, clinic.contactEmail].filter(Boolean).join("  \u00b7  ");
  const issuedAt = prescription.issuedAt ?? prescription.createdAt;
  const issuedDate = zonedDateStr(new Date(issuedAt), timeZone ?? "UTC");
  const scriptNo = prescription.scriptNo != null ? String(prescription.scriptNo).padStart(4, "0") : "\u2014";
  const patientDob = patient.dob ? zonedDateStr(new Date(patient.dob), timeZone ?? "UTC") : "\u2014";
  const doctorName = clean(doctor?.user?.name ?? doctor?.name ?? "Doctor");

  // --- Header: Rx icon + brand ---
  doc.rect(0, 0, PAGE_W, 52).fill("#0f766e");
  doc.fill("#ffffff");
  doc.font("Helvetica-Bold").fontSize(17).text("\u211e", MARGIN, 12, { continued: true });
  doc.fontSize(14).text(`  ${brandName}`, { width: PAGE_W - MARGIN * 2, align: "left" });
  doc.font("Helvetica").fontSize(7.5).fillColor("#d1fae5").text(clean(clinicName), MARGIN, 32);
  if (contact) {
    doc.text(contact, MARGIN, 41, { width: PAGE_W - MARGIN * 2 });
  }

  // --- Script number chip ---
  doc.rect(PAGE_W - MARGIN - 78, 12, 78, 26).fill("#134e4a");
  doc.fill("#ffffff").font("Helvetica-Bold").fontSize(7).text("SCRIPT NO.", PAGE_W - MARGIN - 72, 17, { width: 66, align: "center" });
  doc.fontSize(10).text(scriptNo, PAGE_W - MARGIN - 72, 25, { width: 66, align: "center" });

  let y = 62;

  // --- Patient / Doctor / Date grid ---
  doc.fillColor("#0f172a");
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#475569").text("PATIENT", MARGIN, y);
  doc.fillColor("#0f172a").fontSize(9).font("Helvetica").text(clean(patient.name), MARGIN, y + 8);
  doc.fontSize(6.5).fillColor("#64748b").text(`DOB: ${patientDob}`, MARGIN, y + 18);

  doc.font("Helvetica-Bold").fontSize(7).fillColor("#475569").text("DOCTOR", MARGIN + 96, y);
  doc.fillColor("#0f172a").fontSize(9).font("Helvetica").text(doctorName, MARGIN + 96, y + 8);
  const license = doctor?.licenseNo ? `Lic. ${clean(doctor.licenseNo)}` : "";
  if (license) {
    doc.fontSize(6.5).fillColor("#64748b").text(license, MARGIN + 96, y + 18);
  }

  doc.font("Helvetica-Bold").fontSize(7).fillColor("#475569").text("DATE", PAGE_W - MARGIN - 60, y, { width: 60, align: "right" });
  doc.fillColor("#0f172a").fontSize(9).font("Helvetica").text(issuedDate, PAGE_W - MARGIN - 60, y + 8, { width: 60, align: "right" });

  y += 40;

  // --- Items table ---
  doc.moveDown(0);
  const tableTop = y;
  const colX = [MARGIN, MARGIN + 92, MARGIN + 128, MARGIN + 162, MARGIN + 216, MARGIN + 252];
  const colW = [86, 34, 32, 52, 34, 20];
  const headers = ["Drug", "Strength", "Dosage", "Frequency", "Qty", "Ref"];

  doc.fillColor("#0f766e");
  doc.rect(MARGIN - 2, tableTop - 4, PAGE_W - MARGIN * 2 + 4, 14).fill();
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(6.5);
  headers.forEach((h, i) => doc.text(h, colX[i], tableTop, { width: colW[i], align: i >= 4 ? "center" : "left" }));

  let rowY = tableTop + 16;
  doc.fillColor("#0f172a").font("Helvetica").fontSize(7);
  for (const item of prescription.items) {
    const name = clean(item.drugName);
    const strength = clean(item.strength);
    const dosage = clean(item.dosage);
    const frequency = clean(item.frequency);
    const quantity = item.quantity != null ? String(item.quantity) : "\u2014";
    const refills = item.refills != null ? String(item.refills) : "0";
    doc.text(name, colX[0], rowY, { width: colW[0] });
    doc.text(strength, colX[1], rowY, { width: colW[1], align: "center" });
    doc.text(dosage, colX[2], rowY, { width: colW[2], align: "center" });
    doc.text(frequency, colX[3], rowY, { width: colW[3], align: "center" });
    doc.text(quantity, colX[4], rowY, { width: colW[4], align: "center" });
    doc.text(refills, colX[5], rowY, { width: colW[5], align: "center" });
    rowY += 13;
  }

  y = rowY + 6;

  // --- Notes ---
  if (prescription.notes) {
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#475569").text("NOTES", MARGIN, y);
    doc.font("Helvetica").fontSize(7).fillColor("#0f172a").text(clean(prescription.notes), MARGIN, y + 8, {
      width: PAGE_W - MARGIN * 2,
    });
  }

  // --- Footer ---
  doc.moveTo(MARGIN, PAGE_H - MARGIN - 24).lineTo(PAGE_W - MARGIN, PAGE_H - MARGIN - 24).strokeColor("#cbd5e1").stroke();
  doc.fillColor("#64748b").font("Helvetica").fontSize(6.5);
  doc.text(`Prescribed by ${doctorName} \u2014 ${clinicName}`, MARGIN, PAGE_H - MARGIN - 18, {
    width: PAGE_W - MARGIN * 2,
    align: "left",
  });
  doc.font("Helvetica-Bold").text(`Script \u2116 ${scriptNo}`, MARGIN, PAGE_H - MARGIN - 10, {
    width: PAGE_W - MARGIN * 2,
    align: "right",
  });

  doc.end();
  return done;
}
