import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import { PaymentException, PolarAnalytics } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    POLAR_ACCESS_TOKEN: Bun.env.POLAR_ACCESS_TOKEN,
    POLAR_ENVIRONMENT: Bun.env.POLAR_ENVIRONMENT,
  } as unknown as AppEnv;
};

const mockMetricsGet = mock(() => Promise.resolve(createMockMetricsResponse()));
const mockMetricsLimits = mock(() => Promise.resolve(createMockLimitsResponse()));

mock.module("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    metrics = {
      get: mockMetricsGet,
      limits: mockMetricsLimits,
    };
  },
}));

function createMockMetricsResponse(overrides = {}) {
  return {
    periods: [
      {
        timestamp: new Date("2024-01-01"),
        orders: 100,
        revenue: 50000,
        cumulativeRevenue: 50000,
        averageOrderValue: 500,
        oneTimeProducts: 30,
        oneTimeProductsRevenue: 15000,
        newSubscriptions: 20,
        newSubscriptionsRevenue: 20000,
        renewedSubscriptions: 10,
        renewedSubscriptionsRevenue: 15000,
        activeSubscriptions: 50,
        monthlyRecurringRevenue: 25000,
      },
      {
        timestamp: new Date("2024-01-02"),
        orders: 120,
        revenue: 60000,
        cumulativeRevenue: 110000,
        averageOrderValue: 500,
        oneTimeProducts: 35,
        oneTimeProductsRevenue: 17500,
        newSubscriptions: 25,
        newSubscriptionsRevenue: 25000,
        renewedSubscriptions: 12,
        renewedSubscriptionsRevenue: 17500,
        activeSubscriptions: 55,
        monthlyRecurringRevenue: 27500,
      },
    ],
    metrics: {
      orders: { slug: "orders", displayName: "Orders", type: "scalar" },
      revenue: { slug: "revenue", displayName: "Revenue", type: "currency" },
      cumulativeRevenue: {
        slug: "cumulative_revenue",
        displayName: "Cumulative Revenue",
        type: "currency",
      },
      averageOrderValue: {
        slug: "average_order_value",
        displayName: "Average Order Value",
        type: "currency",
      },
      oneTimeProducts: {
        slug: "one_time_products",
        displayName: "One-Time Products",
        type: "scalar",
      },
      oneTimeProductsRevenue: {
        slug: "one_time_products_revenue",
        displayName: "One-Time Products Revenue",
        type: "currency",
      },
      newSubscriptions: {
        slug: "new_subscriptions",
        displayName: "New Subscriptions",
        type: "scalar",
      },
      newSubscriptionsRevenue: {
        slug: "new_subscriptions_revenue",
        displayName: "New Subscriptions Revenue",
        type: "currency",
      },
      renewedSubscriptions: {
        slug: "renewed_subscriptions",
        displayName: "Renewed Subscriptions",
        type: "scalar",
      },
      renewedSubscriptionsRevenue: {
        slug: "renewed_subscriptions_revenue",
        displayName: "Renewed Subscriptions Revenue",
        type: "currency",
      },
      activeSubscriptions: {
        slug: "active_subscriptions",
        displayName: "Active Subscriptions",
        type: "scalar",
      },
      monthlyRecurringRevenue: {
        slug: "monthly_recurring_revenue",
        displayName: "Monthly Recurring Revenue",
        type: "currency",
      },
    },
    ...overrides,
  };
}

function createMockLimitsResponse(overrides = {}) {
  return {
    minDate: "2023-01-01",
    intervals: {
      hour: { maxDays: 7 },
      day: { maxDays: 90 },
      week: { maxDays: 365 },
      month: { maxDays: 730 },
      year: { maxDays: 3650 },
    },
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCallArgs = (): any => {
  const calls = mockMetricsGet.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

describe("PolarAnalytics", () => {
  let analytics: PolarAnalytics;
  const originalEnv = Bun.env.POLAR_ACCESS_TOKEN;

  beforeEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = "test-access-token";
    analytics = new PolarAnalytics(createMockEnv());
    mockMetricsGet.mockClear();
    mockMetricsLimits.mockClear();
    mockMetricsGet.mockImplementation(() => Promise.resolve(createMockMetricsResponse()));
    mockMetricsLimits.mockImplementation(() => Promise.resolve(createMockLimitsResponse()));
  });

  afterEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = originalEnv;
  });

  describe("constructor", () => {
    test("should throw PaymentException when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      expect(() => new PolarAnalytics(createMockEnv())).toThrow(PaymentException);
    });

    test("should throw with descriptive message when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      try {
        new PolarAnalytics(createMockEnv());
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentException);
        expect((error as PaymentException).message).toContain("Polar access token is required");
      }
    });

    test("should create instance when access token is provided", () => {
      expect(analytics).toBeInstanceOf(PolarAnalytics);
    });
  });

  describe("get", () => {
    test("should get analytics successfully", async () => {
      const result = await analytics.get({
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        interval: "day",
      });

      expect(mockMetricsGet).toHaveBeenCalledTimes(1);
      expect(result.periods).toHaveLength(2);
      expect(result.metrics).toBeDefined();
    });

    test("should call API with correct parameters", async () => {
      await analytics.get({
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        interval: "day",
        organizationId: "org_123",
        productId: "prod_123",
        billingType: "recurring",
        customerId: "cust_123",
      });

      expect(mockMetricsGet).toHaveBeenCalledTimes(1);
      const callArgs = getCallArgs();
      expect(callArgs.startDate).toBe("2024-01-01");
      expect(callArgs.endDate).toBe("2024-01-31");
      expect(callArgs.interval).toBe("day");
      expect(callArgs.organizationId).toBe("org_123");
      expect(callArgs.productId).toBe("prod_123");
      expect(callArgs.billingType).toBe("recurring");
      expect(callArgs.customerId).toBe("cust_123");
    });

    test("should handle different intervals", async () => {
      const intervals = ["hour", "day", "week", "month", "year"] as const;

      for (const interval of intervals) {
        mockMetricsGet.mockClear();
        await analytics.get({
          startDate: new Date("2024-01-01"),
          endDate: new Date("2024-01-31"),
          interval,
        });

        const callArgs = getCallArgs();
        expect(callArgs.interval).toBe(interval);
      }
    });

    test("should handle array parameters for organizationId", async () => {
      await analytics.get({
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        interval: "day",
        organizationId: ["org_123", "org_456"],
      });

      const callArgs = getCallArgs();
      expect(callArgs.organizationId).toEqual(["org_123", "org_456"]);
    });

    test("should handle array parameters for productId", async () => {
      await analytics.get({
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        interval: "day",
        productId: ["prod_123", "prod_456"],
      });

      const callArgs = getCallArgs();
      expect(callArgs.productId).toEqual(["prod_123", "prod_456"]);
    });

    test("should handle array parameters for customerId", async () => {
      await analytics.get({
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        interval: "day",
        customerId: ["cust_123", "cust_456"],
      });

      const callArgs = getCallArgs();
      expect(callArgs.customerId).toEqual(["cust_123", "cust_456"]);
    });

    test("should map periods correctly", async () => {
      const result = await analytics.get({
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        interval: "day",
      });

      expect(result.periods).toHaveLength(2);

      const firstPeriod = result.periods[0];
      expect(firstPeriod?.timestamp).toEqual(new Date("2024-01-01"));
      expect(firstPeriod?.orders).toBe(100);
      expect(firstPeriod?.revenue).toBe(50000);
      expect(firstPeriod?.cumulativeRevenue).toBe(50000);
      expect(firstPeriod?.averageOrderValue).toBe(500);
      expect(firstPeriod?.oneTimeProducts).toBe(30);
      expect(firstPeriod?.oneTimeProductsRevenue).toBe(15000);
      expect(firstPeriod?.newSubscriptions).toBe(20);
      expect(firstPeriod?.newSubscriptionsRevenue).toBe(20000);
      expect(firstPeriod?.renewedSubscriptions).toBe(10);
      expect(firstPeriod?.renewedSubscriptionsRevenue).toBe(15000);
      expect(firstPeriod?.activeSubscriptions).toBe(50);
      expect(firstPeriod?.monthlyRecurringRevenue).toBe(25000);
    });

    test("should map metrics correctly", async () => {
      const result = await analytics.get({
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        interval: "day",
      });

      expect(result.metrics.orders.slug).toBe("orders");
      expect(result.metrics.orders.displayName).toBe("Orders");
      expect(result.metrics.orders.type).toBe("scalar");

      expect(result.metrics.revenue.slug).toBe("revenue");
      expect(result.metrics.revenue.displayName).toBe("Revenue");
      expect(result.metrics.revenue.type).toBe("currency");

      expect(result.metrics.monthlyRecurringRevenue.slug).toBe("monthly_recurring_revenue");
      expect(result.metrics.monthlyRecurringRevenue.displayName).toBe("Monthly Recurring Revenue");
    });

    test("should handle optional parameters as null", async () => {
      await analytics.get({
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        interval: "day",
      });

      const callArgs = getCallArgs();
      expect(callArgs.organizationId).toBeNull();
      expect(callArgs.productId).toBeNull();
      expect(callArgs.billingType).toBeNull();
      expect(callArgs.customerId).toBeNull();
    });
  });

  describe("getLimits", () => {
    test("should get limits successfully", async () => {
      const result = await analytics.getLimits();

      expect(mockMetricsLimits).toHaveBeenCalledTimes(1);
      expect(result.minDate).toBeDefined();
      expect(result.intervals).toBeDefined();
    });

    test("should map minDate correctly", async () => {
      const result = await analytics.getLimits();

      expect(result.minDate).toEqual(new Date("2023-01-01"));
    });

    test("should map intervals correctly", async () => {
      const result = await analytics.getLimits();

      expect(result.intervals.hour.maxDays).toBe(7);
      expect(result.intervals.day.maxDays).toBe(90);
      expect(result.intervals.week.maxDays).toBe(365);
      expect(result.intervals.month.maxDays).toBe(730);
      expect(result.intervals.year.maxDays).toBe(3650);
    });
  });

  describe("instance methods", () => {
    test("should have get method", () => {
      expect(typeof analytics.get).toBe("function");
    });

    test("should have getLimits method", () => {
      expect(typeof analytics.getLimits).toBe("function");
    });
  });
});
