import type { EnvironmentNameType } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import { HttpStatus, type StatusCodeType } from "@talosjs/http-status";
import { GUEST_ROLE, type IRolesConfig, Role } from "@talosjs/role";
import type { RouteConfigType } from "@talosjs/routing";
import { type AssertType, type IAssert, isAssert, isAssertRecord, validateAssert } from "@talosjs/validation";

const role = new Role();

export type RouteValidationErrorType = { message: string; status: StatusCodeType; key?: string | null };

export const validateConstraint = (constraint: AssertType | IAssert, value: unknown): string | null => {
  const result = validateAssert(constraint, value);
  return result.isValid ? null : result.message || "Validation failed";
};

type SchemaJsonType = {
  domain?: unknown;
  index?: unknown;
  undeclared?: unknown;
  required?: { key: unknown }[];
  optional?: { key: unknown }[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isObjectSchema = (json: unknown): json is SchemaJsonType => isPlainObject(json) && json.domain === "object";

const keysOfSchemaJson = (json: unknown): string[] | null => {
  if (Array.isArray(json)) {
    const branches = json.filter(isObjectSchema).map(keysOfSchemaJson);
    if (branches.length === 0 || branches.some((keys) => keys === null)) {
      return null;
    }
    return branches.flatMap((keys) => keys ?? []);
  }
  // An index signature or `"+": "reject"` keeps the undeclared keys: the schema accepts them,
  // or validation rejects the request before a controller can read them
  if (!isObjectSchema(json) || json.index !== undefined || json.undeclared === "reject") {
    return null;
  }
  const keys = [...(json.required ?? []), ...(json.optional ?? [])].map(({ key }) => String(key));
  return keys.length > 0 ? keys : null;
};

/**
 * The keys an object constraint declares, or null when it declares none — a scalar, an empty
 * or open object (`"object"`, `{}`, an index signature) — and so accepts any key
 */
export const declaredKeys = (constraint: AssertType | IAssert): string[] | null => {
  if (isAssert(constraint)) {
    return declaredKeys(constraint.getConstraint());
  }
  if (isAssertRecord(constraint)) {
    const keys = Object.keys(constraint);
    return keys.length > 0 ? keys : null;
  }
  return keysOfSchemaJson(constraint.json);
};

const pickDeclared = (constraint: AssertType | IAssert | undefined, value: unknown): Record<string, unknown> | null => {
  if (!constraint || !isPlainObject(value)) {
    return null;
  }
  const keys = declaredKeys(constraint);
  return keys ? Object.fromEntries(Object.entries(value).filter(([key]) => keys.includes(key))) : null;
};

/**
 * Keep in `context.queries` and `context.payload` only the keys the route declares, so a controller
 * that spreads them after a trusted value (`{ userId, ...context.queries }`) cannot have it replaced
 * by the caller. A route without a constraint, or with an open one (see `declaredKeys`), keeps
 * everything; `context.request.queries` and `context.request.payload` always hold the raw input.
 */
export const keepDeclaredInput = (context: ContextType, route: RouteConfigType): void => {
  const queries = pickDeclared(route.queries, context.queries);
  if (queries) {
    context.queries = queries as ContextType["queries"];
  }
  const payload = pickDeclared(route.payload, context.payload);
  if (payload) {
    context.payload = payload as ContextType["payload"];
  }
};

export const validateRouteAccess = async (
  context: ContextType,
  route: RouteConfigType,
  currentEnv: EnvironmentNameType,
): Promise<RouteValidationErrorType | null> => {
  if (route.params) {
    const error = validateConstraint(route.params, context.params);
    if (error) {
      return {
        message: `Invalid parameter: ${error}`,
        status: HttpStatus.Code.BadRequest,
        key: "INVALID_PARAMETER",
      };
    }
  }
  if (route.queries) {
    const error = validateConstraint(route.queries, context.queries);
    if (error) {
      return {
        message: `Invalid query parameters: ${error}`,
        status: HttpStatus.Code.BadRequest,
        key: "INVALID_QUERY",
      };
    }
  }
  if (route.payload) {
    const error = validateConstraint(route.payload, context.payload);
    if (error) {
      return {
        message: `Invalid payload: ${error}`,
        status: HttpStatus.Code.BadRequest,
        key: "INVALID_PAYLOAD",
      };
    }
  }
  if (route.files) {
    const error = validateConstraint(route.files, context.files);
    if (error) {
      return {
        message: `Invalid file: ${error}`,
        status: HttpStatus.Code.BadRequest,
        key: "INVALID_FILE",
      };
    }
  }
  if (route.env && route.env.length > 0 && !route.env.includes(currentEnv)) {
    return {
      message: `Route "${route.name}" is not available in "${currentEnv}" environment`,
      status: HttpStatus.Code.NotAcceptable,
      key: "ROUTE_ENV_NOT_ALLOWED",
    };
  }
  if (route.ip && route.ip.length > 0 && (!context.ip || !route.ip.includes(context.ip))) {
    return {
      message: `Route "${route.name}" is not available for IP "${context.ip}"`,
      status: HttpStatus.Code.NotAcceptable,
      key: "ROUTE_IP_NOT_ALLOWED",
    };
  }
  if (route.host && route.host.length > 0 && !route.host.includes(context.host)) {
    return {
      message: `Route "${route.name}" is not available for host "${context.host}"`,
      status: HttpStatus.Code.NotAcceptable,
      key: "ROUTE_HOST_NOT_ALLOWED",
    };
  }
  if (route.roles && route.roles.length > 0) {
    const rolesConfig = container.hasConstant("app.roles") ? container.getConstant<IRolesConfig>("app.roles") : null;
    const guestRole = rolesConfig?.roles.GUEST ?? GUEST_ROLE;
    const isPublicRoute = route.roles.includes(guestRole);
    if (!isPublicRoute) {
      if (!context.user || !context.user.roles || context.user.roles.length === 0) {
        return {
          message: `Route "${route.name}" requires authentication`,
          status: HttpStatus.Code.Forbidden,
          key: "AUTHENTICATION_REQUIRED",
        };
      }
      const userRoles = context.user.roles;
      const hasRequiredRole = route.roles.some(
        (requiredRole) =>
          userRoles.includes(requiredRole) ||
          (rolesConfig !== null && userRoles.some((userRole) => role.hasRole(userRole, requiredRole, rolesConfig))),
      );
      if (!hasRequiredRole) {
        return {
          message: `Route "${route.name}" is not accessible for user roles`,
          status: HttpStatus.Code.NotAcceptable,
          key: "ROLE_NOT_ALLOWED",
        };
      }
    }
  }
  return null;
};

export const validateResponse = (route: RouteConfigType, data: unknown): RouteValidationErrorType | null => {
  if (route.response) {
    const error = validateConstraint(route.response, data);
    if (error) {
      return {
        message: `Invalid response: ${error}`,
        status: HttpStatus.Code.NotAcceptable,
        key: "INVALID_RESPONSE",
      };
    }
  }
  return null;
};
