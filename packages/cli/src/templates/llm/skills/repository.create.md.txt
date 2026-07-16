---
name: repository-create
description: Generate a new repository class with its test file, then complete the generated code.
when_to_use: Use when creating a new TypeORM repository for database operations on an entity.
model: sonnet
effort: medium
allowed-tools: Bash(talos repository:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Repository Class

> **Run autonomously — do not ask the user questions;** pick the recommended option and proceed. **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` — check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

Generate a TypeORM repository class and test file, then complete both. Follow the shared `talos-scaffold` skill workflow (run-from-root, `--name`/`--module` inference, module registration, lint/format, coding conventions); this covers only the repository-specific parts.

## Steps

### 1. Infer the options, then run the generator

```bash
talos repository:create --name=<name> --module=<module>
```

- `--name` — class name from the entity it serves ("a repository for products" → `Product`). Any casing; the CLI normalizes to PascalCase and appends the `Repository` suffix, so omit it.

### 2. Complete the repository class

Read `modules/<module>/src/repositories/<Name>Repository.ts`, then:

- Verify the entity import path matches the actual entity location.
- Adjust the `find` method's search fields (default searches `name` with `ILike`); customize relation loading in `findOne`/`findOneBy` if needed.
- **Add** custom domain methods the entity's fields/business context call for (e.g. `revokeSession`, `markAsRead`, `archive`).
- **Remove** scaffolded methods that don't fit (e.g. `createMany`/`updateMany` for singleton entities; `find` if the entity is always accessed by ID).

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

  // --- Standard CRUD methods (drop names removed in step 2) ---

  for (const name of ["open", "close", "find", "findOne", "findOneBy", "create", "createMany", "update", "updateMany", "delete", "count"]) {
    test(`should have '${name}' method`, () => {
      expect(typeof (<Name>Repository.prototype as never)[name]).toBe("function");
    });
  }

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

  test("create() should persist via save() and forward SaveOptions", async () => {
    const entity = new <Name>Entity();
    const repo = createRepo();
    const result = await repo.create(entity);
    expect(mockTypeormRepo.save).toHaveBeenCalledWith(entity, undefined);
    expect(result).toBe(entity);
    await repo.create(entity, { reload: false });
    expect(mockTypeormRepo.save).toHaveBeenCalledWith(entity, { reload: false });
  });

  test("findOne() should return the entity when found, null otherwise", async () => {
    const entity = new <Name>Entity();
    mockTypeormRepo.findOne.mockImplementationOnce(async () => entity);
    const repo = createRepo();
    expect(await repo.findOne("test-id")).toBe(entity);
    expect(await repo.findOne("missing-id")).toBeNull();
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
