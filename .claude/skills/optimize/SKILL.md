---
name: optimize
description: Optimize a module's codebase for quality, performance, and clean conventions. Enforces arrow functions (except class methods), type/interface naming, removes duplication, and ensures only important tests remain.
---

# Optimize Codebase

Optimize a module's codebase for quality, performance, and clean conventions.

## Important

Always run all commands from the **root of the project** (the monorepo root), not from inside individual packages.

## Coding Conventions

### Visibility Modifiers

Always explicitly declare visibility on every class method and property.

```typescript
// correct
export class UserService {
  private readonly repository: UserRepository;
  public async execute(data?: ServiceDataType): Promise<void> {}
  protected validate(): boolean {}
}

// incorrect — visibility is implicit
export class UserService {
  repository: UserRepository;
  async execute() {}
}
```

### Functions vs Class Methods

Use arrow functions everywhere except class methods.

```typescript
// correct — arrow function for standalone function
const formatName = (name: string): string => name.trim();

// correct — regular method syntax inside a class
export class UserService {
  public async execute(data?: ServiceDataType): Promise<void> {
    const formatted = formatName(data?.name ?? "");
  }
}

// incorrect — arrow function as class method
export class UserService {
  public execute = async (data?: ServiceDataType): Promise<void> => {};
}
```

### Type and Interface Naming

- Type aliases **must** end with `Type`
- Interface names **must** start with `I`

```typescript
// correct
type ServiceDataType = Record<string, unknown>;
interface IService { execute(): Promise<void>; }

// incorrect
type ServiceData = Record<string, unknown>;
interface Service { execute(): Promise<void>; }
```

### Non-null Assertions

Never use `!` on class properties. Use a default value or optional type instead.

```typescript
// correct
export class UserEntity {
  public name: string = "";
  public email?: string | null;
}

// incorrect
export class UserEntity {
  public name!: string;
}
```

### Optional Entity Properties

- Optional properties (`?`) must include `null` in their type union
- Do NOT use `= undefined` as an initializer
- Always specify `nullable` explicitly in every `@Column`

```typescript
// correct
export class BookEntity {
  @Column({ name: "title", type: "varchar", length: 255, nullable: false })
  public title: string = "";

  @Column({ name: "subtitle", type: "varchar", length: 255, nullable: true })
  public subtitle?: string | null;
}

// incorrect
export class BookEntity {
  @Column({ name: "title", type: "varchar", length: 255 })  // nullable missing
  public title: string = "";

  @Column({ name: "subtitle", type: "varchar", length: 255, nullable: true })
  public subtitle?: string;  // null missing from type union
}
```

### Dependency Injection

```typescript
import { inject } from "@talosjs/container";

@decorator.seed()
export class BookSeed implements ISeed {
  constructor(
    @inject(BookRepository)
    private readonly repository: BookRepository,
  ) {}
}
```

### Code Hygiene

- Remove all unused imports
- Remove dead code: unreachable branches, unused variables, empty files
- Never leave `TODO` comments without a corresponding task

## Steps

### 1. Identify the target

Work in `modules/<module>/`. Ask the user if no module is specified.

### 2. Analyze the module

Read all `src/**/*.ts` and `tests/**/*.ts` files. Map all types, interfaces, classes, functions, and their dependencies.

### 3. Enforce naming conventions

Scan and fix across all files:
- Types not ending with `Type` — rename and update all references
- Interfaces not starting with `I` — rename and update all references
- Non-arrow standalone functions — convert to arrow functions (skip class methods)
- Missing visibility modifiers — add explicit `public`, `private`, or `protected`

### 4. Remove code duplication

- Extract shared logic into helper arrow functions or base classes
- Consolidate repeated type definitions
- Merge similar utility functions
- Remove dead code (unused imports, unreachable branches, unused variables)

### 5. Optimize for performance

- Replace inefficient loops with single-pass approaches
- Use `Map`/`Set` instead of arrays for lookups
- Prefer early returns to reduce nesting
- Remove unnecessary `async`/`await` where a direct return suffices
- Eliminate redundant null/undefined checks

### 6. Optimize tests

- Remove trivial tests (class name checks, method existence) unless they are smoke tests for generated code
- Keep and improve tests that verify actual business logic, edge cases, error handling
- Consolidate redundant test cases into parameterized patterns
- Every public method with logic needs at least one happy-path and one edge-case test

### 7. Final cleanup

- Remove unused imports and empty files
- Ensure consistent formatting

### 8. Check

```bash
talos monorepo:check
```

Fix any failures before completing.
