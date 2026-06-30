import { describe, expect, test } from "bun:test";
import { YAML } from "bun";
import { RoleException } from "@/RoleException";
import rolesYml from "@/roles.yml" with { type: "text" };
import type { RolesConfigType } from "@/types";
import { validateConfig } from "@/validateConfig";

const validConfig = YAML.parse(rolesYml) as RolesConfigType;

const clone = (c: RolesConfigType): RolesConfigType => JSON.parse(JSON.stringify(c));

describe("validateConfig", () => {
  describe("required roles", () => {
    test("should not throw for the default config", () => {
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    for (const key of ["GUEST", "TRIAL_USER", "USER", "PREMIUM_USER", "ADMIN", "SUPER_ADMIN", "SYSTEM"] as const) {
      test(`should throw when roles.${key} is missing`, () => {
        const config = clone(validConfig);
        delete (config.roles as Record<string, unknown>)[key];
        expect(() => validateConfig(config)).toThrow(RoleException);
        expect(() => validateConfig(config)).toThrow(`roles.${key}`);
      });
    }
  });

  describe("roles ↔ hierarchy consistency", () => {
    test("should throw when a roles value has no matching hierarchy entry", () => {
      const config = clone(validConfig);
      (config.roles as Record<string, unknown>).GUEST = "ROLE_GHOST";
      expect(() => validateConfig(config)).toThrow(RoleException);
      expect(() => validateConfig(config)).toThrow("ROLE_GHOST");
    });
  });

  describe("hierarchy entry validation", () => {
    test("should throw when description is missing", () => {
      const config = clone(validConfig);
      delete (config.hierarchy.ROLE_GUEST as Record<string, unknown>).description;
      expect(() => validateConfig(config)).toThrow(RoleException);
      expect(() => validateConfig(config)).toThrow('"description"');
    });

    test("should throw when description is an empty string", () => {
      const config = clone(validConfig);
      (config.hierarchy.ROLE_GUEST as Record<string, unknown>).description = "   ";
      expect(() => validateConfig(config)).toThrow(RoleException);
      expect(() => validateConfig(config)).toThrow('"description"');
    });

    test("should throw when inherits is not an array", () => {
      const config = clone(validConfig);
      (config.hierarchy.ROLE_USER as Record<string, unknown>).inherits = "ROLE_GUEST";
      expect(() => validateConfig(config)).toThrow(RoleException);
      expect(() => validateConfig(config)).toThrow('"inherits"');
    });

    test("should throw when an inherits entry is an empty string", () => {
      const config = clone(validConfig);
      (config.hierarchy.ROLE_USER as Record<string, unknown>).inherits = [""];
      expect(() => validateConfig(config)).toThrow(RoleException);
      expect(() => validateConfig(config)).toThrow('"inherits"');
    });

    test("should throw when an inherited role is not defined in hierarchy", () => {
      const config = clone(validConfig);
      (config.hierarchy.ROLE_USER as Record<string, unknown>).inherits = ["ROLE_NONEXISTENT"];
      expect(() => validateConfig(config)).toThrow(RoleException);
      expect(() => validateConfig(config)).toThrow("ROLE_NONEXISTENT");
    });

    test("should not throw when inherits is undefined (no parent)", () => {
      const config = clone(validConfig);
      delete (config.hierarchy.ROLE_GUEST as Record<string, unknown>).inherits;
      expect(() => validateConfig(config)).not.toThrow();
    });

    test("should throw a RoleException with the offending role as key", () => {
      const config = clone(validConfig);
      delete (config.hierarchy.ROLE_ADMIN as Record<string, unknown>).description;
      let err: RoleException | undefined;
      try {
        validateConfig(config);
      } catch (e) {
        err = e as RoleException;
      }
      expect(err).toBeInstanceOf(RoleException);
      expect(err?.key).toBe("ROLE_ADMIN");
    });
  });
});
