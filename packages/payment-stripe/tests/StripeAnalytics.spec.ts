import { beforeEach, describe, expect, mock, test } from "bun:test";
import { StripeAnalytics } from "@/StripeAnalytics";
import type { StripeClient } from "@/StripeClient";

const mockChargesList = mock(() => Promise.resolve(createMockChargesList()));
const mockSubscriptionsList = mock(() => Promise.resolve(createMockSubscriptionsList()));

const START_TS = Math.floor(new Date("2024-01-01").getTime() / 1000);
const END_TS = Math.floor(new Date("2024-01-31").getTime() / 1000);

function createMockClient() {
  return {
    sdk: {
      charges: {
        list: mockChargesList,
      },
      subscriptions: {
        list: mockSubscriptionsList,
      },
    },
  } as unknown as StripeClient;
}

function createMockCharge(overrides = {}) {
  return {
    id: "ch_test123",
    object: "charge",
    status: "succeeded",
    amount: 1999,
    currency: "eur",
    created: START_TS,
    ...overrides,
  };
}

function createMockChargesList(overrides = {}) {
  return {
    data: [
      createMockCharge({ created: START_TS }),
      createMockCharge({ id: "ch_test456", amount: 999, created: START_TS + 86400 }),
    ],
    has_more: false,
    ...overrides,
  };
}

function createMockSubscription(overrides = {}) {
  return {
    id: "sub_test123",
    object: "subscription",
    status: "active",
    created: START_TS,
    ...overrides,
  };
}

function createMockSubscriptionsList(overrides = {}) {
  return {
    data: [
      createMockSubscription(),
      createMockSubscription({ id: "sub_test456", status: "canceled", created: START_TS + 86400 }),
      createMockSubscription({ id: "sub_test789", status: "active", created: START_TS + 172800 }),
    ],
    has_more: false,
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getChargesArgs = (): any => {
  const calls = mockChargesList.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getSubscriptionsArgs = (): any => {
  const calls = mockSubscriptionsList.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

describe("StripeAnalytics", () => {
  let analytics: StripeAnalytics;
  const startDate = new Date("2024-01-01");
  const endDate = new Date("2024-01-31");

  beforeEach(() => {
    analytics = new StripeAnalytics(createMockClient());
    mockChargesList.mockClear();
    mockSubscriptionsList.mockClear();
    mockChargesList.mockImplementation(() => Promise.resolve(createMockChargesList()));
    mockSubscriptionsList.mockImplementation(() => Promise.resolve(createMockSubscriptionsList()));
  });

  describe("get", () => {
    test("should call charges and subscriptions APIs", async () => {
      await analytics.get({ startDate, endDate });

      expect(mockChargesList).toHaveBeenCalledTimes(1);
      expect(mockSubscriptionsList).toHaveBeenCalledTimes(1);
    });

    test("should call charges API with correct date range", async () => {
      await analytics.get({ startDate, endDate });

      const args = getChargesArgs();
      expect(args.created.gte).toBe(START_TS);
      expect(args.created.lte).toBe(END_TS);
    });

    test("should call subscriptions API with correct date range", async () => {
      await analytics.get({ startDate, endDate });

      const args = getSubscriptionsArgs();
      expect(args.created.gte).toBe(START_TS);
      expect(args.created.lte).toBe(END_TS);
    });

    test("should use custom limit for charges", async () => {
      await analytics.get({ startDate, endDate, limit: 50 });

      const args = getChargesArgs();
      expect(args.limit).toBe(50);
    });

    test("should default charges limit to 100", async () => {
      await analytics.get({ startDate, endDate });

      const args = getChargesArgs();
      expect(args.limit).toBe(100);
    });

    test("should calculate totalRevenue from succeeded charges", async () => {
      const result = await analytics.get({ startDate, endDate });

      expect(result.totalRevenue).toBe(1999 + 999);
    });

    test("should count totalTransactions from succeeded charges", async () => {
      const result = await analytics.get({ startDate, endDate });

      expect(result.totalTransactions).toBe(2);
    });

    test("should exclude failed charges from totals", async () => {
      mockChargesList.mockImplementation(() =>
        Promise.resolve(
          createMockChargesList({
            data: [
              createMockCharge({ amount: 1000 }),
              createMockCharge({ id: "ch_failed", amount: 500, status: "failed" }),
            ],
          }),
        ),
      );

      const result = await analytics.get({ startDate, endDate });

      expect(result.totalRevenue).toBe(1000);
      expect(result.totalTransactions).toBe(1);
    });

    test("should group charges by day in periods", async () => {
      const result = await analytics.get({ startDate, endDate });

      expect(result.periods.length).toBeGreaterThan(0);
      expect(result.periods[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("should sort periods chronologically", async () => {
      const result = await analytics.get({ startDate, endDate });

      for (let i = 1; i < result.periods.length; i++) {
        const prev = result.periods[i - 1]?.date ?? "";
        const curr = result.periods[i]?.date ?? "";
        expect(prev <= curr).toBe(true);
      }
    });

    test("should aggregate revenue per day", async () => {
      mockChargesList.mockImplementation(() =>
        Promise.resolve(
          createMockChargesList({
            data: [
              createMockCharge({ amount: 1000, created: START_TS }),
              createMockCharge({ id: "ch_2", amount: 500, created: START_TS }),
              createMockCharge({ id: "ch_3", amount: 2000, created: START_TS + 86400 }),
            ],
          }),
        ),
      );

      const result = await analytics.get({ startDate, endDate });

      const day1 = result.periods.find((p) => p.transactionCount === 2);
      expect(day1?.revenue).toBe(1500);
      expect(day1?.transactionCount).toBe(2);
    });

    test("should filter by currency when provided", async () => {
      mockChargesList.mockImplementation(() =>
        Promise.resolve(
          createMockChargesList({
            data: [
              createMockCharge({ amount: 1000, currency: "eur" }),
              createMockCharge({ id: "ch_usd", amount: 2000, currency: "usd" }),
            ],
          }),
        ),
      );

      const result = await analytics.get({ startDate, endDate, currency: "eur" });

      expect(result.totalRevenue).toBe(1000);
      expect(result.totalTransactions).toBe(1);
    });

    test("should use provided currency in result", async () => {
      const result = await analytics.get({ startDate, endDate, currency: "usd" });

      expect(result.currency).toBe("usd");
    });

    test("should use currency from first charge when not specified", async () => {
      const result = await analytics.get({ startDate, endDate });

      expect(result.currency).toBe("eur");
    });

    test("should default currency to usd when no charges", async () => {
      mockChargesList.mockImplementation(() => Promise.resolve(createMockChargesList({ data: [] })));

      const result = await analytics.get({ startDate, endDate });

      expect(result.currency).toBe("usd");
    });

    test("should count active subscriptions", async () => {
      const result = await analytics.get({ startDate, endDate });

      expect(result.activeSubscriptions).toBe(2);
    });

    test("should count canceled subscriptions", async () => {
      const result = await analytics.get({ startDate, endDate });

      expect(result.canceledSubscriptions).toBe(1);
    });

    test("should count new subscriptions created in range", async () => {
      const result = await analytics.get({ startDate, endDate });

      expect(result.newSubscriptions).toBe(3);
    });

    test("should not count subscriptions created before range", async () => {
      mockSubscriptionsList.mockImplementation(() =>
        Promise.resolve(
          createMockSubscriptionsList({
            data: [
              createMockSubscription({ created: START_TS - 86400, status: "active" }),
              createMockSubscription({ id: "sub_in", created: START_TS, status: "active" }),
            ],
          }),
        ),
      );

      const result = await analytics.get({ startDate, endDate });

      expect(result.newSubscriptions).toBe(1);
    });

    test("should return periods with correct shape", async () => {
      const result = await analytics.get({ startDate, endDate });

      const period = result.periods[0];
      expect(period).toHaveProperty("date");
      expect(period).toHaveProperty("revenue");
      expect(period).toHaveProperty("currency");
      expect(period).toHaveProperty("transactionCount");
    });
  });

  describe("instance methods", () => {
    test("should have get method", () => {
      expect(typeof analytics.get).toBe("function");
    });
  });
});
