export type RoleType = `ROLE_${Uppercase<string>}`

/** Default role for unauthenticated/public routes. */
export const GUEST_ROLE: RoleType = "ROLE_GUEST"

export type RoleHierarchyEntryType = {
  inherits?: RoleType[];
  description: string;
};

export type RoleHierarchyType = Record<RoleType, RoleHierarchyEntryType>;

export interface IRolesConfig {
  roles: Record<Uppercase<string>, RoleType>;
  hierarchy: RoleHierarchyType;
}

export interface IRole {
  hasRole: (userRole: RoleType, requiredRole: RoleType, config: IRolesConfig) => boolean;
  getInheritedRoles: (role: RoleType, config: IRolesConfig) => RoleType[];
}
