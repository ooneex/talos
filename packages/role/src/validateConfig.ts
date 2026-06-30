import { RoleException } from "./RoleException";
import type { RolesConfigType } from "./types";

const REQUIRED_ROLES = ["GUEST", "TRIAL_USER", "USER", "PREMIUM_USER", "ADMIN", "SUPER_ADMIN", "SYSTEM"] as const;

export const validateConfig = (config: RolesConfigType): void => {
  for (const key of REQUIRED_ROLES) {
    if (!config.roles[key as Uppercase<string>]) {
      throw new RoleException(`Missing required role key: roles.${key}`, key as Uppercase<string>);
    }
  }

  for (const [key, roleValue] of Object.entries(config.roles)) {
    if (!config.hierarchy[roleValue as Uppercase<string>]) {
      throw new RoleException(
        `Role "${key}" maps to "${roleValue}" which is not defined in hierarchy`,
        roleValue as Uppercase<string>,
      );
    }
  }

  for (const [role, entry] of Object.entries(config.hierarchy)) {
    if (typeof entry.description !== "string" || entry.description.trim() === "") {
      throw new RoleException(
        `Invalid hierarchy entry for "${role}": "description" must be a non-empty string`,
        role as Uppercase<string>,
      );
    }

    if (entry.inherits !== undefined) {
      if (!Array.isArray(entry.inherits)) {
        throw new RoleException(
          `Invalid hierarchy entry for "${role}": "inherits" must be an array`,
          role as Uppercase<string>,
        );
      }

      for (const parent of entry.inherits) {
        if (typeof parent !== "string" || parent.trim() === "") {
          throw new RoleException(
            `Invalid hierarchy entry for "${role}": each value in "inherits" must be a non-empty string`,
            role as Uppercase<string>,
          );
        }

        if (!config.hierarchy[parent as Uppercase<string>]) {
          throw new RoleException(
            `Invalid hierarchy entry for "${role}": inherited role "${parent}" is not defined in hierarchy`,
            role as Uppercase<string>,
          );
        }
      }
    }
  }
};
