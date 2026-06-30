# @talosjs/app-env

Environment detection and configuration management for Talos applications — supports development, staging, production, and testing environments.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **15 Environment Types** - Support for local, development, staging, production, and more

✅ **Boolean Flags** - Quick environment checks with `isProduction`, `isDevelopment`, etc.

✅ **Type-Safe** - Full TypeScript support with proper type definitions

✅ **Zero Dependencies** - Lightweight with no external runtime dependencies

✅ **Validation** - Throws descriptive errors for invalid environment configurations

✅ **Immutable** - All properties are readonly for safety

## Installation

```bash
bun add @talosjs/app-env
```

## Usage

### Basic Usage

```typescript
import { AppEnv } from '@talosjs/app-env';

const env = new AppEnv('production');

if (env.isProduction) {
  console.log('Running in production mode');
}

if (env.isDevelopment || env.isLocal) {
  console.log('Debug mode enabled');
}
```

### With Environment Variable

```typescript
import { AppEnv, type EnvType } from '@talosjs/app-env';

const env = new AppEnv(process.env.APP_ENV as EnvType);

console.log(`Current environment: ${env.env}`);
```

### Environment-Specific Configuration

```typescript
import { AppEnv } from '@talosjs/app-env';

const env = new AppEnv('staging');

const config = {
  apiUrl: env.isProduction
    ? 'https://api.example.com'
    : env.isStaging
      ? 'https://staging-api.example.com'
      : 'http://localhost:3000',
  debug: env.isLocal || env.isDevelopment,
  caching: env.isProduction || env.isStaging
};
```

### Integration with Talos App

```typescript
import { App } from '@talosjs/app';
import { AppEnv, type EnvType } from '@talosjs/app-env';

const app = new App({
  env: new AppEnv(process.env.APP_ENV as EnvType),
  // ... other config
});

await app.run();
```

## API Reference

### Classes

#### `AppEnv`

Main class for environment configuration and detection.

**Constructor:**
```typescript
new AppEnv(env: EnvType)
```

**Parameters:**
- `env` - The environment type string

**Throws:** `AppEnvException` if env is not provided or invalid

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `env` | `EnvType` | The current environment string |
| `isLocal` | `boolean` | True if environment is "local" |
| `isDevelopment` | `boolean` | True if environment is "development" |
| `isStaging` | `boolean` | True if environment is "staging" |
| `isTesting` | `boolean` | True if environment is "testing" |
| `isTest` | `boolean` | True if environment is "test" |
| `isQa` | `boolean` | True if environment is "qa" |
| `isUat` | `boolean` | True if environment is "uat" |
| `isIntegration` | `boolean` | True if environment is "integration" |
| `isPreview` | `boolean` | True if environment is "preview" |
| `isDemo` | `boolean` | True if environment is "demo" |
| `isSandbox` | `boolean` | True if environment is "sandbox" |
| `isBeta` | `boolean` | True if environment is "beta" |
| `isCanary` | `boolean` | True if environment is "canary" |
| `isHotfix` | `boolean` | True if environment is "hotfix" |
| `isProduction` | `boolean` | True if environment is "production" |

**Example:**
```typescript
const env = new AppEnv('production');

console.log(env.env);           // "production"
console.log(env.isProduction);  // true
console.log(env.isDevelopment); // false
```

### Enums

#### `Environment`

Enum containing all valid environment values.

```typescript
enum Environment {
  LOCAL = "local",
  DEVELOPMENT = "development",
  STAGING = "staging",
  TESTING = "testing",
  TEST = "test",
  QA = "qa",
  UAT = "uat",
  INTEGRATION = "integration",
  PREVIEW = "preview",
  DEMO = "demo",
  SANDBOX = "sandbox",
  BETA = "beta",
  CANARY = "canary",
  HOTFIX = "hotfix",
  PRODUCTION = "production",
}
```

### Types

#### `EnvType`

```typescript
type EnvType = `${Environment}`;
// Equivalent to: "local" | "development" | "staging" | "testing" | "test" | "qa" | "uat" | "integration" | "preview" | "demo" | "sandbox" | "beta" | "canary" | "hotfix" | "production"
```

#### `IAppEnv`

```typescript
interface IAppEnv {
  readonly env: EnvType;
  readonly isLocal: boolean;
  readonly isDevelopment: boolean;
  readonly isStaging: boolean;
  readonly isTesting: boolean;
  readonly isTest: boolean;
  readonly isQa: boolean;
  readonly isUat: boolean;
  readonly isIntegration: boolean;
  readonly isPreview: boolean;
  readonly isDemo: boolean;
  readonly isSandbox: boolean;
  readonly isBeta: boolean;
  readonly isCanary: boolean;
  readonly isHotfix: boolean;
  readonly isProduction: boolean;
}
```

#### `AppEnvClassType`

```typescript
type AppEnvClassType = new (env: EnvType) => IAppEnv;
```

## Advanced Usage

### Custom Environment Helper

```typescript
import { AppEnv, type IAppEnv } from '@talosjs/app-env';

function isProductionLike(env: IAppEnv): boolean {
  return env.isProduction || env.isStaging || env.isUat;
}

function isDevelopmentLike(env: IAppEnv): boolean {
  return env.isLocal || env.isDevelopment || env.isTest;
}

const env = new AppEnv('staging');
console.log(isProductionLike(env)); // true
```

### Error Handling

```typescript
import { AppEnv, AppEnvException } from '@talosjs/app-env';

try {
  const env = new AppEnv('' as any);
} catch (error) {
  if (error instanceof AppEnvException) {
    console.error('Invalid environment:', error.message);
    // Handle missing or invalid environment
  }
}
```

### Feature Flags Based on Environment

```typescript
import { AppEnv } from '@talosjs/app-env';

const env = new AppEnv('beta');

const features = {
  newDashboard: env.isBeta || env.isCanary,
  experimentalApi: env.isLocal || env.isDevelopment,
  analytics: env.isProduction || env.isStaging,
  debugToolbar: !env.isProduction,
  maintenanceMode: env.isHotfix
};
```

### Logging Configuration

```typescript
import { AppEnv } from '@talosjs/app-env';

const env = new AppEnv('development');

const logConfig = {
  level: env.isProduction ? 'error' : env.isStaging ? 'warn' : 'debug',
  prettyPrint: env.isLocal || env.isDevelopment,
  includeStackTrace: !env.isProduction
};
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun run test`
4. Build the project: `bun run build`

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation for API changes
- Ensure all tests pass before submitting PR

---

Made with ❤️ by the Talos team
