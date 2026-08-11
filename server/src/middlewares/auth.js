import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { unauthorized } from "../utils/errors.js";

/**
 * Skeleton for M2 (Auth & RBAC).
 * Decodes the Bearer access token when present and attaches `req.user`.
 * Does not reject anonymous requests yet — M2 adds the `requireAuth` guard.
 */
export function authMiddleware(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.jwt.accessSecret);
    req.user = { id: payload.sub, clinicId: payload.clinicId, role: payload.role };
  } catch {
    // Invalid/expired token: leave req.user unset. M2 turns this into 401.
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) {
    next(unauthorized("Authentication required"));
    return;
  }
  next();
}
