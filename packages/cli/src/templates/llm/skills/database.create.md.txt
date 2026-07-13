---
name: database-create
description: Generate a new database class with its test file, then complete the generated code. Use when creating a new database adapter that extends TypeormDatabase from @talosjs/database.
allowed-tools: Bash(talos database:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Database Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a database class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the database-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos database:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the database class name, taken from its purpose (e.g., "a database for analytics" → `Analytics`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Database` suffix automatically, so omit the suffix.
- The database type (e.g. Postgres, MySQL) has no flag — the generator asks for it via an interactive prompt.

### 2. Complete the database class

Read `modules/<module>/src/databases/<Name>Database.ts`, then implement:

- Add entity imports and register them in the `entities` array
- Adjust the database path if needed (default is `"var/db"`)
- Configure DataSource options as appropriate

```typescript
import { DataSource } from "typeorm";
import { TypeormDatabase, decorator } from "@talosjs/database";

@decorator.database()
export class <Name>Database extends TypeormDatabase {
  public getSource(database?: string): DataSource {
    database = database || "var/db";

    this.source = new DataSource({
      synchronize: false,
      entities: [
        // TODO: Load your entities here
      ],
      enableWAL: true,
      busyErrorRetry: 2000,
      busyTimeout: 30_000,
      database,
      type: "sqlite",
    });

    return this.source;
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/databases/<Name>Database.spec.ts`:

**Coverage:** class identity (`name.endsWith("Database")`, is constructor), `getSource` exists and returns a `DataSource`-like object (has `initialize` and `destroy`), default path is `"var/db"`, custom path is used when provided, `synchronize` is `false`, `entities` is an array, instance isolation.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Database } from "@/databases/<Name>Database";

describe("<Name>Database", () => {
  test("should have class name ending with 'Database'", () => {
    expect(<Name>Database.name.endsWith("Database")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Database).toBe("function");
  });

  test("should have 'getSource' method", () => {
    expect(typeof <Name>Database.prototype.getSource).toBe("function");
  });

  test("'getSource' should return a DataSource-like object", () => {
    const db = new <Name>Database();
    const source = db.getSource();
    expect(source).toBeDefined();
    expect(typeof source.initialize).toBe("function");
    expect(typeof source.destroy).toBe("function");
  });

  test("'getSource' should use the default database path when no argument is given", () => {
    const db = new <Name>Database();
    const source = db.getSource();
    expect((source.options as any).database).toBe("var/db");
  });

  test("'getSource' should use the provided path when given", () => {
    const db = new <Name>Database();
    const source = db.getSource("custom/path/db");
    expect((source.options as any).database).toBe("custom/path/db");
  });

  test("'getSource' options should have synchronize disabled", () => {
    const db = new <Name>Database();
    const source = db.getSource();
    expect((source.options as any).synchronize).toBe(false);
  });

  test("'getSource' options should include the registered entities", () => {
    const db = new <Name>Database();
    const source = db.getSource();
    expect(Array.isArray((source.options as any).entities)).toBe(true);
  });

  test("should produce independent instances", () => {
    const a = new <Name>Database();
    const b = new <Name>Database();
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
