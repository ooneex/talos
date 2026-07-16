---
name: optimize-conventions
description: Project coding conventions — explicit visibility, arrow functions vs class methods, Type/I naming (DI-enforced), no non-null assertions, nullable entity columns, DI wiring, code hygiene, duplication/dead-code removal, and performance rules.
when_to_use: Use when enforcing conventions, refactoring, or reviewing a module's code style.
user-invocable: false
---

# Coding Conventions

> **Run autonomously — do not ask the user questions.** On any choice, pick the recommended option and proceed.

Used by the `optimize` skill (steps 3–5) to enforce conventions and remove duplication/dead code.

## Visibility

Declare explicit visibility (`public`/`private`/`protected`) on every class method and property.

```typescript
export class UserService {
  private readonly repository: UserRepository;
  public async execute(data?: ServiceDataType): Promise<void> {}
  protected validate(): boolean {}
}
```

## Arrow Functions vs Class Methods

Arrow functions everywhere, except class methods (use regular method syntax).

```typescript
const formatName = (name: string): string => name.trim(); // standalone: arrow

export class UserService {
  public async execute(): Promise<void> {} // method: regular syntax, NOT `execute = async () =>`
}
```

## Type & Interface Naming

Type aliases **must** end with `Type`; interfaces **must** start with `I`. **Strictly enforced by DI decorators — violations throw at startup:**

| Artefact | Convention | Example |
|---|---|---|
| Service | ends `Service` | `UserService` |
| Repository | ends `Repository` | `UserRepository` |
| Middleware | ends `Middleware` | `AuthMiddleware` |
| Cron | ends `Cron` | `ExpiredTokenCleanupCron` |
| Type alias | ends `Type` | `ServiceDataType` |
| Interface | starts `I` | `IService` |

## Non-null Assertions

Never use `!` on class properties — use a default value or optional type.

```typescript
export class UserEntity {
  public name: string = "";      // not `name!: string`
  public email?: string | null;
}
```

## Optional Entity Properties

- Optional (`?`) types must include `null` in the union.
- Never initialize with `= undefined`.
- Always set `nullable` explicitly in every `@Column`.

```typescript
export class BookEntity {
  @Column({ name: "title", type: "varchar", length: 255, nullable: false })
  public title: string = "";

  @Column({ name: "subtitle", type: "varchar", length: 255, nullable: true })
  public subtitle?: string | null; // not `subtitle?: string`, and not `nullable` omitted
}
```

## Dependency Injection

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

## Code Hygiene

- Remove unused imports and dead code (unreachable branches, unused variables, empty files).
- No `TODO` comments without a corresponding task.

## Duplication & Dead Code

- Extract shared logic into helper arrow functions or base classes.
- Consolidate repeated type definitions; merge similar utilities.

## Performance

- Replace inefficient loops with single-pass approaches.
- Use `Map`/`Set` instead of arrays for lookups.
- Prefer early returns to reduce nesting.
- Drop unnecessary `async`/`await` where a direct return suffices.
- Eliminate redundant null/undefined checks.
