import { describe, expect, mock, test } from "bun:test";
import { VectorTable } from "@/index";

const mockReranker = { rerank: mock() };

mock.module("@lancedb/lancedb", () => ({
  rerankers: {
    RRFReranker: {
      create: mock(() => Promise.resolve(mockReranker)),
    },
  },
  Index: {
    btree: mock(() => ({ type: "btree" })),
    bitmap: mock(() => ({ type: "bitmap" })),
    labelList: mock(() => ({ type: "labelList" })),
    ivfPq: mock(() => ({ type: "ivfPq" })),
  },
}));

type TestData = { metadata: { category: string; score: number } };

const createMockVectorQuery = () => {
  const query: Record<string, ReturnType<typeof mock>> = {};

  query.rerank = mock(() => query);
  query.limit = mock(() => query);
  query.nprobes = mock(() => query);
  query.refineFactor = mock(() => query);
  query.fastSearch = mock(() => query);
  query.select = mock(() => query);
  query.where = mock(() => query);
  query.toArray = mock(() => Promise.resolve([{ id: "1", text: "hello", metadata: { category: "books", score: 9 } }]));
  query.explainPlan = mock(() => Promise.resolve("ProjectionExec"));
  query.analyzePlan = mock(() => Promise.resolve("AnalyzePlan: 1ms"));

  return query;
};

const createMockQueryBuilder = (
  rows: unknown[] = [{ id: "1", text: "hello", metadata: { category: "books", score: 9 } }],
) => {
  const q: Record<string, ReturnType<typeof mock>> = {};
  q.where = mock(() => q);
  q.limit = mock(() => q);
  q.select = mock(() => q);
  q.toArray = mock(() => Promise.resolve(rows));
  return q;
};

const createMockTable = (queryRows?: unknown[]) => ({
  add: mock((..._args: unknown[]) => Promise.resolve()),
  createIndex: mock((..._args: unknown[]) => Promise.resolve()),
  search: mock((..._args: unknown[]) => createMockVectorQuery()),
  query: mock(() => createMockQueryBuilder(queryRows)),
});

describe("VectorTable", () => {
  describe("add", () => {
    test("should add data to the table", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);
      const data = [{ id: "1", text: "hello", metadata: { category: "books", score: 9 } }];

      const result = await table.add(data);

      expect(mockTable.add).toHaveBeenCalledWith(data);
      expect(result).toBe(table);
    });
  });

  describe("findById", () => {
    test("should return matching row by id", async () => {
      const row = { id: "abc", text: "hello", metadata: { category: "books", score: 9 } };
      const mockTable = createMockTable([row]);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const result = await table.findById("abc");

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.where).toHaveBeenCalledWith("id = 'abc'");
      expect(q.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(row);
    });

    test("should return null when no row matches", async () => {
      const mockTable = createMockTable([]);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const result = await table.findById("missing");

      expect(result).toBeNull();
    });

    test("should escape single quotes in id", async () => {
      const mockTable = createMockTable([]);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findById("o'brien");

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.where).toHaveBeenCalledWith("id = 'o''brien'");
    });

    test("should apply select and always include id", async () => {
      const mockTable = createMockTable([]);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findById("1", { select: ["text", "category"] });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.select).toHaveBeenCalledWith(["id", "text", "metadata.category"]);
    });

    test("should not call select when option is omitted", async () => {
      const mockTable = createMockTable([]);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findById("1");

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.select).not.toHaveBeenCalled();
    });
  });

  describe("findBy", () => {
    test("should filter by a string metadata field", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findBy({ category: "books" });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.where).toHaveBeenCalledWith("metadata.category = 'books'");
      expect(q.limit).toHaveBeenCalledWith(10);
    });

    test("should filter by a number metadata field", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findBy({ score: 9 });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.where).toHaveBeenCalledWith("metadata.score = 9");
    });

    test("should join multiple fields with AND", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findBy({ category: "books", score: 9 });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.where).toHaveBeenCalledWith("metadata.category = 'books' AND metadata.score = 9");
    });

    test("should apply custom limit", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findBy({ category: "books" }, { limit: 5 });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.limit).toHaveBeenCalledWith(5);
    });

    test("should apply select and always include id", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findBy({ category: "books" }, { select: ["category"] });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.select).toHaveBeenCalledWith(["id", "metadata.category"]);
    });

    test("should escape single quotes in string values", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findBy({ category: "cook's" });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.where).toHaveBeenCalledWith("metadata.category = 'cook''s'");
    });

    test("should skip undefined values", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findBy({ category: "books", score: undefined });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.where).toHaveBeenCalledWith("metadata.category = 'books'");
    });

    test("should return rows from toArray", async () => {
      const row = { id: "1", text: "hello", metadata: { category: "books", score: 9 } };
      const mockTable = createMockTable([row]);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const results = await table.findBy({ category: "books" });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      expect(results).toEqual([row] as any);
    });
  });

  describe("findOneBy", () => {
    test("should return first matching row", async () => {
      const row = { id: "1", text: "hello", metadata: { category: "books", score: 9 } };
      const mockTable = createMockTable([row]);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const result = await table.findOneBy({ category: "books" });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(row);
    });

    test("should return null when no row matches", async () => {
      const mockTable = createMockTable([]);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const result = await table.findOneBy({ category: "missing" });

      expect(result).toBeNull();
    });

    test("should apply select and always include id", async () => {
      const mockTable = createMockTable([]);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.findOneBy({ category: "books" }, { select: ["text", "category"] });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const q = (mockTable.query.mock.results[0] as any).value;
      expect(q.select).toHaveBeenCalledWith(["id", "text", "metadata.category"]);
    });
  });

  describe("createIndex", () => {
    test("should create a scalar index on a column", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const result = await table.createIndex("category");

      expect(mockTable.createIndex).toHaveBeenCalledWith("category", undefined);
      expect(result).toBe(table);
    });

    test("should create a scalar index with config options", async () => {
      const { Index } = await import("@lancedb/lancedb");
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);
      const config = { config: Index.btree() };

      const result = await table.createIndex("category", config);

      expect(mockTable.createIndex).toHaveBeenCalledWith("category", config);
      expect(result).toBe(table);
    });
  });

  describe("createVectorIndex", () => {
    test("should create IVF PQ vector index on default column", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const result = await table.createVectorIndex();

      expect(mockTable.createIndex).toHaveBeenCalled();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const call = mockTable.createIndex.mock.lastCall as any[];
      expect(call?.[0]).toBe("vector");
      expect(result).toBe(table);
    });

    test("should create vector index on custom column", async () => {
      const mockTable = createMockTable();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.createVectorIndex("custom_vector");

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const call = mockTable.createIndex.mock.lastCall as any[];
      expect(call?.[0]).toBe("custom_vector");
    });
  });

  describe("search", () => {
    test("should perform hybrid search with defaults", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const results = await table.search("hello world");

      expect(mockTable.search).toHaveBeenCalledWith("hello world", "hybrid", "text");
      expect(mockQuery.rerank).toHaveBeenCalled();
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(mockQuery.fastSearch).toHaveBeenCalled();
      expect(mockQuery.toArray).toHaveBeenCalled();
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      expect(results).toEqual([{ id: "1", text: "hello", metadata: { category: "books", score: 9 } }] as any);
    });

    test("should apply custom limit", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.search("query", { limit: 5 });

      expect(mockQuery.limit).toHaveBeenCalledWith(5);
    });

    test("should apply select columns with metadata prefix", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.search("query", { select: ["id", "category"] });

      expect(mockQuery.select).toHaveBeenCalledWith(["id", "metadata.category"]);
    });

    test("should always include id in select even when omitted", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.search("query", { select: ["text", "category"] });

      expect(mockQuery.select).toHaveBeenCalledWith(["id", "text", "metadata.category"]);
    });

    test("should keep id and text columns unprefixed in select", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.search("query", { select: ["id", "text"] });

      expect(mockQuery.select).toHaveBeenCalledWith(["id", "text"]);
    });

    test("should apply filter with metadata prefix", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.search("query", { filter: { field: "category", op: "=", value: "books" } });

      expect(mockQuery.where).toHaveBeenCalledWith("metadata.category = 'books'");
    });

    test("should apply nprobes option", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.search("query", { nprobes: 20 });

      expect(mockQuery.nprobes).toHaveBeenCalledWith(20);
    });

    test("should apply refineFactor option", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.search("query", { refineFactor: 10 });

      expect(mockQuery.refineFactor).toHaveBeenCalledWith(10);
    });

    test("should skip fastSearch when disabled", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.search("query", { fastSearch: false });

      expect(mockQuery.fastSearch).not.toHaveBeenCalled();
    });

    test("should not call select or where when not provided", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.search("query");

      expect(mockQuery.select).not.toHaveBeenCalled();
      expect(mockQuery.where).not.toHaveBeenCalled();
    });
  });

  describe("explainPlan", () => {
    test("should return query plan with defaults", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const plan = await table.explainPlan("query");

      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(mockQuery.explainPlan).toHaveBeenCalledWith(true);
      expect(plan).toBe("ProjectionExec");
    });

    test("should apply filter and custom options", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.explainPlan("query", {
        limit: 5,
        filter: { field: "score", op: ">", value: 3 },
        verbose: false,
      });

      expect(mockQuery.limit).toHaveBeenCalledWith(5);
      expect(mockQuery.where).toHaveBeenCalledWith("metadata.score > 3");
      expect(mockQuery.explainPlan).toHaveBeenCalledWith(false);
    });
  });

  describe("analyzePlan", () => {
    test("should return analyze plan with defaults", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      const plan = await table.analyzePlan("query");

      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(mockQuery.analyzePlan).toHaveBeenCalled();
      expect(plan).toBe("AnalyzePlan: 1ms");
    });

    test("should apply filter and custom limit", async () => {
      const mockTable = createMockTable();
      const mockQuery = createMockVectorQuery();
      mockTable.search.mockReturnValue(mockQuery);
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const table = new VectorTable<TestData>(mockTable as any);

      await table.analyzePlan("query", {
        limit: 20,
        filter: { field: "category", op: "LIKE", value: "%book%" },
      });

      expect(mockQuery.limit).toHaveBeenCalledWith(20);
      expect(mockQuery.where).toHaveBeenCalledWith("metadata.category LIKE '%book%'");
    });
  });
});
