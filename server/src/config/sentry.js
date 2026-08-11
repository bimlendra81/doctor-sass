import { logger } from "../utils/logger.js";

let sentry = null;

export async function initSentry() {
  if (!process.env.SENTRY_DSN) {
    logger.info("Sentry not configured (SENTRY_DSN missing) — skipping");
    return null;
  }
  try {
    const { init, captureException } = await import("@sentry/node");
    init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
      release: process.env.npm_package_version,
    });
    sentry = { captureException };
    logger.info("Sentry initialized");
  } catch (err) {
    logger.warn("Sentry init failed (falling back to logs only)", { error: err.message });
  }
  return sentry;
}

export function getSentry() {
  return sentry;
}
