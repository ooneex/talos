import { RoleException } from "./RoleException";
import type { IRolesConfig, RoleType } from "./types";

const REQUIRED_ROLES = ["GUEST", "TRIAL_USER", "USER", "PREMIUM_USER", "ADMIN", "SUPER_ADMIN", "SYSTEM"] as const;

export const validateConfig = (config: IRolesConfig): void => {
  for (const key of REQUIRED_ROLES) {
    if (!config.roles[key as RoleType]) {
      throw new RoleException(`Missing required role key: roles.${key}`, key);
    }
  }

  for (const [key, roleValue] of Object.entries(config.roles)) {
    if (!config.hierarchy[roleValue as RoleType]) {
      throw new RoleException(`Role "${key}" maps to "${roleValue}" which is not defined in hierarchy`, roleValue);
    }
  }

  for (const [role, entry] of Object.entries(config.hierarchy)) {
    if (typeof entry.description !== "string" || entry.description.trim() === "") {
      throw new RoleException(`Invalid hierarchy entry for "${role}": "description" must be a non-empty string`, role);
    }

    if (entry.inherits !== undefined) {
      if (!Array.isArray(entry.inherits)) {
        throw new RoleException(`Invalid hierarchy entry for "${role}": "inherits" must be an array`, role);
      }

      for (const parent of entry.inherits) {
        if (typeof parent !== "string" || parent.trim() === "") {
          throw new RoleException(
            `Invalid hierarchy entry for "${role}": each value in "inherits" must be a non-empty string`,
            role,
          );
        }

        if (!config.hierarchy[parent as RoleType]) {
          throw new RoleException(
            `Invalid hierarchy entry for "${role}": inherited role "${parent}" is not defined in hierarchy`,
            role,
          );
        }
      }
    }
  }
};
