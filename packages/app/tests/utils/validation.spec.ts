import { describe, expect, test } from "bun:test";
import { Environment } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import { HttpStatus } from "@talosjs/http-status";
import type { IRolesConfig, RoleType } from "@talosjs/role";
import type { RouteConfigType } from "@talosjs/routing";
import { type AssertType, type IAssert, type } from "@talosjs/validation";
import { AssertFile } from "@talosjs/validation/constraints/AssertFile";
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

const HIERARCHY_ROLES_CONFIG = {
  roles: {
    GUEST: "ROLE_GUEST",
    USER: "ROLE_USER",
    REVIEWER: "ROLE_REVIEWER",
    MODERATOR: "ROLE_MODERATOR",
    MANAGER: "ROLE_MANAGER",
    ADMIN: "ROLE_ADMIN",
    SUPER_ADMIN: "ROLE_SUPER_ADMIN",
    SYSTEM: "ROLE_SYSTEM",
  },
  hierarchy: {
    ROLE_GUEST: { description: "Guest" },
    ROLE_USER: { inherits: ["ROLE_GUEST"], description: "User" },
    ROLE_REVIEWER: { inherits: ["ROLE_USER"], description: "Reviewer" },
    ROLE_MODERATOR: { inherits: ["ROLE_USER"], description: "Moderator" },
    ROLE_MANAGER: { inherits: ["ROLE_USER"], description: "Manager" },
    ROLE_ADMIN: { inherits: ["ROLE_MANAGER"], description: "Admin" },
    ROLE_SUPER_ADMIN: { inherits: ["ROLE_ADMIN"], description: "Super admin" },
    ROLE_SYSTEM: { inherits: ["ROLE_SUPER_ADMIN"], description: "System" },
  },
} satisfies IRolesConfig;

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
      expect(result?.message).toContain('Invalid parameter: "id"');
      expect(result?.key).toBe("INVALID_PARAMETER");
    });

    test("accepts a single constraint covering every param", async () => {
      const context = createMockContext({ params: { id: "123" } });
      const route = createMockRoute({ params: type({ id: "string" }) });

      expect(await validateRouteAccess(context, route, Environment.DEVELOPMENT)).toBeNull();

      const invalid = createMockContext({ params: { id: 123 } });

      expect(await validateRouteAccess(invalid, route, Environment.DEVELOPMENT)).not.toBeNull();
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

  describe("files validation", () => {
    const createUpload = (name: string, mimeType: string): ContextType["files"][string] =>
      new File(["content"], name, { type: mimeType }) as unknown as ContextType["files"][string];

    test("returns null when files are valid", async () => {
      const context = createMockContext({ files: { avatar: createUpload("avatar.png", "image/png") } });
      const route = createMockRoute({
        files: new AssertFile({ avatar: { types: ["image/*"] } }),
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("returns error when a file is invalid", async () => {
      const context = createMockContext({ files: { avatar: createUpload("clip.mp4", "video/mp4") } });
      const route = createMockRoute({
        files: new AssertFile({ avatar: { types: ["image/*"] } }),
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(HttpStatus.Code.BadRequest);
      expect(result?.message).toContain('Invalid file: "avatar"');
      expect(result?.key).toBe("INVALID_FILE");
    });

    test("returns error when a required file is missing", async () => {
      const context = createMockContext({ files: {} });
      const route = createMockRoute({
        files: new AssertFile({ avatar: {} }),
      });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result?.message).toContain("File is required");
      expect(result?.key).toBe("INVALID_FILE");
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

    test("returns null for anonymous user when route declares ROLE_GUEST", async () => {
      container.addConstant("app.roles", {
        roles: { GUEST: "ROLE_GUEST", ADMIN: "ROLE_ADMIN" },
        hierarchy: {},
      });

      try {
        const context = createMockContext({ user: null });
        const route = createMockRoute({ roles: ["ROLE_GUEST"] });

        const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

        expect(result).toBeNull();
      } finally {
        container.removeConstant("app.roles");
      }
    });

    test("returns null for authenticated user without matching role when route declares ROLE_GUEST", async () => {
      container.addConstant("app.roles", {
        roles: { GUEST: "ROLE_GUEST", ADMIN: "ROLE_ADMIN" },
        hierarchy: {},
      });

      try {
        const context = createMockContext({
          user: { id: "1", email: "test@test.com", roles: ["ROLE_USER"] } as unknown as ContextType["user"],
        });
        const route = createMockRoute({ roles: ["ROLE_GUEST"] });

        const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

        expect(result).toBeNull();
      } finally {
        container.removeConstant("app.roles");
      }
    });

    test("returns null when user role inherits the required role through the hierarchy", async () => {
      container.addConstant("app.roles", HIERARCHY_ROLES_CONFIG);

      try {
        const context = createMockContext({
          user: { id: "1", email: "test@test.com", roles: ["ROLE_SUPER_ADMIN"] } as unknown as ContextType["user"],
        });
        const route = createMockRoute({ roles: ["ROLE_USER"] });

        const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

        expect(result).toBeNull();
      } finally {
        container.removeConstant("app.roles");
      }
    });

    test("returns null when one of several user roles inherits the required role", async () => {
      container.addConstant("app.roles", HIERARCHY_ROLES_CONFIG);

      try {
        const context = createMockContext({
          user: {
            id: "1",
            email: "test@test.com",
            roles: ["ROLE_REVIEWER", "ROLE_ADMIN"],
          } as unknown as ContextType["user"],
        });
        const route = createMockRoute({ roles: ["ROLE_MANAGER"] });

        const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

        expect(result).toBeNull();
      } finally {
        container.removeConstant("app.roles");
      }
    });

    test("returns null when the route accepts any of several roles and one is inherited", async () => {
      container.addConstant("app.roles", HIERARCHY_ROLES_CONFIG);

      try {
        const context = createMockContext({
          user: { id: "1", email: "test@test.com", roles: ["ROLE_ADMIN"] } as unknown as ContextType["user"],
        });
        const route = createMockRoute({ roles: ["ROLE_SYSTEM", "ROLE_USER"] });

        const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

        expect(result).toBeNull();
      } finally {
        container.removeConstant("app.roles");
      }
    });

    test("returns error when the required role is above the user role in the hierarchy", async () => {
      container.addConstant("app.roles", HIERARCHY_ROLES_CONFIG);

      try {
        const context = createMockContext({
          user: { id: "1", email: "test@test.com", roles: ["ROLE_USER"] } as unknown as ContextType["user"],
        });
        const route = createMockRoute({ roles: ["ROLE_ADMIN"] });

        const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

        expect(result?.key).toBe("ROLE_NOT_ALLOWED");
        expect(result?.status).toBe(HttpStatus.Code.NotAcceptable);
      } finally {
        container.removeConstant("app.roles");
      }
    });

    test("returns error for sibling roles that do not inherit from each other", async () => {
      container.addConstant("app.roles", HIERARCHY_ROLES_CONFIG);

      try {
        const context = createMockContext({
          user: { id: "1", email: "test@test.com", roles: ["ROLE_REVIEWER"] } as unknown as ContextType["user"],
        });
        const route = createMockRoute({ roles: ["ROLE_MODERATOR"] });

        const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

        expect(result?.key).toBe("ROLE_NOT_ALLOWED");
      } finally {
        container.removeConstant("app.roles");
      }
    });

    test("still matches an exact role that is missing from the hierarchy", async () => {
      container.addConstant("app.roles", HIERARCHY_ROLES_CONFIG);

      try {
        const context = createMockContext({
          user: { id: "1", email: "test@test.com", roles: ["ROLE_UNKNOWN"] } as unknown as ContextType["user"],
        });
        const route = createMockRoute({ roles: ["ROLE_UNKNOWN"] });

        const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

        expect(result).toBeNull();
      } finally {
        container.removeConstant("app.roles");
      }
    });

    test("falls back to exact role matching when app.roles is not registered", async () => {
      const context = createMockContext({
        user: { id: "1", email: "test@test.com", roles: ["ROLE_SUPER_ADMIN"] } as unknown as ContextType["user"],
      });
      const route = createMockRoute({ roles: ["ROLE_USER"] });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result?.key).toBe("ROLE_NOT_ALLOWED");
    });

    test("treats ROLE_GUEST as public even when app.roles is not registered", async () => {
      const context = createMockContext({ user: null });
      const route = createMockRoute({ roles: ["ROLE_GUEST"] });

      const result = await validateRouteAccess(context, route, Environment.DEVELOPMENT);

      expect(result).toBeNull();
    });

    test("passes roles to context route", () => {
      const roles: RoleType[] = ["ROLE_ADMIN", "ROLE_USER"];
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
