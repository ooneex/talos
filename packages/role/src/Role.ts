import type { IRole, IRolesConfig, RoleType } from "./types";

export class Role implements IRole {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor is required for Bun function coverage
  public constructor() {}

  public hasRole(userRole: RoleType, requiredRole: RoleType, config: IRolesConfig): boolean {
    if (userRole === requiredRole) return config.hierarchy[userRole] !== undefined;
    return this.getInheritedRoles(userRole, config).includes(requiredRole);
  }

  public getInheritedRoles(role: RoleType, config: IRolesConfig): RoleType[] {
    if (!config.hierarchy[role]) return [];

    const visited = new Set<RoleType>();
    const ordered: RoleType[] = [];

    const collect = (r: RoleType): void => {
      if (visited.has(r)) return;
      visited.add(r);
      const entry = config.hierarchy[r];
      if (entry?.inherits) {
        for (const parent of entry.inherits) collect(parent);
      }
      ordered.push(r);
    };

    collect(role);

    return ordered;
  }
}
