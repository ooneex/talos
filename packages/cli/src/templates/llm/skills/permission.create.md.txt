---
name: permission-create
description: Generate a new permission class with its test file, then complete the generated code.
when_to_use: Use when creating a new permission that extends Permission from @talosjs/permission.
model: sonnet
effort: low
allowed-tools: Bash(talos permission:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Permission Class

> **Run autonomously — do not ask the user questions;** pick the recommended option and proceed. **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` — check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

Generate a permission class and test file, then complete the implementation. Follow the shared `talos-scaffold` skill workflow (run-from-root, `--name`/`--module` inference, module registration, lint/format, coding conventions); this covers only the permission-specific parts.

## Steps

### 1. Infer options, then run the generator

```bash
talos permission:create --name=<name> --module=<module>
```

- `--name` — class name from the action it guards ("a permission to edit posts" → `EditPost`). Any casing; the CLI normalizes to PascalCase and appends the `Permission` suffix, so omit it.

### 2. Complete the permission class

Read `modules/<module>/src/permissions/<Name>Permission.ts`, then implement:

- Implement `allow()` with permission rules using `this.ability.can()`
- Implement `setUserPermissions()` with role-based permission logic
- Implement `check()` to **deny by default (fail closed)** and derive its result from the resolved ability — never leave it returning a hardcoded `true`

```typescript
import type { ContextType } from "@talosjs/controller";
import { decorator, Permission } from "@talosjs/permission";

@decorator.permission()
export class <Name>Permission extends Permission {
  public allow(): this {
    // this.ability.can("read", "YourEntity");
    // this.ability.can(["read", "update"], "YourEntity", { userId: user.id });
    return this;
  }

  public setUserPermissions(context: ContextType): this {
    // const { user } = context;
    // if (!user) return this;
    // if (user.roles.includes("ROLE_ADMIN")) {
    //   this.ability.can("manage", "all");
    // }
    return this;
  }

  public check(context: ContextType): boolean {
    // Deny by default (fail closed). Resolve the caller's abilities, then
    // authorize only the specific action/subject this permission guards, e.g.:
    //   return this.setUserPermissions(context).ability.can("update", "YourEntity");
    return false;
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/permissions/<Name>Permission.spec.ts`:

**Coverage:** class identity (`name.endsWith("Permission")`, is constructor), extends `Permission`, `allow` exists and returns `this` (fluent), does not throw, `setUserPermissions` exists and returns `this`, does not throw when `user` is absent, `check` exists and returns a `boolean`, `check` **denies by default** (returns `false`) for an unauthorized/empty context. Add one test per role/action combination after implementing. Instance isolation.

```typescript
import { Permission } from "@talosjs/permission";
import { describe, expect, test } from "bun:test";
import { <Name>Permission } from "@/permissions/<Name>Permission";

describe("<Name>Permission", () => {
  test("should have class name ending with 'Permission'", () => {
    expect(<Name>Permission.name.endsWith("Permission")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Permission).toBe("function");
  });

  test("should extend Permission", () => {
    const permission = new <Name>Permission();
    expect(permission).toBeInstanceOf(Permission);
  });

  test("should have 'allow' method", () => {
    expect(typeof <Name>Permission.prototype.allow).toBe("function");
  });

  test("'allow' should return 'this' for fluent chaining", () => {
    const permission = new <Name>Permission();
    expect(permission.allow()).toBe(permission);
  });

  test("'allow' should not throw", () => {
    const permission = new <Name>Permission();
    expect(() => permission.allow()).not.toThrow();
  });

  test("should have 'setUserPermissions' method", () => {
    expect(typeof <Name>Permission.prototype.setUserPermissions).toBe("function");
  });

  test("'setUserPermissions' should return 'this' for fluent chaining", () => {
    const permission = new <Name>Permission();
    const context = {} as any;
    expect(permission.setUserPermissions(context)).toBe(permission);
  });

  test("'setUserPermissions' should not throw when user is absent from context", () => {
    const permission = new <Name>Permission();
    expect(() => permission.setUserPermissions({ user: undefined } as any)).not.toThrow();
  });

  test("should have 'check' method", () => {
    expect(typeof <Name>Permission.prototype.check).toBe("function");
  });

  test("'check' should return a boolean", () => {
    const permission = new <Name>Permission();
    const result = permission.check({} as any);
    expect(typeof result).toBe("boolean");
  });

  test("'check' should deny by default for an unauthorized context", () => {
    const permission = new <Name>Permission();
    expect(permission.check({ user: undefined } as any)).toBe(false);
  });

  // Add one test per role/action combination after implementing allow/setUserPermissions

  test("should produce independent instances", () => {
    const a = new <Name>Permission();
    const b = new <Name>Permission();
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
