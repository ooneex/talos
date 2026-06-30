import type { IRole, RolesConfigType } from "./types";

export class Role implements IRole {
  public hasRole(userRole: Uppercase<string>, requiredRole: Uppercase<string>, config: RolesConfigType): boolean {
    if (userRole === requiredRole) return config.hierarchy[userRole] !== undefined;
    return this.getInheritedRoles(userRole, config).includes(requiredRole);
  }

  public getInheritedRoles(role: Uppercase<string>, config: RolesConfigType): Uppercase<string>[] {
    if (!config.hierarchy[role]) return [];

    const visited = new Set<Uppercase<string>>();
    const ordered: Uppercase<string>[] = [];

    const collect = (r: Uppercase<string>): void => {
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
