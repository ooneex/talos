import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import { PaymentException, PolarCheckout } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    POLAR_ACCESS_TOKEN: Bun.env.POLAR_ACCESS_TOKEN,
    POLAR_ENVIRONMENT: Bun.env.POLAR_ENVIRONMENT,
  } as unknown as AppEnv;
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const mockCheckoutsCreate = mock((): any => Promise.resolve(createMockCheckoutResponse()));
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const mockCheckoutsGet = mock((): any => Promise.resolve(createMockCheckoutResponse()));

mock.module("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    checkouts = {
      create: mockCheckoutsCreate,
      get: mockCheckoutsGet,
    };
  },
}));

function createMockCheckoutResponse(overrides = {}) {
  return {
    id: "chk_123",
    status: "open",
    clientSecret: "cs_secret_123",
    url: "https://checkout.polar.sh/chk_123",
    embedId: "embed_123",
    allowDiscountCodes: true,
    isDiscountApplicable: true,
    isPaymentRequired: true,
    metadata: { orderId: "order_123" },
    createdAt: new Date("2024-01-01"),
    modifiedAt: new Date("2024-01-02"),
    expiresAt: new Date("2024-01-03"),
    successUrl: "https://example.com/success",
    embedOrigin: "https://example.com",
    amount: 1999,
    taxAmount: 199,
    currency: "USD",
    subtotalAmount: 1800,
    totalAmount: 1999,
    productId: "prod_123",
    productPriceId: "price_123",
    discountId: "disc_123",
    customer: {
      id: "cust_123",
      email: "test@example.com",
      name: "John Doe",
      externalId: "ext_123",
      taxId: "tax_123",
      billingAddress: {
        line1: "123 Main St",
        line2: "Apt 4",
        city: "New York",
        state: "NY",
        postalCode: "10001",
        country: "US",
      },
    },
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCreateCallArgs = (): any => {
  const calls = mockCheckoutsCreate.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

describe("PolarCheckout", () => {
  let checkout: PolarCheckout;
  const originalEnv = Bun.env.POLAR_ACCESS_TOKEN;

  beforeEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = "test-access-token";
    checkout = new PolarCheckout(createMockEnv());
    mockCheckoutsCreate.mockClear();
    mockCheckoutsGet.mockClear();
    mockCheckoutsCreate.mockImplementation(() => Promise.resolve(createMockCheckoutResponse()));
    mockCheckoutsGet.mockImplementation(() => Promise.resolve(createMockCheckoutResponse()));
  });

  afterEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = originalEnv;
  });

  describe("constructor", () => {
    test("should throw PaymentException when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      expect(() => new PolarCheckout(createMockEnv())).toThrow(PaymentException);
    });

    test("should throw with descriptive message when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      try {
        new PolarCheckout(createMockEnv());
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentException);
        expect((error as PaymentException).message).toContain("Polar access token is required");
      }
    });

    test("should create instance when access token is provided", () => {
      expect(checkout).toBeInstanceOf(PolarCheckout);
    });
  });

  describe("create", () => {
    test("should create a checkout successfully", async () => {
      const result = await checkout.create({
        products: ["prod_123"],
      });

      expect(mockCheckoutsCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("chk_123");
      expect(result.status).toBe("open");
      expect(result.clientSecret).toBe("cs_secret_123");
    });

    test("should call API with correct parameters", async () => {
      await checkout.create({
        products: ["prod_123", "prod_456"],
        customerEmail: "customer@example.com",
        customerName: "Jane Doe",
        successUrl: "https://example.com/success",
        metadata: { orderRef: "ORD-001" },
      });

      expect(mockCheckoutsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.products).toEqual(["prod_123", "prod_456"]);
      expect(callArgs.customerEmail).toBe("customer@example.com");
      expect(callArgs.customerName).toBe("Jane Doe");
      expect(callArgs.successUrl).toBe("https://example.com/success");
      expect(callArgs.metadata).toEqual({ orderRef: "ORD-001" });
    });

    test("should handle customer external ID", async () => {
      await checkout.create({
        products: ["prod_123"],
        customerExternalId: "ext_cust_123",
      });

      const callArgs = getCreateCallArgs();
      expect(callArgs.customerExternalId).toBe("ext_cust_123");
    });

    test("should handle customer ID", async () => {
      await checkout.create({
        products: ["prod_123"],
        customerId: "cust_123",
      });

      const callArgs = getCreateCallArgs();
      expect(callArgs.customerId).toBe("cust_123");
    });

    test("should handle billing address", async () => {
      await checkout.create({
        products: ["prod_123"],
        customerBillingAddress: {
          line1: "456 Oak Ave",
          city: "San Francisco",
          state: "CA",
          postalCode: "94102",
          country: "US",
        },
      });

      const callArgs = getCreateCallArgs();
      expect(callArgs.customerBillingAddress.line1).toBe("456 Oak Ave");
      expect(callArgs.customerBillingAddress.city).toBe("San Francisco");
      expect(callArgs.customerBillingAddress.country).toBe("US");
    });

    test("should handle discount ID", async () => {
      await checkout.create({
        products: ["prod_123"],
        discountId: "disc_123",
      });

      const callArgs = getCreateCallArgs();
      expect(callArgs.discountId).toBe("disc_123");
    });

    test("should handle allowDiscountCodes option", async () => {
      await checkout.create({
        products: ["prod_123"],
        allowDiscountCodes: false,
      });

      const callArgs = getCreateCallArgs();
      expect(callArgs.allowDiscountCodes).toBe(false);
    });

    test("should handle embed origin", async () => {
      await checkout.create({
        products: ["prod_123"],
        embedOrigin: "https://myapp.com",
      });

      const callArgs = getCreateCallArgs();
      expect(callArgs.embedOrigin).toBe("https://myapp.com");
    });

    test("should map response correctly with all fields", async () => {
      const result = await checkout.create({
        products: ["prod_123"],
      });

      expect(result.id).toBe("chk_123");
      expect(result.status).toBe("open");
      expect(result.clientSecret).toBe("cs_secret_123");
      expect(result.url).toBe("https://checkout.polar.sh/chk_123");
      expect(result.embedId).toBe("embed_123");
      expect(result.allowDiscountCodes).toBe(true);
      expect(result.isDiscountApplicable).toBe(true);
      expect(result.isPaymentRequired).toBe(true);
      expect(result.metadata).toEqual({ orderId: "order_123" });
      expect(result.createdAt).toEqual(new Date("2024-01-01"));
      expect(result.updatedAt).toEqual(new Date("2024-01-02"));
      expect(result.expiresAt).toEqual(new Date("2024-01-03"));
      expect(result.successUrl).toBe("https://example.com/success");
      expect(result.embedOrigin).toBe("https://example.com");
      expect(result.amount).toBe(1999);
      expect(result.taxAmount).toBe(199);
      expect(result.currency).toBe("USD");
      expect(result.subtotalAmount).toBe(1800);
      expect(result.totalAmount).toBe(1999);
      expect(result.productId).toBe("prod_123");
      expect(result.productPriceId).toBe("price_123");
      expect(result.discountId).toBe("disc_123");
    });

    test("should map customer data correctly", async () => {
      const result = await checkout.create({
        products: ["prod_123"],
      });

      expect(result.customer).toBeDefined();
      expect(result.customer?.id).toBe("cust_123");
      expect(result.customer?.email).toBe("test@example.com");
      expect(result.customer?.name).toBe("John Doe");
      expect(result.customer?.externalId).toBe("ext_123");
      expect(result.customer?.taxId).toBe("tax_123");
      expect(result.customer?.billingAddress).toBeDefined();
      expect(result.customer?.billingAddress?.line1).toBe("123 Main St");
      expect(result.customer?.billingAddress?.city).toBe("New York");
      expect(result.customer?.billingAddress?.country).toBe("US");
    });

    test("should handle minimal response", async () => {
      mockCheckoutsCreate.mockImplementation(() =>
        Promise.resolve({
          id: "chk_minimal",
          status: "open",
          clientSecret: "cs_minimal",
          metadata: {},
        }),
      );

      const result = await checkout.create({
        products: ["prod_123"],
      });

      expect(result.id).toBe("chk_minimal");
      expect(result.status).toBe("open");
      expect(result.clientSecret).toBe("cs_minimal");
      expect(result.url).toBeUndefined();
      expect(result.customer).toBeUndefined();
    });
  });

  describe("get", () => {
    test("should get a checkout by ID", async () => {
      const result = await checkout.get("chk_123");

      expect(mockCheckoutsGet).toHaveBeenCalledTimes(1);
      expect(mockCheckoutsGet).toHaveBeenCalledWith({ id: "chk_123" });
      expect(result.id).toBe("chk_123");
    });

    test("should return full checkout data", async () => {
      const result = await checkout.get("chk_123");

      expect(result.status).toBe("open");
      expect(result.clientSecret).toBe("cs_secret_123");
      expect(result.url).toBe("https://checkout.polar.sh/chk_123");
    });

    test("should handle different checkout statuses", async () => {
      mockCheckoutsGet.mockImplementation(() =>
        Promise.resolve(
          createMockCheckoutResponse({
            status: "succeeded",
          }),
        ),
      );

      const result = await checkout.get("chk_123");

      expect(result.status).toBe("succeeded");
    });
  });

  describe("instance methods", () => {
    test("should have create method", () => {
      expect(typeof checkout.create).toBe("function");
    });

    test("should have get method", () => {
      expect(typeof checkout.get).toBe("function");
    });
  });
});
