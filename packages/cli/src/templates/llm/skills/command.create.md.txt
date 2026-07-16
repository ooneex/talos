---
name: command-create
description: Generate a new command class with its test file, then complete the generated code.
when_to_use: Use when creating a new CLI command that implements the ICommand interface from @talosjs/cli.
model: sonnet
effort: low
allowed-tools: Bash(talos command:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Command Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

Generate a command class and test file, then complete the implementation. This covers only command specifics.

**Rules that apply throughout:**
- **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.
- **Shared workflow:** follow the `talos-scaffold` skill for run-from-root, `--name`/`--module` inference, module registration, lint/format, and conventions.

## Steps

### 1. Infer options, then run the generator

```bash
talos command:create --name=<name> --module=<module>
```

- `--name` — command class name, from the action it performs ("a command to import users" → `ImportUser`). Any casing; the CLI normalizes to PascalCase and appends the `Command` suffix, so omit it.

Also generates: `commands.ts` root export, imports into the app root file, `modules/app/bin/command/run.ts` (if missing), and a `command` script in `modules/app/package.json`.

### 2. Complete the command class

Read `modules/<module>/src/commands/<Name>Command.ts`, then implement:

- Define `CommandOptionsType` with all required and optional options
- Implement `run()` with actual command logic
- Inject required dependencies via the constructor

```typescript
import { type ICommand, decorator } from "@talosjs/cli";

type CommandOptionsType = {
  name?: string;
};

@decorator.command()
export class <Name>Command<T extends CommandOptionsType = CommandOptionsType> implements ICommand<T> {
  public getName(): string {
    return "<command:name>";
  }

  public getDescription(): string {
    return "Execute <command:name> command";
  }

  public async run(options: T): Promise<void> {
    // TODO: Implement command logic
  }
}
```

### 3. Complete the test file

Read and replace `modules/<module>/tests/commands/<Name>Command.spec.ts`:

**Coverage:** class identity (`name.endsWith("Command")`, is constructor); `getName` exists and returns a non-empty string in `namespace:action` format; `getDescription` exists and differs from name; `run` exists and returns `Promise` (with empty and populated options); instance isolation. After implementing `run()`, add behavior tests.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>Command } from "@/commands/<Name>Command";

describe("<Name>Command", () => {
  test("should have class name ending with 'Command'", () => {
    expect(<Name>Command.name.endsWith("Command")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Command).toBe("function");
  });

  test("should have 'getName' method", () => {
    expect(typeof <Name>Command.prototype.getName).toBe("function");
  });

  test("'getName' should return a non-empty string", () => {
    const command = new <Name>Command();
    const name = command.getName();
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
  });

  test("'getName' should use colon-separated namespace:action format", () => {
    const command = new <Name>Command();
    expect(command.getName()).toMatch(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/);
  });

  test("should have 'getDescription' method", () => {
    expect(typeof <Name>Command.prototype.getDescription).toBe("function");
  });

  test("'getDescription' should return a non-empty string", () => {
    const command = new <Name>Command();
    const desc = command.getDescription();
    expect(typeof desc).toBe("string");
    expect(desc.length).toBeGreaterThan(0);
  });

  test("'getDescription' should differ from 'getName'", () => {
    const command = new <Name>Command();
    expect(command.getDescription()).not.toBe(command.getName());
  });

  test("should have 'run' method", () => {
    expect(typeof <Name>Command.prototype.run).toBe("function");
  });

  test("'run' should return a Promise when called with empty options", () => {
    const command = new <Name>Command();
    const result = command.run({} as any);
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("'run' should return a Promise when called with options", () => {
    const command = new <Name>Command();
    const result = command.run({ name: "test" } as any);
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  // Add behavior tests after implementing run()

  test("should produce independent instances", () => {
    const a = new <Name>Command();
    const b = new <Name>Command();
    expect(a).not.toBe(b);
  });
});
```

### 4. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.

### 5. Run the command

Invoke it by its `getName()` value (extra args are forwarded):

```bash
talos command:run <command:name> [args...]
```
