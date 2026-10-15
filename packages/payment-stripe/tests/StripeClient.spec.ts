import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { PaymentException } from "@talosjs/payment";
import { StripeClient } from "@/StripeClient";

describe("StripeClient", () => {
  const originalEnv = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_API_VERSION: process.env.STRIPE_API_VERSION,
    STRIPE_API_HOST: process.env.STRIPE_API_HOST,
    STRIPE_API_PORT: process.env.STRIPE_API_PORT,
    STRIPE_API_PROTOCOL: process.env.STRIPE_API_PROTOCOL,
  };

  // getApiField is part of Stripe's runtime API but is not declared in its public types.
  const apiVersionOf = (client: StripeClient): string =>
    (client.sdk as unknown as { getApiField: (key: string) => string }).getApiField("version");

  const apiFieldOf = (client: StripeClient, key: string): unknown =>
    (client.sdk as unknown as { getApiField: (key: string) => unknown }).getApiField(key);

  const restore = (key: keyof typeof originalEnv): void => {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  };

  beforeEach(() => {
    for (const key of Object.keys(originalEnv)) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(originalEnv) as (keyof typeof originalEnv)[]) {
      restore(key);
    }
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

  describe("endpoint", () => {
    test("should talk to api.stripe.com over https by default", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_key";

      const client = new StripeClient(new AppEnv());

      expect(apiFieldOf(client, "host")).toBe("api.stripe.com");
      expect(apiFieldOf(client, "protocol")).toBe("https");
    });

    test("should point the SDK at STRIPE_API_HOST, STRIPE_API_PORT and STRIPE_API_PROTOCOL", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_key";
      process.env.STRIPE_API_HOST = "localhost";
      process.env.STRIPE_API_PORT = "12111";
      process.env.STRIPE_API_PROTOCOL = "http";

      const client = new StripeClient(new AppEnv());

      expect(apiFieldOf(client, "host")).toBe("localhost");
      expect(apiFieldOf(client, "port")).toBe(12111);
      expect(apiFieldOf(client, "protocol")).toBe("http");
    });

    test("should send requests to the configured host", async () => {
      const requests: string[] = [];
      const server = Bun.serve({
        port: 0,
        fetch: (request) => {
          requests.push(new URL(request.url).pathname);
          return Response.json({ id: "prod_local", object: "product", name: "Local", active: true });
        },
      });

      try {
        process.env.STRIPE_SECRET_KEY = "sk_test_key";
        process.env.STRIPE_API_HOST = "localhost";
        process.env.STRIPE_API_PORT = String(server.port);
        process.env.STRIPE_API_PROTOCOL = "http";

        const product = await new StripeClient(new AppEnv()).sdk.products.retrieve("prod_local");

        expect(product.id).toBe("prod_local");
        expect(requests).toEqual(["/v1/products/prod_local"]);
      } finally {
        server.stop(true);
      }
    });

    test.each(["abc", "0", "70000", "80.5"])("should refuse STRIPE_API_PORT=%s", (port) => {
      process.env.STRIPE_SECRET_KEY = "sk_test_key";
      process.env.STRIPE_API_PORT = port;

      expect(() => new StripeClient(new AppEnv())).toThrow("STRIPE_API_PORT must be a port number");
    });

    test("should refuse a STRIPE_API_PROTOCOL other than http or https", () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_key";
      process.env.STRIPE_API_PROTOCOL = "ftp";

      try {
        new StripeClient(new AppEnv());
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentException);
        expect((error as PaymentException).key).toBe("INVALID_CONFIGURATION");
      }
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
