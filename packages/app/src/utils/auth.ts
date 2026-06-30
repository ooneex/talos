import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import { HttpStatus } from "@talosjs/http-status";
import type { RolesConfigType } from "@talosjs/role";
import type { RouteValidationErrorType } from "./validation";

export const applyEnvRoles = (context: ContextType): void => {
  if (!context.user) {
    return;
  }

  const rolesConfig = container.hasConstant("app.roles") ? container.getConstant<RolesConfigType>("app.roles") : null;

  if (!rolesConfig) {
    return;
  }

  const systemRole = rolesConfig.roles.SYSTEM;
  const systemUsers = context.env.SYSTEM_USERS;
  if (systemRole && systemUsers?.includes(context.user.email) && !context.user.roles.includes(systemRole)) {
    context.user.roles.push(systemRole);
  }

  const superAdminRole = rolesConfig.roles.SUPER_ADMIN;
  const superAdminUsers = context.env.SUPER_ADMIN_USERS;
  if (superAdminRole && superAdminUsers?.includes(context.user.email) && !context.user.roles.includes(superAdminRole)) {
    context.user.roles.push(superAdminRole);
  }

  const adminRole = rolesConfig.roles.ADMIN;
  const adminUsers = context.env.ADMIN_USERS;
  if (adminRole && adminUsers?.includes(context.user.email) && !context.user.roles.includes(adminRole)) {
    context.user.roles.push(adminRole);
  }
};

export const checkAllowedUsers = (context: ContextType): RouteValidationErrorType | null => {
  if (!context.user) {
    return null;
  }

  const allowedUsersKey = `${context.env.APP_ENV.toUpperCase()}_ALLOWED_USERS` as keyof typeof context.env;
  const allowedUsers = context.env[allowedUsersKey] as string[] | undefined;

  if (allowedUsers && allowedUsers.length > 0 && !allowedUsers.includes(context.user.email)) {
    return {
      message: `User "${context.user.email}" is not allowed in "${context.env.APP_ENV}" environment`,
      status: HttpStatus.Code.Forbidden,
      key: "USER_NOT_ALLOWED",
    };
  }

  return null;
};
