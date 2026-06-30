import type { LocaleType } from "@talosjs/translation";

export enum EAccountType {
  OAUTH = "oauth",
  EMAIL = "email",
  CREDENTIALS = "credentials",
  WEBAUTHN = "webauthn",
}

export enum EVerificationType {
  EMAIL = "email",
  PHONE = "phone",
  PASSWORD_RESET = "password_reset",
  TWO_FACTOR = "two_factor",
  ACCOUNT_ACTIVATION = "account_activation",
}

export enum EProfileUpdateStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  REVERTED = "reverted",
}

export type AccountType = `${EAccountType}`;
export type VerificationType = `${EVerificationType}`;
export type ProfileUpdateStatusType = `${EProfileUpdateStatus}`;

interface IBase {
  id: string;
  isLocked?: boolean;
  lockedAt?: Date;
  isBanned?: boolean;
  bannedAt?: Date;
  banReason?: string;
  isBlocked?: boolean;
  blockedAt?: Date;
  blockReason?: string;
  isPublic?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  language?: LocaleType;
}

export interface IUser extends IBase {
  email: string;
  roles: Uppercase<string>[];
  externalId?: string;
  name?: string;
  lastName?: string;
  firstName?: string;
  username?: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  birthDate?: Date;
  timezone?: string;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  lastActiveAt?: Date;
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  recoveryTokens?: string[];
  sessions?: ISession[];
  accounts?: IAccount[];
  verifications?: IVerification[];
}

export interface ISession extends IBase {
  // Unique authentication token for the session
  token: string;
  // Token used to refresh the main session token when it expires
  refreshToken?: string;
  // Browser user agent string for device/browser identification
  userAgent?: string;
  // IP address from which the session was created
  ipAddress?: string;
  // Type of device (e.g., "mobile", "desktop", "tablet")
  deviceType?: string;
  // User-friendly device name (e.g., "John's iPhone", "MacBook Pro")
  deviceName?: string;
  // Browser name and version (e.g., "Chrome 120.0", "Safari 17.1")
  browser?: string;
  // Operating system information (e.g., "macOS 14.2", "Windows 11")
  operatingSystem?: string;
  // Geographic location where session was created (e.g., "New York, US")
  location?: string;
  // Whether the session is currently active and valid
  isActive: boolean;
  // When the session expires and becomes invalid
  expiresAt: Date;
  // Last time this session was used for authentication
  lastAccessAt?: Date;
  // When the session was manually revoked/terminated
  revokedAt?: Date;
  // Reason for session revocation (e.g., "user_logout", "admin_revoked", "security_breach")
  revokedReason?: string;
  user?: IUser;
}

export interface IAccount extends IBase {
  // OAuth provider name (e.g., "google", "github", "facebook", "microsoft")
  provider?: string;
  // Unique account ID from the external provider
  providerAccountId?: string;
  // Authentication method used for this account
  type: EAccountType;
  // Hashed password for credentials-based accounts
  password?: string;
  // Token for accessing provider APIs on behalf of the user
  accessToken?: string;
  // When the access token expires and needs refresh
  accessTokenExpiresAt?: Date;
  // Token used to obtain new access tokens
  refreshToken?: string;
  // When the refresh token expires
  refreshTokenExpiresAt?: Date;
  // General expiration date for the account connection
  expiresAt?: Date;
  // e.g., "Bearer", "Basic", "JWT" - defines how the access token should be used
  tokenType?: string;
  // OAuth scopes granted (e.g., "read:user,user:email")
  scope?: string;
  // OpenID Connect ID token containing user identity claims
  idToken?: string;
  // OAuth session state parameter for security
  sessionState?: string;
  // Email address associated with this provider account
  email?: string;
  // Whether the email is verified by the provider
  emailVerified?: boolean;
  // Display name from the provider profile
  name?: string;
  // Profile picture/avatar from the provider
  picture?: string;
  // Additional profile data from the provider
  profile?: Record<string, unknown>;
  user?: IUser;
}

export interface IVerification extends IBase {
  // Email address to be verified (for email verification types)
  email?: string;
  // Phone number to be verified (for phone verification types)
  phone?: string;
  // Secure token used for verification (typically UUID or similar)
  token: string;
  // Type of verification being performed
  type: EVerificationType;
  // Short numeric code sent to user (alternative to token for SMS/email)
  code?: string;
  // Whether this verification has been successfully completed
  isUsed: boolean;
  // When the verification was successfully completed
  usedAt?: Date;
  // When this verification expires and becomes invalid
  expiresAt: Date;
  // Number of verification attempts made so far
  attemptsCount: number;
  // Maximum allowed verification attempts before blocking
  maxAttempts: number;
  // IP address from which verification was requested
  ipAddress?: string;
  // Browser user agent string for security tracking
  userAgent?: string;
  // Additional data specific to the verification type
  metadata?: Record<string, unknown>;
  description?: string;
  user?: IUser;
}

export interface IUserProfileUpdate extends IBase {
  // What fields were changed in this update
  changedFields: string[];
  // Previous values before the update (for audit trail)
  previousValues?: Record<string, unknown>;
  // New values after the update
  newValues?: Record<string, unknown>;
  // Reason for the update (e.g., "profile_completion", "user_edit", "admin_correction")
  updateReason?: string;
  // IP address from which the update was made
  ipAddress?: string;
  // Browser user agent string for security tracking
  userAgent?: string;
  // Whether this update requires verification (e.g., email/phone changes)
  requiresVerification?: boolean;
  // Status of the update (e.g., "pending", "completed", "failed", "reverted")
  status: EProfileUpdateStatus;
  // When the update was applied/completed
  appliedAt?: Date;
  // Additional metadata specific to the update
  metadata?: Record<string, unknown>;
  description?: string;
  user?: IUser;
  // Reference to verification if update requires it
  verification?: IVerification;
}
