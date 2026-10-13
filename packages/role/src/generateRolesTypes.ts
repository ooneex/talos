import type { IRolesConfig } from "./types";

const LINE_WIDTH = 120;

const formatUnion = (name: string, members: string[]): string => {
  const quoted = members.map((member) => `"${member}"`);
  const singleLine = `export type ${name} = ${quoted.join(" | ")};`;
  if (singleLine.length <= LINE_WIDTH) {
    return singleLine;
  }

  return [`export type ${name} =`, ...quoted.map((member) => `  | ${member}`)].join("\n").concat(";");
};

/**
 * Renders the roles declared in a roles.yml as TypeScript types, formatted the
 * way Biome would format them so the generated file stays stable once checked in.
 */
export const generateRolesTypes = (config: IRolesConfig): string => {
  return [
    formatUnion("RoleType", Object.keys(config.roles)),
    "",
    formatUnion("RoleHierarchyRoleType", Object.keys(config.hierarchy)),
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
  ].join("\n");
};
