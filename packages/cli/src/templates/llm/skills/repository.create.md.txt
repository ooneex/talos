---
name: repository-create
description: Generate a new repository class with its test file, then complete the generated code. Use when creating a new TypeORM repository for database operations on an entity.
allowed-tools: Bash(talos repository:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Repository Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a repository class and test file, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the repository-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos repository:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the repository class name, taken from the entity it serves (e.g., "a repository for products" → `Product`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Repository` suffix automatically, so omit the suffix.

### 2. Complete the repository class

Read `modules/<module>/src/repositories/<Name>Repository.ts`, then implement:

- Verify the entity import path matches the actual entity location
- Adjust the `find` method's search fields (default searches `name` with `ILike`)
- Customize relations loading in `findOne`/`findOneBy` if needed

**Adding methods:** Look at the entity's fields and business context to determine if custom domain-specific methods are needed (e.g., `revokeSession`, `markAsRead`, `archive`).

**Removing methods:** Remove scaffolded methods that don't fit the entity context (e.g., remove `createMany`/`updateMany` for singleton entities, remove `find` if entity is always accessed by ID).

```typescript
import { inject } from "@talosjs/container";
import type { ITypeormDatabase } from "@talosjs/database";
import { decorator } from "@talosjs/repository";
import type { FilterResultType } from "@talosjs/types";
import type { FindManyOptions, FindOptionsWhere, Repository, SaveOptions, UpdateResult } from "typeorm";
import { ILike } from "typeorm";
import { <Name>Entity } from "../entities/<Name>Entity";

@decorator.repository()
export class <Name>Repository {
  constructor(
    @inject("database")
    private readonly database: ITypeormDatabase,
  ) {}

  public async open(): Promise<Repository<<Name>Entity>> {
    return await this.database.open(<Name>Entity);
  }

  public async close(): Promise<void> {
    await this.database.close();
  }

  public async find(
    criteria: FindManyOptions<<Name>Entity> & { page?: number; limit?: number; q?: string },
  ): Promise<FilterResultType<<Name>Entity>> {
    // ... pagination and search logic
  }

  public async findOne(id: string): Promise<<Name>Entity | null> { ... }
  public async findOneBy(criteria: FindOptionsWhere<<Name>Entity>): Promise<<Name>Entity | null> { ... }
  public async create(entity: <Name>Entity, options?: SaveOptions): Promise<<Name>Entity> { ... }
  public async createMany(entities: <Name>Entity[], options?: SaveOptions): Promise<<Name>Entity[]> { ... }
  public async update(entity: <Name>Entity, options?: SaveOptions): Promise<<Name>Entity> { ... }
  public async updateMany(entities: <Name>Entity[], options?: SaveOptions): Promise<<Name>Entity[]> { ... }
  public async delete(criteria: FindOptionsWhere<<Name>Entity> | FindOptionsWhere<<Name>Entity>[]): Promise<UpdateResult> { ... }
  public async count(criteria?: FindOptionsWhere<<Name>Entity> | FindOptionsWhere<<Name>Entity>[]): Promise<number> { ... }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/repositories/<Name>Repository.spec.ts`:

**Coverage:** class identity (`name.endsWith("Repository")`, is constructor), entity can be instantiated, each retained CRUD method exists and behaves correctly via mock database, each custom domain method has existence + interaction test. No live-database tests.

```typescript
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { <Name>Entity } from "@/entities/<Name>Entity";
import { <Name>Repository } from "@/repositories/<Name>Repository";

const mockTypeormRepo = {
  find: mock(async () => []),
  findOne: mock(async () => null),
  findOneBy: mock(async () => null),
  save: mock(async (entity: unknown) => entity),
  delete: mock(async () => ({ affected: 1, raw: [] })),
  count: mock(async () => 0),
  findAndCount: mock(async () => [[], 0] as [unknown[], number]),
};

const mockDatabase = {
  open: mock(async () => mockTypeormRepo),
  close: mock(async () => undefined),
};

const createRepo = () => new <Name>Repository(mockDatabase as never);

describe("<Name>Repository", () => {
  beforeEach(() => {
    for (const fn of Object.values(mockTypeormRepo)) fn.mockClear();
    mockDatabase.open.mockClear();
    mockDatabase.close.mockClear();
  });

  // --- Class identity ---

  test("should have class name ending with 'Repository'", () => {
    expect(<Name>Repository.name.endsWith("Repository")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Repository).toBe("function");
  });

  // --- Entity creation ---

  test("should create a <Name>Entity instance", () => {
    const entity = new <Name>Entity();
    // TODO: assign entity fields based on its definition
    expect(entity).toBeInstanceOf(<Name>Entity);
  });

  // --- Standard CRUD methods (remove blocks for methods removed in step 2) ---

  test("should have 'open' method", () => {
    expect(typeof <Name>Repository.prototype.open).toBe("function");
  });

  test("should have 'close' method", () => {
    expect(typeof <Name>Repository.prototype.close).toBe("function");
  });

  test("should have 'find' method", () => {
    expect(typeof <Name>Repository.prototype.find).toBe("function");
  });

  test("should have 'findOne' method", () => {
    expect(typeof <Name>Repository.prototype.findOne).toBe("function");
  });

  test("should have 'findOneBy' method", () => {
    expect(typeof <Name>Repository.prototype.findOneBy).toBe("function");
  });

  test("should have 'create' method", () => {
    expect(typeof <Name>Repository.prototype.create).toBe("function");
  });

  test("should have 'createMany' method", () => {
    expect(typeof <Name>Repository.prototype.createMany).toBe("function");
  });

  test("should have 'update' method", () => {
    expect(typeof <Name>Repository.prototype.update).toBe("function");
  });

  test("should have 'updateMany' method", () => {
    expect(typeof <Name>Repository.prototype.updateMany).toBe("function");
  });

  test("should have 'delete' method", () => {
    expect(typeof <Name>Repository.prototype.delete).toBe("function");
  });

  test("should have 'count' method", () => {
    expect(typeof <Name>Repository.prototype.count).toBe("function");
  });

  // --- Database interaction (mocked) ---

  test("open() should request the entity's TypeORM repository from the database", async () => {
    const repo = createRepo();
    await repo.open();
    expect(mockDatabase.open).toHaveBeenCalledWith(<Name>Entity);
  });

  test("close() should close the database connection", async () => {
    const repo = createRepo();
    await repo.close();
    expect(mockDatabase.close).toHaveBeenCalled();
  });

  test("create() should persist the entity via save()", async () => {
    const entity = new <Name>Entity();
    const repo = createRepo();
    const result = await repo.create(entity);
    expect(mockTypeormRepo.save).toHaveBeenCalledWith(entity, undefined);
    expect(result).toBe(entity);
  });

  test("create() should forward SaveOptions to save()", async () => {
    const entity = new <Name>Entity();
    const options = { reload: false };
    const repo = createRepo();
    await repo.create(entity, options);
    expect(mockTypeormRepo.save).toHaveBeenCalledWith(entity, options);
  });

  test("findOne() should return entity when found", async () => {
    const entity = new <Name>Entity();
    entity.id = "test-id";
    mockTypeormRepo.findOne.mockImplementation(async () => entity);
    const repo = createRepo();
    const result = await repo.findOne("test-id");
    expect(result).toBe(entity);
  });

  test("findOne() should return null when entity is not found", async () => {
    const repo = createRepo();
    const result = await repo.findOne("missing-id");
    expect(result).toBeNull();
  });

  test("update() should persist the updated entity via save()", async () => {
    const entity = new <Name>Entity();
    const repo = createRepo();
    const result = await repo.update(entity);
    expect(mockTypeormRepo.save).toHaveBeenCalledWith(entity, undefined);
    expect(result).toBe(entity);
  });

  test("delete() should delegate to the TypeORM repository", async () => {
    const criteria = { id: "test-id" };
    const repo = createRepo();
    await repo.delete(criteria);
    expect(mockTypeormRepo.delete).toHaveBeenCalledWith(criteria);
  });

  test("count() should return the count from the TypeORM repository", async () => {
    mockTypeormRepo.count.mockImplementation(async () => 7);
    const repo = createRepo();
    const result = await repo.count();
    expect(result).toBe(7);
  });

  // Add structural + interaction tests for each custom domain method added in step 2
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
