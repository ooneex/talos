---
name: optimize
description: Use when the user asks to optimize, clean up, refactor, harden, lint, test, or improve an Talos package for quality, performance, API clarity, or repository conventions.
metadata:
  short-description: Optimize an Talos package
---

# Optimize Package

Optimize one package under `packages/<name>/`.

## Important

Always run commands from the monorepo root unless the command explicitly changes into a package.

Do not reach into another package's `src/` or `dist/`. Consume sibling packages through public imports such as `@talosjs/container`.

## Target

Work in `packages/<name>/`. If the user does not identify a package and it cannot be inferred from changed files, ask for it.

Read:

- `packages/<name>/src/**/*.ts`
- `packages/<name>/tests/**/*.ts`
- `packages/<name>/package.json`
- `packages/<name>/README.md` when public behavior changes

## Package Conventions

- Public API exports live in `src/index.ts`.
- Package-local types live in `src/types.ts` when that matches the existing package pattern.
- Decorators live in `src/decorators.ts` where applicable.
- Tests live in `tests/` and use the `.spec.ts` suffix.
- Packages build to `dist/` through `bunup`; do not edit generated `dist/` files unless explicitly requested.
- Sibling packages are imported as `@talosjs/<name>`, never by relative paths into another package.

## Coding Conventions

### Visibility Modifiers

Every class method and property declares `public`, `private`, or `protected`.

```typescript
export class UserService {
  private readonly repository: UserRepository;

  public async execute(data?: ServiceDataType): Promise<void> {}

  protected validate(): boolean {
    return true;
  }
}
```

### Functions vs Class Methods

Use arrow functions for standalone functions. Use normal method syntax for class methods.

```typescript
const formatName = (name: string): string => name.trim();

export class UserService {
  public async execute(data?: ServiceDataType): Promise<void> {
    const formatted = formatName(data?.name ?? "");
  }
}
```

### Type and Interface Naming

- Type aliases end with `Type`.
- Interfaces start with `I`.

```typescript
type ServiceDataType = Record<string, unknown>;

interface IService {
  execute(): Promise<void>;
}
```

### Dependency Injection

Use constructor injection and package decorators where the package supports DI.

```typescript
import { inject } from "@talosjs/container";
import { decorator, type IService } from "@talosjs/service";

@decorator.service()
export class UserService implements IService {
  public constructor(
    @inject(UserRepository)
    private readonly repository: UserRepository,
  ) {}
}
```

DI naming conventions are strict:

- Services end with `Service`
- Repositories end with `Repository`
- Middlewares end with `Middleware`
- Crons end with `Cron`
- Controllers follow the controller package's decorator conventions

### Entities

When editing TypeORM entities:

- Avoid non-null assertions.
- Optional properties include `null` in their type union.
- Do not initialize optional properties with `undefined`.
- Set `nullable` explicitly in every `@Column`.

```typescript
export class BookEntity {
  @Column({ name: "title", type: "varchar", length: 255, nullable: false })
  public title: string = "";

  @Column({ name: "subtitle", type: "varchar", length: 255, nullable: true })
  public subtitle?: string | null;
}
```

### Exceptions

Throw typed package exceptions instead of returning `null` or string error codes when behavior fails in a meaningful way.

## Optimization Steps

1. Map the package's public API, internal files, dependencies, and tests.
2. Remove unused imports, dead code, unreachable branches, and empty files.
3. Rename types and interfaces to match repository conventions.
4. Add missing visibility modifiers.
5. Convert standalone function declarations to arrow functions unless a declaration is required for a specific runtime behavior.
6. Reduce duplication only when the abstraction clearly simplifies the package.
7. Improve performance with simple, defensible changes: single-pass loops, `Map`/`Set` lookups, early returns, and avoiding redundant async work.
8. Keep tests focused on behavior, edge cases, and error paths. Remove trivial existence checks unless they are meaningful smoke tests.
9. Update `src/index.ts` if public exports changed.
10. Update `README.md` if public behavior or usage changed.

## Validation

Prefer package-level validation:

```bash
bun test packages/<name>/tests
bunx nx run @talosjs/<name>:build
bunx nx run @talosjs/<name>:lint
```

For broad or cross-package changes:

```bash
bun run fmt
bun run build
bun run lint
bun run test
```
