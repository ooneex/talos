---
name: cache-create
description: Generate a new cache adapter class with its test file, then complete the generated code.
when_to_use: Use when creating a new cache adapter that implements the ICache interface from @talosjs/cache.
model: sonnet
effort: low
allowed-tools: Bash(talos cache:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Cache Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

Generate a cache class and test file, then complete the implementation. This covers only cache specifics.

**Rules that apply throughout:**
- **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.
- **Shared workflow:** follow the `talos-scaffold` skill for run-from-root, `--name`/`--module` inference, module registration, lint/format, and conventions.

## Steps

### 1. Infer options, then run the generator

```bash
talos cache:create --name=<name> --module=<module>
```

- `--name` — cache class name, from what is cached ("a cache for user sessions" → `UserSession`). Any casing; the CLI normalizes to PascalCase and appends the `Cache` suffix, so omit it.

### 2. Complete the cache class

Read `modules/<module>/src/cache/<Name>Cache.ts`, then implement:

- Implement `get`, `set`, `delete`, `has` with actual cache logic
- Replace `CacheException` throws with real operations
- Inject required dependencies (e.g. Redis client) via the constructor
- **For session/token or otherwise sensitive caches, always set an explicit `ttl`** so entries expire; don't cache secrets in plaintext (encrypt or store an opaque reference instead)

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

**Coverage:** class identity (`name.endsWith("Cache")`, is constructor); each method (`get`, `set`, `delete`, `has`) exists and returns a `Promise`, each rejects with `CacheException` before implementation; instance isolation. After implementing: add set→get round-trip, set→has, set→delete→has, and TTL tests.

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
