---
name: entity-create
description: Generate a new TypeORM entity class with its test file, then complete the generated code. Use when creating a new database entity with columns, relations, and table mapping.
allowed-tools: Bash(talos entity:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>] [--table-name=<table_name>]
disallowed-tools: AskUserQuestion
---

# Make Entity Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate an entity class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the entity-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos entity:create --name=<name> --module=<module> --table-name=<table_name>
```

**Inferring options from the user's request:**

- `--name` — the entity class name, taken from the domain object (e.g., "an entity for user profiles" → `UserProfile`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Entity` suffix automatically, so omit the suffix.
- `--table-name` — optional; pass only if the user names a specific table. Otherwise omit and it defaults to the snake_case pluralized form (e.g., `UserProfile` → `user_profiles`).

### 2. Complete the entity class

Read `modules/<module>/src/entities/<Name>Entity.ts`, then implement:

- Add entity-specific columns with `@Column` decorators
- Add relations if needed (`@ManyToOne`, `@OneToMany`, `@ManyToMany`, etc.)
- Remove scaffolded columns that are not relevant
- Adjust column types, lengths, and constraints
- Declare the primary key with an explicit `nullable: false` and auto-generate its value with `random.id()`, e.g.:

  ```typescript
  @PrimaryColumn({ name: "id", type: "varchar", length: 20, nullable: false })
  id: string = random.id();
  ```

```typescript
import type { LocaleType } from "@talosjs/translation";
import { random } from "@talosjs/utils/random";
import { Column, CreateDateColumn, DeleteDateColumn, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({
  name: "<table_name>",
})
export class <Name>Entity extends BaseEntity {
  @PrimaryColumn({ name: "id", type: "varchar", length: 20, nullable: false })
  id: string = random.id();

  @Column({ name: "is_locked", type: "boolean", default: false, nullable: true })
  public isLocked?: boolean | null;

  @Column({ name: "locked_at", type: "timestamptz", nullable: true })
  public lockedAt?: Date | null;

  @Column({ name: "is_blocked", type: "boolean", default: false, nullable: true })
  public isBlocked?: boolean | null;

  @Column({ name: "blocked_at", type: "timestamptz", nullable: true })
  public blockedAt?: Date | null;

  @Column({ name: "block_reason", type: "text", nullable: true })
  public blockReason?: string | null;

  @Column({ name: "is_public", type: "boolean", default: true, nullable: true })
  public isPublic?: boolean | null;

  @Column({ name: "lang", type: "varchar", length: 10, nullable: true })
  public lang?: LocaleType | null;

  @CreateDateColumn({ name: "created_at", nullable: true })
  createdAt?: Date | null;

  @UpdateDateColumn({ name: "updated_at", nullable: true })
  updatedAt?: Date | null;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt?: Date | null;
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/entities/<Name>Entity.spec.ts`:

**Coverage:** class identity (`name.endsWith("Entity")`, is constructor), ID auto-generation (string, 20 chars, unique per instance), each column property (exists via `"prop" in entity`, default value correct, accepts valid values, accepts `null` for nullable, accepts `undefined` for optional), boolean columns with defaults (verify `false`/`true` and toggling), date/timestamp columns (start as `undefined`, accept `Date`, accept `null`), instance isolation (no shared property state).

Remove test blocks for removed columns. Add new test blocks for each custom column. For relation properties, add a test that the property exists and defaults to `undefined`.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Entity } from "@/entities/<Name>Entity";

describe("<Name>Entity", () => {
  // --- Class identity ---

  test("should have class name ending with 'Entity'", () => {
    expect(<Name>Entity.name.endsWith("Entity")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Entity).toBe("function");
  });

  // --- ID ---

  test("should auto-generate an id for 'id'", () => {
    const entity = new <Name>Entity();
    expect(entity.id).toBeDefined();
    expect(typeof entity.id).toBe("string");
    expect(entity.id.length).toBe(20);
  });

  test("should generate a unique 'id' for each instance", () => {
    const a = new <Name>Entity();
    const b = new <Name>Entity();
    expect(a.id).not.toBe(b.id);
  });

  // --- isLocked ---

  test("should have 'isLocked' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("isLocked" in entity).toBe(true);
    expect(entity.isLocked).toBeUndefined();
  });

  test("should accept true for 'isLocked'", () => {
    const entity = new <Name>Entity();
    entity.isLocked = true;
    expect(entity.isLocked).toBe(true);
  });

  test("should accept false for 'isLocked'", () => {
    const entity = new <Name>Entity();
    entity.isLocked = false;
    expect(entity.isLocked).toBe(false);
  });

  test("should accept null for 'isLocked'", () => {
    const entity = new <Name>Entity();
    entity.isLocked = null;
    expect(entity.isLocked).toBeNull();
  });

  // --- lockedAt ---

  test("should have 'lockedAt' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("lockedAt" in entity).toBe(true);
    expect(entity.lockedAt).toBeUndefined();
  });

  test("should accept a Date for 'lockedAt'", () => {
    const entity = new <Name>Entity();
    const date = new Date("2025-01-01T00:00:00Z");
    entity.lockedAt = date;
    expect(entity.lockedAt).toEqual(date);
  });

  test("should accept null for 'lockedAt'", () => {
    const entity = new <Name>Entity();
    entity.lockedAt = null;
    expect(entity.lockedAt).toBeNull();
  });

  // --- isBlocked ---

  test("should have 'isBlocked' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("isBlocked" in entity).toBe(true);
    expect(entity.isBlocked).toBeUndefined();
  });

  test("should accept true for 'isBlocked'", () => {
    const entity = new <Name>Entity();
    entity.isBlocked = true;
    expect(entity.isBlocked).toBe(true);
  });

  test("should accept null for 'isBlocked'", () => {
    const entity = new <Name>Entity();
    entity.isBlocked = null;
    expect(entity.isBlocked).toBeNull();
  });

  // --- blockedAt ---

  test("should have 'blockedAt' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("blockedAt" in entity).toBe(true);
    expect(entity.blockedAt).toBeUndefined();
  });

  test("should accept a Date for 'blockedAt'", () => {
    const entity = new <Name>Entity();
    const date = new Date("2025-06-15T12:00:00Z");
    entity.blockedAt = date;
    expect(entity.blockedAt).toEqual(date);
  });

  test("should accept null for 'blockedAt'", () => {
    const entity = new <Name>Entity();
    entity.blockedAt = null;
    expect(entity.blockedAt).toBeNull();
  });

  // --- blockReason ---

  test("should have 'blockReason' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("blockReason" in entity).toBe(true);
    expect(entity.blockReason).toBeUndefined();
  });

  test("should accept a string for 'blockReason'", () => {
    const entity = new <Name>Entity();
    entity.blockReason = "Violated terms of service";
    expect(entity.blockReason).toBe("Violated terms of service");
  });

  test("should accept null for 'blockReason'", () => {
    const entity = new <Name>Entity();
    entity.blockReason = null;
    expect(entity.blockReason).toBeNull();
  });

  // --- isPublic ---

  test("should have 'isPublic' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("isPublic" in entity).toBe(true);
    expect(entity.isPublic).toBeUndefined();
  });

  test("should accept true for 'isPublic'", () => {
    const entity = new <Name>Entity();
    entity.isPublic = true;
    expect(entity.isPublic).toBe(true);
  });

  test("should accept false for 'isPublic'", () => {
    const entity = new <Name>Entity();
    entity.isPublic = false;
    expect(entity.isPublic).toBe(false);
  });

  test("should accept null for 'isPublic'", () => {
    const entity = new <Name>Entity();
    entity.isPublic = null;
    expect(entity.isPublic).toBeNull();
  });

  // --- lang ---

  test("should have 'lang' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("lang" in entity).toBe(true);
    expect(entity.lang).toBeUndefined();
  });

  test("should accept a locale string for 'lang'", () => {
    const entity = new <Name>Entity();
    entity.lang = "en";
    expect(entity.lang).toBe("en");
  });

  test("should accept null for 'lang'", () => {
    const entity = new <Name>Entity();
    entity.lang = null;
    expect(entity.lang).toBeNull();
  });

  // --- createdAt / updatedAt / deletedAt ---

  test("should have 'createdAt' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("createdAt" in entity).toBe(true);
    expect(entity.createdAt).toBeUndefined();
  });

  test("should accept a Date for 'createdAt'", () => {
    const entity = new <Name>Entity();
    const date = new Date();
    entity.createdAt = date;
    expect(entity.createdAt).toEqual(date);
  });

  test("should have 'updatedAt' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("updatedAt" in entity).toBe(true);
    expect(entity.updatedAt).toBeUndefined();
  });

  test("should accept a Date for 'updatedAt'", () => {
    const entity = new <Name>Entity();
    const date = new Date();
    entity.updatedAt = date;
    expect(entity.updatedAt).toEqual(date);
  });

  test("should have 'deletedAt' defaulting to undefined", () => {
    const entity = new <Name>Entity();
    expect("deletedAt" in entity).toBe(true);
    expect(entity.deletedAt).toBeUndefined();
  });

  test("should accept a Date for 'deletedAt'", () => {
    const entity = new <Name>Entity();
    const date = new Date();
    entity.deletedAt = date;
    expect(entity.deletedAt).toEqual(date);
  });

  test("should accept null for 'deletedAt' (soft-delete reset)", () => {
    const entity = new <Name>Entity();
    entity.deletedAt = null;
    expect(entity.deletedAt).toBeNull();
  });

  // --- Instance isolation ---

  test("should not share property state between instances", () => {
    const a = new <Name>Entity();
    const b = new <Name>Entity();
    a.isLocked = true;
    expect(b.isLocked).toBeUndefined();
  });
});
```

### 4. Register the entity

Add `<Name>Entity` to the `entities` array in `src/<PascalModuleName>Module.ts` (see `talos-scaffold` for the `ModuleType` shape).

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
