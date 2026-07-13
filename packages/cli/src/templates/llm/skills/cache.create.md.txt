---
name: cache-create
description: Generate a new cache adapter class with its test file, then complete the generated code. Use when creating a new cache adapter that implements the ICache interface from @talosjs/cache.
allowed-tools: Bash(talos cache:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Cache Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a cache class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the cache-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos cache:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the cache class name, taken from what is cached (e.g., "a cache for user sessions" → `UserSession`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Cache` suffix automatically, so omit the suffix.

### 2. Complete the cache class

Read `modules/<module>/src/cache/<Name>Cache.ts`, then implement:

- Implement `get`, `set`, `delete`, `has` with actual cache logic
- Replace `CacheException` throws with real operations
- Inject required dependencies (e.g., Redis client) via the constructor
- **For session/token or otherwise sensitive caches, always set an explicit `ttl`** so entries expire, and avoid caching secrets in plaintext (encrypt or store an opaque reference instead)

```typescript
import { CacheException, type ICache, decorator } from "@talosjs/cache";

@decorator.cache()
export class <Name>Cache implements ICache {
  public async get<T = unknown>(key: string): Promise<T | undefined> {
    throw new CacheException(`Failed to get key "${key}": Not implemented`);
  }

  public async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    throw new CacheException(`Failed to set key "${key}": Not implemented`);
  }

  public async delete(key: string): Promise<boolean> {
    throw new CacheException(`Failed to delete key "${key}": Not implemented`);
  }

  public async has(key: string): Promise<boolean> {
    throw new CacheException(`Failed to check if key "${key}" exists: Not implemented`);
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/cache/<Name>Cache.spec.ts`:

**Coverage:** class identity (`name.endsWith("Cache")`, is constructor), each method (`get`, `set`, `delete`, `has`) exists and returns a `Promise`, each rejects with `CacheException` before implementation. After implementing: add set→get round-trip, set→has, set→delete→has, and TTL tests. Instance isolation.

```typescript
import { CacheException } from "@talosjs/cache";
import { describe, expect, test } from "bun:test";
import { <Name>Cache } from "@/cache/<Name>Cache";

describe("<Name>Cache", () => {
  test("should have class name ending with 'Cache'", () => {
    expect(<Name>Cache.name.endsWith("Cache")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Cache).toBe("function");
  });

  test("should have 'get' method that returns a Promise", () => {
    const cache = new <Name>Cache();
    expect(typeof <Name>Cache.prototype.get).toBe("function");
    const result = cache.get("k");
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("should have 'set' method that returns a Promise", () => {
    const cache = new <Name>Cache();
    expect(typeof <Name>Cache.prototype.set).toBe("function");
    const result = cache.set("k", "v");
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("should have 'delete' method that returns a Promise", () => {
    const cache = new <Name>Cache();
    expect(typeof <Name>Cache.prototype.delete).toBe("function");
    const result = cache.delete("k");
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("should have 'has' method that returns a Promise", () => {
    const cache = new <Name>Cache();
    expect(typeof <Name>Cache.prototype.has).toBe("function");
    const result = cache.has("k");
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("'get' should reject with CacheException before implementation", async () => {
    const cache = new <Name>Cache();
    await expect(cache.get("key")).rejects.toBeInstanceOf(CacheException);
  });

  test("'set' should reject with CacheException before implementation", async () => {
    const cache = new <Name>Cache();
    await expect(cache.set("key", "value")).rejects.toBeInstanceOf(CacheException);
  });

  test("'delete' should reject with CacheException before implementation", async () => {
    const cache = new <Name>Cache();
    await expect(cache.delete("key")).rejects.toBeInstanceOf(CacheException);
  });

  test("'has' should reject with CacheException before implementation", async () => {
    const cache = new <Name>Cache();
    await expect(cache.has("key")).rejects.toBeInstanceOf(CacheException);
  });

  // Replace the four CacheException tests above with round-trip tests once implemented

  test("should produce independent instances", () => {
    const a = new <Name>Cache();
    const b = new <Name>Cache();
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
