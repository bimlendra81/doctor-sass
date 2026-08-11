import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getSentry } from "../config/sentry.js";

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logger.error("unhandled error", { error: err.message, stack: err.stack });
  getSentry()?.captureException?.(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
}
