import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import { HttpStatus } from "@talosjs/http-status";
import { applyEnvRoles, checkAllowedUsers } from "@/utils/auth";
import { createMockContext } from "./helpers";

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

describe("checkAllowedUsers", () => {
  beforeEach(() => {
    if (!container.hasConstant("app.roles")) {
      container.addConstant("app.roles", testRolesConfig);
    }
  });

  afterEach(() => {
    if (container.hasConstant("app.roles")) {
      container.removeConstant("app.roles");
    }
  });
  test("returns null when no user is present", () => {
    const context = createMockContext({ user: null });

    const result = checkAllowedUsers(context);

    expect(result).toBeNull();
  });

  test("returns Forbidden when user is not in allowed users list", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "staging",
        STAGING_ALLOWED_USERS: ["allowed@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "notallowed@test.com", roles: [] } as unknown as ContextType["user"],
    });

    const result = checkAllowedUsers(context);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(HttpStatus.Code.Forbidden);
    expect(result?.message).toContain("notallowed@test.com");
    expect(result?.message).toContain("staging");
    expect(result?.key).toBe("USER_NOT_ALLOWED");
  });

  test("returns null when user is in allowed users list", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "staging",
        STAGING_ALLOWED_USERS: ["allowed@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "allowed@test.com", roles: [] } as unknown as ContextType["user"],
    });

    const result = checkAllowedUsers(context);

    expect(result).toBeNull();
  });

  test("returns null when allowed users list is empty", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "staging",
        STAGING_ALLOWED_USERS: [],
      } as unknown as ContextType["env"],
      user: { email: "anyone@test.com", roles: [] } as unknown as ContextType["user"],
    });

    const result = checkAllowedUsers(context);

    expect(result).toBeNull();
  });

  test("returns null when allowed users property is undefined", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
      } as unknown as ContextType["env"],
      user: { email: "anyone@test.com", roles: [] } as unknown as ContextType["user"],
    });

    const result = checkAllowedUsers(context);

    expect(result).toBeNull();
  });

  test("checks correct env-specific allowed users list", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "development",
        DEVELOPMENT_ALLOWED_USERS: ["dev@test.com"],
        STAGING_ALLOWED_USERS: ["staging@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "staging@test.com", roles: [] } as unknown as ContextType["user"],
    });

    const result = checkAllowedUsers(context);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(HttpStatus.Code.Forbidden);
    expect(result?.key).toBe("USER_NOT_ALLOWED");
  });

  test("does not mutate user roles", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SYSTEM_USERS: ["system@test.com"],
        SUPER_ADMIN_USERS: ["system@test.com"],
        ADMIN_USERS: ["system@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "system@test.com", roles: [] } as unknown as ContextType["user"],
    });

    const result = checkAllowedUsers(context);

    expect(result).toBeNull();
    expect(context.user?.roles).toHaveLength(0);
  });
});

describe("applyEnvRoles", () => {
  beforeEach(() => {
    if (!container.hasConstant("app.roles")) {
      container.addConstant("app.roles", testRolesConfig);
    }
  });

  afterEach(() => {
    if (container.hasConstant("app.roles")) {
      container.removeConstant("app.roles");
    }
  });

  test("does nothing when no user is present", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SYSTEM_USERS: ["system@test.com"],
      } as unknown as ContextType["env"],
      user: null,
    });

    applyEnvRoles(context);

    expect(context.user).toBeNull();
  });

  test("adds SYSTEM role when user is in SYSTEM_USERS", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SYSTEM_USERS: ["system@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "system@test.com", roles: [] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles).toContain("ROLE_SYSTEM");
  });

  test("does not duplicate SYSTEM role if already present", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SYSTEM_USERS: ["system@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "system@test.com", roles: ["ROLE_SYSTEM"] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles.filter((r) => r === "ROLE_SYSTEM")).toHaveLength(1);
  });

  test("does not add SYSTEM role when user is not in SYSTEM_USERS", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SYSTEM_USERS: ["other@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "user@test.com", roles: [] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles).not.toContain("ROLE_SYSTEM");
  });

  test("adds SUPER_ADMIN role when user is in SUPER_ADMIN_USERS", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SUPER_ADMIN_USERS: ["superadmin@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "superadmin@test.com", roles: [] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles).toContain("ROLE_SUPER_ADMIN");
  });

  test("does not duplicate SUPER_ADMIN role if already present", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SUPER_ADMIN_USERS: ["superadmin@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "superadmin@test.com", roles: ["ROLE_SUPER_ADMIN"] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles.filter((r) => r === "ROLE_SUPER_ADMIN")).toHaveLength(1);
  });

  test("does not add SUPER_ADMIN role when user is not in SUPER_ADMIN_USERS", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SUPER_ADMIN_USERS: ["other@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "user@test.com", roles: [] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles).not.toContain("ROLE_SUPER_ADMIN");
  });

  test("adds ADMIN role when user is in ADMIN_USERS", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        ADMIN_USERS: ["admin@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "admin@test.com", roles: [] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles).toContain("ROLE_ADMIN");
  });

  test("does not duplicate ADMIN role if already present", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        ADMIN_USERS: ["admin@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "admin@test.com", roles: ["ROLE_ADMIN"] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles.filter((r) => r === "ROLE_ADMIN")).toHaveLength(1);
  });

  test("does not add ADMIN role when user is not in ADMIN_USERS", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        ADMIN_USERS: ["other@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "user@test.com", roles: [] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles).not.toContain("ROLE_ADMIN");
  });

  test("adds all roles when user is in SYSTEM_USERS, SUPER_ADMIN_USERS, and ADMIN_USERS", () => {
    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SYSTEM_USERS: ["multi@test.com"],
        SUPER_ADMIN_USERS: ["multi@test.com"],
        ADMIN_USERS: ["multi@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "multi@test.com", roles: [] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles).toContain("ROLE_SYSTEM");
    expect(context.user?.roles).toContain("ROLE_SUPER_ADMIN");
    expect(context.user?.roles).toContain("ROLE_ADMIN");
  });

  test("skips role assignment when app.roles is not registered in container", () => {
    container.removeConstant("app.roles");

    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SYSTEM_USERS: ["system@test.com"],
        SUPER_ADMIN_USERS: ["system@test.com"],
        ADMIN_USERS: ["system@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "system@test.com", roles: [] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles).toHaveLength(0);
  });

  test("uses role values from app.roles config", () => {
    container.removeConstant("app.roles");
    container.addConstant("app.roles", {
      ...testRolesConfig,
      roles: { ...testRolesConfig.roles, SYSTEM: "CUSTOM_SYSTEM_ROLE" },
    });

    const context = createMockContext({
      env: {
        APP_ENV: "production",
        SYSTEM_USERS: ["system@test.com"],
      } as unknown as ContextType["env"],
      user: { email: "system@test.com", roles: [] } as unknown as ContextType["user"],
    });

    applyEnvRoles(context);

    expect(context.user?.roles).toContain("CUSTOM_SYSTEM_ROLE");
    expect(context.user?.roles).not.toContain("ROLE_SYSTEM");
  });
});
