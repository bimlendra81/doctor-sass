import { AppError } from "../utils/errors.js";

/**
 * Skeleton for M2 (RBAC). Fills in later; today it only documents that every
 * tenant-scoped DB query must be filtered by `clinicId` from the token/context,
 * never from client-supplied arguments.
 */
export function tenantMiddleware(_req, _res, next) {
  next();
}

export function assertTenantScope(req) {
  const clinicId = req.user?.clinicId;
  if (!clinicId) {
    throw new AppError("Tenant scope required", "TENANT_REQUIRED", 403);
  }
  return clinicId;
}
