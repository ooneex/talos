import type { RolesConfigType } from "./types";

export const generateRolesTypes = (config: RolesConfigType): string => {
  const roleKeys = Object.keys(config.roles) as Uppercase<string>[];
  const hierarchyKeys = Object.keys(config.hierarchy) as Uppercase<string>[];

  const roleUnion = roleKeys.map((k) => `"${k}"`).join(" | ");
  const hierarchyUnion = hierarchyKeys.map((k) => `"${k}"`).join(" | ");

  return [
    `export type RoleType = ${roleUnion};`,
    "",
    `export type RoleHierarchyRoleType = ${hierarchyUnion};`,
    "",
    "export type RolesMapType = Record<RoleType, RoleHierarchyRoleType>;",
    "",
    "export type TypedRolesConfigType = {",
    "  roles: RolesMapType;",
    "  hierarchy: Record<RoleHierarchyRoleType, {",
    "    inherits?: RoleHierarchyRoleType[];",
    "    description: string;",
    "  }>;",
    "};",
  ].join("\n");
};
