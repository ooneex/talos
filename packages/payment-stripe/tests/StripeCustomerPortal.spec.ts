import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { StripeClient } from "@/StripeClient";
import { StripeCustomerPortal } from "@/StripeCustomerPortal";

const mockPortalSessionCreate = mock(() => Promise.resolve(createMockPortalSession()));

function createMockClient() {
  return {
    sdk: {
      billingPortal: {
        sessions: {
          create: mockPortalSessionCreate,
        },
      },
    },
  } as unknown as StripeClient;
}

function createMockPortalSession(overrides = {}) {
  return {
    id: "bps_test123",
    object: "billing_portal.session",
    url: "https://billing.stripe.com/session/test123",
    return_url: "https://example.com/return",
    created: 1704067200,
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCreateArgs = (): any => {
  const calls = mockPortalSessionCreate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

describe("StripeCustomerPortal", () => {
  let portal: StripeCustomerPortal;

  beforeEach(() => {
    portal = new StripeCustomerPortal(createMockClient());
    mockPortalSessionCreate.mockClear();
    mockPortalSessionCreate.mockImplementation(() => Promise.resolve(createMockPortalSession()));
  });

  describe("create", () => {
    test("should create a portal session successfully", async () => {
      const result = await portal.create({
        customerId: "cus_test123",
        returnUrl: "https://example.com/return",
      });

      expect(mockPortalSessionCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("bps_test123");
    });

    test("should call API with correct customer and return_url", async () => {
      await portal.create({
        customerId: "cus_test123",
        returnUrl: "https://example.com/billing",
      });

      const args = getCreateArgs();
      expect(args.customer).toBe("cus_test123");
      expect(args.return_url).toBe("https://example.com/billing");
    });

    test("should map response fields correctly", async () => {
      const result = await portal.create({
        customerId: "cus_test123",
        returnUrl: "https://example.com/return",
      });

      expect(result.id).toBe("bps_test123");
      expect(result.url).toBe("https://billing.stripe.com/session/test123");
      expect(result.returnUrl).toBe("https://example.com/return");
      expect(result.createdAt).toEqual(new Date(1704067200 * 1000));
    });

    test("should return a billing.stripe.com URL", async () => {
      const result = await portal.create({
        customerId: "cus_test123",
        returnUrl: "https://example.com/return",
      });

      expect(result.url).toContain("billing.stripe.com");
    });

    test("should handle different customers", async () => {
      mockPortalSessionCreate.mockImplementation(() =>
        Promise.resolve(createMockPortalSession({ id: "bps_other456" })),
      );

      const result = await portal.create({
        customerId: "cus_other456",
        returnUrl: "https://app.example.com/account",
      });

      const args = getCreateArgs();
      expect(args.customer).toBe("cus_other456");
      expect(result.id).toBe("bps_other456");
    });
  });

  describe("instance methods", () => {
    test("should have create method", () => {
      expect(typeof portal.create).toBe("function");
    });
  });
});
