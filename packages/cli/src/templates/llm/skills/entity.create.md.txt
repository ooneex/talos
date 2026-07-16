---
name: entity-create
description: Generate a new TypeORM entity class with its test file, then complete the generated code.
when_to_use: Use when creating a new database entity with columns, relations, and table mapping.
model: sonnet
effort: medium
allowed-tools: Bash(talos entity:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>] [--table-name=<table_name>]
---

# Make Entity Class

> **Run autonomously — do not ask the user questions.** Pick the recommended option and proceed.

Generate a TypeORM entity class and test file, then complete both (entity-specific parts only). Follow the shared `talos-scaffold` skill for run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions.

- **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (once extracted into a shared package). Check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

## Steps

### 1. Infer the options from the request, then run the generator

```bash
talos entity:create --name=<name> --module=<module> --table-name=<table_name>
```

- `--name` — entity class name from the domain object (e.g. "an entity for user profiles" → `UserProfile`). Any casing; the CLI normalizes to PascalCase and appends the `Entity` suffix, so omit it.
- `--table-name` — optional; pass only if the user names a specific table. Defaults to the snake_case plural (e.g. `UserProfile` → `user_profiles`).

### 2. Complete the entity class

Read `modules/<module>/src/entities/<Name>Entity.ts`, then:

- Add entity-specific columns (`@Column`) and relations (`@ManyToOne`, `@OneToMany`, `@ManyToMany`, etc.).
- Remove irrelevant scaffolded columns; adjust column types, lengths, and constraints.
- Declare the primary key with explicit `nullable: false`, auto-generated via `random.id()` (see below).

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

Read and replace `modules/<module>/tests/entities/<Name>Entity.spec.ts`, per the pattern below:

- **Class identity** — `name.endsWith("Entity")`, is constructor.
- **ID** — auto-generates a unique 20-char string per instance.
- **Each column** — exists via `"prop" in entity`, correct default, accepts valid values, accepts `null` (nullable) / `undefined` (optional). Booleans: verify `false`/`true` and toggling. Dates/timestamps: start `undefined`, accept `Date`, accept `null`.
- **Instance isolation** — no shared property state.

Remove blocks for removed columns; add one block per custom column. For a relation property, test it exists and defaults to `undefined`.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Entity } from "@/entities/<Name>Entity";

describe("<Name>Entity", () => {
  // --- Class identity ---
  test("should have class name ending with 'Entity'", () => {
    expect(<Name>Entity.name.endsWith("Entity")).toBe(true);
  });

  // --- ID ---
  test("should auto-generate a unique 20-char string id", () => {
    const a = new <Name>Entity();
    const b = new <Name>Entity();
    expect(typeof a.id).toBe("string");
    expect(a.id.length).toBe(20);
    expect(a.id).not.toBe(b.id);
  });

  // --- boolean column (repeat per column) ---
  test("should default 'isLocked' to undefined and accept true/false/null", () => {
    const entity = new <Name>Entity();
    expect("isLocked" in entity).toBe(true);
    expect(entity.isLocked).toBeUndefined();
    entity.isLocked = true;
    expect(entity.isLocked).toBe(true);
    entity.isLocked = null;
    expect(entity.isLocked).toBeNull();
  });

  // --- date/timestamp column (repeat per date column: createdAt, updatedAt, deletedAt, ...) ---
  test("should default 'lockedAt' to undefined and accept Date/null", () => {
    const entity = new <Name>Entity();
    expect(entity.lockedAt).toBeUndefined();
    const date = new Date();
    entity.lockedAt = date;
    expect(entity.lockedAt).toEqual(date);
    entity.lockedAt = null;
    expect(entity.lockedAt).toBeNull();
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
