---
name: rate-limit-create
description: Generate a new rate limiter class with its test file, then complete the generated code.
when_to_use: Use when creating a custom request throttling strategy that implements the IRateLimiter interface from @talosjs/rate-limit.
model: sonnet
effort: low
allowed-tools: Bash(talos rate-limit:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Rate Limiter Class

> **Run autonomously — do not ask the user questions;** pick the recommended option and proceed. **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` — check both roots before assuming a path is missing.

Generate a rate limiter class and test file, then complete the implementation. Follow the shared `talos-scaffold` skill workflow (run-from-root, `--name`/`--module` inference, lint/format, coding conventions); this covers only the rate-limit-specific parts.

## Steps

### 1. Infer the options, then run the generator

```bash
talos rate-limit:create --name=<name> --module=<module>
```

- `--name` — class name from the throttling strategy ("a sliding window limiter for the login route" → `Login`).

### 2. Complete the rate limiter class

Read `modules/<module>/src/rate-limit/<Name>RateLimiter.ts`, then implement:

- `check(key)` — increment the counter for `key` and return a `RateLimitResultType` (`limited`, `remaining`, `total`, `resetAt`)
- `isLimited(key)` — return whether `key` is over the limit (defaults to `check(key).limited`)
- `reset(key)` — clear the counter for `key`
- `getCount(key)` — return the current count for `key`
- Inject required dependencies (e.g. a Redis client, `AppEnv`) via the constructor

```typescript
import { decorator, RateLimitException } from "@talosjs/rate-limit";
import type { IRateLimiter, RateLimitResultType } from "@talosjs/rate-limit";

@decorator.rateLimit()
export class <Name>RateLimiter implements IRateLimiter {
  public async check(key: string): Promise<RateLimitResultType> {
    // Implement your throttling strategy here
  }

  public async isLimited(key: string): Promise<boolean> {
    const result = await this.check(key);

    return result.limited;
  }

  public async reset(key: string): Promise<boolean> {
    // Clear the counter for the key
  }

  public async getCount(key: string): Promise<number> {
    // Return the current count for the key
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/rate-limit/<Name>RateLimiter.spec.ts`:

**Coverage:** class identity (`name.endsWith("RateLimiter")`, is constructor), `check`/`isLimited`/`reset`/`getCount` exist and are functions, `check` returns a `RateLimitResultType` shape, `isLimited` mirrors `check().limited`, instance isolation.

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
