import type { User } from "@clerk/backend";
import { container, inject } from "@talosjs/container";
import type { ContextConfigType, ContextType } from "@talosjs/controller";
import { HttpStatus } from "@talosjs/http-status";
import type { IMiddleware } from "@talosjs/middleware";
import type { RolesConfigType } from "@talosjs/role";
import type { IUser } from "@talosjs/user";
import { AuthException } from "./AuthException";
import { ClerkAuth } from "./ClerkAuth";
import { decorator } from "./decorators";
import type { IAuth } from "./types";

@decorator.auth()
export class ClerkAuthMiddleware implements IMiddleware, IAuth {
  constructor(@inject(ClerkAuth) private readonly clerkAuth: ClerkAuth) {}

  public async getCurrentUser(token?: string): Promise<User | null> {
    return await this.clerkAuth.getCurrentUser(token);
  }

  public async handler<T extends ContextConfigType>(context: ContextType<T>): Promise<ContextType<T>> {
    const token = context.header.getBearerToken() ?? context.queries?.bearerToken;

    const rolesConfig = container.hasConstant("app.roles") ? container.getConstant<RolesConfigType>("app.roles") : null;

    const guestRole = rolesConfig?.roles.GUEST ?? "ROLE_GUEST";
    const routeRoles = context.route?.roles ?? [];
    const isGuestOnly = routeRoles.length === 0 || (routeRoles.length === 1 && routeRoles[0] === guestRole);

    if (!token) {
      if (isGuestOnly) {
        return context;
      }

      throw new AuthException("Authentication required: Missing bearer token", "MISSING_BEARER_TOKEN", {
        status: HttpStatus.Code.Unauthorized,
      });
    }

    const clerkUser = await this.clerkAuth.getCurrentUser(token);

    if (!clerkUser) {
      throw new AuthException("Authentication failed: Invalid or expired token", "INVALID_TOKEN", {
        status: HttpStatus.Code.Unauthorized,
      });
    }

    const primaryEmail = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId);

    if (!primaryEmail) {
      throw new AuthException("User has no primary email", "NO_PRIMARY_EMAIL", {
        status: HttpStatus.Code.Unauthorized,
      });
    }

    const userRole = rolesConfig?.roles.USER ?? "ROLE_USER";
    const user: IUser = {
      id: clerkUser.privateMetadata?.externalId as string,
      externalId: clerkUser.id,
      email: primaryEmail.emailAddress,
      roles: (clerkUser.privateMetadata?.roles as Uppercase<string>[]) ?? [userRole],
    };

    if (clerkUser.firstName) user.firstName = clerkUser.firstName;
    if (clerkUser.lastName) user.lastName = clerkUser.lastName;
    if (clerkUser.phoneNumbers[0]?.phoneNumber) user.phone = clerkUser.phoneNumbers[0].phoneNumber;
    if (clerkUser.lastActiveAt) user.lastActiveAt = new Date(clerkUser.lastActiveAt);
    if (clerkUser.lastSignInAt) user.lastLoginAt = new Date(clerkUser.lastSignInAt);
    if (clerkUser.imageUrl) user.avatar = clerkUser.imageUrl;
    if (clerkUser.banned) user.isBanned = clerkUser.banned;
    if (clerkUser.locked) user.isLocked = clerkUser.locked;
    if (clerkUser.createdAt) user.createdAt = new Date(clerkUser.createdAt);
    if (clerkUser.updatedAt) user.updatedAt = new Date(clerkUser.updatedAt);

    context.user = user;

    return context;
  }
}
