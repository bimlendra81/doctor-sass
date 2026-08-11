import { AppError } from "./errors.js";

export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("Validation failed", "VALIDATION_ERROR", 400, result.error.flatten().fieldErrors);
  }
  return result.data;
}
