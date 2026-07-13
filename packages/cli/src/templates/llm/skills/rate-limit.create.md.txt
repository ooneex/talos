---
name: rate-limit-create
description: Generate a new rate limiter class with its test file, then complete the generated code. Use when creating a custom request throttling strategy that implements the IRateLimiter interface from @talosjs/rate-limit.
allowed-tools: Bash(talos rate-limit:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Rate Limiter Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a rate limiter class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, lint/format, and coding conventions); this skill covers only the rate-limit-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos rate-limit:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the rate limiter class name, taken from the throttling strategy (e.g., "a sliding window limiter for the login route" → `Login`).

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
