export type RoleHierarchyEntryType = {
  inherits?: Uppercase<string>[];
  description: string;
};

export type RoleHierarchyType = Record<Uppercase<string>, RoleHierarchyEntryType>;

export interface IRolesConfig {
  roles: Record<Uppercase<string>, Uppercase<string>>;
  hierarchy: RoleHierarchyType;
}

export interface IRole {
  hasRole: (userRole: Uppercase<string>, requiredRole: Uppercase<string>, config: IRolesConfig) => boolean;
  getInheritedRoles: (role: Uppercase<string>, config: IRolesConfig) => Uppercase<string>[];
}
