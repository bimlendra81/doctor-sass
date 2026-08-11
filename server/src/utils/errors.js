export class AppError extends Error {
  constructor(message, code, statusCode = 400, details) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function notFound(message = "Not found") {
  return new AppError(message, "NOT_FOUND", 404);
}

export function unauthorized(message = "Unauthorized") {
  return new AppError(message, "UNAUTHORIZED", 401);
}

export function forbidden(message = "Forbidden") {
  return new AppError(message, "FORBIDDEN", 403);
}
