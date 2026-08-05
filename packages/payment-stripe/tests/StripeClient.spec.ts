import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { PaymentException } from "@talosjs/payment";
import { StripeClient } from "@/StripeClient";

describe("StripeClient", () => {
  const originalEnv = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_API_VERSION: process.env.STRIPE_API_VERSION,
  };

  // getApiField is part of Stripe's runtime API but is not declared in its public types.
  const apiVersionOf = (client: StripeClient): string =>
    (client.sdk as unknown as { getApiField: (key: string) => string }).getApiField("version");

  const restore = (key: keyof typeof originalEnv): void => {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  };

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_API_VERSION;
  });

  afterEach(() => {
    restore("STRIPE_SECRET_KEY");
    restore("STRIPE_API_VERSION");
  });

  describe("constructor", () => {
    test("should build the SDK when STRIPE_SECRET_KEY is set", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_key";

      const client = new StripeClient(new AppEnv());

      expect(client).toBeInstanceOf(StripeClient);
      expect(client.sdk).toBeDefined();
    });

    test("should throw PaymentException when STRIPE_SECRET_KEY is missing", () => {
      expect(() => new StripeClient(new AppEnv())).toThrow(PaymentException);
    });

    test("should throw with TOKEN_REQUIRED key when STRIPE_SECRET_KEY is missing", () => {
      try {
        new StripeClient(new AppEnv());
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentException);
        expect((error as PaymentException).key).toBe("TOKEN_REQUIRED");
        expect((error as PaymentException).message).toContain("STRIPE_SECRET_KEY");
      }
    });

    test("should use the default API version when STRIPE_API_VERSION is not set", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_key";

      const client = new StripeClient(new AppEnv());

      expect(apiVersionOf(client)).toBe("2025-06-30.basil");
    });

    test("should use STRIPE_API_VERSION when provided", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_key";
      process.env.STRIPE_API_VERSION = "2024-06-20";

      const client = new StripeClient(new AppEnv());

      expect(apiVersionOf(client)).toBe("2024-06-20");
    });
  });

  describe("sdk", () => {
    test("should always return the same instance", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_key";

      const client = new StripeClient(new AppEnv());

      expect(client.sdk).toBe(client.sdk);
    });
  });
});
