import type { IRolesConfig, RoleType } from "./types";

/** The line width Biome formats generated projects at. */
const LINE_WIDTH = 120;

/** A string-literal union type, on one line when it fits and one member per line otherwise, as Biome lays it out. */
const unionType = (name: string, members: string[]): string => {
  const literals = members.map((member) => `"${member}"`);
  const singleLine = `export type ${name} = ${literals.join(" | ")};`;

  if (singleLine.length <= LINE_WIDTH) {
    return singleLine;
  }

  return [`export type ${name} =`, ...literals.map((literal) => `  | ${literal}`)].join("\n").concat(";");
};

/**
 * The content of `roles.types.ts`, already formatted the way Biome would format it and ending with a newline,
 * so regenerating it leaves the git tree clean.
 */
export const generateRolesTypes = (config: IRolesConfig): string => {
  const roleKeys = Object.keys(config.roles) as RoleType[];
  const hierarchyKeys = Object.keys(config.hierarchy) as RoleType[];

  return [
    unionType("RoleType", roleKeys),
    "",
    unionType("RoleHierarchyRoleType", hierarchyKeys),
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
