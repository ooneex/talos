import { describe, expect, mock, test } from "bun:test";
import { Utf8 } from "apache-arrow";

// The base constructor resolves an embedding function from the lancedb
// registry — stub it so instantiating never reaches a real provider.
mock.module("@lancedb/lancedb/embedding", () => ({
  getRegistry: () => ({
    get: () => ({
      create: () => ({
        sourceField: (type: Utf8) => type,
        vectorField: () => new Utf8(),
      }),
    }),
  }),
  LanceSchema: (schema: Record<string, unknown>) => schema,
}));

const { AbstractVectorDatabase, VectorDatabase } = await import("@/index");

describe("VectorDatabase", () => {
  test("should be an AbstractVectorDatabase", () => {
    expect(new VectorDatabase()).toBeInstanceOf(AbstractVectorDatabase);
  });

  test("should expose an empty database uri", () => {
    expect(new VectorDatabase().getDatabaseUri()).toBe("");
  });

  test("should default to the qwen3 embedding model", () => {
    expect(new VectorDatabase().getEmbeddingModel()).toEqual({
      model: "qwen3-embedding-8b",
    });
  });

  test("should embed with openai when an embedding model override is passed", () => {
    const db = new VectorDatabase({ model: "text-embedding-3-small" });
    expect(db.getEmbeddingModel()).toEqual({
      model: "text-embedding-3-small",
    });
  });

  test("should declare a utf8 metadata field", () => {
    const schema = new VectorDatabase().getSchema();
    expect(Object.keys(schema)).toEqual(["metadata"]);
    expect(schema.metadata).toBeInstanceOf(Utf8);
  });
});
