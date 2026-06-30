# @talosjs/migrations

Database migration runner with versioned schema changes, rollback support, execution logging, and container-aware lifecycle management.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Versioned Migrations** - Timestamp-based migration versioning with automatic ordering

✅ **Up/Down Methods** - Each migration defines `up` and `down` for applying and rolling back changes

✅ **Dependency Support** - Migrations can declare dependencies on other migrations

✅ **Transaction Safety** - Each migration runs inside a database transaction

✅ **Migration Tracking** - Tracks executed migrations in a dedicated database table

✅ **Code Generation** - Create new migration files from a template with `migrationCreate`

✅ **Container Integration** - Decorator-based registration with dependency injection

✅ **Terminal Logging** - Progress and error reporting via the TerminalLogger

## Installation

```bash
bun add @talosjs/migrations
```

## Usage

### Creating a Migration

```typescript
import { migrationCreate } from '@talosjs/migrations';

// Creates a new migration file in the migrations/ directory
const filePath = await migrationCreate();
console.log(`Created: ${filePath}`);
```

### Writing a Migration

```typescript
import { decorator } from '@talosjs/migrations';
import type { IMigration, MigrationClassType } from '@talosjs/migrations';
import type { SQL, TransactionSQL } from 'bun';

@decorator.migration()
class Migration20240115103045 implements IMigration {
  public async up(tx: TransactionSQL, sql: SQL): Promise<void> {
    await tx`CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )`;
  }

  public async down(tx: TransactionSQL, sql: SQL): Promise<void> {
    await tx`DROP TABLE IF EXISTS users`;
  }

  public getVersion(): string {
    return '20240115103045';
  }

  public getDependencies(): MigrationClassType[] {
    return [];
  }
}
```

### Running Migrations

```typescript
import { up } from '@talosjs/migrations';

// Uses DATABASE_URL environment variable by default
await up();

// Or with custom config
await up({
  databaseUrl: 'postgres://user:pass@localhost:5432/mydb',
  tableName: 'schema_migrations',
});
```

## API Reference

### Functions

#### `migrationCreate(config?)`

Creates a new migration file from a template.

**Parameters:**
- `config.dir` - Directory for migration files (default: `"migrations"`)

**Returns:** `Promise<string>` - Path to the created migration file

#### `up(config?)`

Runs all pending migrations in version order.

**Parameters:**
- `config.databaseUrl` - Database connection URL (default: `DATABASE_URL` env var)
- `config.tableName` - Name of the migrations tracking table (default: `"migrations"`)

#### `generateMigrationVersion()`

Generates a timestamp-based version string for new migrations.

#### `getMigrations()`

Returns all registered migrations sorted by version.

#### `createMigrationTable(sql, tableName)`

Creates the migration tracking table if it does not exist.

### Interfaces

#### `IMigration`

```typescript
interface IMigration {
  up: (tx: TransactionSQL, sql: SQL) => Promise<void>;
  down: (tx: TransactionSQL, sql: SQL) => Promise<void>;
  getVersion: () => string;
  getDependencies: () => Promise<MigrationClassType[]> | MigrationClassType[];
}
```

### Decorators

#### `@decorator.migration()`

Registers a class as a migration with the dependency injection container.

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
