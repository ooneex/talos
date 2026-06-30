import type { EnvironmentNameType } from "@talosjs/app-env";
import type { ContextType } from "@talosjs/controller";
import { HttpStatus, type StatusCodeType } from "@talosjs/http-status";
import type { RouteConfigType } from "@talosjs/routing";
import { type AssertType, type IAssert, type } from "@talosjs/validation";

export type RouteValidationErrorType = { message: string; status: StatusCodeType; key?: string | null };

export const validateConstraint = (constraint: AssertType | IAssert, value: unknown): string | null => {
  if (
    constraint !== null &&
    typeof constraint === "object" &&
    "validate" in constraint &&
    typeof constraint.validate === "function"
  ) {
    const result = constraint.validate(value);
    if (!result.isValid) {
      return result.message || "Validation failed";
    }
  } else if (typeof constraint === "function") {
    const result = constraint(value);
    if (result instanceof type.errors) {
      return result.summary;
    }
  }

  return null;
};

export const validateRouteAccess = async (
  context: ContextType,
  route: RouteConfigType,
  currentEnv: EnvironmentNameType,
): Promise<RouteValidationErrorType | null> => {
  // Check params
  if (route.params) {
    for (const [paramName, constraint] of Object.entries(route.params)) {
      const error = validateConstraint(constraint, context.params?.[paramName]);
      if (error) {
        return {
          message: `Invalid parameter "${paramName}": ${error}`,
          status: HttpStatus.Code.BadRequest,
          key: "INVALID_PARAMETER",
        };
      }
    }
  }

  // Check queries
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

  // Check payload
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

  // Check env
  if (route.env && route.env.length > 0 && !route.env.includes(currentEnv)) {
    return {
      message: `Route "${route.name}" is not available in "${currentEnv}" environment`,
      status: HttpStatus.Code.NotAcceptable,
      key: "ROUTE_ENV_NOT_ALLOWED",
    };
  }

  // Check ip
  if (route.ip && route.ip.length > 0 && (!context.ip || !route.ip.includes(context.ip))) {
    return {
      message: `Route "${route.name}" is not available for IP "${context.ip}"`,
      status: HttpStatus.Code.NotAcceptable,
      key: "ROUTE_IP_NOT_ALLOWED",
    };
  }

  // Check host
  if (route.host && route.host.length > 0 && !route.host.includes(context.host)) {
    return {
      message: `Route "${route.name}" is not available for host "${context.host}"`,
      status: HttpStatus.Code.NotAcceptable,
      key: "ROUTE_HOST_NOT_ALLOWED",
    };
  }

  // Check roles
  if (route.roles && route.roles.length > 0) {
    if (!context.user || !context.user.roles || context.user.roles.length === 0) {
      return {
        message: `Route "${route.name}" requires authentication`,
        status: HttpStatus.Code.Forbidden,
        key: "AUTHENTICATION_REQUIRED",
      };
    }

    const hasRequiredRole = route.roles.some((requiredRole) => context.user?.roles.includes(requiredRole));

    if (!hasRequiredRole) {
      return {
        message: `Route "${route.name}" is not accessible for user roles`,
        status: HttpStatus.Code.NotAcceptable,
        key: "ROLE_NOT_ALLOWED",
      };
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
