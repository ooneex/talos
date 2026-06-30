import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AppEnv } from "@talosjs/app-env";
import { PaymentException, PolarCustomer } from "@/index";

const createMockEnv = (): AppEnv => {
  return {
    POLAR_ACCESS_TOKEN: Bun.env.POLAR_ACCESS_TOKEN,
    POLAR_ENVIRONMENT: Bun.env.POLAR_ENVIRONMENT,
  } as unknown as AppEnv;
};

const mockCustomersCreate = mock(() => Promise.resolve(createMockCustomerResponse()));
const mockCustomersUpdate = mock(() => Promise.resolve(createMockCustomerResponse()));
const mockCustomersDelete = mock(() => Promise.resolve());
const mockCustomersGet = mock(() => Promise.resolve(createMockCustomerResponse()));
const mockCustomersList = mock(() => Promise.resolve(createMockCustomerListResponse()));
const mockCustomersGetExternal = mock(() => Promise.resolve(createMockCustomerResponse()));
const mockCustomersUpdateExternal = mock(() => Promise.resolve(createMockCustomerResponse()));
const mockCustomersDeleteExternal = mock(() => Promise.resolve());

mock.module("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    customers = {
      create: mockCustomersCreate,
      update: mockCustomersUpdate,
      delete: mockCustomersDelete,
      get: mockCustomersGet,
      list: mockCustomersList,
      getExternal: mockCustomersGetExternal,
      updateExternal: mockCustomersUpdateExternal,
      deleteExternal: mockCustomersDeleteExternal,
    };
  },
}));

function createMockCustomerResponse(overrides = {}) {
  return {
    id: "cust_123",
    createdAt: new Date("2024-01-01"),
    modifiedAt: new Date("2024-01-02"),
    deletedAt: undefined,
    email: "customer@example.com",
    emailVerified: true,
    name: "John Doe",
    externalId: "ext_123",
    avatarUrl: "https://example.com/avatar.jpg",
    billingAddress: {
      line1: "123 Main St",
      line2: "Apt 4",
      city: "New York",
      state: "NY",
      postalCode: "10001",
      country: "US",
    },
    taxId: ["vat", "DE123456789"],
    organizationId: "org_123",
    metadata: { source: "website" },
    ...overrides,
  };
}

function createMockCustomerListResponse(overrides = {}) {
  return {
    result: {
      items: [
        createMockCustomerResponse(),
        createMockCustomerResponse({
          id: "cust_456",
          email: "another@example.com",
          name: "Jane Smith",
        }),
      ],
      pagination: {
        totalCount: 50,
        maxPage: 5,
      },
    },
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCreateCallArgs = (): any => {
  const calls = mockCustomersCreate.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getUpdateCallArgs = (): any => {
  const calls = mockCustomersUpdate.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getListCallArgs = (): any => {
  const calls = mockCustomersList.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getUpdateExternalCallArgs = (): any => {
  const calls = mockCustomersUpdateExternal.mock.calls as unknown[][];
  if (calls.length === 0) {
    throw new Error("No calls recorded");
  }
  return calls[0]?.[0];
};

describe("PolarCustomer", () => {
  let customer: PolarCustomer;
  const originalEnv = Bun.env.POLAR_ACCESS_TOKEN;

  beforeEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = "test-access-token";
    customer = new PolarCustomer(createMockEnv());
    mockCustomersCreate.mockClear();
    mockCustomersUpdate.mockClear();
    mockCustomersDelete.mockClear();
    mockCustomersGet.mockClear();
    mockCustomersList.mockClear();
    mockCustomersGetExternal.mockClear();
    mockCustomersUpdateExternal.mockClear();
    mockCustomersDeleteExternal.mockClear();
    mockCustomersCreate.mockImplementation(() => Promise.resolve(createMockCustomerResponse()));
    mockCustomersUpdate.mockImplementation(() => Promise.resolve(createMockCustomerResponse()));
    mockCustomersDelete.mockImplementation(() => Promise.resolve());
    mockCustomersGet.mockImplementation(() => Promise.resolve(createMockCustomerResponse()));
    mockCustomersList.mockImplementation(() => Promise.resolve(createMockCustomerListResponse()));
    mockCustomersGetExternal.mockImplementation(() => Promise.resolve(createMockCustomerResponse()));
    mockCustomersUpdateExternal.mockImplementation(() => Promise.resolve(createMockCustomerResponse()));
    mockCustomersDeleteExternal.mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    Bun.env.POLAR_ACCESS_TOKEN = originalEnv;
  });

  describe("constructor", () => {
    test("should throw PaymentException when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      expect(() => new PolarCustomer(createMockEnv())).toThrow(PaymentException);
    });

    test("should throw with descriptive message when access token is missing", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "";

      try {
        new PolarCustomer(createMockEnv());
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentException);
        expect((error as PaymentException).message).toContain("Polar access token is required");
      }
    });

    test("should create instance when access token is provided", () => {
      expect(customer).toBeInstanceOf(PolarCustomer);
    });
  });

  describe("create", () => {
    test("should create a customer successfully", async () => {
      const result = await customer.create({
        email: "new@example.com",
      });

      expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("cust_123");
      expect(result.email).toBe("customer@example.com");
    });

    test("should call API with correct parameters", async () => {
      await customer.create({
        email: "test@example.com",
        name: "Test User",
        externalId: "user_123",
        organizationId: "org_456",
        metadata: { tier: "premium" },
      });

      expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.email).toBe("test@example.com");
      expect(callArgs.name).toBe("Test User");
      expect(callArgs.externalId).toBe("user_123");
      expect(callArgs.organizationId).toBe("org_456");
      expect(callArgs.metadata).toEqual({ tier: "premium" });
    });

    test("should handle billing address", async () => {
      await customer.create({
        email: "test@example.com",
        billingAddress: {
          line1: "456 Oak Ave",
          line2: "Suite 100",
          city: "San Francisco",
          state: "CA",
          postalCode: "94102",
          country: "US",
        },
      });

      expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.billingAddress.line1).toBe("456 Oak Ave");
      expect(callArgs.billingAddress.line2).toBe("Suite 100");
      expect(callArgs.billingAddress.city).toBe("San Francisco");
      expect(callArgs.billingAddress.state).toBe("CA");
      expect(callArgs.billingAddress.postalCode).toBe("94102");
      expect(callArgs.billingAddress.country).toBe("US");
    });

    test("should handle tax ID", async () => {
      await customer.create({
        email: "business@example.com",
        taxId: "DE123456789",
      });

      expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
      const callArgs = getCreateCallArgs();
      expect(callArgs.taxId).toEqual(["DE123456789", null]);
    });

    test("should map response correctly", async () => {
      const result = await customer.create({
        email: "test@example.com",
      });

      expect(result.id).toBe("cust_123");
      expect(result.email).toBe("customer@example.com");
      expect(result.emailVerified).toBe(true);
      expect(result.name).toBe("John Doe");
      expect(result.externalId).toBe("ext_123");
      expect(result.avatarUrl).toBe("https://example.com/avatar.jpg");
      expect(result.organizationId).toBe("org_123");
      expect(result.metadata).toEqual({ source: "website" });
      expect(result.createdAt).toEqual(new Date("2024-01-01"));
      expect(result.updatedAt).toEqual(new Date("2024-01-02"));
    });

    test("should map billing address in response", async () => {
      const result = await customer.create({
        email: "test@example.com",
      });

      expect(result.billingAddress).toBeDefined();
      expect(result.billingAddress?.line1).toBe("123 Main St");
      expect(result.billingAddress?.line2).toBe("Apt 4");
      expect(result.billingAddress?.city).toBe("New York");
      expect(result.billingAddress?.state).toBe("NY");
      expect(result.billingAddress?.postalCode).toBe("10001");
      expect(result.billingAddress?.country).toBe("US");
    });

    test("should map tax ID in response", async () => {
      const result = await customer.create({
        email: "test@example.com",
      });

      expect(result.taxId).toBe("DE123456789");
    });

    test("should handle string taxId in response", async () => {
      mockCustomersCreate.mockImplementation(() =>
        Promise.resolve(
          createMockCustomerResponse({
            taxId: "US123456789",
          }),
        ),
      );

      const result = await customer.create({
        email: "test@example.com",
      });

      expect(result.taxId).toBe("US123456789");
    });

    test("should handle deletedAt in response", async () => {
      mockCustomersCreate.mockImplementation(() =>
        Promise.resolve(
          createMockCustomerResponse({
            deletedAt: new Date("2024-06-01"),
          }),
        ),
      );

      const result = await customer.create({
        email: "test@example.com",
      });

      expect(result.deletedAt).toEqual(new Date("2024-06-01"));
    });
  });

  describe("update", () => {
    test("should update a customer successfully", async () => {
      const result = await customer.update("cust_123", {
        name: "Updated Name",
      });

      expect(mockCustomersUpdate).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    test("should call API with correct parameters", async () => {
      await customer.update("cust_123", {
        email: "updated@example.com",
        name: "Updated User",
        metadata: { tier: "enterprise" },
      });

      expect(mockCustomersUpdate).toHaveBeenCalledTimes(1);
      const callArgs = getUpdateCallArgs();
      expect(callArgs.id).toBe("cust_123");
      expect(callArgs.customerUpdate.email).toBe("updated@example.com");
      expect(callArgs.customerUpdate.name).toBe("Updated User");
      expect(callArgs.customerUpdate.metadata).toEqual({ tier: "enterprise" });
    });

    test("should handle partial updates", async () => {
      await customer.update("cust_123", {
        name: "Only Name Updated",
      });

      expect(mockCustomersUpdate).toHaveBeenCalledTimes(1);
      const callArgs = getUpdateCallArgs();
      expect(callArgs.customerUpdate.name).toBe("Only Name Updated");
      expect(callArgs.customerUpdate.email).toBeNull();
    });

    test("should handle billing address update", async () => {
      await customer.update("cust_123", {
        billingAddress: {
          line1: "789 New St",
          city: "Chicago",
          state: "IL",
          postalCode: "60601",
          country: "US",
        },
      });

      const callArgs = getUpdateCallArgs();
      expect(callArgs.customerUpdate.billingAddress.line1).toBe("789 New St");
      expect(callArgs.customerUpdate.billingAddress.city).toBe("Chicago");
    });
  });

  describe("remove", () => {
    test("should delete a customer", async () => {
      await customer.remove("cust_123");

      expect(mockCustomersDelete).toHaveBeenCalledTimes(1);
      expect(mockCustomersDelete).toHaveBeenCalledWith({ id: "cust_123" });
    });
  });

  describe("get", () => {
    test("should get a customer by ID", async () => {
      const result = await customer.get("cust_123");

      expect(mockCustomersGet).toHaveBeenCalledTimes(1);
      expect(mockCustomersGet).toHaveBeenCalledWith({ id: "cust_123" });
      expect(result.id).toBe("cust_123");
    });

    test("should return full customer data", async () => {
      const result = await customer.get("cust_123");

      expect(result.email).toBe("customer@example.com");
      expect(result.name).toBe("John Doe");
      expect(result.emailVerified).toBe(true);
    });
  });

  describe("list", () => {
    test("should list customers with default options", async () => {
      await customer.list();

      expect(mockCustomersList).toHaveBeenCalledTimes(1);
      const callArgs = getListCallArgs();
      expect(callArgs.page).toBe(1);
      expect(callArgs.limit).toBe(10);
    });

    test("should list customers with custom options", async () => {
      await customer.list({
        organizationId: "org_123",
        email: "test@example.com",
        query: "John",
        page: 2,
        limit: 20,
      });

      expect(mockCustomersList).toHaveBeenCalledTimes(1);
      const callArgs = getListCallArgs();
      expect(callArgs.organizationId).toBe("org_123");
      expect(callArgs.email).toBe("test@example.com");
      expect(callArgs.query).toBe("John");
      expect(callArgs.page).toBe(2);
      expect(callArgs.limit).toBe(20);
    });

    test("should return items and pagination", async () => {
      const result = await customer.list();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe("cust_123");
      expect(result.items[1]?.id).toBe("cust_456");
      expect(result.pagination.totalCount).toBe(50);
      expect(result.pagination.maxPage).toBe(5);
    });
  });

  describe("getByExternalId", () => {
    test("should get a customer by external ID", async () => {
      const result = await customer.getByExternalId("ext_123");

      expect(mockCustomersGetExternal).toHaveBeenCalledTimes(1);
      expect(mockCustomersGetExternal).toHaveBeenCalledWith({
        externalId: "ext_123",
      });
      expect(result.id).toBe("cust_123");
    });
  });

  describe("updateByExternalId", () => {
    test("should update a customer by external ID", async () => {
      const result = await customer.updateByExternalId("ext_123", {
        name: "Updated via External ID",
      });

      expect(mockCustomersUpdateExternal).toHaveBeenCalledTimes(1);
      const callArgs = getUpdateExternalCallArgs();
      expect(callArgs.externalId).toBe("ext_123");
      expect(callArgs.customerUpdate.name).toBe("Updated via External ID");
      expect(result).toBeDefined();
    });
  });

  describe("removeByExternalId", () => {
    test("should delete a customer by external ID", async () => {
      await customer.removeByExternalId("ext_123");

      expect(mockCustomersDeleteExternal).toHaveBeenCalledTimes(1);
      expect(mockCustomersDeleteExternal).toHaveBeenCalledWith({
        externalId: "ext_123",
      });
    });
  });

  describe("instance methods", () => {
    test("should have create method", () => {
      expect(typeof customer.create).toBe("function");
    });

    test("should have update method", () => {
      expect(typeof customer.update).toBe("function");
    });

    test("should have remove method", () => {
      expect(typeof customer.remove).toBe("function");
    });

    test("should have get method", () => {
      expect(typeof customer.get).toBe("function");
    });

    test("should have list method", () => {
      expect(typeof customer.list).toBe("function");
    });

    test("should have getByExternalId method", () => {
      expect(typeof customer.getByExternalId).toBe("function");
    });

    test("should have updateByExternalId method", () => {
      expect(typeof customer.updateByExternalId).toBe("function");
    });

    test("should have removeByExternalId method", () => {
      expect(typeof customer.removeByExternalId).toBe("function");
    });
  });
});
