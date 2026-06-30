import { createClerkClient, type Session, type User, verifyToken } from "@clerk/backend";
import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { AuthException } from "./AuthException";
import { decorator } from "./decorators";
import type { IAuth } from "./types";

@decorator.auth()
export class ClerkAuth implements IAuth {
  private readonly client: ReturnType<typeof createClerkClient>;
  private readonly secretKey: string;

  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    const secretKey = this.env.CLERK_SECRET_KEY;

    if (!secretKey) {
      throw new AuthException(
        "Clerk secret key is required. Provide a secret key through config options or set the CLERK_SECRET_KEY environment variable.",
        "API_KEY_REQUIRED",
      );
    }

    this.secretKey = secretKey;
    this.client = createClerkClient({
      secretKey,
    });
  }

  public async getCurrentUser(token?: string): Promise<User | null> {
    if (!token) {
      return null;
    }

    const { sub: userId } = await verifyToken(token, {
      secretKey: this.secretKey,
    });

    if (!userId) {
      return null;
    }

    return await this.getUser(userId);
  }

  public async banUser(userId: string): Promise<User> {
    return await this.client.users.banUser(userId);
  }

  public async isBanned(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    return user.banned;
  }

  public async unbanUser(userId: string): Promise<User> {
    return await this.client.users.unbanUser(userId);
  }

  public async getUser(userId: string): Promise<User> {
    return await this.client.users.getUser(userId);
  }

  public async lockUser(userId: string): Promise<User> {
    return await this.client.users.lockUser(userId);
  }

  public async isLocked(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    return user.locked;
  }

  public async unlockUser(userId: string): Promise<User> {
    return await this.client.users.unlockUser(userId);
  }

  public async updateUser(userId: string, params: Parameters<typeof this.client.users.updateUser>[1]): Promise<User> {
    return await this.client.users.updateUser(userId, params);
  }

  public async updateUserProfileImage(userId: string, params: { file: Blob | File }): Promise<User> {
    return await this.client.users.updateUserProfileImage(userId, params);
  }

  public async updateUserMetadata(
    userId: string,
    params: Parameters<typeof this.client.users.updateUserMetadata>[1],
  ): Promise<User> {
    return await this.client.users.updateUserMetadata(userId, params);
  }

  public async getUserMetadata(userId: string): Promise<{
    publicMetadata: User["publicMetadata"];
    privateMetadata: User["privateMetadata"];
    unsafeMetadata: User["unsafeMetadata"];
  }> {
    const user = await this.getUser(userId);
    return {
      publicMetadata: user.publicMetadata,
      privateMetadata: user.privateMetadata,
      unsafeMetadata: user.unsafeMetadata,
    };
  }

  public async deleteUser(userId: string): Promise<User> {
    return await this.client.users.deleteUser(userId);
  }

  public async deleteUserProfileImage(userId: string): Promise<User> {
    return await this.client.users.deleteUserProfileImage(userId);
  }

  public async getSession(sessionId: string): Promise<Session> {
    return await this.client.sessions.getSession(sessionId);
  }

  public async getCurrentUserSession(token: string): Promise<Session | null> {
    const { sid: sessionId } = await verifyToken(token, {
      secretKey: this.secretKey,
    });

    if (!sessionId) {
      return null;
    }

    return await this.getSession(sessionId);
  }

  public async signIn({
    email,
    password,
    ttl = 2_592_000,
  }: {
    email: string;
    password: string;
    ttl?: number;
  }): Promise<{ user: User; token: string }> {
    const { data: users } = await this.client.users.getUserList({
      emailAddress: [email],
    });

    if (users.length === 0) {
      throw new AuthException("Invalid email or password.", "INVALID_CREDENTIALS");
    }

    const user = users[0] as User;

    const { verified } = await this.client.users.verifyPassword({
      userId: user.id,
      password,
    });

    if (!verified) {
      throw new AuthException("Invalid email or password.", "INVALID_CREDENTIALS");
    }

    const signInToken = await this.client.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: ttl,
    });

    return { user, token: signInToken.token };
  }

  public async signOut(sessionId: string): Promise<Session> {
    return await this.client.sessions.revokeSession(sessionId);
  }
}
