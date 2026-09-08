import { describe, expect, mock, test } from "bun:test";
import {
  CloudflareVectorDatabase,
  CloudflareVectorizeClient,
  type CloudflareVectorizeVectorType,
  CloudflareVectorTable,
  type ITextEmbeddingFunction,
  VectorDatabaseException,
} from "@/index";

type TestDataType = {
  metadata: {
    category: string;
    priority?: number;
  };
};

type FetchCallType = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

const apiResponse = <ResultType>(
  result: ResultType,
  options: { status?: number; errors?: string[] } = {},
): Response => {
  const status = options.status ?? 200;
  const errors = (options.errors ?? []).map((message, index) => ({ code: 1000 + index, message }));

  return Response.json(
    { result, success: status >= 200 && status < 300, errors, messages: [] },
    { status, statusText: status === 200 ? "OK" : "Bad Request" },
  );
};

const createFetch = (responses: Response[]): { calls: FetchCallType[]; fetch: typeof globalThis.fetch } => {
  const calls: FetchCallType[] = [];
  const fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, ...(init ? { init } : {}) });
    const response = responses.shift();
    if (!response) {
      throw new Error("Unexpected request");
    }

    return Promise.resolve(response);
  });

  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
};

const createEmbedding = (dimensions = 3): ITextEmbeddingFunction => ({
  ndims: () => dimensions,
  computeSourceEmbeddings: mock((data: string[]) =>
    Promise.resolve(data.map((_, index) => [index + 0.1, index + 0.2, index + 0.3])),
  ),
  computeQueryEmbeddings: mock(() => Promise.resolve([0.1, 0.2, 0.3])),
});

const createClient = (responses: Response[]) => {
  const request = createFetch(responses);
  const client = new CloudflareVectorizeClient({
    accountId: "account/id",
    apiToken: "secret-token",
    fetch: request.fetch,
  });

  return { client, ...request };
};

describe("CloudflareVectorizeClient", () => {
  test("requires an account ID and API token", () => {
    expect(() => new CloudflareVectorizeClient({ accountId: "", apiToken: "token" })).toThrow(
      "Cloudflare account ID is required",
    );
    expect(() => new CloudflareVectorizeClient({ accountId: "account", apiToken: "" })).toThrow(
      "Cloudflare API token is required",
    );
  });

  test("lists indexes with the Vectorize V2 URL and bearer token", async () => {
    const indexes = [{ name: "documents", config: { dimensions: 3, metric: "cosine" as const } }];
    const { client, calls } = createClient([apiResponse(indexes)]);

    expect(await client.listIndexes()).toEqual(indexes);
    expect(String(calls[0]?.input)).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account%2Fid/vectorize/v2/indexes",
    );
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe("Bearer secret-token");
  });

  test("creates an index using its fixed vector configuration", async () => {
    const { client, calls } = createClient([apiResponse({ name: "documents" })]);

    await client.createIndex({ name: "documents", dimensions: 768, metric: "cosine", description: "Docs" });

    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      name: "documents",
      description: "Docs",
      config: { dimensions: 768, metric: "cosine" },
    });
  });

  test("uploads vectors as NDJSON", async () => {
    const { client, calls } = createClient([apiResponse({ mutationId: "mutation-1" })]);
    const vectors: CloudflareVectorizeVectorType[] = [
      { id: "one", values: [0.1, 0.2], metadata: { category: "docs" } },
      { id: "two", values: [0.3, 0.4] },
    ];

    expect(await client.upsert("docs/index", vectors)).toEqual({ mutationId: "mutation-1" });
    expect(String(calls[0]?.input)).toEndWith("/docs%2Findex/upsert");
    expect(new Headers(calls[0]?.init?.headers).get("Content-Type")).toBe("application/x-ndjson");
    expect(
      String(calls[0]?.init?.body)
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual(vectors);
  });

  test("reports Cloudflare API errors without exposing the token", async () => {
    const { client } = createClient([apiResponse(null, { status: 400, errors: ["vectorize.invalid_body_payload"] })]);

    const promise = client.listIndexes();
    await expect(promise).rejects.toThrow("vectorize.invalid_body_payload");
    await expect(promise).rejects.not.toThrow("secret-token");
  });

  test("wraps network and invalid JSON failures", async () => {
    const failingFetch = mock(() => Promise.reject(new Error("offline"))) as unknown as typeof globalThis.fetch;
    const client = new CloudflareVectorizeClient({ accountId: "account", apiToken: "token", fetch: failingFetch });

    await expect(client.listIndexes()).rejects.toMatchObject({ key: "VECTOR_DB_REQUEST_FAILED" });

    const invalid = createFetch([new Response("not json", { status: 502 })]);
    const invalidClient = new CloudflareVectorizeClient({
      accountId: "account",
      apiToken: "token",
      fetch: invalid.fetch,
    });
    await expect(invalidClient.listIndexes()).rejects.toMatchObject({ key: "VECTOR_DB_INVALID_RESPONSE" });
  });
});

describe("CloudflareVectorDatabase", () => {
  test("connects by listing indexes and exposes the API client", async () => {
    const request = createFetch([apiResponse([])]);
    const database = new CloudflareVectorDatabase<TestDataType>({
      accountId: "account",
      apiToken: "token",
      fetch: request.fetch,
      embeddingFunction: createEmbedding(),
    });

    expect(() => database.getDatabase()).toThrow(VectorDatabaseException);
    await database.connect();
    expect(database.getDatabase()).toBeInstanceOf(CloudflareVectorizeClient);
    expect(database.getDatabaseUri()).toEndWith("/accounts/account/vectorize/v2/indexes");
    expect(database.getEmbeddingModel()).toEqual({ model: "text-embedding-3-small" });
  });

  test("opens an existing compatible index without recreating it", async () => {
    const request = createFetch([
      apiResponse([]),
      apiResponse([{ name: "documents", config: { dimensions: 3, metric: "cosine" } }]),
    ]);
    const database = new CloudflareVectorDatabase<TestDataType>({
      accountId: "account",
      apiToken: "token",
      fetch: request.fetch,
      embeddingFunction: createEmbedding(),
    });

    await database.connect();
    const table = await database.open("documents");

    expect(table).toBeInstanceOf(CloudflareVectorTable);
    expect(request.calls).toHaveLength(2);
  });

  test("lists and deletes indexes after connecting", async () => {
    const indexes = [{ name: "documents", config: { dimensions: 3, metric: "cosine" as const } }];
    const request = createFetch([apiResponse([]), apiResponse(indexes), apiResponse({})]);
    const database = new CloudflareVectorDatabase<TestDataType>({
      accountId: "account",
      apiToken: "token",
      fetch: request.fetch,
      embeddingFunction: createEmbedding(),
    });

    await database.connect();
    expect(await database.listIndexes()).toEqual(indexes);
    expect(await database.deleteIndex("documents/archive")).toEqual({});
    expect(String(request.calls[2]?.input)).toEndWith("/documents%2Farchive");
    expect(request.calls[2]?.init?.method).toBe("DELETE");
  });

  test("creates a missing index using embedding dimensions", async () => {
    const request = createFetch([apiResponse([]), apiResponse([]), apiResponse({ name: "documents" })]);
    const database = new CloudflareVectorDatabase<TestDataType>({
      accountId: "account",
      apiToken: "token",
      fetch: request.fetch,
      embeddingFunction: createEmbedding(768),
    });

    await database.connect();
    await database.open("documents", { metric: "dot-product", description: "Knowledge base" });

    expect(JSON.parse(String(request.calls[2]?.init?.body))).toEqual({
      name: "documents",
      description: "Knowledge base",
      config: { dimensions: 768, metric: "dot-product" },
    });
  });

  test("rejects incompatible models and existing index dimensions", async () => {
    expect(
      () =>
        new CloudflareVectorDatabase<TestDataType>({
          accountId: "account",
          apiToken: "token",
          embeddingFunction: createEmbedding(1537),
        }),
    ).toThrow("supports at most 1536 dimensions");

    const request = createFetch([
      apiResponse([]),
      apiResponse([{ name: "documents", config: { dimensions: 2, metric: "cosine" } }]),
    ]);
    const database = new CloudflareVectorDatabase<TestDataType>({
      accountId: "account",
      apiToken: "token",
      fetch: request.fetch,
      embeddingFunction: createEmbedding(3),
    });

    await database.connect();
    await expect(database.open("documents")).rejects.toMatchObject({ key: "VECTOR_DB_DIMENSIONS_MISMATCH" });
  });
});

describe("CloudflareVectorTable", () => {
  test("embeds source text and inserts it with user metadata", async () => {
    const { client, calls } = createClient([apiResponse({ mutationId: "mutation-1" })]);
    const embedding = createEmbedding();
    const table = new CloudflareVectorTable<TestDataType>("documents", client, embedding);

    const mutation = await table.add([
      { id: "one", text: "First document", metadata: { category: "docs", priority: 1 } },
      { id: "two", text: "Second document", metadata: { category: "guides" }, namespace: "tenant-a" },
    ]);

    expect(mutation).toEqual({ mutationId: "mutation-1" });
    expect(embedding.computeSourceEmbeddings).toHaveBeenCalledWith(["First document", "Second document"]);
    const vectors = String(calls[0]?.init?.body)
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(vectors).toEqual([
      {
        id: "one",
        values: [0.1, 0.2, 0.3],
        metadata: { category: "docs", priority: 1, _talosText: "First document" },
      },
      {
        id: "two",
        values: [1.1, 1.2, 1.3],
        namespace: "tenant-a",
        metadata: { category: "guides", _talosText: "Second document" },
      },
    ]);
  });

  test("rejects empty writes and embedding count mismatches", async () => {
    const { client } = createClient([]);
    const table = new CloudflareVectorTable<TestDataType>("documents", client, createEmbedding());

    await expect(table.add([])).rejects.toMatchObject({ key: "VECTOR_DB_EMPTY_WRITE" });

    const embedding = createEmbedding();
    embedding.computeSourceEmbeddings = mock(() => Promise.resolve([]));
    const mismatched = new CloudflareVectorTable<TestDataType>("documents", client, embedding);
    await expect(
      mismatched.upsert([{ id: "one", text: "Text", metadata: { category: "docs" } }]),
    ).rejects.toMatchObject({ key: "VECTOR_DB_EMBEDDING_COUNT_MISMATCH" });
  });

  test("retrieves records and restores source text from internal metadata", async () => {
    const vector = {
      id: "one",
      values: [0.1, 0.2, 0.3],
      namespace: "tenant-a",
      metadata: { category: "docs", priority: 1, _talosText: "Document text" },
    };
    const { client } = createClient([apiResponse([vector]), apiResponse([])]);
    const table = new CloudflareVectorTable<TestDataType>("documents", client, createEmbedding());

    expect(await table.findById("one")).toEqual({
      id: "one",
      text: "Document text",
      metadata: { category: "docs", priority: 1 },
      namespace: "tenant-a",
      values: [0.1, 0.2, 0.3],
    });
    expect(await table.findById("missing")).toBeNull();
  });

  test("retrieves multiple records by ID", async () => {
    const vectors = [
      { id: "one", values: [0.1], metadata: { category: "docs", _talosText: "One" } },
      { id: "two", values: [0.2], metadata: { category: "guides", _talosText: "Two" } },
    ];
    const { client, calls } = createClient([apiResponse(vectors)]);
    const table = new CloudflareVectorTable<TestDataType>("documents", client, createEmbedding());

    expect(await table.getByIds(["one", "two"])).toEqual([
      { id: "one", text: "One", metadata: { category: "docs" }, values: [0.1] },
      { id: "two", text: "Two", metadata: { category: "guides" }, values: [0.2] },
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ ids: ["one", "two"] });
  });

  test("queries an embedded string with metadata filtering", async () => {
    const result = {
      count: 1,
      matches: [
        {
          id: "one",
          score: 0.99,
          metadata: { category: "docs", _talosText: "Document text" },
        },
      ],
    };
    const { client, calls } = createClient([apiResponse(result)]);
    const embedding = createEmbedding();
    const table = new CloudflareVectorTable<TestDataType>("documents", client, embedding);

    expect(await table.search("vector database", { topK: 3, filter: { category: "docs" } })).toEqual([
      { id: "one", text: "Document text", metadata: { category: "docs" }, score: 0.99 },
    ]);
    expect(embedding.computeQueryEmbeddings).toHaveBeenCalledWith("vector database");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      vector: [0.1, 0.2, 0.3],
      returnMetadata: "all",
      topK: 3,
      filter: { category: "docs" },
    });
  });

  test("delegates vector deletion and metadata index creation", async () => {
    const { client, calls } = createClient([
      apiResponse({ mutationId: "delete-1" }),
      apiResponse({ mutationId: "index-1" }),
    ]);
    const table = new CloudflareVectorTable<TestDataType>("documents", client, createEmbedding());

    expect(await table.deleteByIds(["one", "two"])).toEqual({ mutationId: "delete-1" });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ ids: ["one", "two"] });
    expect(await table.createMetadataIndex("category", "string")).toEqual({ mutationId: "index-1" });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ propertyName: "category", indexType: "string" });
  });
});
