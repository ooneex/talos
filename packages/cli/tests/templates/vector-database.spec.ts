import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../src/templates");

describe("vector-database.txt", () => {
  const file = Bun.file(join(templatesDir, "vector-database.txt"));

  test("should exist", async () => {
    expect(await file.exists()).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await file.text();
    expect(content).toContain("{{NAME}}");
  });

  test("should contain vectorDatabase decorator", async () => {
    const content = await file.text();
    expect(content).toContain("@decorator.vectorDatabase()");
  });

  test("should extend AbstractVectorDatabase", async () => {
    const content = await file.text();
    expect(content).toContain("extends VectorDatabase");
  });

  test("should have getDatabaseUri method", async () => {
    const content = await file.text();
    expect(content).toContain("getDatabaseUri");
  });

  test("should have getEmbeddingModel method", async () => {
    const content = await file.text();
    expect(content).toContain("getEmbeddingModel");
  });

  test("should have getSchema method", async () => {
    const content = await file.text();
    expect(content).toContain("getSchema");
  });

  test("should import from @talosjs/rag", async () => {
    const content = await file.text();
    expect(content).toContain("@talosjs/rag");
  });

  test("should import from apache-arrow", async () => {
    const content = await file.text();
    expect(content).toContain("apache-arrow");
  });
});

describe("vector-database.test.txt", () => {
  const file = Bun.file(join(templatesDir, "vector-database.test.txt"));

  test("should exist", async () => {
    expect(await file.exists()).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await file.text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{MODULE}}");
  });

  test("should use @module import path", async () => {
    const content = await file.text();
    expect(content).toContain("@module/{{MODULE}}/databases/{{NAME}}VectorDatabase");
  });

  test("should contain test imports", async () => {
    const content = await file.text();
    expect(content).toContain("describe");
    expect(content).toContain("expect");
    expect(content).toContain("test");
  });

  test("should test getDatabaseUri method", async () => {
    const content = await file.text();
    expect(content).toContain("getDatabaseUri");
  });

  test("should test getEmbeddingModel method", async () => {
    const content = await file.text();
    expect(content).toContain("getEmbeddingModel");
  });

  test("should test getSchema method", async () => {
    const content = await file.text();
    expect(content).toContain("getSchema");
  });
});
