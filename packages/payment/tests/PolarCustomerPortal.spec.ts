import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import { PaymentException, PolarCustomerPortal } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    POLAR_ACCESS_TOKEN: Bun.env.POLAR_ACCESS_TOKEN,
    POLAR_ENVIRONMENT: Bun.env.POLAR_ENVIRONMENT,
  } as unknown as AppEnv;
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const mockCustomerSessionsCreate = mock((): any => Promise.resolve(createMockCustomerSessionResponse()));

mock.module("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    customerSessions = {
      create: mockCustomerSessionsCreate,
    };
  },
}));

function createMockCustomerSessionResponse(overrides = {}) {
  return {
    id: "session_123",
    token: "tok_secret_123",
    customerPortalUrl: "https://polar.sh/org/portal?token=tok_secret_123",
    createdAt: new Date("2024-01-01"),
    expiresAt: new Date("2024-01-02"),
    customerId: "cust_123",
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCreateCallArgs = (): any => {
  const calls = mockCustomerSessionsCreate.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

describe("PolarCustomerPortal", () => {
  let customerPortal: PolarCustomerPortal;
  const originalEnv = {
    POLAR_ACCESS_TOKEN: Bun.env.POLAR_ACCESS_TOKEN,
    POLAR_ENVIRONMENT: Bun.env.POLAR_ENVIRONMENT,
  };

  beforeEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = "test-access-token";
    Bun.env.POLAR_ENVIRONMENT = "production";
    customerPortal = new PolarCustomerPortal(createMockEnv());
    mockCustomerSessionsCreate.mockClear();
    mockCustomerSessionsCreate.mockImplementation(() => Promise.resolve(createMockCustomerSessionResponse()));
  });

  afterEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = originalEnv.POLAR_ACCESS_TOKEN;
    Bun.env.POLAR_ENVIRONMENT = originalEnv.POLAR_ENVIRONMENT;
  });

  describe("constructor", () => {
    test("should throw PaymentException when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      expect(() => new PolarCustomerPortal(createMockEnv())).toThrow(PaymentException);
    });

    test("should throw with descriptive message when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      try {
        new PolarCustomerPortal(createMockEnv());
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentException);
        expect((error as PaymentException).message).toContain("Polar access token is required");
      }
    });

    test("should create instance when access token is provided", () => {
      expect(customerPortal).toBeInstanceOf(PolarCustomerPortal);
    });
  });

  describe("create", () => {
    test("should create a customer session successfully", async () => {
      const result = await customerPortal.create({
        customerId: "cust_123",
      });

      expect(mockCustomerSessionsCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("session_123");
      expect(result.token).toBe("tok_secret_123");
    });

    test("should call API with correct parameters", async () => {
      await customerPortal.create({
        customerId: "cust_456",
      });

      expect(mockCustomerSessionsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.customerId).toBe("cust_456");
    });

    test("should map response correctly with all fields", async () => {
      const result = await customerPortal.create({
        customerId: "cust_123",
      });

      expect(result.id).toBe("session_123");
      expect(result.token).toBe("tok_secret_123");
      expect(result.customerPortalUrl).toBe("https://polar.sh/org/portal?token=tok_secret_123");
      expect(result.createdAt).toEqual(new Date("2024-01-01"));
      expect(result.expiresAt).toEqual(new Date("2024-01-02"));
      expect(result.customerId).toBe("cust_123");
    });

    test("should handle minimal response", async () => {
      mockCustomerSessionsCreate.mockImplementation(() =>
        Promise.resolve({
          id: "session_minimal",
          token: "tok_minimal",
          customerPortalUrl: "https://polar.sh/portal",
        }),
      );

      const result = await customerPortal.create({
        customerId: "cust_123",
      });

      expect(result.id).toBe("session_minimal");
      expect(result.token).toBe("tok_minimal");
      expect(result.customerPortalUrl).toBe("https://polar.sh/portal");
      expect(result.createdAt).toBeUndefined();
      expect(result.expiresAt).toBeUndefined();
      expect(result.customerId).toBeUndefined();
    });
  });

  describe("getPortalUrl", () => {
    test("should return production portal URL", () => {
      Bun.env.POLAR_ENVIRONMENT = "production";
      customerPortal = new PolarCustomerPortal(createMockEnv());

      const url = customerPortal.getPortalUrl("my-organization");

      expect(url).toBe("https://polar.sh/my-organization/portal");
    });

    test("should return sandbox portal URL", () => {
      Bun.env.POLAR_ENVIRONMENT = "sandbox";
      customerPortal = new PolarCustomerPortal(createMockEnv());

      const url = customerPortal.getPortalUrl("my-organization");

      expect(url).toBe("https://sandbox.polar.sh/my-organization/portal");
    });

    test("should handle organization slug with special characters", () => {
      const url = customerPortal.getPortalUrl("my-org-name");

      expect(url).toContain("my-org-name/portal");
    });

    test("should default to production when environment is not set", () => {
      Bun.env.POLAR_ENVIRONMENT = "";
      customerPortal = new PolarCustomerPortal(createMockEnv());

      const url = customerPortal.getPortalUrl("org");

      expect(url).toBe("https://polar.sh/org/portal");
    });
  });

  describe("instance methods", () => {
    test("should have create method", () => {
      expect(typeof customerPortal.create).toBe("function");
    });

    test("should have getPortalUrl method", () => {
      expect(typeof customerPortal.getPortalUrl).toBe("function");
    });
  });
});
