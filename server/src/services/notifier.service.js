import nodemailer from "nodemailer";
import { logger } from "../utils/logger.js";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) {
    // Dev fallback: capture the composed message instead of attempting a network send.
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  try {
    const info = await getTransporter().sendMail({
      from: process.env.MAIL_FROM ?? "Doctor SaaS <no-reply@doctor-saas.dev>",
      to,
      subject,
      html,
      text,
    });
    logger.info("email dispatched", { to, subject, messageId: info.messageId });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    logger.error("email send failed", { to, subject, error: err.message });
    return { ok: false, error: err.message };
  }
}

export async function sendSms({ to, body }) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM) {
    logger.info("sms not configured, skipping", { to });
    return { ok: true, skipped: true };
  }
  // Twilio SDK is an optional dependency; only exercised when configured.
  const { default: twilio } = await import("twilio");
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const message = await client.messages.create({
    to,
    from: process.env.TWILIO_FROM,
    body,
  });
  logger.info("sms dispatched", { to, sid: message.sid });
  return { ok: true, sid: message.sid };
}
