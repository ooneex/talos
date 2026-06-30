import { describe, expect, mock, test } from "bun:test";
import { Utf8 } from "apache-arrow";
import type { EmbeddingModelType, EmbeddingProviderType, FieldValueType } from "@/index";
import { VectorDatabaseException, VectorTable } from "@/index";
import { AbstractVectorDatabase } from "../src/AbstractVectorDatabase.ts";

// Mock embedding function
const mockEmbeddingFn = {
  sourceField: mock((type: Utf8) => type),
  vectorField: mock(() => new Utf8()),
};

// Mock registry
mock.module("@lancedb/lancedb/embedding", () => ({
  getRegistry: () => ({
    get: () => ({
      create: () => mockEmbeddingFn,
    }),
  }),
  LanceSchema: mock((schema: Record<string, unknown>) => schema),
}));

// Mock table
const mockTable = {
  add: mock(() => Promise.resolve()),
  createIndex: mock(() => Promise.resolve()),
  search: mock(),
};

// Mock connection
const mockConnection = {
  tableNames: mock(() => Promise.resolve([] as string[])),
  openTable: mock(() => Promise.resolve(mockTable)),
  createEmptyTable: mock((..._args: unknown[]) => Promise.resolve(mockTable)),
};

mock.module("@lancedb/lancedb", () => ({
  connect: mock(() => Promise.resolve(mockConnection)),
  Index: {
    btree: mock(() => ({})),
    fts: mock(() => ({})),
    ivfPq: mock(() => ({})),
  },
}));

type TestData = { metadata: { category: string } };

class TestVectorDatabase extends AbstractVectorDatabase<TestData> {
  getDatabaseUri(): string {
    return "/tmp/test-lancedb";
  }

  getEmbeddingModel(): { provider: EmbeddingProviderType; model: EmbeddingModelType["model"] } {
    return { provider: "openai", model: "text-embedding-3-small" };
  }

  getSchema(): { [K in keyof TestData]: FieldValueType } {
    return { metadata: new Utf8() };
  }
}

describe("AbstractVectorDatabase", () => {
  test("should throw VectorDatabaseException when getDatabase called before connect", () => {
    const db = new TestVectorDatabase();
    expect(() => db.getDatabase()).toThrow(VectorDatabaseException);
    expect(() => db.getDatabase()).toThrow("Database not connected. Call connect() first.");
  });

  test("should connect and return database connection", async () => {
    const db = new TestVectorDatabase();
    await db.connect();
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    expect(db.getDatabase()).toBe(mockConnection as any);
  });

  test("should return correct database URI", () => {
    const db = new TestVectorDatabase();
    expect(db.getDatabaseUri()).toBe("/tmp/test-lancedb");
  });

  test("should return correct embedding model", () => {
    const db = new TestVectorDatabase();
    expect(db.getEmbeddingModel()).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
    });
  });

  test("should return correct schema", () => {
    const db = new TestVectorDatabase();
    const schema = db.getSchema();
    expect(schema.metadata).toBeInstanceOf(Utf8);
  });

  test("should open existing table by name", async () => {
    mockConnection.tableNames.mockReturnValueOnce(Promise.resolve(["embeddings"]));

    const db = new TestVectorDatabase();
    await db.connect();
    const table = await db.open("embeddings");

    expect(table).toBeInstanceOf(VectorTable);
    expect(mockConnection.openTable).toHaveBeenCalledWith("embeddings");
  });

  test("should create new table when it does not exist", async () => {
    mockConnection.tableNames.mockReturnValueOnce(Promise.resolve([]));

    const db = new TestVectorDatabase();
    await db.connect();
    const table = await db.open("new_table");

    expect(table).toBeInstanceOf(VectorTable);
    expect(mockConnection.createEmptyTable).toHaveBeenCalled();
  });

  test("should create new table with custom mode option", async () => {
    mockConnection.tableNames.mockReturnValueOnce(Promise.resolve([]));

    const db = new TestVectorDatabase();
    await db.connect();
    await db.open("new_table", { mode: "create" });

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const lastCall = mockConnection.createEmptyTable.mock.lastCall as any[];
    expect(lastCall?.[0]).toBe("new_table");
    expect(lastCall?.[2]).toEqual({ mode: "create" });
  });

  test("should create indices on new table", async () => {
    mockConnection.tableNames.mockReturnValueOnce(Promise.resolve([]));
    mockTable.createIndex.mockClear();

    const db = new TestVectorDatabase();
    await db.connect();
    await db.open("indexed_table");

    expect(mockTable.createIndex).toHaveBeenCalledTimes(3);
  });
});
