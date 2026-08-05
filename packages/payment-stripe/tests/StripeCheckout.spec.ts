import { beforeEach, describe, expect, mock, test } from "bun:test";
import { StripeCheckoutSession } from "@/StripeCheckout";
import type { StripeClient } from "@/StripeClient";

const mockSessionCreate = mock(() => Promise.resolve(createMockSession()));
const mockSessionRetrieve = mock(() => Promise.resolve(createMockSession()));

function createMockClient() {
  return {
    sdk: {
      checkout: {
        sessions: {
          create: mockSessionCreate,
          retrieve: mockSessionRetrieve,
        },
      },
    },
  } as unknown as StripeClient;
}

function createMockSession(overrides = {}) {
  return {
    id: "cs_test123",
    object: "checkout.session",
    url: "https://checkout.stripe.com/c/pay/cs_test123",
    status: "open",
    payment_status: "unpaid",
    customer: "cus_test123",
    customer_email: "user@example.com",
    amount_total: 1999,
    currency: "eur",
    metadata: { plan: "pro" },
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCreateArgs = (): any => {
  const calls = mockSessionCreate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

describe("StripeCheckoutSession", () => {
  let checkout: StripeCheckoutSession;

  beforeEach(() => {
    checkout = new StripeCheckoutSession(createMockClient());
    mockSessionCreate.mockClear();
    mockSessionRetrieve.mockClear();
    mockSessionCreate.mockImplementation(() => Promise.resolve(createMockSession()));
    mockSessionRetrieve.mockImplementation(() => Promise.resolve(createMockSession()));
  });

  describe("create", () => {
    test("should create a session with the required params only", async () => {
      const result = await checkout.create({
        lineItems: [{ price: "price_test123" }],
        mode: "payment",
        successUrl: "https://example.com/success",
      });

      expect(mockSessionCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("cs_test123");

      const args = getCreateArgs();
      expect(args.line_items).toEqual([{ price: "price_test123", quantity: 1 }]);
      expect(args.mode).toBe("payment");
      expect(args.success_url).toBe("https://example.com/success");
      expect(args.cancel_url).toBeUndefined();
      expect(args.customer).toBeUndefined();
      expect(args.customer_email).toBeUndefined();
      expect(args.metadata).toBeUndefined();
    });

    test("should keep explicit line item quantities", async () => {
      await checkout.create({
        lineItems: [{ price: "price_a", quantity: 3 }, { price: "price_b" }],
        mode: "subscription",
        successUrl: "https://example.com/success",
      });

      const args = getCreateArgs();
      expect(args.line_items).toEqual([
        { price: "price_a", quantity: 3 },
        { price: "price_b", quantity: 1 },
      ]);
    });

    test("should forward the cancel url when provided", async () => {
      await checkout.create({
        lineItems: [{ price: "price_test123" }],
        mode: "payment",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(getCreateArgs().cancel_url).toBe("https://example.com/cancel");
    });

    test("should prefer the customer id over the customer email", async () => {
      await checkout.create({
        lineItems: [{ price: "price_test123" }],
        mode: "payment",
        successUrl: "https://example.com/success",
        customerId: "cus_test123",
        customerEmail: "user@example.com",
      });

      const args = getCreateArgs();
      expect(args.customer).toBe("cus_test123");
      expect(args.customer_email).toBeUndefined();
    });

    test("should use the customer email when no customer id is given", async () => {
      await checkout.create({
        lineItems: [{ price: "price_test123" }],
        mode: "payment",
        successUrl: "https://example.com/success",
        customerEmail: "user@example.com",
      });

      const args = getCreateArgs();
      expect(args.customer).toBeUndefined();
      expect(args.customer_email).toBe("user@example.com");
    });

    test("should forward metadata when provided", async () => {
      await checkout.create({
        lineItems: [{ price: "price_test123" }],
        mode: "setup",
        successUrl: "https://example.com/success",
        metadata: { plan: "pro" },
      });

      expect(getCreateArgs().metadata).toEqual({ plan: "pro" });
    });
  });

  describe("get", () => {
    test("should retrieve a session by id", async () => {
      const result = await checkout.get("cs_test123");

      expect(mockSessionRetrieve).toHaveBeenCalledTimes(1);
      expect(mockSessionRetrieve.mock.calls[0]).toEqual(["cs_test123"] as never);
      expect(result.id).toBe("cs_test123");
    });
  });

  describe("mapping", () => {
    test("should map every session field", async () => {
      const result = await checkout.get("cs_test123");

      expect(result).toEqual({
        id: "cs_test123",
        url: "https://checkout.stripe.com/c/pay/cs_test123",
        status: "open",
        paymentStatus: "unpaid",
        customerId: "cus_test123",
        customerEmail: "user@example.com",
        amountTotal: 1999,
        currency: "eur",
        metadata: { plan: "pro" },
      });
    });

    test("should unwrap an expanded customer and fall back to customer details email", async () => {
      mockSessionRetrieve.mockImplementation(() =>
        Promise.resolve(
          createMockSession({
            customer: { id: "cus_expanded" },
            customer_email: null,
            customer_details: { email: "details@example.com" },
          }),
        ),
      );

      const result = await checkout.get("cs_test123");

      expect(result.customerId).toBe("cus_expanded");
      expect(result.customerEmail).toBe("details@example.com");
    });

    test("should null missing customer, email and status and default metadata", async () => {
      mockSessionRetrieve.mockImplementation(() =>
        Promise.resolve(
          createMockSession({
            status: null,
            customer: null,
            customer_email: null,
            amount_total: null,
            currency: null,
            metadata: null,
          }),
        ),
      );

      const result = await checkout.get("cs_test123");

      expect(result.status).toBeNull();
      expect(result.customerId).toBeNull();
      expect(result.customerEmail).toBeNull();
      expect(result.amountTotal).toBeNull();
      expect(result.currency).toBeNull();
      expect(result.metadata).toEqual({});
    });
  });
});
