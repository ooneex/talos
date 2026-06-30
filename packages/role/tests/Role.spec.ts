import { describe, expect, test } from "bun:test";
import { YAML } from "bun";
import { Role } from "@/Role";
import rolesYml from "@/roles.yml" with { type: "text" };
import type { RolesConfigType } from "@/types";

const config = YAML.parse(rolesYml) as RolesConfigType;

describe("Role", () => {
  const role = new Role();

  describe("hasRole", () => {
    test("should return true when user role equals the required role", () => {
      expect(role.hasRole("ROLE_USER", "ROLE_USER", config)).toBe(true);
    });

    test("should return true when user role inherits the required role", () => {
      expect(role.hasRole("ROLE_ADMIN", "ROLE_USER", config)).toBe(true);
      expect(role.hasRole("ROLE_SYSTEM", "ROLE_GUEST", config)).toBe(true);
      expect(role.hasRole("ROLE_SUPER_ADMIN", "ROLE_ADMIN", config)).toBe(true);
    });

    test("should return false when user role does not inherit the required role", () => {
      expect(role.hasRole("ROLE_GUEST", "ROLE_USER", config)).toBe(false);
      expect(role.hasRole("ROLE_USER", "ROLE_ADMIN", config)).toBe(false);
      expect(role.hasRole("ROLE_PREMIUM_USER", "ROLE_REVIEWER", config)).toBe(false);
    });

    test("should return false when user role is unknown", () => {
      expect(role.hasRole("ROLE_UNKNOWN" as Uppercase<string>, "ROLE_GUEST", config)).toBe(false);
    });

    test("should return false when both roles are unknown", () => {
      expect(role.hasRole("ROLE_UNKNOWN" as Uppercase<string>, "ROLE_ALSO_UNKNOWN" as Uppercase<string>, config)).toBe(
        false,
      );
    });

    test("should return false when required role is unknown even if user role exists", () => {
      expect(role.hasRole("ROLE_GUEST", "ROLE_UNKNOWN" as Uppercase<string>, config)).toBe(false);
    });

    test("should return false for sibling roles on different branches", () => {
      // ROLE_MODERATOR does not inherit ROLE_REVIEWER; they are siblings under ROLE_USER
      expect(role.hasRole("ROLE_MODERATOR", "ROLE_REVIEWER", config)).toBe(false);
      expect(role.hasRole("ROLE_REVIEWER", "ROLE_VIP_USER", config)).toBe(false);
    });
  });

  describe("getInheritedRoles", () => {
    test("should return only the role itself when it has no inherits", () => {
      const result = role.getInheritedRoles("ROLE_GUEST", config);
      expect(result).toEqual(["ROLE_GUEST"]);
    });

    test("should return empty array for an unknown role", () => {
      const result = role.getInheritedRoles("ROLE_UNKNOWN" as Uppercase<string>, config);
      expect(result).toEqual([]);
    });

    test("should return the role and its direct parent", () => {
      const result = role.getInheritedRoles("ROLE_TRIAL_USER", config);
      expect(result).toEqual(["ROLE_GUEST", "ROLE_TRIAL_USER"]);
    });

    test("should return all ancestors before the role itself", () => {
      const result = role.getInheritedRoles("ROLE_USER", config);
      expect(result).toEqual(["ROLE_GUEST", "ROLE_TRIAL_USER", "ROLE_USER"]);
    });

    test("should collect the full chain for a deeply nested role", () => {
      // ROLE_SYSTEM → ROLE_SUPER_ADMIN → ROLE_ADMIN → ROLE_MANAGER → ROLE_USER → ROLE_TRIAL_USER → ROLE_GUEST
      const result = role.getInheritedRoles("ROLE_SYSTEM", config);
      expect(result).toEqual([
        "ROLE_GUEST",
        "ROLE_TRIAL_USER",
        "ROLE_USER",
        "ROLE_MANAGER",
        "ROLE_ADMIN",
        "ROLE_SUPER_ADMIN",
        "ROLE_SYSTEM",
      ]);
    });

    test("should not include duplicate roles when multiple paths share a common ancestor", () => {
      // ROLE_REVIEWER inherits ROLE_USER which inherits ROLE_TRIAL_USER → ROLE_GUEST
      const result = role.getInheritedRoles("ROLE_REVIEWER", config);
      const unique = new Set(result);
      expect(result.length).toBe(unique.size);
    });

    test("should order ancestors before descendants ending with the role itself", () => {
      const result = role.getInheritedRoles("ROLE_PREMIUM_USER", config);
      expect(result).toEqual(["ROLE_GUEST", "ROLE_TRIAL_USER", "ROLE_USER", "ROLE_PREMIUM_USER"]);
    });

    test("should handle a config with no hierarchy entries gracefully", () => {
      const emptyConfig: RolesConfigType = { roles: {}, hierarchy: {} };
      const result = role.getInheritedRoles("ROLE_GUEST", emptyConfig);
      expect(result).toEqual([]);
    });
  });
});
