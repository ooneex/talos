import type { IRolesConfig, RoleType } from "./types";

export const generateRolesTypes = (config: IRolesConfig): string => {
  const roleKeys = Object.keys(config.roles) as RoleType[];
  const hierarchyKeys = Object.keys(config.hierarchy) as RoleType[];

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
