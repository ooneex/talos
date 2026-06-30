import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import { AuthException, ClerkAuth } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    CLERK_SECRET_KEY: Bun.env.CLERK_SECRET_KEY,
  } as unknown as AppEnv;
};

type MockClient = ReturnType<typeof mockCreateClerkClient>;

const mockCreateClerkClient = mock(() => ({
  users: {
    banUser: mock(() => Promise.resolve({ id: "user_1" })),
    unbanUser: mock(() => Promise.resolve({ id: "user_1" })),
    getUser: mock(() =>
      Promise.resolve({
        id: "user_1",
        banned: false,
        locked: false,
        publicMetadata: {},
        privateMetadata: {},
        unsafeMetadata: {},
      }),
    ),
    lockUser: mock(() => Promise.resolve({ id: "user_1" })),
    unlockUser: mock(() => Promise.resolve({ id: "user_1" })),
    updateUser: mock(() => Promise.resolve({ id: "user_1" })),
    updateUserProfileImage: mock(() => Promise.resolve({ id: "user_1" })),
    updateUserMetadata: mock(() => Promise.resolve({ id: "user_1" })),
    deleteUser: mock(() => Promise.resolve({ id: "user_1" })),
    deleteUserProfileImage: mock(() => Promise.resolve({ id: "user_1" })),
    getUserList: mock(() => Promise.resolve({ data: [{ id: "user_1" }] })),
    verifyPassword: mock(() => Promise.resolve({ verified: true })),
  },
  sessions: {
    getSession: mock(() => Promise.resolve({ id: "sess_1" })),
    revokeSession: mock(() => Promise.resolve({ id: "sess_1" })),
  },
  signInTokens: {
    createSignInToken: mock(() => Promise.resolve({ id: "sit_1", token: "sign-in-token" })),
  },
}));

const mockVerifyToken = mock(() => Promise.resolve({ sub: "user_1", sid: "sess_1" }));

mock.module("@clerk/backend", () => ({
  createClerkClient: mockCreateClerkClient,
  verifyToken: mockVerifyToken,
}));

mock.module("@talosjs/container", () => ({
  injectable: () => () => {},
}));

describe("ClerkAuth", () => {
  const originalEnv = Bun.env.CLERK_SECRET_KEY;

  beforeEach(() => {
    Bun.env.CLERK_SECRET_KEY = "test-secret-key";
    mockVerifyToken.mockClear();
    mockVerifyToken.mockImplementation(() => Promise.resolve({ sub: "user_1", sid: "sess_1" }));
  });

  afterEach(() => {
    Bun.env.CLERK_SECRET_KEY = originalEnv;
  });

  describe("Secret key handling", () => {
    test("should use secret key from environment variable", () => {
      Bun.env.CLERK_SECRET_KEY = "env-secret-key";
      const auth = new ClerkAuth(createMockEnv());

      expect(auth).toBeInstanceOf(ClerkAuth);
      expect(mockCreateClerkClient).toHaveBeenCalledWith({ secretKey: "env-secret-key" });
    });

    test("should throw AuthException when no secret key is provided", () => {
      Bun.env.CLERK_SECRET_KEY = "";

      expect(() => new ClerkAuth(createMockEnv())).toThrow(AuthException);
    });

    test("should throw with descriptive message when secret key is missing", () => {
      Bun.env.CLERK_SECRET_KEY = "";

      try {
        new ClerkAuth(createMockEnv());
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthException);
        expect((error as AuthException).message).toContain("Clerk secret key is required");
      }
    });
  });

  describe("getCurrentUser", () => {
    test("should return user when token is valid", async () => {
      const auth = new ClerkAuth(createMockEnv());
      const user = await auth.getCurrentUser("valid-token");

      expect(user).toBeDefined();
      expect(mockVerifyToken).toHaveBeenCalledWith("valid-token", { secretKey: "test-secret-key" });
    });

    test("should return null when userId is not found", async () => {
      mockVerifyToken.mockImplementation(() => Promise.resolve({ sub: "", sid: "" }));
      const auth = new ClerkAuth(createMockEnv());
      const user = await auth.getCurrentUser("invalid-token");

      expect(user).toBeNull();
    });
  });

  describe("getCurrentUserSession", () => {
    test("should return session when token is valid", async () => {
      const auth = new ClerkAuth(createMockEnv());
      const session = await auth.getCurrentUserSession("valid-token");

      expect(session).toBeDefined();
      expect(mockVerifyToken).toHaveBeenCalledWith("valid-token", { secretKey: "test-secret-key" });
    });

    test("should return null when sessionId is not found", async () => {
      mockVerifyToken.mockImplementation(() => Promise.resolve({ sub: "", sid: "" }));
      const auth = new ClerkAuth(createMockEnv());
      const session = await auth.getCurrentUserSession("invalid-token");

      expect(session).toBeNull();
    });
  });

  describe("User operations", () => {
    let auth: ClerkAuth;

    beforeEach(() => {
      auth = new ClerkAuth(createMockEnv());
    });

    test("should ban user", async () => {
      const result = await auth.banUser("user_1");
      expect(result).toBeDefined();
    });

    test("should check if user is banned", async () => {
      const result = await auth.isBanned("user_1");
      expect(result).toBe(false);
    });

    test("should unban user", async () => {
      const result = await auth.unbanUser("user_1");
      expect(result).toBeDefined();
    });

    test("should get user", async () => {
      const result = await auth.getUser("user_1");
      expect(result).toBeDefined();
    });

    test("should lock user", async () => {
      const result = await auth.lockUser("user_1");
      expect(result).toBeDefined();
    });

    test("should check if user is locked", async () => {
      const result = await auth.isLocked("user_1");
      expect(result).toBe(false);
    });

    test("should unlock user", async () => {
      const result = await auth.unlockUser("user_1");
      expect(result).toBeDefined();
    });

    test("should delete user", async () => {
      const result = await auth.deleteUser("user_1");
      expect(result).toBeDefined();
    });

    test("should delete user profile image", async () => {
      const result = await auth.deleteUserProfileImage("user_1");
      expect(result).toBeDefined();
    });

    test("should update user", async () => {
      const result = await auth.updateUser("user_1", { firstName: "John" });
      expect(result).toBeDefined();
    });

    test("should update user profile image", async () => {
      const result = await auth.updateUserProfileImage("user_1", { file: new Blob(["test"]) });
      expect(result).toBeDefined();
    });

    test("should update user metadata", async () => {
      const result = await auth.updateUserMetadata("user_1", { publicMetadata: { role: "admin" } });
      expect(result).toBeDefined();
    });

    test("should get user metadata", async () => {
      const result = await auth.getUserMetadata("user_1");
      expect(result).toHaveProperty("publicMetadata");
      expect(result).toHaveProperty("privateMetadata");
      expect(result).toHaveProperty("unsafeMetadata");
    });
  });

  describe("signIn", () => {
    let auth: ClerkAuth;

    beforeEach(() => {
      auth = new ClerkAuth(createMockEnv());
      const client = mockCreateClerkClient.mock.results.at(-1)?.value as MockClient;
      client.users.getUserList.mockImplementation(() => Promise.resolve({ data: [{ id: "user_1" }] }));
      client.users.verifyPassword.mockImplementation(() => Promise.resolve({ verified: true }));
      client.signInTokens.createSignInToken.mockImplementation(() =>
        Promise.resolve({ id: "sit_1", token: "sign-in-token" }),
      );
    });

    test("should sign in with email and password", async () => {
      const result = await auth.signIn({ email: "test@example.com", password: "password123" });

      expect(result.user).toBeDefined();
      expect(result.token).toBe("sign-in-token");
    });

    test("should use custom ttl", async () => {
      const client = mockCreateClerkClient.mock.results.at(-1)?.value as MockClient;
      await auth.signIn({ email: "test@example.com", password: "password123", ttl: 3600 });

      expect(client.signInTokens.createSignInToken).toHaveBeenCalledWith({
        userId: "user_1",
        expiresInSeconds: 3600,
      });
    });

    test("should throw when email is not found", async () => {
      const client = mockCreateClerkClient.mock.results.at(-1)?.value as MockClient;
      client.users.getUserList.mockImplementation(() => Promise.resolve({ data: [] }));

      expect(auth.signIn({ email: "unknown@example.com", password: "password123" })).rejects.toThrow(AuthException);
    });

    test("should throw when password is invalid", async () => {
      const client = mockCreateClerkClient.mock.results.at(-1)?.value as MockClient;
      client.users.verifyPassword.mockImplementation(() => Promise.resolve({ verified: false }));

      expect(auth.signIn({ email: "test@example.com", password: "wrong" })).rejects.toThrow(AuthException);
    });
  });

  describe("Session operations", () => {
    let auth: ClerkAuth;

    beforeEach(() => {
      auth = new ClerkAuth(createMockEnv());
    });

    test("should get session", async () => {
      const result = await auth.getSession("sess_1");
      expect(result).toBeDefined();
    });

    test("should sign out", async () => {
      const result = await auth.signOut("sess_1");
      expect(result).toBeDefined();
    });
  });

  describe("Instance creation", () => {
    test("should create ClerkAuth instance", () => {
      const instance = new ClerkAuth(createMockEnv());
      expect(instance).toBeInstanceOf(ClerkAuth);
    });

    test("should have all required methods", () => {
      const auth = new ClerkAuth(createMockEnv());
      expect(typeof auth.getCurrentUser).toBe("function");
      expect(typeof auth.getCurrentUserSession).toBe("function");
      expect(typeof auth.banUser).toBe("function");
      expect(typeof auth.isBanned).toBe("function");
      expect(typeof auth.unbanUser).toBe("function");
      expect(typeof auth.getUser).toBe("function");
      expect(typeof auth.lockUser).toBe("function");
      expect(typeof auth.isLocked).toBe("function");
      expect(typeof auth.unlockUser).toBe("function");
      expect(typeof auth.updateUser).toBe("function");
      expect(typeof auth.updateUserProfileImage).toBe("function");
      expect(typeof auth.updateUserMetadata).toBe("function");
      expect(typeof auth.getUserMetadata).toBe("function");
      expect(typeof auth.deleteUser).toBe("function");
      expect(typeof auth.deleteUserProfileImage).toBe("function");
      expect(typeof auth.getSession).toBe("function");
      expect(typeof auth.signIn).toBe("function");
      expect(typeof auth.signOut).toBe("function");
    });
  });
});
