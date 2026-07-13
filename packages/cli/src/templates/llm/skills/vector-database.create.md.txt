---
name: vector-database-create
description: Generate a new vector database class with its test file, then complete the generated code. Use when creating a new vector database that extends VectorDatabase from @talosjs/rag.
allowed-tools: Bash(talos vector-database:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Vector Database Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a vector database class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the vector-database-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos vector-database:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the vector database class name, taken from what it indexes (e.g., "a vector store for embeddings" → `Embedding`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `VectorDatabase` suffix automatically, so omit the suffix.

### 2. Complete the vector database class

Read `modules/<module>/src/databases/<Name>VectorDatabase.ts`, then implement:

- Set `getDatabaseUri()` to the actual LanceDB database path
- Configure the embedding provider and model in `getEmbeddingModel()`
- Define custom data fields in `DataType` and map them in `getSchema()`

```typescript
import { type EmbeddingModelType, type EmbeddingProviderType, type FieldValueType, VectorDatabase, decorator } from "@talosjs/rag";
import { Utf8 } from "apache-arrow";

type DataType = {
  name: string;
};

@decorator.vectorDatabase()
export class <Name>VectorDatabase extends VectorDatabase<DataType> {
  public getDatabaseUri(): string {
    return "";
  }

  public getEmbeddingModel(): { provider: EmbeddingProviderType; model: EmbeddingModelType["model"] } {
    return { provider: "openai", model: "text-embedding-ada-002" };
  }

  public getSchema(): { [K in keyof DataType]: FieldValueType } {
    return {
      name: new Utf8(),
    };
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/databases/<Name>VectorDatabase.spec.ts`:

**Coverage:** class identity (`name.endsWith("VectorDatabase")`, is constructor), `getDatabaseUri` exists and returns a string, `getEmbeddingModel` exists and returns `{ provider, model }` (both non-empty strings, provider is a recognized value), `getSchema` exists and returns a non-empty object with keys matching `DataType` fields, instance isolation.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>VectorDatabase } from "@/databases/<Name>VectorDatabase";

describe("<Name>VectorDatabase", () => {
  test("should have class name ending with 'VectorDatabase'", () => {
    expect(<Name>VectorDatabase.name.endsWith("VectorDatabase")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>VectorDatabase).toBe("function");
  });

  test("should have 'getDatabaseUri' method", () => {
    expect(typeof <Name>VectorDatabase.prototype.getDatabaseUri).toBe("function");
  });

  test("'getDatabaseUri' should return a string", () => {
    const db = new <Name>VectorDatabase();
    expect(typeof db.getDatabaseUri()).toBe("string");
  });

  test("should have 'getEmbeddingModel' method", () => {
    expect(typeof <Name>VectorDatabase.prototype.getEmbeddingModel).toBe("function");
  });

  test("'getEmbeddingModel' should return an object with 'provider' and 'model' keys", () => {
    const db = new <Name>VectorDatabase();
    const embedding = db.getEmbeddingModel();
    expect(embedding).toBeDefined();
    expect(typeof embedding.provider).toBe("string");
    expect(embedding.provider.length).toBeGreaterThan(0);
    expect(typeof embedding.model).toBe("string");
    expect(embedding.model.length).toBeGreaterThan(0);
  });

  test("'getEmbeddingModel' provider should be a recognized value", () => {
    const db = new <Name>VectorDatabase();
    const { provider } = db.getEmbeddingModel();
    expect(["openai", "cohere", "huggingface", "ollama"]).toContain(provider);
  });

  test("should have 'getSchema' method", () => {
    expect(typeof <Name>VectorDatabase.prototype.getSchema).toBe("function");
  });

  test("'getSchema' should return a non-empty object", () => {
    const db = new <Name>VectorDatabase();
    const schema = db.getSchema();
    expect(schema).toBeDefined();
    expect(Object.keys(schema).length).toBeGreaterThan(0);
  });

  test("'getSchema' keys should match the DataType fields", () => {
    const db = new <Name>VectorDatabase();
    const schema = db.getSchema();
    // Update this list to match the actual DataType fields defined in the class
    const expectedFields = ["name"];
    for (const field of expectedFields) {
      expect(Object.keys(schema)).toContain(field);
    }
  });

  test("should produce independent instances", () => {
    const a = new <Name>VectorDatabase();
    const b = new <Name>VectorDatabase();
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
