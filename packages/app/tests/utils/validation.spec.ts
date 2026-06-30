import { describe, expect, test } from "bun:test";
import { Environment } from "@talosjs/app-env";
import type { ContextType } from "@talosjs/controller";
import { HttpStatus } from "@talosjs/http-status";
import type { RouteConfigType } from "@talosjs/routing";
import { type AssertType, type IAssert, type } from "@talosjs/validation";
import { validateConstraint, validateResponse, validateRouteAccess } from "@/utils/validation";
import { createMockContext, createMockRoute } from "./helpers";

describe("validateConstraint", () => {
  test("returns null for valid IAssert constraint", () => {
    const constraint = {
      getConstraint: () => type("string"),
      getErrorMessage: () => null,
      validate: () => ({ isValid: true }),
    } satisfies IAssert;

    const result = validateConstraint(constraint, "test-value");

    expect(result).toBeNull();
  });

  test("returns error message for invalid IAssert constraint", () => {
    const constraint = {
      getConstraint: () => type("string"),
      getErrorMessage: () => "Custom error message",
      validate: () => ({ isValid: false, message: "Custom error message" }),
    } satisfies IAssert;

    const result = validateConstraint(constraint, "invalid-value");

    expect(result).toBe("Custom error message");
  });

  test("returns default message when IAssert validation fails without message", () => {
    const constraint = {
      getConstraint: () => type("string"),
      getErrorMessage: () => null,
      validate: () => ({ isValid: false }),
    } satisfies IAssert;

    const result = validateConstraint(constraint, "invalid-value");

    expect(result).toBe("Validation failed");
  });

  test("returns null for valid arktype constraint", () => {
    const constraint = type("string");

    const result = validateConstraint(constraint, "valid-string");

    expect(result).toBeNull();
  });

  test("returns error summary for invalid arktype constraint", () => {
    const constraint = type("number");

    const result = validateConstraint(constraint, "not-a-number");

    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  test("returns null when constraint is null", () => {
    const result = validateConstraint(null as unknown as AssertType | IAssert, "value");

    expect(result).toBeNull();
  });

  test("returns null for non-function non-object constraint", () => {
    const result = validateConstraint("invalid-constraint" as unknown as AssertType | IAssert, "value");

    expect(result).toBeNull();
  });
});

describe("validateRouteAccess", () => {
  test("returns null when route has no restrictions", async () => {
    const context = createMockContext();
    const route = createMockRoute();

    const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

    expect(result).toBeNull();
  });

  describe("params validation", () => {
    test("returns null when params are valid", async () => {
      const context = createMockContext({ params: { id: "123" } });
      const route = createMockRoute({
        params: { id: type("string") },
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("returns error when params are invalid", async () => {
      const context = createMockContext({ params: { id: 123 } });
      const route = createMockRoute({
        params: { id: type("string") },
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.BadRequest);
      expect(result?.message).toContain('Invalid parameter "id"');
      expect(result?.key).toBe("INVALID_PARAMETER");
    });
  });

  describe("queries validation", () => {
    test("returns null when queries are valid", async () => {
      const context = createMockContext({ queries: { page: "1" } as unknown as ContextType["queries"] });
      const route = createMockRoute({
        queries: type({ page: "string" }),
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("returns error when queries are invalid", async () => {
      const context = createMockContext({ queries: { page: 123 } });
      const route = createMockRoute({
        queries: type({ page: "string" }),
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.BadRequest);
      expect(result?.message).toContain("Invalid query parameters");
      expect(result?.key).toBe("INVALID_QUERY");
    });
  });

  describe("payload validation", () => {
    test("returns null when payload is valid", async () => {
      const context = createMockContext({ payload: { name: "test" } });
      const route = createMockRoute({
        payload: type({ name: "string" }),
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("returns error when payload is invalid", async () => {
      const context = createMockContext({ payload: { name: 123 } });
      const route = createMockRoute({
        payload: type({ name: "string" }),
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.BadRequest);
      expect(result?.message).toContain("Invalid payload");
      expect(result?.key).toBe("INVALID_PAYLOAD");
    });
  });

  describe("environment validation", () => {
    test("returns null when env is allowed", async () => {
      const context = createMockContext();
      const route = createMockRoute({
        env: [Environment.DEVELOPMENT, Environment.TESTING],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("returns error when env is not allowed", async () => {
      const context = createMockContext();
      const route = createMockRoute({
        name: "api.test.list",
        env: [Environment.PRODUCTION],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.NotAcceptable);
      expect(result?.message).toContain('Route "api.test.list" is not available in "development" environment');
      expect(result?.key).toBe("ROUTE_ENV_NOT_ALLOWED");
    });

    test("returns null when env array is empty", async () => {
      const context = createMockContext();
      const route = createMockRoute({ env: [] });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });
  });

  describe("IP validation", () => {
    test("returns null when IP is allowed", async () => {
      const context = createMockContext({ ip: "192.168.1.1" });
      const route = createMockRoute({
        ip: ["192.168.1.1", "10.0.0.1"],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("returns error when IP is not allowed", async () => {
      const context = createMockContext({ ip: "192.168.1.100" });
      const route = createMockRoute({
        name: "api.test.list",
        ip: ["192.168.1.1", "10.0.0.1"],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.NotAcceptable);
      expect(result?.message).toContain('Route "api.test.list" is not available for IP "192.168.1.100"');
      expect(result?.key).toBe("ROUTE_IP_NOT_ALLOWED");
    });

    test("returns error when context IP is null", async () => {
      const context = createMockContext({ ip: null });
      const route = createMockRoute({
        name: "api.test.list",
        ip: ["192.168.1.1"],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.NotAcceptable);
      expect(result?.key).toBe("ROUTE_IP_NOT_ALLOWED");
    });

    test("returns null when IP array is empty", async () => {
      const context = createMockContext({ ip: "192.168.1.100" });
      const route = createMockRoute({ ip: [] });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });
  });

  describe("host validation", () => {
    test("returns null when host is allowed", async () => {
      const context = createMockContext({ host: "example.com" });
      const route = createMockRoute({
        host: ["example.com", "api.example.com"],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("returns error when host is not allowed", async () => {
      const context = createMockContext({ host: "evil.com" });
      const route = createMockRoute({
        name: "api.test.list",
        host: ["example.com", "api.example.com"],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.NotAcceptable);
      expect(result?.message).toContain('Route "api.test.list" is not available for host "evil.com"');
      expect(result?.key).toBe("ROUTE_HOST_NOT_ALLOWED");
    });

    test("returns null when host array is empty", async () => {
      const context = createMockContext({ host: "any.com" });
      const route = createMockRoute({ host: [] });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });
  });

  describe("roles validation", () => {
    test("returns error when user is null and roles required", async () => {
      const context = createMockContext({ user: null });
      const route = createMockRoute({
        name: "api.test.list",
        roles: ["ROLE_USER"],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.Forbidden);
      expect(result?.message).toContain('Route "api.test.list" requires authentication');
      expect(result?.key).toBe("AUTHENTICATION_REQUIRED");
    });

    test("returns error when user has no roles", async () => {
      const context = createMockContext({
        user: { id: "1", email: "test@test.com", roles: [] } as unknown as ContextType["user"],
      });
      const route = createMockRoute({
        name: "api.test.list",
        roles: ["ROLE_USER"],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.Forbidden);
      expect(result?.message).toContain('Route "api.test.list" requires authentication');
      expect(result?.key).toBe("AUTHENTICATION_REQUIRED");
    });

    test("returns null when user has required role", async () => {
      const context = createMockContext({
        user: { id: "1", email: "test@test.com", roles: ["ROLE_ADMIN"] } as unknown as ContextType["user"],
      });
      const route = createMockRoute({
        roles: ["ROLE_ADMIN"],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("returns error when user lacks required role", async () => {
      const context = createMockContext({
        user: { id: "1", email: "test@test.com", roles: ["ROLE_GUEST"] } as unknown as ContextType["user"],
      });
      const route = createMockRoute({
        name: "api.test.list",
        roles: ["ROLE_ADMIN"],
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.NotAcceptable);
      expect(result?.message).toContain('Route "api.test.list" is not accessible for user roles');
      expect(result?.key).toBe("ROLE_NOT_ALLOWED");
    });

    test("returns null when roles array is empty", async () => {
      const context = createMockContext({ user: null });
      const route = createMockRoute({ roles: [] });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("passes roles to context route", () => {
      const roles: Uppercase<string>[] = ["ROLE_ADMIN", "ROLE_USER"];
      const context = createMockContext({
        route: {
          name: "api.test.list",
          path: "/test",
          method: "GET",
          version: 1,
          description: "Test route",
          roles,
        },
      });

      expect(context.route?.roles).toEqual(["ROLE_ADMIN", "ROLE_USER"]);
    });

    test("context route has no roles when not provided", () => {
      const context = createMockContext();

      expect(context.route?.roles).toBeUndefined();
    });
  });
});

describe("validateResponse", () => {
  test("returns null when no response constraint defined", () => {
    const route = createMockRoute();

    const result = validateResponse(route, { data: "test" });

    expect(result).toBeNull();
  });

  test("returns null when response data is valid", () => {
    const route = createMockRoute({
      response: type({ id: "number", name: "string" }),
    } as Partial<RouteConfigType>);

    const result = validateResponse(route, { id: 1, name: "test" });

    expect(result).toBeNull();
  });

  test("returns error when response data is invalid", () => {
    const route = createMockRoute({
      response: type({ id: "number", name: "string" }),
    } as Partial<RouteConfigType>);

    const result = validateResponse(route, { id: "not-a-number", name: "test" });

    expect(result).not.toBeNull();
    expect(result?.status).toBe(HttpStatus.Code.NotAcceptable);
    expect(result?.message).toContain("Invalid response");
    expect(result?.key).toBe("INVALID_RESPONSE");
  });

  test("returns error for missing required fields", () => {
    const route = createMockRoute({
      response: type({ id: "number", name: "string" }),
    } as Partial<RouteConfigType>);

    const result = validateResponse(route, { id: 1 });

    expect(result).not.toBeNull();
    expect(result?.status).toBe(HttpStatus.Code.NotAcceptable);
    expect(result?.key).toBe("INVALID_RESPONSE");
  });

  test("works with IAssert constraint", () => {
    const route = createMockRoute({
      response: {
        getConstraint: () => type("unknown"),
        getErrorMessage: () => null,
        validate: () => ({ isValid: true }),
      } satisfies IAssert,
    } as Partial<RouteConfigType>);

    const result = validateResponse(route, { anything: "works" });

    expect(result).toBeNull();
  });

  test("returns error with IAssert constraint that fails", () => {
    const route = createMockRoute({
      response: {
        getConstraint: () => type("unknown"),
        getErrorMessage: () => "Response validation failed",
        validate: () => ({ isValid: false, message: "Response validation failed" }),
      } satisfies IAssert,
    } as Partial<RouteConfigType>);

    const result = validateResponse(route, { invalid: "data" });

    expect(result).not.toBeNull();
    expect(result?.message).toContain("Response validation failed");
    expect(result?.key).toBe("INVALID_RESPONSE");
  });
});
