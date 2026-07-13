---
name: seed-create
description: Generate a new database seed file with its test file, then complete the generated code. Use when creating seed data for populating the database using @talosjs/seeds.
allowed-tools: Bash(talos seed:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Seed

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a seed file and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, lint/format, and coding conventions); this skill covers only the seed-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos seed:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the seed class name, taken from the data it seeds (e.g., "a seed for demo users" → `DemoUser`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Seed` suffix automatically, so omit the suffix.

Also generates a `seeds.ts` root export file in the seeds directory.

### 2. Complete the seed data

Edit `modules/<module>/src/seeds/<name-seed>.yml`:

- Add seed data entries with hardcoded nanoid values for `id` fields — generate via `bun -e "import { random } from '@talosjs/utils'; console.log(random.nanoid())"`
- Do NOT use sequential IDs like `"item-1"`, `"item-2"`
- Ensure the same entity uses the same ID everywhere it appears

### 3. Complete the seed class

Read `modules/<module>/src/seeds/<Name>Seed.ts`, then implement:

- Import the relevant entity classes and repository
- Use `resolve()` from `@talosjs/container` to get the repository instance
- Map the imported YAML data to entity instances
- **Hash any credential/secret field** (passwords, API keys, tokens) with the framework's hashing utility before persisting — never store plaintext credentials, even in demo/dev seeds, since seed data can leak into other environments
- Use the repository to persist the entities

### 4. Complete the test file

Read and replace `modules/<module>/tests/seeds/<Name>Seed.spec.ts`:

**Coverage:** class identity (`name.endsWith("Seed")`, is constructor), `run` exists on prototype, `isActive` exists and returns `true` by default, `getDependencies` exists and returns an array, data YAML file exists, is non-empty, contains at least one entry, instance isolation.

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { <Name>Seed } from "@/seeds/<Name>Seed";

describe("<Name>Seed", () => {
  test("should have class name ending with 'Seed'", () => {
    expect(<Name>Seed.name.endsWith("Seed")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Seed).toBe("function");
  });

  test("should have 'run' method", () => {
    expect(typeof <Name>Seed.prototype.run).toBe("function");
  });

  test("should have 'isActive' method", () => {
    expect(typeof <Name>Seed.prototype.isActive).toBe("function");
  });

  test("'isActive' should return a boolean", () => {
    const seed = Object.create(<Name>Seed.prototype) as <Name>Seed;
    expect(typeof seed.isActive()).toBe("boolean");
  });

  test("'isActive' should return true by default", () => {
    const seed = Object.create(<Name>Seed.prototype) as <Name>Seed;
    expect(seed.isActive()).toBe(true);
  });

  test("should have 'getDependencies' method", () => {
    expect(typeof <Name>Seed.prototype.getDependencies).toBe("function");
  });

  test("'getDependencies' should return an array", () => {
    const seed = Object.create(<Name>Seed.prototype) as <Name>Seed;
    expect(Array.isArray(seed.getDependencies())).toBe(true);
  });

  test("should have a data yml file", () => {
    const dataFile = join(__dirname, "..", "src", "seeds", "<name-seed>.yml");
    expect(existsSync(dataFile)).toBe(true);
  });

  test("data yml file should not be empty", () => {
    const dataFile = join(__dirname, "..", "src", "seeds", "<name-seed>.yml");
    const content = readFileSync(dataFile, "utf-8");
    expect(content.trim().length).toBeGreaterThan(0);
  });

  test("data yml file should contain at least one entry", () => {
    const dataFile = join(__dirname, "..", "src", "seeds", "<name-seed>.yml");
    const content = readFileSync(dataFile, "utf-8");
    expect(content).toMatch(/^-\s/m);
  });

  test("should produce independent instances", () => {
    const a = Object.create(<Name>Seed.prototype) as <Name>Seed;
    const b = Object.create(<Name>Seed.prototype) as <Name>Seed;
    expect(a).not.toBe(b);
  });
});
```

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
