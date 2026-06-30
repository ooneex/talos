import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import type { JwtDefaultPayloadType, JwtPayloadType } from "@/index";
import { Jwt, JwtException } from "@/index";

const createMockEnv = (overrides: Partial<AppEnv> = {}): AppEnv => {
  return {
    JWT_SECRET: Bun.env.JWT_SECRET,
    ...overrides,
  } as unknown as AppEnv;
};

describe("Jwt", () => {
  const testSecret = "test-secret-key-with-minimum-32-characters";
  let originalJwtSecret: string | undefined;

  beforeEach(() => {
    originalJwtSecret = Bun.env.JWT_SECRET;
  });

  afterEach(() => {
    if (originalJwtSecret !== undefined) {
      Bun.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete Bun.env.JWT_SECRET;
    }
  });

  describe("Constructor", () => {
    test("should create Jwt instance with JWT_SECRET from env", () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));

      expect(jwt).toBeInstanceOf(Jwt);
      expect(jwt.getSecret()).toBe(testSecret);
    });

    test("should expose JWT_SECRET correctly", () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));

      expect(jwt.getSecret()).toBe(testSecret);
    });

    test("should throw JwtException when JWT_SECRET is not set", () => {
      expect(() => new Jwt(createMockEnv({ JWT_SECRET: undefined }))).toThrow(JwtException);
    });

    test("should throw JwtException with descriptive message when JWT_SECRET is not set", () => {
      try {
        new Jwt(createMockEnv({ JWT_SECRET: undefined }));
      } catch (error) {
        expect(error).toBeInstanceOf(JwtException);
        expect((error as JwtException).message).toBe(
          "JWT secret is required. Please set the JWT_SECRET environment variable.",
        );
      }
    });
  });

  describe("getSecret", () => {
    test("should return secret as string", () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
      const secret = jwt.getSecret();

      expect(typeof secret).toBe("string");
      expect(secret).toBe(testSecret);
    });

    test("should return the same secret for different secret strings", () => {
      const secrets = [
        "simple-secret",
        "complex-secret-with-special-chars!@#$%^&*()",
        "unicode-secret-with-émojis-🔐-and-special-chars-ñ",
        `very-long-secret-${new Array(100).fill("x").join("")}`,
      ];

      for (const secret of secrets) {
        const jwt = new Jwt(createMockEnv({ JWT_SECRET: secret }));

        expect(jwt.getSecret()).toBe(secret);
      }
    });
  });

  describe("create", () => {
    let jwt: Jwt;

    beforeEach(() => {
      jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
    });

    test("should create JWT token with default configuration", async () => {
      const token = await jwt.create();

      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);

      // Verify it's a valid JWT by decoding
      const header = jwt.getHeader(token);
      expect(header.alg).toBe("HS256");
    });

    test("should create JWT token with custom payload", async () => {
      const payload = {
        userId: "123",
        role: "admin",
        permissions: ["read", "write"],
      };

      const token = await jwt.create({ payload });

      const decodedPayload = jwt.getPayload(token);
      expect(decodedPayload.userId).toBe("123");
      expect(decodedPayload.role).toBe("admin");
      expect(decodedPayload.permissions).toEqual(["read", "write"]);
    });

    test("should create JWT token with standard JWT claims", async () => {
      const payload: JwtDefaultPayloadType = {
        iss: "test-issuer",
        sub: "user123",
        aud: "test-audience",
        exp: "1h",
        iat: Date.now(),
        jti: "unique-token-id",
        nbf: Date.now(),
      };

      const token = await jwt.create({ payload });

      const decodedPayload = jwt.getPayload(token);
      expect(decodedPayload.iss).toBe("test-issuer");
      expect(decodedPayload.sub).toBe("user123");
      expect(decodedPayload.aud).toBe("test-audience");
      expect(decodedPayload.jti).toBe("unique-token-id");
    });

    test("should create JWT token with custom header", async () => {
      const customHeader = {
        alg: "HS256" as const,
        kid: "key-123",
        cty: "JWT",
      };

      const token = await jwt.create({ header: customHeader });

      const decodedHeader = jwt.getHeader(token);
      expect(decodedHeader.alg).toBe("HS256");
      expect(decodedHeader.kid).toBe("key-123");
      expect(decodedHeader.cty).toBe("JWT");
    });

    test("should create JWT token with both payload and header", async () => {
      const payload = { userId: "456", role: "user" };
      const header = { alg: "HS256" as const, kid: "key-456" };

      const token = await jwt.create({ payload, header });

      const decodedPayload = jwt.getPayload(token);
      const decodedHeader = jwt.getHeader(token);

      expect(decodedPayload.userId).toBe("456");
      expect(decodedPayload.role).toBe("user");
      expect(decodedHeader.kid).toBe("key-456");
      expect(decodedHeader.alg).toBe("HS256");
    });

    test("should handle different expiration time formats", async () => {
      const expirationFormats = [
        "1h" as const,
        "30m" as const,
        "7d" as const,
        "1w" as const,
        "1y" as const,
        Math.floor(Date.now() / 1000) + 3600, // Unix timestamp
        new Date(Date.now() + 3600000), // Date object
      ];

      for (const exp of expirationFormats) {
        const token = await jwt.create({ payload: { exp } });
        const decodedPayload = jwt.getPayload(token);

        expect(decodedPayload.exp).toBeDefined();
      }
    });

    test("should handle array audience", async () => {
      const payload = {
        aud: ["service1", "service2", "service3"],
      };

      const token = await jwt.create({ payload });
      const decodedPayload = jwt.getPayload(token);

      expect(decodedPayload.aud).toEqual(["service1", "service2", "service3"]);
    });

    test("should handle mixed payload with standard and custom claims", async () => {
      const payload = {
        // Standard claims
        iss: "auth-service",
        sub: "user789",
        exp: "2h" as const,
        // Custom claims
        userId: "789",
        email: "user@example.com",
        roles: ["admin", "moderator"],
        metadata: {
          lastLogin: new Date().toISOString(),
          loginCount: 42,
        },
      };

      const token = await jwt.create({ payload });
      const decodedPayload = jwt.getPayload(token);

      // Standard claims
      expect(decodedPayload.iss).toBe("auth-service");
      expect(decodedPayload.sub).toBe("user789");
      // Custom claims
      expect(decodedPayload.userId).toBe("789");
      expect(decodedPayload.email).toBe("user@example.com");
      expect(decodedPayload.roles).toEqual(["admin", "moderator"]);
      expect(decodedPayload.metadata).toEqual(payload.metadata);
    });

    test("should handle empty payload gracefully", async () => {
      const token = await jwt.create({ payload: {} });

      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);

      const decodedPayload = jwt.getPayload(token);
      expect(typeof decodedPayload).toBe("object");
    });

    test("should use generic types correctly", async () => {
      interface UserPayload extends Record<string, unknown> {
        userId: string;
        email: string;
        roles: string[];
      }

      const payload: JwtPayloadType<UserPayload> = {
        userId: "user123",
        email: "user@test.com",
        roles: ["admin"],
        iss: "auth-service",
      };

      const token = await jwt.create<UserPayload>({ payload });
      const decodedPayload = jwt.getPayload<UserPayload>(token);

      expect(decodedPayload.userId).toBe("user123");
      expect(decodedPayload.email).toBe("user@test.com");
      expect(decodedPayload.roles).toEqual(["admin"]);
      expect(decodedPayload.iss).toBe("auth-service");
    });
  });

  describe("isValid", () => {
    let jwt: Jwt;

    beforeEach(() => {
      jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
    });

    test("should return true for valid token", async () => {
      const token = await jwt.create();
      const isValid = await jwt.isValid(token);

      expect(isValid).toBe(true);
    });

    test("should return false for invalid token signature", async () => {
      const token = await jwt.create();
      const invalidToken = `${token.slice(0, -5)}INVALID`;
      const isValid = await jwt.isValid(invalidToken);

      expect(isValid).toBe(false);
    });

    test("should return false for malformed token", async () => {
      const malformedTokens = [
        "not.a.jwt",
        "invalid-token-format",
        "",
        "only-one-part",
        "two.parts",
        "four.parts.are.invalid",
      ];

      for (const token of malformedTokens) {
        const isValid = await jwt.isValid(token);
        expect(isValid).toBe(false);
      }
    });

    test("should return false for expired token", async () => {
      // Create a token that expires immediately
      const expiredPayload = {
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      const token = await jwt.create({ payload: expiredPayload });
      const isValid = await jwt.isValid(token);

      expect(isValid).toBe(false);
    });

    test("should return false for token signed with different secret", async () => {
      const differentJwt = new Jwt(createMockEnv({ JWT_SECRET: "different-secret-key-with-minimum-length" }));
      const token = await differentJwt.create();
      const isValid = await jwt.isValid(token);

      expect(isValid).toBe(false);
    });

    test("should return false for token with invalid nbf (not before) claim", async () => {
      // Create a token that is not valid before a future time
      const futurePayload = {
        nbf: Math.floor(Date.now() / 1000) + 3600, // Valid 1 hour from now
      };

      const token = await jwt.create({ payload: futurePayload });
      const isValid = await jwt.isValid(token);

      expect(isValid).toBe(false);
    });

    test("should handle various invalid token formats gracefully", async () => {
      const invalidTokens = [
        null,
        undefined,
        123,
        {},
        [],
        "Bearer token",
        "JWT token",
        new Array(1000).join("a"), // Very long string
      ];

      for (const token of invalidTokens) {
        const isValid = await jwt.isValid(token as string);
        expect(isValid).toBe(false);
      }
    });
  });

  describe("getHeader", () => {
    let jwt: Jwt;

    beforeEach(() => {
      jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
    });

    test("should return default header for token created with default settings", async () => {
      const token = await jwt.create();
      const header = jwt.getHeader(token);

      expect(header.alg).toBe("HS256");
      expect(header.typ).toBeUndefined();
    });

    test("should return custom header properties", async () => {
      const customHeader = {
        alg: "HS256" as const,
        kid: "key-id-123",
        cty: "JWT",
        x5t: "thumbprint",
      };

      const token = await jwt.create({ header: customHeader });
      const header = jwt.getHeader(token);

      expect(header.alg).toBe("HS256"); // Always set
      expect(header.typ).toBeUndefined(); // Not set by default
      expect(header.kid).toBe("key-id-123");
      expect(header.cty).toBe("JWT");
      expect(header.x5t).toBe("thumbprint");
    });

    test("should return header with generic type", async () => {
      interface CustomHeader {
        alg: string;
        typ: string;
        kid: string;
        custom: string;
      }

      const customHeader = {
        alg: "HS256" as const,
        kid: "test-key",
        custom: "custom-value",
      };

      const token = await jwt.create({ header: customHeader });
      const header = jwt.getHeader<CustomHeader>(token);

      expect(header.alg).toBe("HS256");
      expect(header.kid).toBe("test-key");
      expect(header.custom).toBe("custom-value");
    });

    test("should decode header from manually created JWT", () => {
      // Create a JWT manually for testing
      const header = { alg: "HS256", typ: "JWT", kid: "manual-key" };
      const payload = { sub: "test" };
      const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "");
      const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "");
      const signature = "fake-signature";
      const token = `${headerB64}.${payloadB64}.${signature}`;

      const decodedHeader = jwt.getHeader(token);

      expect(decodedHeader.alg).toBe("HS256");
      expect(decodedHeader.typ).toBe("JWT");
      expect(decodedHeader.kid).toBe("manual-key");
    });

    test("should handle header decoding errors gracefully", () => {
      const invalidTokens = ["invalid.token", "not-base64.invalid", "", "missing-parts"];

      for (const token of invalidTokens) {
        expect(() => jwt.getHeader(token)).toThrow();
      }
    });
  });

  describe("getPayload", () => {
    let jwt: Jwt;

    beforeEach(() => {
      jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
    });

    test("should return payload for valid token", async () => {
      const originalPayload = {
        userId: "123",
        email: "test@example.com",
        roles: ["admin", "user"],
      };

      const token = await jwt.create({ payload: originalPayload });
      const decodedPayload = jwt.getPayload(token);

      expect(decodedPayload.userId).toBe("123");
      expect(decodedPayload.email).toBe("test@example.com");
      expect(decodedPayload.roles).toEqual(["admin", "user"]);
    });

    test("should return standard JWT claims", async () => {
      const originalPayload = {
        iss: "issuer",
        sub: "subject",
        aud: "audience",
        jti: "jwt-id",
        exp: "1h" as const,
        iat: Date.now(),
        nbf: Date.now(),
      };

      const token = await jwt.create({ payload: originalPayload });
      const decodedPayload = jwt.getPayload(token);

      expect(decodedPayload.iss).toBe("issuer");
      expect(decodedPayload.sub).toBe("subject");
      expect(decodedPayload.aud).toBe("audience");
      expect(decodedPayload.jti).toBe("jwt-id");
      expect(decodedPayload.exp).toBeDefined();
      expect(decodedPayload.iat).toBeDefined();
      expect(decodedPayload.nbf).toBeDefined();
    });

    test("should return payload with generic type", async () => {
      interface UserPayload extends Record<string, unknown> {
        userId: string;
        profile: {
          name: string;
          avatar: string;
        };
        permissions: string[];
      }

      const originalPayload: UserPayload = {
        userId: "user456",
        profile: {
          name: "John Doe",
          avatar: "https://example.com/avatar.jpg",
        },
        permissions: ["read", "write", "delete"],
      };

      const token = await jwt.create({ payload: originalPayload });
      const decodedPayload = jwt.getPayload<UserPayload>(token);

      expect(decodedPayload.userId).toBe("user456");
      expect(decodedPayload.profile.name).toBe("John Doe");
      expect(decodedPayload.profile.avatar).toBe("https://example.com/avatar.jpg");
      expect(decodedPayload.permissions).toEqual(["read", "write", "delete"]);
    });

    test("should handle complex nested payload structures", async () => {
      const complexPayload = {
        user: {
          id: "123",
          profile: {
            personal: {
              firstName: "John",
              lastName: "Doe",
              birthDate: "1990-01-01",
            },
            contact: {
              email: "john@example.com",
              phone: "+1234567890",
            },
          },
          preferences: {
            theme: "dark",
            language: "en",
            notifications: {
              email: true,
              push: false,
              sms: true,
            },
          },
        },
        session: {
          id: "session123",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        },
        permissions: {
          resources: ["users", "posts", "comments"],
          actions: ["create", "read", "update", "delete"],
          restrictions: {
            rateLimit: 100,
            maxFileSize: 10485760,
          },
        },
      };

      const token = await jwt.create({ payload: complexPayload });
      const decodedPayload = jwt.getPayload(token);

      const userPayload = decodedPayload.user as Record<string, unknown>;
      const profilePayload = userPayload.profile as Record<string, unknown>;
      const personalPayload = profilePayload.personal as Record<string, unknown>;
      const preferencesPayload = userPayload.preferences as Record<string, unknown>;
      const notificationsPayload = preferencesPayload.notifications as Record<string, unknown>;
      const sessionPayload = decodedPayload.session as Record<string, unknown>;
      const permissionsPayload = decodedPayload.permissions as Record<string, unknown>;
      const restrictionsPayload = permissionsPayload.restrictions as Record<string, unknown>;

      expect(userPayload.id).toBe("123");
      expect(personalPayload.firstName).toBe("John");
      expect(notificationsPayload.email).toBe(true);
      expect(sessionPayload.id).toBe("session123");
      expect(permissionsPayload.resources).toContain("users");
      expect(restrictionsPayload.rateLimit).toBe(100);
    });

    test("should handle empty payload", async () => {
      const token = await jwt.create({ payload: {} });
      const decodedPayload = jwt.getPayload(token);

      expect(typeof decodedPayload).toBe("object");
      expect(decodedPayload).toBeDefined();
    });

    test("should decode payload from expired token", async () => {
      const payload = {
        userId: "456",
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired
      };

      const token = await jwt.create({ payload });
      // Should still be able to decode payload even if token is expired
      const decodedPayload = jwt.getPayload(token);

      expect(decodedPayload.userId).toBe("456");
      expect(decodedPayload.exp).toBeDefined();
    });

    test("should handle special data types in payload", async () => {
      const payload = {
        stringValue: "test string",
        numberValue: 42,
        booleanValue: true,
        nullValue: null,
        arrayValue: [1, 2, 3, "four", true],
        objectValue: {
          nested: "value",
          count: 10,
        },
        dateString: new Date().toISOString(),
      };

      const token = await jwt.create({ payload });
      const decodedPayload = jwt.getPayload(token);

      expect(decodedPayload.stringValue).toBe("test string");
      expect(decodedPayload.numberValue).toBe(42);
      expect(decodedPayload.booleanValue).toBe(true);
      expect(decodedPayload.nullValue).toBeNull();
      expect(decodedPayload.arrayValue).toEqual([1, 2, 3, "four", true]);
      expect((decodedPayload.objectValue as Record<string, unknown>).nested).toBe("value");
      expect((decodedPayload.objectValue as Record<string, unknown>).count).toBe(10);
      expect(decodedPayload.dateString).toBe(payload.dateString);
    });

    test("should handle payload decoding errors gracefully", () => {
      const invalidTokens = ["invalid.token", "header.invalid-payload.signature", "", "malformed-token"];

      for (const token of invalidTokens) {
        expect(() => jwt.getPayload(token)).toThrow();
      }
    });
  });

  describe("Integration Tests", () => {
    test("should create, validate, and decode token in complete flow", async () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
      const originalPayload = {
        userId: "integration-test-user",
        email: "integration@test.com",
        roles: ["admin"],
        iss: "integration-test",
        exp: "1h" as const,
      };

      // Create token
      const token = await jwt.create({ payload: originalPayload });
      expect(typeof token).toBe("string");

      // Validate token
      const isValid = await jwt.isValid(token);
      expect(isValid).toBe(true);

      // Decode header
      const header = jwt.getHeader(token);
      expect(header.alg).toBe("HS256");

      // Decode payload
      const payload = jwt.getPayload(token);
      expect(payload.userId).toBe("integration-test-user");
      expect(payload.email).toBe("integration@test.com");
      expect(payload.roles).toEqual(["admin"]);
      expect(payload.iss).toBe("integration-test");
    });

    test("should work with real-world JWT workflow", async () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));

      // Simulate login - create access token
      const accessToken = await jwt.create({
        payload: {
          sub: "user123",
          email: "user@example.com",
          roles: ["user"],
          type: "access",
          exp: "15m" as const,
        },
      });

      // Simulate refresh token
      const refreshToken = await jwt.create({
        payload: {
          sub: "user123",
          type: "refresh",
          exp: "7d" as const,
        },
      });

      // Validate both tokens
      expect(await jwt.isValid(accessToken)).toBe(true);
      expect(await jwt.isValid(refreshToken)).toBe(true);

      // Extract user info from access token
      const accessPayload = jwt.getPayload(accessToken);
      expect(accessPayload.sub).toBe("user123");
      expect(accessPayload.email).toBe("user@example.com");
      expect(accessPayload.type).toBe("access");

      // Extract user info from refresh token
      const refreshPayload = jwt.getPayload(refreshToken);
      expect(refreshPayload.sub).toBe("user123");
      expect(refreshPayload.type).toBe("refresh");
      expect(refreshPayload.email).toBeUndefined(); // Refresh tokens typically don't include detailed user info
    });

    test("should handle cross-instance token validation", async () => {
      const jwt1 = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
      const jwt2 = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));

      // Create token with first instance
      const token = await jwt1.create({
        payload: { userId: "cross-instance-test" },
      });

      // Validate and decode with second instance
      const isValid = await jwt2.isValid(token);
      expect(isValid).toBe(true);

      const payload = jwt2.getPayload(token);
      expect(payload.userId).toBe("cross-instance-test");
    });

    test("should demonstrate token lifecycle", async () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));

      // Create token with short expiration
      const shortLivedToken = await jwt.create({
        payload: {
          userId: "lifecycle-test",
          exp: Math.floor(Date.now() / 1000) + 1, // Expires in 1 second
        },
      });

      // Initially valid
      expect(await jwt.isValid(shortLivedToken)).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Now expired
      expect(await jwt.isValid(shortLivedToken)).toBe(false);

      // But payload can still be decoded
      const payload = jwt.getPayload(shortLivedToken);
      expect(payload.userId).toBe("lifecycle-test");
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle very large payloads", async () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
      const largePayload = {
        userId: "large-payload-test",
        data: new Array(1000).fill("x").join(""),
        arrayData: new Array(100).fill({ key: "value", count: 42 }),
      };

      const token = await jwt.create({ payload: largePayload });
      const decodedPayload = jwt.getPayload(token);

      expect(decodedPayload.userId).toBe("large-payload-test");
      expect((decodedPayload.data as string).length).toBe(1000);
      expect(decodedPayload.arrayData).toHaveLength(100);
    });

    test("should handle special characters in payload values", async () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
      const specialPayload = {
        name: "José María",
        description: "Special chars: 你好 🌟 @#$%^&*()",
        email: "test+special@domain.co.uk",
        unicode: "Iñtërnâtiônàlizætiøn",
      };

      const token = await jwt.create({ payload: specialPayload });
      const decodedPayload = jwt.getPayload(token);

      expect(decodedPayload.name).toBe("José María");
      expect(decodedPayload.description).toBe("Special chars: 你好 🌟 @#$%^&*()");
      expect(decodedPayload.email).toBe("test+special@domain.co.uk");
      expect(decodedPayload.unicode).toBe("Iñtërnâtiônàlizætiøn");
    });

    test("should handle concurrent token operations", async () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));

      // Create multiple tokens concurrently
      const promises = Array.from({ length: 10 }, (_, i) => jwt.create({ payload: { userId: `user${i}`, index: i } }));

      const tokens = await Promise.all(promises);

      // Validate all tokens concurrently
      const validationPromises = tokens.map((token) => jwt.isValid(token));
      const validationResults = await Promise.all(validationPromises);

      // All should be valid
      expect(validationResults.every((result) => result === true)).toBe(true);

      // Decode all payloads and verify uniqueness
      const payloads = tokens.map((token) => jwt.getPayload(token));
      const userIds = payloads.map((payload) => payload.userId);

      expect(new Set(userIds).size).toBe(10); // All unique
    });

    test("should handle different secret formats", () => {
      const secrets = [
        "simple-string",
        "with-numbers-123",
        "with-special-chars-!@#$%^&*()",
        "UPPERCASE-SECRET",
        "mixed-Case-Secret-123!",
        new Array(256)
          .fill("a")
          .join(""), // Very long secret
      ];

      for (const secret of secrets) {
        expect(() => new Jwt(createMockEnv({ JWT_SECRET: secret }))).not.toThrow();
        const jwt = new Jwt(createMockEnv({ JWT_SECRET: secret }));
        expect(jwt.getSecret()).toBe(secret);
      }
    });

    test("should maintain consistency across multiple operations", async () => {
      const jwt = new Jwt(createMockEnv({ JWT_SECRET: testSecret }));
      const payload = { userId: "consistency-test", timestamp: Date.now() };

      // Create token
      const token = await jwt.create({ payload });

      // Perform multiple operations
      const operations = await Promise.all([
        jwt.isValid(token),
        jwt.isValid(token),
        Promise.resolve(jwt.getHeader(token)),
        Promise.resolve(jwt.getPayload(token)),
        Promise.resolve(jwt.getPayload(token)),
      ]);

      // All validation operations should return true
      expect(operations[0]).toBe(true);
      expect(operations[1]).toBe(true);

      // Header operations should return consistent results
      const header1 = operations[2];
      expect(header1.alg).toBe("HS256");

      // Payload operations should return consistent results
      const payload1 = operations[3] as ReturnType<typeof jwt.getPayload>;
      const payload2 = operations[4] as ReturnType<typeof jwt.getPayload>;

      expect(payload1.userId).toBe(payload2.userId);
      expect(payload1.timestamp).toBe(payload2.timestamp);
    });
  });
});
