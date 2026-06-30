import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import type { IProduct } from "@/index";
import { PaymentException, PolarProduct } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    POLAR_ACCESS_TOKEN: Bun.env.POLAR_ACCESS_TOKEN,
    POLAR_ENVIRONMENT: Bun.env.POLAR_ENVIRONMENT,
  } as unknown as AppEnv;
};

const mockProductsCreate = mock(() => Promise.resolve(createMockProductResponse()));
const mockProductsUpdate = mock(() => Promise.resolve(createMockProductResponse()));

mock.module("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    products = {
      create: mockProductsCreate,
      update: mockProductsUpdate,
    };
  },
}));

function createMockProductResponse(overrides = {}) {
  return {
    id: "prod_123",
    createdAt: new Date("2024-01-01"),
    modifiedAt: new Date("2024-01-02"),
    name: "Test Product",
    description: "A test product",
    isRecurring: false,
    isArchived: false,
    organizationId: "org_123",
    metadata: { key: "value" },
    prices: [],
    benefits: [],
    attachedCustomFields: [],
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCreateCallArgs = (): any => {
  const calls = mockProductsCreate.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getUpdateCallArgs = (): any => {
  const calls = mockProductsUpdate.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

describe("PolarProduct", () => {
  let product: PolarProduct;
  const originalEnv = Bun.env.POLAR_ACCESS_TOKEN;

  beforeEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = "test-access-token";
    product = new PolarProduct(createMockEnv());
    mockProductsCreate.mockClear();
    mockProductsUpdate.mockClear();
    mockProductsCreate.mockImplementation(() => Promise.resolve(createMockProductResponse()));
    mockProductsUpdate.mockImplementation(() => Promise.resolve(createMockProductResponse()));
  });

  afterEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = originalEnv;
  });

  describe("constructor", () => {
    test("should throw PaymentException when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      expect(() => new PolarProduct(createMockEnv())).toThrow(PaymentException);
    });

    test("should throw with descriptive message when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      try {
        new PolarProduct(createMockEnv());
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentException);
        expect((error as PaymentException).message).toContain("Polar access token is required");
      }
    });

    test("should create instance when access token is provided", () => {
      expect(product).toBeInstanceOf(PolarProduct);
    });
  });

  describe("create", () => {
    test("should create a product successfully", async () => {
      const result = await product.create({
        name: "New Product",
        description: "Product description",
      } as IProduct);

      expect(mockProductsCreate).toHaveBeenCalledTimes(1);
      expect(result.name).toBe("Test Product");
      expect(result.key).toBe("prod_123");
    });

    test("should call API with correct parameters", async () => {
      await product.create({
        name: "New Product",
        description: "Product description",
        organizationId: "org_456",
        metadata: { custom: "data" },
      } as unknown as IProduct);

      expect(mockProductsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.name).toBe("New Product");
      expect(callArgs.description).toBe("Product description");
      expect(callArgs.organizationId).toBe("org_456");
      expect(callArgs.metadata).toEqual({ custom: "data" });
    });

    test("should handle prices in create", async () => {
      await product.create({
        name: "Priced Product",
        prices: [
          {
            type: "fixed",
            priceCurrency: "usd",
            priceAmount: 1999,
          },
        ],
      } as IProduct);

      expect(mockProductsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.prices).toHaveLength(1);
      expect(callArgs.prices[0].type).toBe("fixed");
      expect(callArgs.prices[0].priceAmount).toBe(1999);
    });

    test("should handle recurring interval for monthly subscription", async () => {
      await product.create({
        name: "Monthly Subscription",
        recurringInterval: "monthly",
      } as IProduct);

      expect(mockProductsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.recurringInterval).toBe("month");
    });

    test("should handle recurring interval for yearly subscription", async () => {
      await product.create({
        name: "Yearly Subscription",
        recurringInterval: "yearly",
      } as IProduct);

      expect(mockProductsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.recurringInterval).toBe("year");
    });

    test("should handle images", async () => {
      await product.create({
        name: "Product with Images",
        images: [{ id: "img_1", url: "https://example.com/image.png" }],
      } as IProduct);

      expect(mockProductsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.medias).toEqual(["https://example.com/image.png"]);
    });

    test("should handle attached custom fields", async () => {
      await product.create({
        name: "Product with Custom Fields",
        attachedCustomFields: [{ customFieldId: "field_123", required: true }],
      } as IProduct);

      expect(mockProductsCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.attachedCustomFields).toHaveLength(1);
      expect(callArgs.attachedCustomFields[0].customFieldId).toBe("field_123");
      expect(callArgs.attachedCustomFields[0].required).toBe(true);
    });

    test("should map response correctly", async () => {
      mockProductsCreate.mockImplementation(() =>
        Promise.resolve(
          createMockProductResponse({
            id: "prod_456",
            name: "Mapped Product",
            description: "Mapped description",
            isRecurring: true,
            isArchived: false,
            createdAt: new Date("2024-06-01"),
            modifiedAt: new Date("2024-06-15"),
          }),
        ),
      );

      const result = await product.create({ name: "Test" } as IProduct);

      expect(result.key).toBe("prod_456");
      expect(result.name).toBe("Mapped Product");
      expect(result.description).toBe("Mapped description");
      expect(result.isRecurring).toBe(true);
      expect(result.isArchived).toBe(false);
      expect(result.createdAt).toEqual(new Date("2024-06-01"));
      expect(result.updatedAt).toEqual(new Date("2024-06-15"));
    });
  });

  describe("update", () => {
    test("should update a product successfully", async () => {
      const result = await product.update("prod_123", {
        name: "Updated Product",
      });

      expect(mockProductsUpdate).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    test("should call API with correct parameters", async () => {
      await product.update("prod_123", {
        name: "Updated Name",
        description: "Updated description",
        isArchived: false,
      });

      expect(mockProductsUpdate).toHaveBeenCalledTimes(1);
      const callArgs = getUpdateCallArgs();
      expect(callArgs.id).toBe("prod_123");
      expect(callArgs.productUpdate.name).toBe("Updated Name");
      expect(callArgs.productUpdate.description).toBe("Updated description");
      expect(callArgs.productUpdate.isArchived).toBe(false);
    });

    test("should handle partial updates", async () => {
      await product.update("prod_123", {
        name: "Only Name Updated",
      });

      expect(mockProductsUpdate).toHaveBeenCalledTimes(1);
      const callArgs = getUpdateCallArgs();
      expect(callArgs.productUpdate.name).toBe("Only Name Updated");
      expect(callArgs.productUpdate.description).toBeNull();
    });
  });

  describe("remove", () => {
    test("should archive a product", async () => {
      await product.remove("prod_123");

      expect(mockProductsUpdate).toHaveBeenCalledTimes(1);
      const callArgs = getUpdateCallArgs();
      expect(callArgs.id).toBe("prod_123");
      expect(callArgs.productUpdate.isArchived).toBe(true);
    });
  });

  describe("instance methods", () => {
    test("should have create method", () => {
      expect(typeof product.create).toBe("function");
    });

    test("should have update method", () => {
      expect(typeof product.update).toBe("function");
    });

    test("should have remove method", () => {
      expect(typeof product.remove).toBe("function");
    });
  });
});
