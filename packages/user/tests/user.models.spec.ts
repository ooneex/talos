import { describe, expect, test } from "bun:test";
import {
  EAccountType,
  EProfileUpdateStatus,
  EVerificationType,
  type IAccount,
  type ISession,
  type IUser,
  type IUserProfileUpdate,
  type IVerification,
} from "../src/index";

describe("@talosjs/user - enums", () => {
  test("EAccountType should expose known values", () => {
    expect(String(EAccountType.OAUTH)).toBe("oauth");
    expect(String(EAccountType.EMAIL)).toBe("email");
    expect(String(EAccountType.CREDENTIALS)).toBe("credentials");
    expect(String(EAccountType.WEBAUTHN)).toBe("webauthn");
  });

  test("EVerificationType should expose known values", () => {
    expect(String(EVerificationType.EMAIL)).toBe("email");
    expect(String(EVerificationType.PHONE)).toBe("phone");
    expect(String(EVerificationType.PASSWORD_RESET)).toBe("password_reset");
  });

  test("EProfileUpdateStatus should expose known values", () => {
    expect(String(EProfileUpdateStatus.PENDING)).toBe("pending");
    expect(String(EProfileUpdateStatus.COMPLETED)).toBe("completed");
    expect(String(EProfileUpdateStatus.FAILED)).toBe("failed");
    expect(String(EProfileUpdateStatus.REVERTED)).toBe("reverted");
  });
});

describe("@talosjs/user - IUser", () => {
  test("should allow minimal user", () => {
    const user: IUser = {
      id: "user-1",
      email: "user@example.com",
      roles: [] as IUser["roles"],
    };

    expect(user.id).toBe("user-1");
    expect(user.email).toBe("user@example.com");
    expect(Array.isArray(user.roles)).toBe(true);
  });
});

describe("@talosjs/user - ISession", () => {
  test("should require token and isActive/expiresAt", () => {
    const now = new Date();
    const session: ISession = {
      id: "session-1",
      token: "token-123",
      isActive: true,
      expiresAt: now,
    };

    expect(session.token).toBe("token-123");
    expect(session.isActive).toBe(true);
    expect(session.expiresAt).toBe(now);
  });
});

describe("@talosjs/user - IAccount", () => {
  test("should allow minimal credentials account", () => {
    const account: IAccount = {
      id: "acc-1",
      type: EAccountType.CREDENTIALS,
    };

    expect(account.type).toBe(EAccountType.CREDENTIALS);
  });
});

describe("@talosjs/user - IVerification", () => {
  test("should require token, type, isUsed, expiresAt and counters", () => {
    const now = new Date();
    const verification: IVerification = {
      id: "verif-1",
      token: "code-123",
      type: EVerificationType.EMAIL,
      isUsed: false,
      expiresAt: now,
      attemptsCount: 0,
      maxAttempts: 3,
    };

    expect(verification.token).toBe("code-123");
    expect(verification.type).toBe(EVerificationType.EMAIL);
    expect(verification.isUsed).toBe(false);
    expect(verification.expiresAt).toBe(now);
    expect(verification.maxAttempts).toBe(3);
  });
});

describe("@talosjs/user - IUserProfileUpdate", () => {
  test("should capture changed fields and status", () => {
    const update: IUserProfileUpdate = {
      id: "update-1",
      changedFields: ["email", "name"],
      status: EProfileUpdateStatus.PENDING,
    };

    expect(update.changedFields).toContain("email");
    expect(update.status).toBe(EProfileUpdateStatus.PENDING);
  });
});
