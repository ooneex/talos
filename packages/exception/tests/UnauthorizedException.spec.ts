import { describe, expect, test } from "bun:test";
import { HttpStatus } from "@talosjs/http-status";
import { Exception } from "@/Exception";
import { UnauthorizedException } from "@/UnauthorizedException";

describe("UnauthorizedException", () => {
  describe("Name", () => {
    test("should have correct exception name", () => {
      const exception = new UnauthorizedException("Test message", "TEST");

      expect(exception.name).toBe("UnauthorizedException");
    });
  });

  describe("Immutable Data", () => {
    test("should have immutable data property", () => {
      const data = { key: "value", count: 42 };
      const exception = new UnauthorizedException("Test message", "TEST", data);

      expect(Object.isFrozen(exception.data)).toBe(true);
      expect(() => {
        exception.data.key = "modified";
      }).toThrow();
    });
  });

  describe("Constructor", () => {
    test("should create UnauthorizedException with message only", () => {
      const message = "Access denied";
      const exception = new UnauthorizedException(message, "TEST");

      expect(exception).toBeInstanceOf(UnauthorizedException);
      expect(exception).toBeInstanceOf(Exception);
      expect(exception).toBeInstanceOf(Error);
      expect(exception.message).toBe(message);
      expect(exception.key).toBe("TEST");
      expect(exception.status).toBe(HttpStatus.Code.Unauthorized);
      expect(exception.data).toEqual({});
    });

    test("should create UnauthorizedException with message and data", () => {
      const message = "Invalid authentication credentials";
      const data = { token: "expired_token", userId: "user-123" };
      const exception = new UnauthorizedException(message, "TEST", data);

      expect(exception.message).toBe(message);
      expect(exception.key).toBe("TEST");
      expect(exception.status).toBe(HttpStatus.Code.Unauthorized);
      expect(exception.data).toEqual(data);
    });

    test("should create UnauthorizedException with empty data object", () => {
      const message = "Empty data test";
      const data = {};
      const exception = new UnauthorizedException(message, "TEST", data);

      expect(exception.message).toBe(message);
      expect(exception.status).toBe(HttpStatus.Code.Unauthorized);
      expect(exception.data).toEqual(data);
    });

    test("should handle null data gracefully", () => {
      const message = "Null data test";
      const exception = new UnauthorizedException(message, "TEST");

      expect(exception.message).toBe(message);
      expect(exception.status).toBe(HttpStatus.Code.Unauthorized);
      expect(exception.data).toEqual({});
    });
  });

  describe("Inheritance and Properties", () => {
    test("should inherit all properties from Exception", () => {
      const message = "Authentication failed";
      const data = { token: "invalid_token", realm: "api" };
      const exception = new UnauthorizedException(message, "TEST", data);

      // Properties from Exception
      expect(exception.key).toBe("TEST");
      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.status).toBe(HttpStatus.Code.Unauthorized);
      expect(exception.data).toEqual(data);
      expect(exception.native).toBeUndefined();

      // Properties from Error
      expect(exception.name).toBe("UnauthorizedException");
      expect(exception.message).toBe(message);
      expect(exception.stack).toBeDefined();
    });

    test("should always set status to Unauthorized", () => {
      const exception1 = new UnauthorizedException("Error 1", "TEST");
      const exception2 = new UnauthorizedException("Error 2", "TEST", { key: "value" });

      expect(exception1.status).toBe(HttpStatus.Code.Unauthorized);
      expect(exception2.status).toBe(HttpStatus.Code.Unauthorized);
      expect(exception1.status).toBe(401);
      expect(exception2.status).toBe(401);
    });

    test("should have readonly data property", () => {
      const data = { token: "test_token" };
      const exception = new UnauthorizedException("Test", "TEST", data);

      expect(exception.data).toEqual(data);
      expect(Object.isFrozen(exception.data)).toBe(true);
    });
  });

  describe("Generic Type Support", () => {
    test("should support generic type for data values", () => {
      interface AuthenticationError {
        token: string;
        userId: string;
        reason: string;
      }

      const errorData: Record<string, AuthenticationError> = {
        tokenError: {
          token: "expired_jwt",
          userId: "user-456",
          reason: "Token has expired",
        },
        sessionError: {
          token: "invalid_session",
          userId: "user-789",
          reason: "Session not found",
        },
      };

      const exception = new UnauthorizedException("Authentication failed", "TEST", errorData);

      expect(exception.data).toEqual(errorData);
      expect((exception.data?.tokenError as AuthenticationError)?.token).toBe("expired_jwt");
      expect((exception.data?.sessionError as AuthenticationError)?.reason).toBe("Session not found");
    });

    test("should support string generic type", () => {
      const stringData: Record<string, string> = {
        token: "bearer_token_abc123",
        suggestion: "Please provide valid credentials",
        realm: "secure_api",
      };

      const exception = new UnauthorizedException("String data test", "TEST", stringData);

      expect(exception.data).toEqual(stringData);
      expect(typeof exception.data?.token).toBe("string");
    });

    test("should support number generic type", () => {
      const numberData: Record<string, number> = {
        userId: 12_345,
        attempts: 3,
        maxAttempts: 5,
      };

      const exception = new UnauthorizedException("Number data test", "TEST", numberData);

      expect(exception.data).toEqual(numberData);
      expect(typeof exception.data?.userId).toBe("number");
    });
  });

  describe("Error Handling Scenarios", () => {
    test("should handle authentication token failures", () => {
      const exception = new UnauthorizedException("Authentication token invalid", "TEST", {
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        tokenType: "Bearer",
        reason: "Token signature verification failed",
        expiresAt: "2024-01-15T10:30:00Z",
      });

      expect(exception.message).toBe("Authentication token invalid");
      expect(exception.data?.tokenType).toBe("Bearer");
      expect(exception.data?.reason).toBe("Token signature verification failed");
    });

    test("should handle session expiration", () => {
      const exception = new UnauthorizedException("Session expired", "TEST", {
        sessionId: "sess_abc123",
        expiresAt: "2024-01-15T09:00:00Z",
        currentTime: "2024-01-15T10:30:00Z",
        maxInactivity: 3600,
        lastActivity: "2024-01-15T08:45:00Z",
      });

      expect(exception.message).toBe("Session expired");
      expect(exception.data?.sessionId).toBe("sess_abc123");
      expect(exception.data?.maxInactivity).toBe(3600);
    });

    test("should handle invalid credentials", () => {
      const exception = new UnauthorizedException("Invalid login credentials", "TEST", {
        username: "john.doe",
        passwordProvided: true,
        failedAttempts: 2,
        maxAttempts: 5,
        accountLocked: false,
        lastLoginAttempt: "2024-01-15T10:25:00Z",
      });

      expect(exception.message).toBe("Invalid login credentials");
      expect(exception.data?.username).toBe("john.doe");
      expect(exception.data?.failedAttempts).toBe(2);
      expect(exception.data?.accountLocked).toBe(false);
    });

    test("should handle permission denied scenarios", () => {
      const exception = new UnauthorizedException("Insufficient permissions", "TEST", {
        userId: "user-789",
        requiredRole: "admin",
        userRoles: ["user", "moderator"],
        resource: "/api/admin/users",
        action: "DELETE",
      });

      expect(exception.message).toBe("Insufficient permissions");
      expect(exception.data?.requiredRole).toBe("admin");
      expect(exception.data?.userRoles).toContain("moderator");
      expect(exception.data?.action).toBe("DELETE");
    });
  });

  describe("Stack Trace and Debugging", () => {
    test("should maintain proper stack trace", () => {
      function throwUnauthorizedException() {
        throw new UnauthorizedException("Stack trace test", "TEST");
      }

      try {
        throwUnauthorizedException();
        // biome-ignore lint/suspicious/noExplicitAny: trust me
      } catch (error: any) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain("throwUnauthorizedException");
        expect(error.stack).toContain("Stack trace test");
      }
    });

    test("should support stackToJson method from parent Exception", () => {
      const exception = new UnauthorizedException("JSON stack test", "TEST");
      const stackJson = exception.stackToJson();

      expect(stackJson).toBeDefined();
      if (stackJson) {
        expect(Array.isArray(stackJson)).toBe(true);
        expect(stackJson.length).toBeGreaterThan(0);
        expect(stackJson[0]).toHaveProperty("source");
      }
    });
  });

  describe("Serialization and Inspection", () => {
    test("should be JSON serializable", () => {
      const exception = new UnauthorizedException("Serialization test", "TEST", {
        component: "auth-service",
        version: "5.1.0",
        secureMode: true,
      });

      const serialized = JSON.stringify({
        message: exception.message,
        name: exception.name,
        status: exception.status,
        data: exception.data,
        date: exception.date,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.message).toBe("Serialization test");
      expect(parsed.name).toBe("UnauthorizedException");
      expect(parsed.status).toBe(401);
      expect(parsed.data).toEqual({
        component: "auth-service",
        version: "5.1.0",
        secureMode: true,
      });
    });

    test("should have correct toString representation", () => {
      const exception = new UnauthorizedException("ToString test", "TEST");
      const stringRep = exception.toString();

      expect(stringRep).toContain("UnauthorizedException");
      expect(stringRep).toContain("ToString test");
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty message", () => {
      const exception = new UnauthorizedException("", "TEST");

      expect(exception.message).toBe("");
      expect(exception.status).toBe(HttpStatus.Code.Unauthorized);
    });

    test("should handle very long messages", () => {
      const longMessage = "x".repeat(1000);
      const exception = new UnauthorizedException(longMessage, "TEST");

      expect(exception.message).toBe(longMessage);
      expect(exception.message.length).toBe(1000);
    });

    test("should handle special characters in message", () => {
      const specialMessage = "Unauthorized Access: 特殊文字 🔒 with émojis and ñumbers 123!@#$%^&*()";
      const exception = new UnauthorizedException(specialMessage, "TEST");

      expect(exception.message).toBe(specialMessage);
    });

    test("should handle complex nested data", () => {
      const complexData = {
        authentication: {
          method: "jwt",
          provider: "oauth2",
          status: "failed",
        },
        token: {
          type: "Bearer",
          expiresAt: "2024-01-15T12:00:00Z",
          scopes: ["read", "write"],
        },
        user: {
          id: "user-456",
          roles: ["guest"],
          permissions: [],
        },
        metadata: {
          timestamp: new Date().toISOString(),
          ipAddress: "192.168.1.100",
          userAgent: "Mozilla/5.0",
          attempt: 3,
        },
        suggestions: {
          refreshToken: "Use refresh token to get new access token",
          reauth: "Please log in again",
        },
      };

      const exception = new UnauthorizedException("Complex data test", "TEST", complexData);

      expect(exception.data).toEqual(complexData);
      expect((exception.data?.authentication as { method: string })?.method).toBe("jwt");
      expect((exception.data?.token as { type: string })?.type).toBe("Bearer");
      expect((exception.data?.user as { roles: string[] })?.roles).toContain("guest");
      expect((exception.data?.metadata as { attempt: number })?.attempt).toBe(3);
    });

    test("should handle authentication-specific data structures", () => {
      interface AuthenticationContext {
        sessionId: string;
        tokenInfo: {
          type: "JWT" | "Bearer" | "Basic";
          value: string;
          expiresAt?: string;
          scopes: string[];
        };
        userInfo: {
          id: string;
          email: string;
          verified: boolean;
          roles: string[];
        };
        security: {
          mfaEnabled: boolean;
          trustedDevice: boolean;
          riskScore: number;
        };
      }

      const authData: AuthenticationContext = {
        sessionId: "session_xyz789",
        tokenInfo: {
          type: "JWT",
          value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          expiresAt: "2024-01-15T15:30:00Z",
          scopes: ["profile", "email", "admin"],
        },
        userInfo: {
          id: "user-12345",
          email: "user@example.com",
          verified: true,
          roles: ["user", "premium"],
        },
        security: {
          mfaEnabled: true,
          trustedDevice: false,
          riskScore: 0.7,
        },
      };

      const exception = new UnauthorizedException(
        "Authentication context failed",
        "TEST",
        authData as unknown as Record<string, unknown>,
      );

      expect(exception.data?.sessionId).toBe("session_xyz789");
      expect((exception.data?.tokenInfo as { type: string })?.type).toBe("JWT");
      expect((exception.data?.tokenInfo as { scopes: string[] })?.scopes).toHaveLength(3);
      expect((exception.data?.userInfo as { verified: boolean })?.verified).toBe(true);
      expect((exception.data?.security as { mfaEnabled: boolean })?.mfaEnabled).toBe(true);
    });
  });

  describe("Authentication-Specific Scenarios", () => {
    test("should handle OAuth authentication failures", () => {
      const exception = new UnauthorizedException("OAuth authentication failed", "TEST", {
        provider: "google",
        clientId: "client_123456",
        scope: "openid profile email",
        redirectUri: "https://app.example.com/callback",
        error: "invalid_grant",
        errorDescription: "Authorization code has expired",
        state: "random_state_123",
      });

      expect(exception.message).toBe("OAuth authentication failed");
      expect(exception.data?.provider).toBe("google");
      expect(exception.data?.error).toBe("invalid_grant");
      expect(exception.data?.errorDescription).toContain("expired");
    });

    test("should handle API key validation failures", () => {
      const exception = new UnauthorizedException("API key validation failed", "TEST", {
        apiKey: "ak_test_1234567890abcdef",
        keyValid: false,
        keyExpired: true,
        expiresAt: "2024-01-10T00:00:00Z",
        usage: {
          current: 10_500,
          limit: 10_000,
          remaining: -500,
        },
        permissions: ["read"],
        requiredPermission: "write",
      });

      expect(exception.message).toBe("API key validation failed");
      expect(exception.data?.keyValid).toBe(false);
      expect(exception.data?.keyExpired).toBe(true);
      expect((exception.data?.usage as { remaining: number })?.remaining).toBe(-500);
    });

    test("should handle multi-factor authentication failures", () => {
      const exception = new UnauthorizedException("Multi-factor authentication required", "TEST", {
        mfaRequired: true,
        mfaStep: "totp_verification",
        mfaProvided: false,
        availableMethods: ["totp", "sms", "backup_codes"],
        backupCodesRemaining: 3,
        trustedDevice: false,
        riskAssessment: "high",
      });

      expect(exception.message).toBe("Multi-factor authentication required");
      expect(exception.data?.mfaRequired).toBe(true);
      expect(exception.data?.mfaStep).toBe("totp_verification");
      expect(exception.data?.availableMethods).toContain("totp");
      expect(exception.data?.backupCodesRemaining).toBe(3);
    });

    test("should handle rate limiting scenarios", () => {
      const exception = new UnauthorizedException("Authentication rate limit exceeded", "TEST", {
        rateLimitType: "login_attempts",
        attemptsRemaining: 0,
        maxAttempts: 5,
        resetTime: "2024-01-15T11:30:00Z",
        windowStart: "2024-01-15T10:30:00Z",
        windowDuration: 3600,
        clientInfo: {
          ipAddress: "192.168.1.100",
          userAgent: "curl/7.68.0",
        },
      });

      expect(exception.message).toBe("Authentication rate limit exceeded");
      expect(exception.data?.attemptsRemaining).toBe(0);
      expect(exception.data?.maxAttempts).toBe(5);
      expect(exception.data?.windowDuration).toBe(3600);
      expect((exception.data?.clientInfo as { ipAddress: string })?.ipAddress).toBe("192.168.1.100");
    });

    test("should handle token refresh scenarios", () => {
      const exception = new UnauthorizedException("Token refresh failed", "TEST", {
        refreshToken: "rt_abcdef123456",
        accessToken: "at_expired_789",
        tokenType: "Bearer",
        reason: "refresh_token_expired",
        originalExpiry: "2024-01-15T09:00:00Z",
        refreshAttemptedAt: "2024-01-15T10:30:00Z",
        gracePeriod: false,
        reAuthRequired: true,
      });

      expect(exception.message).toBe("Token refresh failed");
      expect(exception.data?.reason).toBe("refresh_token_expired");
      expect(exception.data?.gracePeriod).toBe(false);
      expect(exception.data?.reAuthRequired).toBe(true);
    });

    test("should handle role-based access control failures", () => {
      const exception = new UnauthorizedException("Role-based access denied", "TEST", {
        userId: "user-567",
        userRoles: ["user", "editor"],
        requiredRoles: ["admin", "super_admin"],
        resource: {
          type: "api_endpoint",
          path: "/admin/system/config",
          method: "PUT",
        },
        policy: {
          name: "admin_only_config",
          version: "1.2",
          strict: true,
        },
        hierarchyCheck: false,
      });

      expect(exception.message).toBe("Role-based access denied");
      expect(exception.data?.userRoles).toContain("editor");
      expect(exception.data?.requiredRoles).toContain("admin");
      expect((exception.data?.resource as { method: string })?.method).toBe("PUT");
      expect((exception.data?.policy as { strict: boolean })?.strict).toBe(true);
    });
  });
});
