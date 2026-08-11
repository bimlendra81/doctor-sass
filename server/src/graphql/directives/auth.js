import { getDirective, mapSchema, MapperKind } from "@graphql-tools/utils";
import { defaultFieldResolver } from "graphql";
import { Role } from "@doctor-sass/shared";
import { forbidden, unauthorized } from "../../utils/errors.js";

const ROLE_ORDER = {
  [Role.PATIENT]: 0,
  [Role.STAFF]: 1,
  [Role.DOCTOR]: 2,
  [Role.CLINIC_ADMIN]: 3,
  [Role.SUPER_ADMIN]: 4,
};

function hasRequiredRole(userRole, required) {
  return (ROLE_ORDER[userRole] ?? -1) >= (ROLE_ORDER[required] ?? Number.MAX_SAFE_INTEGER);
}

export function authDirectiveTransformer(schema) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const directive = getDirective(schema, fieldConfig, "auth")?.[0];
      if (!directive) return fieldConfig;

      const { requires } = directive;
      const originalResolver = fieldConfig.resolve ?? defaultFieldResolver;

      fieldConfig.resolve = async (source, args, context, info) => {
        const user = context.user;
        if (!user) {
          throw unauthorized("Authentication required");
        }
        if (!hasRequiredRole(user.role, requires)) {
          throw forbidden(`Role ${requires} or higher required`);
        }
        return originalResolver(source, args, context, info);
      };
      return fieldConfig;
    },
  });
}
