import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import type { IDiscount } from "@/index";
import { PaymentException, PolarDiscount } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    POLAR_ACCESS_TOKEN: Bun.env.POLAR_ACCESS_TOKEN,
    POLAR_ENVIRONMENT: Bun.env.POLAR_ENVIRONMENT,
  } as unknown as AppEnv;
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const mockDiscountsCreate = mock((): any => Promise.resolve(createMockDiscountResponse()));
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const mockDiscountsUpdate = mock((): any => Promise.resolve(createMockDiscountResponse()));
const mockDiscountsDelete = mock(() => Promise.resolve());
// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const mockDiscountsGet = mock((): any => Promise.resolve(createMockDiscountResponse()));

mock.module("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    discounts = {
      create: mockDiscountsCreate,
      update: mockDiscountsUpdate,
      delete: mockDiscountsDelete,
      get: mockDiscountsGet,
    };
  },
}));

function createMockDiscountResponse(overrides = {}) {
  return {
    id: "disc_123",
    createdAt: new Date("2024-01-01"),
    modifiedAt: new Date("2024-01-02"),
    name: "Test Discount",
    code: "SAVE20",
    type: "percentage",
    basisPoints: 2000,
    duration: "once",
    durationInMonths: undefined,
    startsAt: new Date("2024-01-01"),
    endsAt: new Date("2024-12-31"),
    maxRedemptions: 100,
    redemptionsCount: 25,
    organizationId: "org_123",
    metadata: { campaign: "winter-sale" },
    products: [
      { id: "prod_123", name: "Product A" },
      { id: "prod_456", name: "Product B" },
    ],
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCreateCallArgs = (): any => {
  const calls = mockDiscountsCreate.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getUpdateCallArgs = (): any => {
  const calls = mockDiscountsUpdate.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

describe("PolarDiscount", () => {
  let discount: PolarDiscount;
  const originalEnv = Bun.env.POLAR_ACCESS_TOKEN;

  beforeEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = "test-access-token";
    discount = new PolarDiscount(createMockEnv());
    mockDiscountsCreate.mockClear();
    mockDiscountsUpdate.mockClear();
    mockDiscountsDelete.mockClear();
    mockDiscountsGet.mockClear();
    mockDiscountsCreate.mockImplementation(() => Promise.resolve(createMockDiscountResponse()));
    mockDiscountsUpdate.mockImplementation(() => Promise.resolve(createMockDiscountResponse()));
    mockDiscountsDelete.mockImplementation(() => Promise.resolve());
    mockDiscountsGet.mockImplementation(() => Promise.resolve(createMockDiscountResponse()));
  });

  afterEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = originalEnv;
  });

  describe("constructor", () => {
    test("should throw PaymentException when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      expect(() => new PolarDiscount(createMockEnv())).toThrow(PaymentException);
    });

    test("should throw with descriptive message when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      try {
        new PolarDiscount(createMockEnv());
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentException);
        expect((error as PaymentException).message).toContain("Polar access token is required");
      }
    });

    test("should create instance when access token is provided", () => {
      expect(discount).toBeInstanceOf(PolarDiscount);
    });
  });

  describe("create", () => {
    test("should create a percentage discount successfully", async () => {
      const result = await discount.create({
        name: "20% Off",
        type: "percentage",
        amount: 20,
        duration: "once",
      } as IDiscount);

      expect(mockDiscountsCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("disc_123");
      expect(result.name).toBe("Test Discount");
    });

    test("should call API with correct parameters for percentage discount", async () => {
      await discount.create({
        name: "Summer Sale",
        code: "SUMMER25",
        type: "percentage",
        amount: 25,
        duration: "once",
        maxRedemptions: 50,
        metadata: { source: "email" },
      } as unknown as IDiscount);

      expect(mockDiscountsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.name).toBe("Summer Sale");
      expect(callArgs.code).toBe("SUMMER25");
      expect(callArgs.type).toBe("percentage");
      expect(callArgs.basisPoints).toBe(2500); // 25 * 100
      expect(callArgs.duration).toBe("once");
      expect(callArgs.maxRedemptions).toBe(50);
    });

    test("should create a fixed discount successfully", async () => {
      mockDiscountsCreate.mockImplementation(() =>
        Promise.resolve(
          createMockDiscountResponse({
            type: "fixed",
            amount: 1000,
            currency: "USD",
            basisPoints: undefined,
          }),
        ),
      );

      const result = await discount.create({
        name: "$10 Off",
        type: "fixed",
        amount: 1000,
        currency: "USD",
        duration: "once",
      } as IDiscount);

      expect(mockDiscountsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.type).toBe("fixed");
      expect(callArgs.amount).toBe(1000);
      expect(callArgs.currency).toBe("USD");
      expect(result.type).toBe("fixed");
    });

    test("should handle repeating duration with durationInMonths", async () => {
      await discount.create({
        name: "Repeating Discount",
        type: "percentage",
        amount: 15,
        duration: "repeating",
        durationInMonths: 3,
      } as IDiscount);

      expect(mockDiscountsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.duration).toBe("repeating");
      expect(callArgs.durationInMonths).toBe(3);
    });

    test("should handle forever duration", async () => {
      await discount.create({
        name: "Forever Discount",
        type: "percentage",
        amount: 10,
        duration: "forever",
      } as IDiscount);

      expect(mockDiscountsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.duration).toBe("forever");
    });

    test("should handle start and end dates", async () => {
      const startDate = new Date("2024-06-01");
      const endDate = new Date("2024-06-30");

      await discount.create({
        name: "June Special",
        type: "percentage",
        amount: 20,
        duration: "once",
        startAt: startDate,
        endAt: endDate,
      } as IDiscount);

      expect(mockDiscountsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.startsAt).toEqual(startDate);
      expect(callArgs.endsAt).toEqual(endDate);
    });

    test("should handle applicable products", async () => {
      await discount.create({
        name: "Product Discount",
        type: "percentage",
        amount: 10,
        duration: "once",
        applicableProducts: [
          { id: "prod_123", name: "Product A" },
          { id: "prod_456", name: "Product B" },
        ],
      } as IDiscount);

      expect(mockDiscountsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.products).toEqual(["prod_123", "prod_456"]);
    });

    test("should map response correctly", async () => {
      const result = await discount.create({
        name: "Test",
        type: "percentage",
        amount: 20,
        duration: "once",
      } as IDiscount);

      expect(result.id).toBe("disc_123");
      expect(result.name).toBe("Test Discount");
      expect(result.type).toBe("percentage");
      expect(result.amount).toBe(20); // 2000 basisPoints / 100
      expect(result.duration).toBe("once");
      expect(result.code).toBe("SAVE20");
      expect(result.maxRedemptions).toBe(100);
      expect(result.redemptionsCount).toBe(25);
      expect(result.createdAt).toEqual(new Date("2024-01-01"));
      expect(result.updatedAt).toEqual(new Date("2024-01-02"));
      expect(result.startAt).toEqual(new Date("2024-01-01"));
      expect(result.endAt).toEqual(new Date("2024-12-31"));
      expect(result.organizationId).toBe("org_123");
      expect(result.metadata).toEqual({ campaign: "winter-sale" });
    });

    test("should map applicable products in response", async () => {
      const result = await discount.create({
        name: "Test",
        type: "percentage",
        amount: 20,
        duration: "once",
      } as IDiscount);

      expect(result.applicableProducts).toHaveLength(2);
      expect(result.applicableProducts?.[0]?.id).toBe("prod_123");
      expect(result.applicableProducts?.[0]?.name).toBe("Product A");
      expect(result.applicableProducts?.[1]?.id).toBe("prod_456");
      expect(result.applicableProducts?.[1]?.name).toBe("Product B");
    });

    test("should map fixed discount amount correctly", async () => {
      mockDiscountsCreate.mockImplementation(() =>
        Promise.resolve(
          createMockDiscountResponse({
            type: "fixed",
            amount: 500,
            basisPoints: undefined,
            currency: "USD",
          }),
        ),
      );

      const result = await discount.create({
        name: "Fixed Discount",
        type: "fixed",
        amount: 500,
        duration: "once",
      } as IDiscount);

      expect(result.type).toBe("fixed");
      expect(result.amount).toBe(500);
      expect(result.currency).toBe("USD");
    });
  });

  describe("update", () => {
    test("should update a discount successfully", async () => {
      const result = await discount.update("disc_123", {
        name: "Updated Discount",
      });

      expect(mockDiscountsUpdate).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    test("should call API with correct parameters", async () => {
      await discount.update("disc_123", {
        name: "Updated Name",
        code: "NEWCODE",
        maxRedemptions: 200,
      });

      expect(mockDiscountsUpdate).toHaveBeenCalledTimes(1);
      const callArgs = getUpdateCallArgs();
      expect(callArgs.id).toBe("disc_123");
      expect(callArgs.discountUpdate.name).toBe("Updated Name");
      expect(callArgs.discountUpdate.code).toBe("NEWCODE");
      expect(callArgs.discountUpdate.maxRedemptions).toBe(200);
    });

    test("should handle partial updates", async () => {
      await discount.update("disc_123", {
        name: "Only Name Updated",
      });

      expect(mockDiscountsUpdate).toHaveBeenCalledTimes(1);
      const callArgs = getUpdateCallArgs();
      expect(callArgs.discountUpdate.name).toBe("Only Name Updated");
      expect(callArgs.discountUpdate.code).toBeNull();
    });

    test("should handle updating applicable products", async () => {
      await discount.update("disc_123", {
        applicableProducts: [{ id: "prod_789", name: "New Product" }],
      });

      const callArgs = getUpdateCallArgs();
      expect(callArgs.discountUpdate.products).toEqual(["prod_789"]);
    });
  });

  describe("remove", () => {
    test("should delete a discount", async () => {
      await discount.remove("disc_123");

      expect(mockDiscountsDelete).toHaveBeenCalledTimes(1);
      expect(mockDiscountsDelete).toHaveBeenCalledWith({ id: "disc_123" });
    });
  });

  describe("get", () => {
    test("should get a discount by ID", async () => {
      const result = await discount.get("disc_123");

      expect(mockDiscountsGet).toHaveBeenCalledTimes(1);
      expect(mockDiscountsGet).toHaveBeenCalledWith({ id: "disc_123" });
      expect(result.id).toBe("disc_123");
    });

    test("should return full discount data", async () => {
      const result = await discount.get("disc_123");

      expect(result.name).toBe("Test Discount");
      expect(result.type).toBe("percentage");
      expect(result.amount).toBe(20);
      expect(result.code).toBe("SAVE20");
    });
  });

  describe("instance methods", () => {
    test("should have create method", () => {
      expect(typeof discount.create).toBe("function");
    });

    test("should have update method", () => {
      expect(typeof discount.update).toBe("function");
    });

    test("should have remove method", () => {
      expect(typeof discount.remove).toBe("function");
    });

    test("should have get method", () => {
      expect(typeof discount.get).toBe("function");
    });
  });
});
