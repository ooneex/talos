import { describe, expect, test } from "bun:test";
import { YAML } from "bun";
import { generateRolesTypes, type IRolesConfig } from "@/index";
import rolesYml from "@/roles.yml" with { type: "text" };

const config = YAML.parse(rolesYml) as IRolesConfig;

const minimalConfig: IRolesConfig = {
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
      const single: IRolesConfig = {
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
      expect(output).toContain("  hierarchy: Record<\n    RoleHierarchyRoleType,\n    {\n");
      expect(output).toContain("inherits?: RoleHierarchyRoleType[];");
      expect(output).toContain("description: string;");
    });
  });

  describe("formatting", () => {
    test("should lay out the file the way Biome formats it and end it with a newline", () => {
      expect(generateRolesTypes(minimalConfig)).toBe(
        [
          'export type RoleType = "GUEST" | "ADMIN";',
          "",
          'export type RoleHierarchyRoleType = "ROLE_GUEST" | "ROLE_ADMIN";',
          "",
          "export type RolesMapType = Record<RoleType, RoleHierarchyRoleType>;",
          "",
          "export type TypedRolesConfigType = {",
          "  roles: RolesMapType;",
          "  hierarchy: Record<",
          "    RoleHierarchyRoleType,",
          "    {",
          "      inherits?: RoleHierarchyRoleType[];",
          "      description: string;",
          "    }",
          "  >;",
          "};",
          "",
        ].join("\n"),
      );
    });

    test("should put one member per line when a union does not fit in 120 columns", () => {
      const roles = Object.fromEntries(
        ["GUEST", "TRIAL_USER", "USER", "PREMIUM_USER", "ADMIN", "SUPER_ADMIN", "SYSTEM"].map((key) => [
          key,
          `ROLE_${key}`,
        ]),
      );
      const hierarchy = Object.fromEntries(Object.values(roles).map((role) => [role, { description: role }]));
      const output = generateRolesTypes({ roles, hierarchy } as IRolesConfig);

      expect(output).toContain(
        'export type RoleType = "GUEST" | "TRIAL_USER" | "USER" | "PREMIUM_USER" | "ADMIN" | "SUPER_ADMIN" | "SYSTEM";\n',
      );
      expect(output).toContain(
        'export type RoleHierarchyRoleType =\n  | "ROLE_GUEST"\n  | "ROLE_TRIAL_USER"\n  | "ROLE_USER"\n',
      );
      expect(output).toContain('  | "ROLE_SYSTEM";\n');
      expect(output.split("\n").every((line) => line.length <= 120)).toBe(true);
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
      const empty: IRolesConfig = { roles: {}, hierarchy: {} };
      const output = generateRolesTypes(empty);
      expect(output).toContain("export type RoleType = ;");
      expect(output).toContain("export type RoleHierarchyRoleType = ;");
    });
  });
});
