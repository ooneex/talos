import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Float32 } from "apache-arrow";
import type { QwenModelType } from "@/index";

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

const { QwenEmbeddingFunction } = await import("../src/QwenEmbeddingFunction.ts");

describe("QwenEmbeddingFunction", () => {
  beforeEach(() => {
    embeddingsCreate.mockClear();
    constructorCalls.length = 0;
    process.env.OPENROUTER_API_KEY = "env-key";
  });

  test("should throw when no api key is available", () => {
    delete process.env.OPENROUTER_API_KEY;

    expect(() => new QwenEmbeddingFunction({ model: "qwen3-embedding-8b" })).toThrow("OpenRouter API key is required");
  });

  test("should read the api key from OPENROUTER_API_KEY and default the model", () => {
    new QwenEmbeddingFunction();

    expect(constructorCalls).toEqual([{ apiKey: "env-key", baseURL: "https://openrouter.ai/api/v1" }]);
  });

  test("should expose the api key as a sensitive key", () => {
    const fn = new QwenEmbeddingFunction();
    // biome-ignore lint/suspicious/noExplicitAny: access protected member for testing
    expect((fn as any).getSensitiveKeys()).toEqual(["apiKey"]);
  });

  test("should return 4096 dimensions for qwen3-embedding-8b", () => {
    const fn = new QwenEmbeddingFunction({ model: "qwen3-embedding-8b" });
    expect(fn.ndims()).toBe(4096);
  });

  test("should throw for an unknown model", () => {
    const fn = new QwenEmbeddingFunction({ model: "unknown-model" as QwenModelType });
    expect(() => fn.ndims()).toThrow("Unknown model: unknown-model");
  });

  test("should return a Float32 embedding data type", () => {
    const fn = new QwenEmbeddingFunction();
    expect(fn.embeddingDataType()).toBeInstanceOf(Float32);
  });

  test("should compute source embeddings for a batch of text", async () => {
    const fn = new QwenEmbeddingFunction();
    const embeddings = await fn.computeSourceEmbeddings(["hello", "world"]);

    expect(embeddings).toEqual([[0.1, 0.2, 0.3]]);
    expect(embeddingsCreate).toHaveBeenCalledWith({ model: "qwen/qwen3-embedding-8b", input: ["hello", "world"] });
  });

  test("should compute a query embedding", async () => {
    const fn = new QwenEmbeddingFunction();
    const embedding = await fn.computeQueryEmbeddings("hello");

    expect(embedding).toEqual([0.1, 0.2, 0.3]);
    expect(embeddingsCreate).toHaveBeenCalledWith({ model: "qwen/qwen3-embedding-8b", input: "hello" });
  });

  test("should throw when OpenRouter returns no embedding for a query", async () => {
    embeddingsCreate.mockReturnValueOnce(Promise.resolve({ data: [] }));

    const fn = new QwenEmbeddingFunction();

    await expect(fn.computeQueryEmbeddings("hello")).rejects.toThrow("OpenRouter returned no embedding for the query");
  });
});
