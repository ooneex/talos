import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Float32 } from "apache-arrow";
import type { OpenAIModelType } from "@/index";

const embeddingsCreate = mock(() =>
  Promise.resolve({
    data: [{ embedding: [0.1, 0.2, 0.3] }],
  }),
);

const constructorCalls: unknown[] = [];

class MockOpenAI {
  public embeddings = { create: embeddingsCreate };

  public constructor(options: unknown) {
    constructorCalls.push(options);
  }
}

mock.module("openai", () => ({ default: MockOpenAI }));

const { OpenAIEmbeddingFunction } = await import("../src/OpenAIEmbeddingFunction.ts");

describe("OpenAIEmbeddingFunction", () => {
  beforeEach(() => {
    embeddingsCreate.mockClear();
    constructorCalls.length = 0;
    process.env.OPENROUTER_API_KEY = "env-key";
  });

  test("should throw when no api key is available", () => {
    delete process.env.OPENROUTER_API_KEY;

    expect(() => new OpenAIEmbeddingFunction({ model: "text-embedding-ada-002" })).toThrow(
      "OpenRouter API key is required",
    );
  });

  test("should read the api key from OPENROUTER_API_KEY and default the model", () => {
    new OpenAIEmbeddingFunction();

    expect(constructorCalls).toEqual([{ apiKey: "env-key", baseURL: "https://openrouter.ai/api/v1" }]);
  });

  test("should expose the api key as a sensitive key", () => {
    const fn = new OpenAIEmbeddingFunction();
    // biome-ignore lint/suspicious/noExplicitAny: access protected member for testing
    expect((fn as any).getSensitiveKeys()).toEqual(["apiKey"]);
  });

  test("should return 1536 dimensions for text-embedding-ada-002", () => {
    const fn = new OpenAIEmbeddingFunction({ model: "text-embedding-ada-002" });
    expect(fn.ndims()).toBe(1536);
  });

  test("should return 3072 dimensions for text-embedding-3-large", () => {
    const fn = new OpenAIEmbeddingFunction({ model: "text-embedding-3-large" });
    expect(fn.ndims()).toBe(3072);
  });

  test("should return 1536 dimensions for text-embedding-3-small", () => {
    const fn = new OpenAIEmbeddingFunction({ model: "text-embedding-3-small" });
    expect(fn.ndims()).toBe(1536);
  });

  test("should throw for an unknown model", () => {
    const fn = new OpenAIEmbeddingFunction({ model: "unknown-model" as OpenAIModelType });
    expect(() => fn.ndims()).toThrow("Unknown model: unknown-model");
  });

  test("should return a Float32 embedding data type", () => {
    const fn = new OpenAIEmbeddingFunction();
    expect(fn.embeddingDataType()).toBeInstanceOf(Float32);
  });

  test("should compute source embeddings for a batch of text", async () => {
    const fn = new OpenAIEmbeddingFunction();
    const embeddings = await fn.computeSourceEmbeddings(["hello", "world"]);

    expect(embeddings).toEqual([[0.1, 0.2, 0.3]]);
    expect(embeddingsCreate).toHaveBeenCalledWith({
      model: "openai/text-embedding-3-large",
      input: ["hello", "world"],
    });
  });

  test("should compute a query embedding", async () => {
    const fn = new OpenAIEmbeddingFunction();
    const embedding = await fn.computeQueryEmbeddings("hello");

    expect(embedding).toEqual([0.1, 0.2, 0.3]);
    expect(embeddingsCreate).toHaveBeenCalledWith({ model: "openai/text-embedding-3-large", input: "hello" });
  });

  test("should throw when OpenRouter returns no embedding for a query", async () => {
    embeddingsCreate.mockReturnValueOnce(Promise.resolve({ data: [] }));

    const fn = new OpenAIEmbeddingFunction();

    await expect(fn.computeQueryEmbeddings("hello")).rejects.toThrow("OpenRouter returned no embedding for the query");
  });
});
