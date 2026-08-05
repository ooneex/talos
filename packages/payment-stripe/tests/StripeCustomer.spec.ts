import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { StripeClient } from "@/StripeClient";
import { StripeCustomer } from "@/StripeCustomer";

const mockCustomersCreate = mock(() => Promise.resolve(createMockCustomer()));
const mockCustomersUpdate = mock(() => Promise.resolve(createMockCustomer()));
const mockCustomersRetrieve = mock(() => Promise.resolve(createMockCustomer()));
const mockCustomersDel = mock(() => Promise.resolve({ id: "cus_test123", deleted: true }));
const mockCustomersList = mock(() => Promise.resolve(createMockCustomerList()));

function createMockClient() {
  return {
    sdk: {
      customers: {
        create: mockCustomersCreate,
        update: mockCustomersUpdate,
        retrieve: mockCustomersRetrieve,
        del: mockCustomersDel,
        list: mockCustomersList,
      },
    },
  } as unknown as StripeClient;
}

function createMockCustomer(overrides = {}) {
  return {
    id: "cus_test123",
    object: "customer",
    email: "customer@example.com",
    name: "John Doe",
    phone: "+1234567890",
    address: {
      line1: "123 Main St",
      line2: "Apt 4",
      city: "New York",
      state: "NY",
      postal_code: "10001",
      country: "US",
    },
    metadata: { source: "website" },
    created: 1704067200,
    deleted: undefined,
    ...overrides,
  };
}

function createMockCustomerList(overrides = {}) {
  return {
    data: [
      createMockCustomer(),
      createMockCustomer({ id: "cus_test456", email: "another@example.com", name: "Jane Smith" }),
    ],
    has_more: false,
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getCreateArgs = (): any => {
  const calls = mockCustomersCreate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getUpdateArgs = (): { id: string; params: any } => {
  const calls = mockCustomersUpdate.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return { id: calls[0]?.[0] as string, params: calls[0]?.[1] };
};

// biome-ignore lint/suspicious/noExplicitAny: Mock requires flexible typing
const getListArgs = (): any => {
  const calls = mockCustomersList.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error("No calls recorded");
  return calls[0]?.[0];
};

describe("StripeCustomer", () => {
  let customer: StripeCustomer;

  beforeEach(() => {
    customer = new StripeCustomer(createMockClient());
    mockCustomersCreate.mockClear();
    mockCustomersUpdate.mockClear();
    mockCustomersRetrieve.mockClear();
    mockCustomersDel.mockClear();
    mockCustomersList.mockClear();
    mockCustomersCreate.mockImplementation(() => Promise.resolve(createMockCustomer()));
    mockCustomersUpdate.mockImplementation(() => Promise.resolve(createMockCustomer()));
    mockCustomersRetrieve.mockImplementation(() => Promise.resolve(createMockCustomer()));
    mockCustomersDel.mockImplementation(() => Promise.resolve({ id: "cus_test123", deleted: true }));
    mockCustomersList.mockImplementation(() => Promise.resolve(createMockCustomerList()));
  });

  describe("create", () => {
    test("should create a customer successfully", async () => {
      const result = await customer.create({ email: "new@example.com" });

      expect(mockCustomersCreate).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("cus_test123");
      expect(result.email).toBe("customer@example.com");
    });

    test("should call API with correct email", async () => {
      await customer.create({ email: "test@example.com" });

      const args = getCreateArgs();
      expect(args.email).toBe("test@example.com");
    });

    test("should pass name, phone and metadata when provided", async () => {
      await customer.create({
        email: "test@example.com",
        name: "Test User",
        phone: "+33600000000",
        metadata: { tier: "premium" },
      });

      const args = getCreateArgs();
      expect(args.name).toBe("Test User");
      expect(args.phone).toBe("+33600000000");
      expect(args.metadata).toEqual({ tier: "premium" });
    });

    test("should convert billing address to Stripe format", async () => {
      await customer.create({
        email: "test@example.com",
        billingAddress: {
          line1: "456 Oak Ave",
          line2: "Suite 100",
          city: "Paris",
          state: "IDF",
          postalCode: "75001",
          country: "FR",
        },
      });

      const args = getCreateArgs();
      expect(args.address.line1).toBe("456 Oak Ave");
      expect(args.address.line2).toBe("Suite 100");
      expect(args.address.city).toBe("Paris");
      expect(args.address.state).toBe("IDF");
      expect(args.address.postal_code).toBe("75001");
      expect(args.address.country).toBe("FR");
    });

    test("should map response fields correctly", async () => {
      const result = await customer.create({ email: "test@example.com" });

      expect(result.id).toBe("cus_test123");
      expect(result.email).toBe("customer@example.com");
      expect(result.name).toBe("John Doe");
      expect(result.phone).toBe("+1234567890");
      expect(result.metadata).toEqual({ source: "website" });
      expect(result.createdAt).toEqual(new Date(1704067200 * 1000));
    });

    test("should map billing address in response", async () => {
      const result = await customer.create({ email: "test@example.com" });

      expect(result.billingAddress?.line1).toBe("123 Main St");
      expect(result.billingAddress?.line2).toBe("Apt 4");
      expect(result.billingAddress?.city).toBe("New York");
      expect(result.billingAddress?.state).toBe("NY");
      expect(result.billingAddress?.postalCode).toBe("10001");
      expect(result.billingAddress?.country).toBe("US");
    });

    test("should omit billingAddress when absent in response", async () => {
      mockCustomersCreate.mockImplementation(() => Promise.resolve(createMockCustomer({ address: null })));

      const result = await customer.create({ email: "test@example.com" });

      expect(result.billingAddress).toBeUndefined();
    });
  });

  describe("update", () => {
    test("should update a customer successfully", async () => {
      const result = await customer.update("cus_test123", { name: "Updated Name" });

      expect(mockCustomersUpdate).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    test("should call API with correct id and params", async () => {
      await customer.update("cus_test123", {
        email: "updated@example.com",
        name: "Updated User",
        metadata: { tier: "enterprise" },
      });

      const { id, params } = getUpdateArgs();
      expect(id).toBe("cus_test123");
      expect(params.email).toBe("updated@example.com");
      expect(params.name).toBe("Updated User");
      expect(params.metadata).toEqual({ tier: "enterprise" });
    });

    test("should convert billing address to Stripe format", async () => {
      await customer.update("cus_test123", {
        billingAddress: { line1: "789 New St", postalCode: "75002", country: "FR" },
      });

      const { params } = getUpdateArgs();
      expect(params.address.line1).toBe("789 New St");
      expect(params.address.postal_code).toBe("75002");
      expect(params.address.country).toBe("FR");
    });
  });

  describe("remove", () => {
    test("should delete a customer", async () => {
      await customer.remove("cus_test123");

      expect(mockCustomersDel).toHaveBeenCalledTimes(1);
      expect(mockCustomersDel).toHaveBeenCalledWith("cus_test123");
    });
  });

  describe("get", () => {
    test("should get a customer by ID", async () => {
      const result = await customer.get("cus_test123");

      expect(mockCustomersRetrieve).toHaveBeenCalledTimes(1);
      expect(mockCustomersRetrieve).toHaveBeenCalledWith("cus_test123");
      expect(result.id).toBe("cus_test123");
    });

    test("should return full customer data", async () => {
      const result = await customer.get("cus_test123");

      expect(result.email).toBe("customer@example.com");
      expect(result.name).toBe("John Doe");
    });

    test("should throw when customer is deleted", async () => {
      mockCustomersRetrieve.mockImplementation(() => Promise.resolve({ id: "cus_test123", deleted: true }) as never);

      await expect(customer.get("cus_test123")).rejects.toThrow("deleted");
    });
  });

  describe("list", () => {
    test("should list customers with default limit of 10", async () => {
      await customer.list();

      const args = getListArgs();
      expect(args.limit).toBe(10);
    });

    test("should pass email filter and custom limit", async () => {
      await customer.list({ email: "filter@example.com", limit: 25 });

      const args = getListArgs();
      expect(args.email).toBe("filter@example.com");
      expect(args.limit).toBe(25);
    });

    test("should pass startingAfter for pagination", async () => {
      await customer.list({ startingAfter: "cus_prev123" });

      const args = getListArgs();
      expect(args.starting_after).toBe("cus_prev123");
    });

    test("should return items and hasMore", async () => {
      const result = await customer.list();

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe("cus_test123");
      expect(result.items[1]?.id).toBe("cus_test456");
      expect(result.hasMore).toBe(false);
    });

    test("should indicate hasMore when more pages exist", async () => {
      mockCustomersList.mockImplementation(() => Promise.resolve(createMockCustomerList({ has_more: true })));

      const result = await customer.list();

      expect(result.hasMore).toBe(true);
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
  });
});
