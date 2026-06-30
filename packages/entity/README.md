# @talosjs/entity

Base entity classes and decorators for defining database models with type-safe column mappings, relationships, and lifecycle hooks. This package provides the foundational `IEntity` interface and `EntityClassType` used across the Talos framework for domain-driven design patterns.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Base Interface** - `IEntity` interface with required `id` field for all domain entities

✅ **Class Type** - `EntityClassType` for type-safe entity class references in DI and repositories

✅ **Domain-Driven Design** - Foundation for building domain models in the Talos framework

✅ **Type-Safe** - Full TypeScript support with proper type definitions

✅ **Lightweight** - Minimal package with zero runtime dependencies

## Installation

```bash
bun add @talosjs/entity
```

## Usage

### Implementing an Entity

```typescript
import type { IEntity } from '@talosjs/entity';

class UserEntity implements IEntity {
  id: string;
  name: string;
  email: string;

  constructor(id: string, name: string, email: string) {
    this.id = id;
    this.name = name;
    this.email = email;
  }
}
```

### Using EntityClassType

```typescript
import type { EntityClassType, IEntity } from '@talosjs/entity';

function createRepository(entityClass: EntityClassType) {
  // Use entity class reference for DI or repository creation
  const instance = new entityClass();
  return instance;
}
```

## API Reference

### Interfaces

#### `IEntity`

Base interface for all domain entities.

```typescript
interface IEntity {
  id: string;
}
```

**Properties:**
- `id` - Unique string identifier for the entity

### Types

#### `EntityClassType`

Constructor type for entity classes implementing `IEntity`.

```typescript
type EntityClassType = new (...args: any[]) => IEntity;
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
