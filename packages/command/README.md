# @talosjs/command

A lightweight CLI command framework for TypeScript applications built on Bun. It provides a structured approach to building command-line interfaces with dependency injection, automatic argument parsing, and code generation utilities.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![Deno](https://img.shields.io/badge/Deno-Compatible-blue?style=flat-square&logo=deno)
![Node.js](https://img.shields.io/badge/Node.js-Compatible-green?style=flat-square&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Decorator-Based Registration** - Register commands with `@decorator.command()` and resolve them via the DI container

✅ **Type-Safe Options** - Generic `ICommand<Options>` interface ensures fully typed command arguments

✅ **Automatic Argument Parsing** - Built-in CLI argument parsing with support for named options, booleans, and positionals

✅ **Code Generation** - `commandCreate` scaffolds command files and test stubs from built-in templates

✅ **Dependency Injection** - Integrates with `@talosjs/container` supporting Singleton, Request, and Transient scopes

✅ **Error Handling** - Structured `CommandException` with HTTP status codes and JSON-formatted stack traces

✅ **Terminal Logging** - Automatic error output via `@talosjs/logger` on command failure

## Installation

```bash
bun add @talosjs/command
```

## Usage

### Defining a Command

Implement `ICommand` and register it with the `@decorator.command()` decorator:

```typescript
import { decorator } from '@talosjs/command';
import type { ICommand } from '@talosjs/command';

interface GreetOptions {
  name?: string;
}

@decorator.command()
class GreetCommand implements ICommand<GreetOptions> {
  getName(): string {
    return 'greet';
  }

  getDescription(): string {
    return 'Greet a user by name';
  }

  async run(options: GreetOptions): Promise<void> {
    const who = options.name ?? 'World';
    console.log(`Hello, ${who}!`);
  }
}
```

### Running the CLI Entry Point

Call `run()` in your CLI entry file. It reads `process.argv`, resolves the matching command by name, and executes it:

```typescript
import { run } from '@talosjs/command';
import './commands'; // import files that register commands via @decorator.command()

await run();
```

Invoke from the terminal:

```bash
bun run cli.ts greet --name Alice
# Hello, Alice!
```

### Retrieving a Command Manually

```typescript
import { getCommand } from '@talosjs/command';

const cmd = getCommand('greet');
if (cmd) {
  await cmd.run({ name: 'Bob' });
}
```

### Generating a Command Scaffold

Use `commandCreate` to generate a command file, its test file, and update the barrel export:

```typescript
import { commandCreate } from '@talosjs/command';

const paths = await commandCreate({
  name: 'database:seed',       // supports any case — normalised automatically
  commandDir: 'src/commands',  // optional, defaults to src/commands
  testsDir: 'tests/commands',  // optional, defaults to tests/commands
});

console.log(paths.commandPath); // src/commands/DatabaseSeedCommand.ts
console.log(paths.testPath);    // tests/commands/DatabaseSeedCommand.spec.ts
```

Generated files are based on built-in templates and include the `ICommand` interface, `@decorator.command()` registration, and a placeholder `run` method.

### Error Handling

```typescript
import { CommandException } from '@talosjs/command';

try {
  throw new CommandException('Database not available', 'DB_UNAVAILABLE', {
    host: 'localhost',
    port: 5432,
  });
} catch (error) {
  if (error instanceof CommandException) {
    console.error(error.message); // Database not available
    console.error(error.data);    // { host: 'localhost', port: 5432 }
  }
}
```

## API Reference

### Interfaces

#### `ICommand<Options>`

The contract every command must implement.

```typescript
interface ICommand<Options extends Record<string, unknown> = Record<string, unknown>> {
  run(options: Options): Promise<void> | void;
  getName(): string;
  getDescription(): string;
}
```

| Method | Description |
|--------|-------------|
| `getName()` | Returns the command name used to match CLI input (e.g. `'db:seed'`) |
| `getDescription()` | Returns a human-readable description of the command |
| `run(options)` | Executes the command with the parsed options |

### Decorators

#### `decorator.command(scope?)`

Registers a command class with the DI container and the global `COMMANDS_CONTAINER`.

```typescript
decorator.command(scope?: EContainerScope): ClassDecorator
```

**Parameters:**
- `scope` — DI container scope. Defaults to `EContainerScope.Singleton`

**Example:**

```typescript
import { decorator } from '@talosjs/command';
import { EContainerScope } from '@talosjs/container';

@decorator.command(EContainerScope.Transient)
class BuildCommand implements ICommand {
  // ...
}
```

### Functions

#### `run(): Promise<void>`

Parses `Bun.argv`, resolves the command from the third positional argument, and calls `command.run(options)`. Exits with code `1` if no command is found or if the command throws.

**Parsed options forwarded to `command.run`:**

| CLI flag | `options` key | Type |
|----------|---------------|------|
| `--name` | `name` | `string` |
| `--dir` | `dir` | `string` |
| `--channel` | `channel` | `string` |
| `--is-socket` | `isSocket` | `boolean` |
| `--table-name` | `tableName` | `string` |
| `--module` | `module` | `string` (kebab-cased) |
| `--destination` | `destination` | `string` |
| `--drop` | `drop` | `boolean` |
| `--override` | `override` | `boolean` |
| `--target` | `target` | `string` |
| `--route-name` | `route.name` | `string` |
| `--route-path` | `route.path` | `` `/${string}` `` |
| `--route-method` | `route.method` | `HttpMethodType` |

#### `getCommand(name: string): ICommand | null`

Resolves a registered command by its name. Returns `null` if no match is found.

```typescript
const command = getCommand('db:migrate');
```

#### `commandCreate(config): Promise<{ commandPath: string; testPath: string }>`

Scaffolds a new command class and its test file from built-in templates.

**Parameters:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | — | Command name (any case, normalised to PascalCase) |
| `commandDir` | `string` | `src/commands` | Directory for the generated command file |
| `testsDir` | `string` | `tests/commands` | Directory for the generated test file |

**Returns:** Object with `commandPath` and `testPath` pointing to the created files.

### Classes

#### `CommandException`

Structured exception for command-related errors, extending `Exception` from `@talosjs/exception`.

```typescript
new CommandException(message: string, key: string, data?: Record<string, unknown>)
```

**Parameters:**
- `message` — Human-readable error description
- `key` — Machine-readable error key (e.g. `'INVALID_OPTION'`)
- `data` — Optional contextual data attached to the exception

### Constants

#### `COMMANDS_CONTAINER`

Global array holding all registered command constructors. Populated automatically by `@decorator.command()`.

```typescript
import { COMMANDS_CONTAINER } from '@talosjs/command';

console.log(COMMANDS_CONTAINER.length); // number of registered commands
```

### Types

#### `CommandClassType`

Constructor type for any class implementing `ICommand`.

```typescript
type CommandClassType = new (...args: any[]) => ICommand;
```

## Advanced Usage

### Dependency Injection with Scopes

Commands are resolved through `@talosjs/container`, so they support the full range of container scopes:

```typescript
import { decorator } from '@talosjs/command';
import { EContainerScope } from '@talosjs/container';

@decorator.command(EContainerScope.Singleton)
class MigrateCommand implements ICommand {
  getName() { return 'db:migrate'; }
  getDescription() { return 'Run database migrations'; }

  async run(options: { drop?: boolean }): Promise<void> {
    if (options.drop) {
      console.log('Dropping existing tables...');
    }
    console.log('Running migrations...');
  }
}
```

### Multiple Commands in a Single App

Register all commands by importing their files before calling `run()`:

```typescript
// commands/index.ts
export { MigrateCommand } from './MigrateCommand';
export { SeedCommand } from './SeedCommand';
export { BuildCommand } from './BuildCommand';

// cli.ts
import './commands';
import { run } from '@talosjs/command';

await run();
```

```bash
bun run cli.ts db:migrate --drop
bun run cli.ts db:seed --name fixtures
bun run cli.ts build --target production
```

### Typed Command Options

Use the generic parameter on `ICommand` for full type safety:

```typescript
interface DeployOptions {
  target: string;
  override?: boolean;
  destination?: string;
}

@decorator.command()
class DeployCommand implements ICommand<DeployOptions> {
  getName() { return 'deploy'; }
  getDescription() { return 'Deploy the application'; }

  async run(options: DeployOptions): Promise<void> {
    console.log(`Deploying to ${options.target}...`);
    if (options.override) {
      console.log('Overriding existing deployment');
    }
  }
}
```

### Custom Error Reporting

```typescript
import { CommandException } from '@talosjs/command';

@decorator.command()
class ValidateCommand implements ICommand {
  getName() { return 'validate'; }
  getDescription() { return 'Validate project configuration'; }

  async run(options: { name?: string }): Promise<void> {
    if (!options.name) {
      throw new CommandException(
        'The --name option is required',
        'MISSING_NAME',
        { received: options },
      );
    }
    console.log(`Validating ${options.name}...`);
  }
}
```

When `run()` catches this exception it logs it via `TerminalLogger` and exits with code `1`.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun test tests`
4. Build the project: `bun run build` (from the package dir)

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team
