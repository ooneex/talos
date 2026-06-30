import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { container } from "@talosjs/container";
import { AuthException } from "@/AuthException";
import { ClerkAuthMiddleware } from "@/ClerkAuthMiddleware";

mock.module("@talosjs/container", () => ({
  inject: () => () => {},
}));

const testRolesConfig = {
  roles: {
    GUEST: "ROLE_GUEST",
    TRIAL_USER: "ROLE_TRIAL_USER",
    USER: "ROLE_USER",
    PREMIUM_USER: "ROLE_PREMIUM_USER",
    ADMIN: "ROLE_ADMIN",
    SUPER_ADMIN: "ROLE_SUPER_ADMIN",
    SYSTEM: "ROLE_SYSTEM",
  },
  hierarchy: {
    ROLE_GUEST: { level: 10, description: "Guest" },
    ROLE_TRIAL_USER: { level: 15, description: "Trial user" },
    ROLE_USER: { level: 20, description: "User" },
    ROLE_PREMIUM_USER: { level: 35, description: "Premium user" },
    ROLE_ADMIN: { level: 120, description: "Admin" },
    ROLE_SUPER_ADMIN: { level: 130, description: "Super admin" },
    ROLE_SYSTEM: { level: 999, description: "System" },
  },
};

const createMockClerkUser = (overrides: Record<string, unknown> = {}) => ({
  id: "clerk_user_123",
  firstName: "John",
  lastName: "Doe",
  primaryEmailAddressId: "email_1",
  emailAddresses: [{ id: "email_1", emailAddress: "john@example.com" }],
  phoneNumbers: [{ phoneNumber: "+1234567890" }],
  imageUrl: "https://example.com/avatar.jpg",
  lastActiveAt: 1700000000000,
  lastSignInAt: 1699999000000,
  banned: false,
  locked: false,
  createdAt: 1690000000000,
  updatedAt: 1700000000000,
  privateMetadata: {
    externalId: "ext_123",
    roles: ["ROLE_ADMIN"],
  },
  ...overrides,
});

const createMockContext = (
  token: string | null = "valid-token",
  route?: { roles?: Uppercase<string>[] } | null,
  queries?: { bearerToken?: string | null },
) => ({
  header: {
    getBearerToken: mock(() => token),
  },
  queries,
  route: route !== undefined ? route : null,
  user: undefined as unknown,
});

describe("ClerkAuthMiddleware", () => {
  let mockClerkAuth: { getCurrentUser: ReturnType<typeof mock> };
  let middleware: ClerkAuthMiddleware;

  beforeEach(() => {
    if (!container.hasConstant("app.roles")) {
      container.addConstant("app.roles", testRolesConfig);
    }
    mockClerkAuth = {
      getCurrentUser: mock(() => Promise.resolve(createMockClerkUser())),
    };
    middleware = new ClerkAuthMiddleware(mockClerkAuth as never);
  });

  afterEach(() => {
    if (container.hasConstant("app.roles")) {
      container.removeConstant("app.roles");
    }
  });

  describe("Token validation", () => {
    test("should throw AuthException when bearer token is missing and roles require auth", async () => {
      const context = createMockContext(null, { roles: ["ROLE_USER"] });

      try {
        await middleware.handler(context as never);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthException);
        expect((error as AuthException).message).toBe("Authentication required: Missing bearer token");
      }
    });

    test("should throw AuthException when bearer token is empty string and roles require auth", async () => {
      const context = createMockContext("", { roles: ["ROLE_ADMIN"] });

      try {
        await middleware.handler(context as never);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthException);
        expect((error as AuthException).message).toBe("Authentication required: Missing bearer token");
      }
    });

    test("should return context without throwing when no token and route has no roles", async () => {
      const context = createMockContext(null, { roles: [] });

      const result = await middleware.handler(context as never);

      expect(result).toBe(context as never);
      expect(context.user).toBeUndefined();
    });

    test("should return context without throwing when no token and route roles is only GUEST", async () => {
      const context = createMockContext(null, { roles: ["ROLE_GUEST"] });

      const result = await middleware.handler(context as never);

      expect(result).toBe(context as never);
      expect(context.user).toBeUndefined();
    });

    test("should return context without throwing when no token and route is null", async () => {
      const context = createMockContext(null, null);

      const result = await middleware.handler(context as never);

      expect(result).toBe(context as never);
      expect(context.user).toBeUndefined();
    });

    test("should return context without throwing when no token and route has no roles property", async () => {
      const context = createMockContext(null, {});

      const result = await middleware.handler(context as never);

      expect(result).toBe(context as never);
      expect(context.user).toBeUndefined();
    });

    test("should throw when no token and route has GUEST plus other roles", async () => {
      const context = createMockContext(null, { roles: ["ROLE_GUEST", "ROLE_USER"] });

      try {
        await middleware.handler(context as never);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthException);
        expect((error as AuthException).message).toBe("Authentication required: Missing bearer token");
      }
    });

    test("should pass token to clerkAuth.getCurrentUser", async () => {
      const context = createMockContext("my-token");

      await middleware.handler(context as never);

      expect(mockClerkAuth.getCurrentUser).toHaveBeenCalledWith("my-token");
    });

    test("should fall back to queries.bearerToken when header has no bearer token", async () => {
      const context = createMockContext(null, { roles: ["ROLE_USER"] }, { bearerToken: "query-token" });

      await middleware.handler(context as never);

      expect(mockClerkAuth.getCurrentUser).toHaveBeenCalledWith("query-token");
    });

    test("should prefer header bearer token over queries.bearerToken", async () => {
      const context = createMockContext("header-token", { roles: ["ROLE_USER"] }, { bearerToken: "query-token" });

      await middleware.handler(context as never);

      expect(mockClerkAuth.getCurrentUser).toHaveBeenCalledWith("header-token");
    });

    test("should throw when both header and queries.bearerToken are missing and roles require auth", async () => {
      const context = createMockContext(null, { roles: ["ROLE_USER"] }, {});

      try {
        await middleware.handler(context as never);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthException);
        expect((error as AuthException).message).toBe("Authentication required: Missing bearer token");
      }
    });

    test("should not throw when context.queries is undefined and route is guest-only", async () => {
      const context = createMockContext(null, { roles: ["ROLE_GUEST"] });

      const result = await middleware.handler(context as never);

      expect(result).toBe(context as never);
      expect(context.user).toBeUndefined();
    });
  });

  describe("Clerk user validation", () => {
    test("should throw AuthException when clerkAuth returns null", async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() => Promise.resolve(null));
      const context = createMockContext();

      try {
        await middleware.handler(context as never);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthException);
        expect((error as AuthException).message).toBe("Authentication failed: Invalid or expired token");
      }
    });

    test("should throw AuthException when user has no primary email", async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() =>
        Promise.resolve(
          createMockClerkUser({
            primaryEmailAddressId: "email_999",
            emailAddresses: [{ id: "email_1", emailAddress: "john@example.com" }],
          }),
        ),
      );
      const context = createMockContext();

      try {
        await middleware.handler(context as never);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthException);
        expect((error as AuthException).message).toBe("User has no primary email");
      }
    });

    test("should throw AuthException when emailAddresses is empty", async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() =>
        Promise.resolve(
          createMockClerkUser({
            emailAddresses: [],
          }),
        ),
      );
      const context = createMockContext();

      try {
        await middleware.handler(context as never);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthException);
        expect((error as AuthException).message).toBe("User has no primary email");
      }
    });
  });

  describe("User mapping", () => {
    test("should return the context", async () => {
      const context = createMockContext();

      const result = await middleware.handler(context as never);

      expect(result).toBe(context as never);
    });

    test("should set user on context with required fields mapped correctly", async () => {
      const context = createMockContext();

      await middleware.handler(context as never);

      expect(context.user).toBeDefined();
      const user = context.user as Record<string, unknown>;
      expect(user.id).toBe("ext_123");
      expect(user.externalId).toBe("clerk_user_123");
      expect(user.email).toBe("john@example.com");
      expect(user.roles).toEqual(["ROLE_ADMIN"]);
    });

    test('should default roles to ["ROLE_USER"] when privateMetadata has no roles', async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() =>
        Promise.resolve(
          createMockClerkUser({
            privateMetadata: { externalId: "ext_123" },
          }),
        ),
      );
      const context = createMockContext();

      await middleware.handler(context as never);

      expect((context.user as Record<string, unknown>).roles).toEqual(["ROLE_USER"]);
    });

    test('should default roles to ["ROLE_USER"] when privateMetadata.roles is undefined', async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() =>
        Promise.resolve(
          createMockClerkUser({
            privateMetadata: { externalId: "ext_123", roles: undefined },
          }),
        ),
      );
      const context = createMockContext();

      await middleware.handler(context as never);

      expect((context.user as Record<string, unknown>).roles).toEqual(["ROLE_USER"]);
    });

    test("should map optional string fields when present", async () => {
      const context = createMockContext();

      await middleware.handler(context as never);

      const user = context.user as Record<string, unknown>;
      expect(user.firstName).toBe("John");
      expect(user.lastName).toBe("Doe");
      expect(user.avatar).toBe("https://example.com/avatar.jpg");
    });

    test("should not set optional string fields when absent", async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() =>
        Promise.resolve(
          createMockClerkUser({
            firstName: null,
            lastName: null,
            imageUrl: null,
          }),
        ),
      );
      const context = createMockContext();

      await middleware.handler(context as never);

      const user = context.user as Record<string, unknown>;
      expect(user.firstName).toBeUndefined();
      expect(user.lastName).toBeUndefined();
      expect(user.avatar).toBeUndefined();
    });

    test("should map phone number from first phone entry", async () => {
      const context = createMockContext();

      await middleware.handler(context as never);

      expect((context.user as Record<string, unknown>).phone).toBe("+1234567890");
    });

    test("should not set phone when phoneNumbers is empty", async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() =>
        Promise.resolve(
          createMockClerkUser({
            phoneNumbers: [],
          }),
        ),
      );
      const context = createMockContext();

      await middleware.handler(context as never);

      expect((context.user as Record<string, unknown>).phone).toBeUndefined();
    });

    test("should map isBanned when user is banned", async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() =>
        Promise.resolve(
          createMockClerkUser({
            banned: true,
          }),
        ),
      );
      const context = createMockContext();

      await middleware.handler(context as never);

      expect((context.user as Record<string, unknown>).isBanned).toBe(true);
    });

    test("should not set isBanned when user is not banned", async () => {
      const context = createMockContext();

      await middleware.handler(context as never);

      expect((context.user as Record<string, unknown>).isBanned).toBeUndefined();
    });

    test("should map isLocked when user is locked", async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() =>
        Promise.resolve(
          createMockClerkUser({
            locked: true,
          }),
        ),
      );
      const context = createMockContext();

      await middleware.handler(context as never);

      expect((context.user as Record<string, unknown>).isLocked).toBe(true);
    });

    test("should not set isLocked when user is not locked", async () => {
      const context = createMockContext();

      await middleware.handler(context as never);

      expect((context.user as Record<string, unknown>).isLocked).toBeUndefined();
    });

    test("should map date fields correctly", async () => {
      const context = createMockContext();

      await middleware.handler(context as never);

      const user = context.user as Record<string, unknown>;
      expect(user.lastActiveAt).toEqual(new Date(1700000000000));
      expect(user.lastLoginAt).toEqual(new Date(1699999000000));
      expect(user.createdAt).toEqual(new Date(1690000000000));
      expect(user.updatedAt).toEqual(new Date(1700000000000));
    });

    test("should not set date fields when absent", async () => {
      mockClerkAuth.getCurrentUser.mockImplementation(() =>
        Promise.resolve(
          createMockClerkUser({
            lastActiveAt: null,
            lastSignInAt: null,
            createdAt: null,
            updatedAt: null,
          }),
        ),
      );
      const context = createMockContext();

      await middleware.handler(context as never);

      const user = context.user as Record<string, unknown>;
      expect(user.lastActiveAt).toBeUndefined();
      expect(user.lastLoginAt).toBeUndefined();
      expect(user.createdAt).toBeUndefined();
      expect(user.updatedAt).toBeUndefined();
    });
  });
});
