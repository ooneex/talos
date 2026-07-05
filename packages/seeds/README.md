# @talosjs/seeds

Database seeding framework for populating initial data, fixtures, and test datasets with execution logging and idempotent operations.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Seed Decorator** - Register seed classes with the DI container using `@decorator.seed()`

✅ **ISeed Interface** - Standard interface with `run()`, `isActive()`, and `getDependencies()` methods

✅ **Dependency Resolution** - Define and automatically resolve seed dependencies before execution

✅ **Active/Inactive Control** - Enable or disable individual seeds via the `isActive()` method

✅ **Seed Runner** - Execute all active seeds in order with terminal logging via `run()`

✅ **Seed Scaffolding** - Generate new seed files from a template with `seedCreate()`

✅ **Execution Logging** - Built-in terminal logging for seed progress, success, and failure

✅ **Container Integration** - Automatic registration with `@talosjs/container` for dependency injection

## Installation

```bash
bun add @talosjs/seeds
```

## Usage

### Basic Seed

```typescript
import { decorator, type ISeed, type SeedClassType } from '@talosjs/seeds';

@decorator.seed()
export class UserSeed implements ISeed {
  public async run<T>(data?: unknown[]): Promise<T> {
    // Insert initial users into the database
    return data as T;
  }

  public isActive(): boolean {
    return true;
  }

  public async getDependencies(): Promise<SeedClassType[]> {
    return [];
  }
}
```

### Seed with Dependencies

```typescript
import { decorator, type ISeed, type SeedClassType } from '@talosjs/seeds';

@decorator.seed()
export class RoleSeed implements ISeed {
  public async run<T>(data?: unknown[]): Promise<T> {
    // Insert roles first
    return data as T;
  }

  public isActive(): boolean {
    return true;
  }

  public async getDependencies(): Promise<SeedClassType[]> {
    return [];
  }
}

@decorator.seed()
export class UserSeed implements ISeed {
  public async run<T>(data?: unknown[]): Promise<T> {
    // Roles are available in data from resolved dependencies
    return data as T;
  }

  public isActive(): boolean {
    return true;
  }

  public async getDependencies(): Promise<SeedClassType[]> {
    return [RoleSeed];
  }
}
```

### Running Seeds

```typescript
import { run } from '@talosjs/seeds';

await run();
```

### Creating a New Seed

```typescript
import { seedCreate } from '@talosjs/seeds';

const filePath = await seedCreate({ name: 'product', dir: 'seeds' });
// Creates seeds/ProductSeed.ts from the built-in template
```

## API Reference

### Decorators

#### `@decorator.seed(scope?)`

Decorator to register a seed class with the DI container.

**Parameters:**
- `scope` - Container scope (default: `EContainerScope.Singleton`)

### Interfaces

#### `ISeed`

Interface for seed implementations.

```typescript
interface ISeed {
  run: <T = unknown>(data?: unknown[]) => Promise<T> | T;
  isActive: () => Promise<boolean> | boolean;
  getDependencies: () => Promise<SeedClassType[]> | SeedClassType[];
}
```

### Functions

#### `run(): Promise<void>`

Execute all active seeds with dependency resolution and terminal logging.

#### `seedCreate(config: { name: string; dir?: string }): Promise<string>`

Generate a new seed file from the built-in template. Returns the path of the created file.

#### `getSeeds(): ISeed[]`

Retrieve all registered and active seed instances from the container.

### Types

#### `SeedClassType`

Type for seed class constructors.

```typescript
type SeedClassType = new (...args: any[]) => ISeed;
```

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
