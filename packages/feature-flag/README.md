# @talosjs/feature-flag

A lightweight, type-safe contract for defining feature flags in Talos applications. Each flag is a small, injectable class exposing a name, a human-readable description, and a (synchronous or asynchronous) enablement check, making it easy to gate functionality behind toggles resolved from the DI container.

![Browser](https://img.shields.io/badge/Browser-Compatible-green?style=flat-square&logo=googlechrome)
![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![Deno](https://img.shields.io/badge/Deno-Compatible-blue?style=flat-square&logo=deno)
![Node.js](https://img.shields.io/badge/Node.js-Compatible-green?style=flat-square&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Simple Contract** - A focused `IFeatureFlag` interface with `getKey`, `getDescription`, and `isEnabled`

✅ **Sync or Async** - `isEnabled` may return a `boolean` or a `Promise<boolean>` for remote/config-driven checks

✅ **Dependency Injection** - Register flags with the `@decorator.featureFlag()` decorator and resolve them from the container

✅ **Configurable Scopes** - Singleton, Request, or Transient lifecycles via `EContainerScope`

✅ **Type-Safe** - Full TypeScript support with proper type definitions

## Installation

```bash
bun add @talosjs/feature-flag
```

## Usage

### Defining a Feature Flag

Implement the `IFeatureFlag` interface and register it with the `featureFlag` decorator:

```typescript
import { decorator, type IFeatureFlag } from '@talosjs/feature-flag';

@decorator.featureFlag()
export class DarkModeFeatureFlag implements IFeatureFlag {
  public getKey(): string {
    return 'dark-mode';
  }

  public getDescription(): string {
    return 'Enables the dark mode theme';
  }

  public isEnabled(): boolean {
    return true;
  }
}
```

### Asynchronous Enablement

`isEnabled` can resolve a value from a remote service, database, or environment:

```typescript
import { decorator, type IFeatureFlag } from '@talosjs/feature-flag';

@decorator.featureFlag()
export class BetaCheckoutFeatureFlag implements IFeatureFlag {
  public getKey(): string {
    return 'beta-checkout';
  }

  public getDescription(): string {
    return 'Enables the redesigned checkout flow for beta users';
  }

  public async isEnabled(): Promise<boolean> {
    const value = process.env.BETA_CHECKOUT;
    return value === 'true';
  }
}
```

### Resolving a Flag

```typescript
import { container } from '@talosjs/container';
import { DarkModeFeatureFlag } from './DarkModeFeatureFlag';

const flag = container.get(DarkModeFeatureFlag);

if (await flag.isEnabled()) {
  // ...render dark mode
}
```

## API Reference

### Decorators

#### `decorator.featureFlag(scope?: EContainerScope)`

Registers a feature-flag class with the DI container.

**Parameters:**
- `scope` - Optional container scope. Defaults to `EContainerScope.Singleton`.

**Example:**

```typescript
import { EContainerScope } from '@talosjs/container';
import { decorator, type IFeatureFlag } from '@talosjs/feature-flag';

@decorator.featureFlag(EContainerScope.Transient)
export class ExperimentalFeatureFlag implements IFeatureFlag {
  public getKey(): string {
    return 'experimental';
  }
  public getDescription(): string {
    return 'Enables experimental features';
  }
  public isEnabled(): boolean {
    return false;
  }
}
```

### Types

#### `IFeatureFlag`

```typescript
interface IFeatureFlag {
  getKey: () => string;
  getDescription: () => string;
  isEnabled: () => Promise<boolean> | boolean;
}
```

#### `FeatureFlagClassType`

```typescript
type FeatureFlagClassType = new (...args: any[]) => IFeatureFlag;
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
