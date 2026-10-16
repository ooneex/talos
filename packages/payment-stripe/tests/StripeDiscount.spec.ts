import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { StripeClient } from "@/StripeClient";
import { StripeDiscount } from "@/StripeDiscount";

const mockCouponsCreate = mock(() => Promise.resolve(createMockCoupon()));
const mockCouponsUpdate = mock(() => Promise.resolve(createMockCoupon()));
const mockCouponsRetrieve = mock(() => Promise.resolve(createMockCoupon()));
const mockCouponsDel = mock(() => Promise.resolve({ id: "coupon_test123", deleted: true }));
const mockCouponsList = mock(() => Promise.resolve(createMockCouponList()));
const mockPromotionCodesCreate = mock(() => Promise.resolve({ id: "promo_test123" }));

function createMockClient() {
  return {
    sdk: {
      coupons: {
        create: mockCouponsCreate,
        update: mockCouponsUpdate,
        retrieve: mockCouponsRetrieve,
        del: mockCouponsDel,
        list: mockCouponsList,
      },
      promotionCodes: {
        create: mockPromotionCodesCreate,
        list: mockPromotionCodesList,
        retrieve: mockPromotionCodesRetrieve,
        update: mockPromotionCodesUpdate,
      },
    },
  } as unknown as StripeClient;
}

const mockPromotionCodesList = mock(() => Promise.resolve(createMockPromotionCodeList()));
const mockPromotionCodesRetrieve = mock(() => Promise.resolve(createMockPromotionCode()));
const mockPromotionCodesUpdate = mock(() => Promise.resolve(createMockPromotionCode({ active: false })));

function createMockCoupon(overrides = {}) {
  return {
    id: "coupon_test123",
    object: "coupon",
    name: "Test Coupon",
    percent_off: 20,
    amount_off: null,
    currency: null,
    duration: "once",
    duration_in_months: null,
    max_redemptions: null,
    times_redeemed: 5,
    redeem_by: null,
    valid: true,
    metadata: { source: "campaign" },
    created: 1704067200,
    ...overrides,
  };
}

function createMockPromotionCode(overrides = {}) {
  return {
    id: "promo_test123",
    object: "promotion_code",
    active: true,
    code: "SUMMER15",
    coupon: createMockCoupon(),
    created: 1704067200,
    expires_at: null,
    max_redemptions: null,
    metadata: {},
    times_redeemed: 3,
    ...overrides,
  };
}

function createMockPromotionCodeList(overrides = {}) {
  return {
    data: [createMockPromotionCode(), createMockPromotionCode({ id: "promo_test456", code: "WINTER10" })],
    has_more: false,
    ...overrides,
  };
}

function createMockFixedCoupon(overrides = {}) {
  return createMockCoupon({
    percent_off: null,
    amount_off: 1000,
    currency: "eur",
    ...overrides,
  });
}

function createMockCouponList(overrides = {}) {
  return {
    data: [createMockCoupon(), createMockCoupon({ id: "coupon_test456", name: "Another Coupon", percent_off: 10 })],
    has_more: false,
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCreateArgs = (): any => {
  const calls = mockCouponsCreate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getUpdateArgs = (): { id: string; params: any } => {
  const calls = mockCouponsUpdate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return { id: calls[0]?.[0] as string, params: calls[0]?.[1] };
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getListArgs = (): any => {
  const calls = mockCouponsList.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getPromoCodeArgs = (): any => {
  const calls = mockPromotionCodesCreate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

describe("StripeDiscount", () => {
  let discount: StripeDiscount;

  beforeEach(() => {
    discount = new StripeDiscount(createMockClient());
    mockCouponsCreate.mockClear();
    mockCouponsUpdate.mockClear();
    mockCouponsRetrieve.mockClear();
    mockCouponsDel.mockClear();
    mockCouponsList.mockClear();
    mockPromotionCodesCreate.mockClear();
    mockPromotionCodesList.mockClear();
    mockPromotionCodesRetrieve.mockClear();
    mockPromotionCodesUpdate.mockClear();
    mockPromotionCodesList.mockImplementation(() => Promise.resolve(createMockPromotionCodeList()));
    mockPromotionCodesRetrieve.mockImplementation(() => Promise.resolve(createMockPromotionCode()));
    mockPromotionCodesUpdate.mockImplementation(() => Promise.resolve(createMockPromotionCode({ active: false })));
    mockCouponsCreate.mockImplementation(() => Promise.resolve(createMockCoupon()));
    mockCouponsUpdate.mockImplementation(() => Promise.resolve(createMockCoupon()));
    mockCouponsRetrieve.mockImplementation(() => Promise.resolve(createMockCoupon()));
    mockCouponsDel.mockImplementation(() => Promise.resolve({ id: "coupon_test123", deleted: true }));
    mockCouponsList.mockImplementation(() => Promise.resolve(createMockCouponList()));
    mockPromotionCodesCreate.mockImplementation(() => Promise.resolve({ id: "promo_test123" }));
  });

  describe("create — percentage", () => {
    test("should create a percentage coupon successfully", async () => {
      const result = await discount.create({
        name: "20% Off",
        type: "percentage",
        amount: 20,
        duration: "once",
      });

      expect(mockCouponsCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("coupon_test123");
    });

    test("should call API with percent_off", async () => {
      await discount.create({
        name: "20% Off",
        type: "percentage",
        amount: 20,
        duration: "once",
      });

      const args = getCreateArgs();
      expect(args.percent_off).toBe(20);
      expect(args.amount_off).toBeUndefined();
      expect(args.duration).toBe("once");
    });

    test("should set duration_in_months for repeating", async () => {
      await discount.create({
        name: "3-month 10% off",
        type: "percentage",
        amount: 10,
        duration: "repeating",
        durationInMonths: 3,
      });

      const args = getCreateArgs();
      expect(args.duration).toBe("repeating");
      expect(args.duration_in_months).toBe(3);
    });

    test("should handle forever duration", async () => {
      await discount.create({
        name: "Forever 5% off",
        type: "percentage",
        amount: 5,
        duration: "forever",
      });

      const args = getCreateArgs();
      expect(args.duration).toBe("forever");
    });
  });

  describe("create — fixed", () => {
    test("should create a fixed amount coupon", async () => {
      mockCouponsCreate.mockImplementation(() => Promise.resolve(createMockFixedCoupon()));

      const result = await discount.create({
        name: "10€ Off",
        type: "fixed",
        amount: 1000,
        currency: "eur",
        duration: "once",
      });

      expect(result.type).toBe("fixed");
      expect(result.amount).toBe(1000);
    });

    test("should call API with amount_off and currency", async () => {
      await discount.create({
        name: "10€ Off",
        type: "fixed",
        amount: 1000,
        currency: "eur",
        duration: "once",
      });

      const args = getCreateArgs();
      expect(args.amount_off).toBe(1000);
      expect(args.currency).toBe("eur");
      expect(args.percent_off).toBeUndefined();
    });

    test("should default currency to usd when not provided", async () => {
      await discount.create({
        name: "$5 Off",
        type: "fixed",
        amount: 500,
        duration: "once",
      });

      const args = getCreateArgs();
      expect(args.currency).toBe("usd");
    });
  });

  describe("create — with promotion code", () => {
    test("should create a promotion code when code is provided", async () => {
      await discount.create({
        name: "Summer Sale",
        type: "percentage",
        amount: 15,
        duration: "once",
        code: "SUMMER15",
      });

      expect(mockPromotionCodesCreate).toHaveBeenCalledTimes(1);
      const promoArgs = getPromoCodeArgs();
      expect(promoArgs.coupon).toBe("coupon_test123");
      expect(promoArgs.code).toBe("SUMMER15");
    });

    test("should not create promotion code when code is absent", async () => {
      await discount.create({
        name: "No Code Discount",
        type: "percentage",
        amount: 10,
        duration: "once",
      });

      expect(mockPromotionCodesCreate).not.toHaveBeenCalled();
    });

    test("should pass maxRedemptions and redeemBy to promotion code", async () => {
      const redeemBy = new Date("2024-12-31");
      await discount.create({
        name: "Limited Offer",
        type: "percentage",
        amount: 25,
        duration: "once",
        code: "LIMITED25",
        maxRedemptions: 100,
        redeemBy,
      });

      const promoArgs = getPromoCodeArgs();
      expect(promoArgs.max_redemptions).toBe(100);
      expect(promoArgs.expires_at).toBe(Math.floor(redeemBy.getTime() / 1000));
    });
  });

  describe("create — additional options", () => {
    test("should pass max_redemptions", async () => {
      await discount.create({
        name: "Limited",
        type: "percentage",
        amount: 10,
        duration: "once",
        maxRedemptions: 50,
      });

      const args = getCreateArgs();
      expect(args.max_redemptions).toBe(50);
    });

    test("should pass redeem_by as unix timestamp", async () => {
      const redeemBy = new Date("2024-12-31");
      await discount.create({
        name: "Year End",
        type: "percentage",
        amount: 10,
        duration: "once",
        redeemBy,
      });

      const args = getCreateArgs();
      expect(args.redeem_by).toBe(Math.floor(redeemBy.getTime() / 1000));
    });

    test("should pass applies_to products", async () => {
      await discount.create({
        name: "Product Specific",
        type: "percentage",
        amount: 10,
        duration: "once",
        appliesTo: ["prod_abc", "prod_xyz"],
      });

      const args = getCreateArgs();
      expect(args.applies_to).toEqual({ products: ["prod_abc", "prod_xyz"] });
    });

    test("should pass metadata", async () => {
      await discount.create({
        name: "Tagged Discount",
        type: "percentage",
        amount: 10,
        duration: "once",
        metadata: { campaign: "spring" },
      });

      const args = getCreateArgs();
      expect(args.metadata).toEqual({ campaign: "spring" });
    });
  });

  describe("create — response mapping", () => {
    test("should map percentage coupon fields", async () => {
      const result = await discount.create({
        name: "20% Off",
        type: "percentage",
        amount: 20,
        duration: "once",
      });

      expect(result.id).toBe("coupon_test123");
      expect(result.name).toBe("Test Coupon");
      expect(result.type).toBe("percentage");
      expect(result.amount).toBe(20);
      expect(result.duration).toBe("once");
      expect(result.timesRedeemed).toBe(5);
      expect(result.isValid).toBe(true);
      expect(result.metadata).toEqual({ source: "campaign" });
      expect(result.createdAt).toEqual(new Date(1704067200 * 1000));
    });

    test("should map fixed coupon fields", async () => {
      mockCouponsCreate.mockImplementation(() => Promise.resolve(createMockFixedCoupon()));

      const result = await discount.create({
        name: "10€ Off",
        type: "fixed",
        amount: 1000,
        currency: "eur",
        duration: "once",
      });

      expect(result.type).toBe("fixed");
      expect(result.amount).toBe(1000);
      expect(result.currency).toBe("eur");
    });

    test("should map durationInMonths", async () => {
      mockCouponsCreate.mockImplementation(() =>
        Promise.resolve(createMockCoupon({ duration: "repeating", duration_in_months: 6 })),
      );

      const result = await discount.create({
        name: "6-month",
        type: "percentage",
        amount: 10,
        duration: "repeating",
        durationInMonths: 6,
      });

      expect(result.durationInMonths).toBe(6);
    });

    test("should map redeemBy date", async () => {
      const redeemByTs = Math.floor(new Date("2024-12-31").getTime() / 1000);
      mockCouponsCreate.mockImplementation(() => Promise.resolve(createMockCoupon({ redeem_by: redeemByTs })));

      const result = await discount.create({
        name: "Year End",
        type: "percentage",
        amount: 10,
        duration: "once",
        redeemBy: new Date("2024-12-31"),
      });

      expect(result.redeemBy).toEqual(new Date(redeemByTs * 1000));
    });
  });

  describe("update", () => {
    test("should update a coupon successfully", async () => {
      const result = await discount.update("coupon_test123", { name: "Updated Coupon" });

      expect(mockCouponsUpdate).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    test("should call API with correct id and params", async () => {
      await discount.update("coupon_test123", {
        name: "New Name",
        metadata: { updated: "true" },
      });

      const { id, params } = getUpdateArgs();
      expect(id).toBe("coupon_test123");
      expect(params.name).toBe("New Name");
      expect(params.metadata).toEqual({ updated: "true" });
    });
  });

  describe("remove", () => {
    test("should delete a coupon", async () => {
      await discount.remove("coupon_test123");

      expect(mockCouponsDel).toHaveBeenCalledTimes(1);
      expect(mockCouponsDel).toHaveBeenCalledWith("coupon_test123");
    });
  });

  describe("get", () => {
    test("should get a coupon by ID", async () => {
      const result = await discount.get("coupon_test123");

      expect(mockCouponsRetrieve).toHaveBeenCalledTimes(1);
      expect(mockCouponsRetrieve).toHaveBeenCalledWith("coupon_test123");
      expect(result.id).toBe("coupon_test123");
    });

    test("should return full coupon data", async () => {
      const result = await discount.get("coupon_test123");

      expect(result.name).toBe("Test Coupon");
      expect(result.type).toBe("percentage");
      expect(result.amount).toBe(20);
      expect(result.isValid).toBe(true);
    });
  });

  describe("list", () => {
    test("should list coupons with default limit of 10", async () => {
      await discount.list();

      const args = getListArgs();
      expect(args.limit).toBe(10);
    });

    test("should pass custom limit and startingAfter", async () => {
      await discount.list({ limit: 20, startingAfter: "coupon_prev" });

      const args = getListArgs();
      expect(args.limit).toBe(20);
      expect(args.starting_after).toBe("coupon_prev");
    });

    test("should return items and hasMore", async () => {
      const result = await discount.list();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe("coupon_test123");
      expect(result.hasMore).toBe(false);
    });

    test("should indicate hasMore when more pages exist", async () => {
      mockCouponsList.mockImplementation(() => Promise.resolve(createMockCouponList({ has_more: true })));

      const result = await discount.list();

      expect(result.hasMore).toBe(true);
    });
  });

  describe("listPromotionCodes", () => {
    test("should list promotion codes with default limit of 10", async () => {
      await discount.listPromotionCodes();

      expect(mockPromotionCodesList).toHaveBeenCalledWith({ limit: 10 });
    });

    test("should pass limit, startingAfter, code and active", async () => {
      await discount.listPromotionCodes({ limit: 1, startingAfter: "promo_prev", code: "SUMMER15", active: false });

      expect(mockPromotionCodesList).toHaveBeenCalledWith({
        limit: 1,
        starting_after: "promo_prev",
        code: "SUMMER15",
        active: false,
      });
    });

    test("should map items with their coupon and hasMore", async () => {
      mockPromotionCodesList.mockImplementation(() => Promise.resolve(createMockPromotionCodeList({ has_more: true })));

      const result = await discount.listPromotionCodes();

      expect(result.hasMore).toBe(true);
      expect(result.items.map((p) => p.code)).toEqual(["SUMMER15", "WINTER10"]);
      expect(result.items[0]?.coupon.id).toBe("coupon_test123");
      expect(result.items[0]?.coupon.amount).toBe(20);
    });
  });

  describe("getPromotionCode", () => {
    test("should retrieve and map a promotion code", async () => {
      const expiresAt = 1735603200;
      mockPromotionCodesRetrieve.mockImplementation(() =>
        Promise.resolve(createMockPromotionCode({ expires_at: expiresAt, max_redemptions: 100 })),
      );

      const result = await discount.getPromotionCode("promo_test123");

      expect(mockPromotionCodesRetrieve).toHaveBeenCalledWith("promo_test123");
      expect(result).toEqual({
        id: "promo_test123",
        code: "SUMMER15",
        coupon: expect.objectContaining({ id: "coupon_test123", type: "percentage" }),
        active: true,
        timesRedeemed: 3,
        maxRedemptions: 100,
        expiresAt: new Date(expiresAt * 1000),
        metadata: {},
        createdAt: new Date(1704067200 * 1000),
      });
    });

    test("should leave out a missing expiry and redemption cap", async () => {
      const result = await discount.getPromotionCode("promo_test123");

      expect(result.expiresAt).toBeUndefined();
      expect(result.maxRedemptions).toBeUndefined();
    });

    test("should propagate a Stripe error", async () => {
      mockPromotionCodesRetrieve.mockImplementation(() => Promise.reject(new Error("No such promotion code")));

      await expect(discount.getPromotionCode("promo_missing")).rejects.toThrow("No such promotion code");
    });
  });

  describe("disablePromotionCode", () => {
    test("should make the promotion code inactive without deleting its coupon", async () => {
      const result = await discount.disablePromotionCode("promo_test123");

      expect(mockPromotionCodesUpdate).toHaveBeenCalledWith("promo_test123", { active: false });
      expect(mockCouponsDel).not.toHaveBeenCalled();
      expect(result.active).toBe(false);
      expect(result.timesRedeemed).toBe(3);
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

    test("should have list method", () => {
      expect(typeof discount.list).toBe("function");
    });
  });
});
