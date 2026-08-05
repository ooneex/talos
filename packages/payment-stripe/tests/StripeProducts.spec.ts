import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { StripeClient } from "@/StripeClient";
import { StripeProducts } from "@/StripeProducts";

const mockProductsCreate = mock(() => Promise.resolve(createMockProduct()));
const mockProductsUpdate = mock(() => Promise.resolve(createMockProduct()));
const mockProductsRetrieve = mock(() => Promise.resolve(createMockProduct()));
const mockProductsDel = mock(() => Promise.resolve({ id: "prod_test123", deleted: true }));
const mockProductsList = mock(() => Promise.resolve(createMockProductList()));
const mockPricesCreate = mock(() => Promise.resolve(createMockPrice()));
const mockPricesRetrieve = mock(() => Promise.resolve(createMockPrice()));
const mockPricesList = mock(() => Promise.resolve(createMockPriceList()));

function createMockClient() {
  return {
    sdk: {
      products: {
        create: mockProductsCreate,
        update: mockProductsUpdate,
        retrieve: mockProductsRetrieve,
        del: mockProductsDel,
        list: mockProductsList,
      },
      prices: {
        create: mockPricesCreate,
        retrieve: mockPricesRetrieve,
        list: mockPricesList,
      },
    },
  } as unknown as StripeClient;
}

function createMockProduct(overrides = {}) {
  return {
    id: "prod_test123",
    object: "product",
    name: "Test Product",
    description: "A great test product",
    images: ["https://example.com/image.jpg"],
    active: true,
    metadata: { category: "saas" },
    created: 1704067200,
    updated: 1704153600,
    ...overrides,
  };
}

function createMockProductList(overrides = {}) {
  return {
    data: [createMockProduct(), createMockProduct({ id: "prod_test456", name: "Another Product" })],
    has_more: false,
    ...overrides,
  };
}

function createMockPrice(overrides = {}) {
  return {
    id: "price_test123",
    object: "price",
    product: "prod_test123",
    currency: "eur",
    unit_amount: 1999,
    type: "one_time",
    recurring: null,
    active: true,
    metadata: { plan: "basic" },
    created: 1704067200,
    ...overrides,
  };
}

function createMockRecurringPrice(overrides = {}) {
  return createMockPrice({
    id: "price_recurring123",
    type: "recurring",
    recurring: { interval: "month", interval_count: 1 },
    ...overrides,
  });
}

function createMockPriceList(overrides = {}) {
  return {
    data: [createMockPrice(), createMockRecurringPrice()],
    has_more: false,
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getProductCreateArgs = (): any => {
  const calls = mockProductsCreate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getProductUpdateArgs = (): { id: string; params: any } => {
  const calls = mockProductsUpdate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return { id: calls[0]?.[0] as string, params: calls[0]?.[1] };
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getProductListArgs = (): any => {
  const calls = mockProductsList.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getPriceCreateArgs = (): any => {
  const calls = mockPricesCreate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getPriceListArgs = (): any => {
  const calls = mockPricesList.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

describe("StripeProducts", () => {
  let products: StripeProducts;

  beforeEach(() => {
    products = new StripeProducts(createMockClient());
    mockProductsCreate.mockClear();
    mockProductsUpdate.mockClear();
    mockProductsRetrieve.mockClear();
    mockProductsDel.mockClear();
    mockProductsList.mockClear();
    mockPricesCreate.mockClear();
    mockPricesRetrieve.mockClear();
    mockPricesList.mockClear();
    mockProductsCreate.mockImplementation(() => Promise.resolve(createMockProduct()));
    mockProductsUpdate.mockImplementation(() => Promise.resolve(createMockProduct()));
    mockProductsRetrieve.mockImplementation(() => Promise.resolve(createMockProduct()));
    mockProductsDel.mockImplementation(() => Promise.resolve({ id: "prod_test123", deleted: true }));
    mockProductsList.mockImplementation(() => Promise.resolve(createMockProductList()));
    mockPricesCreate.mockImplementation(() => Promise.resolve(createMockPrice()));
    mockPricesRetrieve.mockImplementation(() => Promise.resolve(createMockPrice()));
    mockPricesList.mockImplementation(() => Promise.resolve(createMockPriceList()));
  });

  describe("create", () => {
    test("should create a product successfully", async () => {
      const result = await products.create({ name: "My Product" });

      expect(mockProductsCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("prod_test123");
    });

    test("should call API with name", async () => {
      await products.create({ name: "SaaS Pro" });

      const args = getProductCreateArgs();
      expect(args.name).toBe("SaaS Pro");
    });

    test("should pass optional fields when provided", async () => {
      await products.create({
        name: "Pro Plan",
        description: "The best plan",
        images: ["https://example.com/img.jpg"],
        metadata: { tier: "pro" },
        active: false,
      });

      const args = getProductCreateArgs();
      expect(args.description).toBe("The best plan");
      expect(args.images).toEqual(["https://example.com/img.jpg"]);
      expect(args.metadata).toEqual({ tier: "pro" });
      expect(args.active).toBe(false);
    });

    test("should map response fields correctly", async () => {
      const result = await products.create({ name: "Test" });

      expect(result.id).toBe("prod_test123");
      expect(result.name).toBe("Test Product");
      expect(result.description).toBe("A great test product");
      expect(result.images).toEqual(["https://example.com/image.jpg"]);
      expect(result.active).toBe(true);
      expect(result.metadata).toEqual({ category: "saas" });
      expect(result.createdAt).toEqual(new Date(1704067200 * 1000));
      expect(result.updatedAt).toEqual(new Date(1704153600 * 1000));
    });

    test("should omit description when absent", async () => {
      mockProductsCreate.mockImplementation(() => Promise.resolve(createMockProduct({ description: null })));

      const result = await products.create({ name: "No Desc" });

      expect(result.description).toBeUndefined();
    });
  });

  describe("update", () => {
    test("should update a product successfully", async () => {
      const result = await products.update("prod_test123", { name: "Updated Name" });

      expect(mockProductsUpdate).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    test("should call API with correct id and params", async () => {
      await products.update("prod_test123", {
        name: "Updated",
        description: "New description",
        active: false,
      });

      const { id, params } = getProductUpdateArgs();
      expect(id).toBe("prod_test123");
      expect(params.name).toBe("Updated");
      expect(params.description).toBe("New description");
      expect(params.active).toBe(false);
    });
  });

  describe("remove", () => {
    test("should delete a product", async () => {
      await products.remove("prod_test123");

      expect(mockProductsDel).toHaveBeenCalledTimes(1);
      expect(mockProductsDel).toHaveBeenCalledWith("prod_test123");
    });
  });

  describe("get", () => {
    test("should get a product by ID", async () => {
      const result = await products.get("prod_test123");

      expect(mockProductsRetrieve).toHaveBeenCalledTimes(1);
      expect(mockProductsRetrieve).toHaveBeenCalledWith("prod_test123");
      expect(result.id).toBe("prod_test123");
    });

    test("should return full product data", async () => {
      const result = await products.get("prod_test123");

      expect(result.name).toBe("Test Product");
      expect(result.active).toBe(true);
    });
  });

  describe("list", () => {
    test("should list products with default limit of 10", async () => {
      await products.list();

      const args = getProductListArgs();
      expect(args.limit).toBe(10);
    });

    test("should pass active filter", async () => {
      await products.list({ active: true, limit: 5 });

      const args = getProductListArgs();
      expect(args.active).toBe(true);
      expect(args.limit).toBe(5);
    });

    test("should pass startingAfter for pagination", async () => {
      await products.list({ startingAfter: "prod_prev" });

      const args = getProductListArgs();
      expect(args.starting_after).toBe("prod_prev");
    });

    test("should return items and hasMore", async () => {
      const result = await products.list();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe("prod_test123");
      expect(result.hasMore).toBe(false);
    });

    test("should indicate hasMore when more pages exist", async () => {
      mockProductsList.mockImplementation(() => Promise.resolve(createMockProductList({ has_more: true })));

      const result = await products.list();

      expect(result.hasMore).toBe(true);
    });
  });

  describe("createPrice", () => {
    test("should create a one-time price successfully", async () => {
      const result = await products.createPrice({
        productId: "prod_test123",
        currency: "eur",
        unitAmount: 1999,
      });

      expect(mockPricesCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("price_test123");
    });

    test("should call API with product, currency, unit_amount", async () => {
      await products.createPrice({
        productId: "prod_test123",
        currency: "eur",
        unitAmount: 2999,
      });

      const args = getPriceCreateArgs();
      expect(args.product).toBe("prod_test123");
      expect(args.currency).toBe("eur");
      expect(args.unit_amount).toBe(2999);
    });

    test("should create a recurring price with interval", async () => {
      mockPricesCreate.mockImplementation(() => Promise.resolve(createMockRecurringPrice()));

      await products.createPrice({
        productId: "prod_test123",
        currency: "eur",
        unitAmount: 999,
        type: "recurring",
        interval: "month",
        intervalCount: 1,
      });

      const args = getPriceCreateArgs();
      expect(args.recurring.interval).toBe("month");
      expect(args.recurring.interval_count).toBe(1);
    });

    test("should default intervalCount to 1 when not provided", async () => {
      mockPricesCreate.mockImplementation(() => Promise.resolve(createMockRecurringPrice()));

      await products.createPrice({
        productId: "prod_test123",
        currency: "usd",
        unitAmount: 500,
        type: "recurring",
        interval: "year",
      });

      const args = getPriceCreateArgs();
      expect(args.recurring.interval_count).toBe(1);
    });

    test("should not set recurring when type is one_time", async () => {
      await products.createPrice({
        productId: "prod_test123",
        currency: "usd",
        unitAmount: 500,
        type: "one_time",
      });

      const args = getPriceCreateArgs();
      expect(args.recurring).toBeUndefined();
    });

    test("should map response fields correctly", async () => {
      const result = await products.createPrice({
        productId: "prod_test123",
        currency: "eur",
        unitAmount: 1999,
      });

      expect(result.id).toBe("price_test123");
      expect(result.productId).toBe("prod_test123");
      expect(result.currency).toBe("eur");
      expect(result.unitAmount).toBe(1999);
      expect(result.type).toBe("one_time");
      expect(result.active).toBe(true);
      expect(result.metadata).toEqual({ plan: "basic" });
      expect(result.createdAt).toEqual(new Date(1704067200 * 1000));
    });

    test("should map recurring price interval", async () => {
      mockPricesCreate.mockImplementation(() => Promise.resolve(createMockRecurringPrice()));

      const result = await products.createPrice({
        productId: "prod_test123",
        currency: "eur",
        unitAmount: 999,
        type: "recurring",
        interval: "month",
      });

      expect(result.type).toBe("recurring");
      expect(result.interval).toBe("month");
      expect(result.intervalCount).toBe(1);
    });
  });

  describe("getPrice", () => {
    test("should get a price by ID", async () => {
      const result = await products.getPrice("price_test123");

      expect(mockPricesRetrieve).toHaveBeenCalledTimes(1);
      expect(mockPricesRetrieve).toHaveBeenCalledWith("price_test123");
      expect(result.id).toBe("price_test123");
    });

    test("should return full price data", async () => {
      const result = await products.getPrice("price_test123");

      expect(result.currency).toBe("eur");
      expect(result.unitAmount).toBe(1999);
    });
  });

  describe("listPrices", () => {
    test("should list prices for a product", async () => {
      await products.listPrices("prod_test123");

      expect(mockPricesList).toHaveBeenCalledTimes(1);
      const args = getPriceListArgs();
      expect(args.product).toBe("prod_test123");
      expect(args.limit).toBe(10);
    });

    test("should pass active filter and custom limit", async () => {
      await products.listPrices("prod_test123", { active: true, limit: 5 });

      const args = getPriceListArgs();
      expect(args.active).toBe(true);
      expect(args.limit).toBe(5);
    });

    test("should return items and hasMore", async () => {
      const result = await products.listPrices("prod_test123");

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe("price_test123");
      expect(result.hasMore).toBe(false);
    });
  });

  describe("instance methods", () => {
    test("should have create method", () => {
      expect(typeof products.create).toBe("function");
    });

    test("should have update method", () => {
      expect(typeof products.update).toBe("function");
    });

    test("should have remove method", () => {
      expect(typeof products.remove).toBe("function");
    });

    test("should have get method", () => {
      expect(typeof products.get).toBe("function");
    });

    test("should have list method", () => {
      expect(typeof products.list).toBe("function");
    });

    test("should have createPrice method", () => {
      expect(typeof products.createPrice).toBe("function");
    });

    test("should have getPrice method", () => {
      expect(typeof products.getPrice).toBe("function");
    });

    test("should have listPrices method", () => {
      expect(typeof products.listPrices).toBe("function");
    });
  });
});
