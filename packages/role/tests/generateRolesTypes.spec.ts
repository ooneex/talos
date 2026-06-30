import { describe, expect, test } from "bun:test";
import { YAML } from "bun";
import { generateRolesTypes, type RolesConfigType } from "@/index";
import rolesYml from "@/roles.yml" with { type: "text" };

const config = YAML.parse(rolesYml) as RolesConfigType;

const minimalConfig: RolesConfigType = {
  roles: {
    GUEST: "ROLE_GUEST",
    ADMIN: "ROLE_ADMIN",
  },
  hierarchy: {
    ROLE_GUEST: { description: "Guest" },
    ROLE_ADMIN: { inherits: ["ROLE_GUEST"], description: "Admin" },
  },
};

describe("generateRolesTypes", () => {
  describe("RoleType", () => {
    test("should include all role keys from config.roles as a union", () => {
      const output = generateRolesTypes(config);
      expect(output).toContain("export type RoleType =");
      for (const key of Object.keys(config.roles)) {
        expect(output).toContain(`"${key}"`);
      }
    });

    test("should produce correct union for minimal config", () => {
      const output = generateRolesTypes(minimalConfig);
      expect(output).toContain('export type RoleType = "GUEST" | "ADMIN"');
    });

    test("should produce a single-member union when config has one role", () => {
      const single: RolesConfigType = {
        roles: { USER: "ROLE_USER" },
        hierarchy: { ROLE_USER: { description: "User" } },
      };
      const output = generateRolesTypes(single);
      expect(output).toContain('export type RoleType = "USER"');
    });
  });

  describe("RoleHierarchyRoleType", () => {
    test("should include all hierarchy keys as a union", () => {
      const output = generateRolesTypes(config);
      expect(output).toContain("export type RoleHierarchyRoleType =");
      for (const key of Object.keys(config.hierarchy)) {
        expect(output).toContain(`"${key}"`);
      }
    });

    test("should produce correct union for minimal config", () => {
      const output = generateRolesTypes(minimalConfig);
      expect(output).toContain('export type RoleHierarchyRoleType = "ROLE_GUEST" | "ROLE_ADMIN"');
    });
  });

  describe("RolesMapType", () => {
    test("should include RolesMapType using the generated unions", () => {
      const output = generateRolesTypes(config);
      expect(output).toContain("export type RolesMapType = Record<RoleType, RoleHierarchyRoleType>;");
    });
  });

  describe("TypedRolesConfigType", () => {
    test("should include TypedRolesConfigType with roles and hierarchy fields", () => {
      const output = generateRolesTypes(config);
      expect(output).toContain("export type TypedRolesConfigType = {");
      expect(output).toContain("roles: RolesMapType;");
      expect(output).toContain("hierarchy: Record<RoleHierarchyRoleType, {");
      expect(output).toContain("inherits?: RoleHierarchyRoleType[];");
      expect(output).toContain("description: string;");
    });
  });

  describe("output structure", () => {
    test("should export exactly four type declarations", () => {
      const output = generateRolesTypes(config);
      const exports = output.match(/^export type /gm);
      expect(exports).toHaveLength(4);
    });

    test("should return a non-empty string", () => {
      const output = generateRolesTypes(config);
      expect(typeof output).toBe("string");
      expect(output.length).toBeGreaterThan(0);
    });

    test("should return an empty-union RoleType for an empty roles map", () => {
      const empty: RolesConfigType = { roles: {}, hierarchy: {} };
      const output = generateRolesTypes(empty);
      expect(output).toContain("export type RoleType = ;");
      expect(output).toContain("export type RoleHierarchyRoleType = ;");
    });
  });
});
