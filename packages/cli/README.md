# @talosjs/cli

Interactive CLI toolkit for scaffolding Talos projects, modules, controllers, services, repositories, and more with customizable code generation templates.

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Features

✅ **Application Scaffolding** - Generate complete Talos applications with best practices

✅ **Module Generation** - Create feature modules with controllers, entities, and services

✅ **Controller Generation** - Generate HTTP and WebSocket controllers with route definitions

✅ **Service Generation** - Create service classes with dependency injection

✅ **Entity & Repository Generation** - Generate entities and repository classes

✅ **Middleware Generation** - Scaffold HTTP and WebSocket middleware classes

✅ **Interactive Prompts** - User-friendly prompts with input validation constraints

✅ **Docker Support** - Add docker services to docker-compose.yml

✅ **Migration & Seeds** - Create database migrations and seed files

✅ **AI & Vector Database** - Generate AI and vector database classes

✅ **Claude Skill Generation** - Scaffold Claude AI skill templates

✅ **Comprehensive Templates** - 20+ code generation commands covering cron, logger, mailer, storage, analytics, cache, permissions, pub/sub, and more

## Installation

### Bun (Global)
```bash
bun add -g @talosjs/cli
```

### Bun (Local)
```bash
bun add -D @talosjs/cli
```

## Usage

### Creating a New Application

```bash
talos app:create
```

This command will interactively prompt you for:
- Application name
- Destination path

The generated application includes:
- Configured `package.json` with all necessary dependencies
- TypeScript configuration
- Biome linting setup
- Git configuration with `.gitignore`
- Initial app module

### Generating a Module

```bash
talos module:create
```

Creates a new feature module with:
- Module file (`src/ModuleNameModule.ts`)
- Migrations directory (`src/migrations/`)
- Seeds directory (`src/seeds/`)
- Bin scripts (`bin/migration/up.ts`, `bin/seed/run.ts`)
- Test file
- `package.json` and `tsconfig.json`

### Generating a Controller

```bash
talos controller:create
```

Interactive prompts will ask for:
- Controller name
- Socket or HTTP controller
- Route name (e.g., api.user.create)
- Route path
- HTTP method (for HTTP controllers)

**Example output:**
```
✔ src/controllers/UserListController.ts created successfully
✔ src/types/routes/api.users.list.ts created successfully
✔ tests/controllers/UserListController.spec.ts created successfully
```

### Generating a Service

```bash
talos service:create
```

Creates a service class with:
- Service file
- Test file

### Generating an Entity

```bash
talos entity:create
```

Creates a TypeORM entity with:
- Entity file
- Test file

### Installing Zsh Completions

```bash
talos completion:zsh
```

Installs Zsh completions for the `oo` and `talos` commands with context-aware option suggestions per command.

### Additional Commands

| Command | Description |
|---------|-------------|
| `completion:zsh` | Install Zsh completion for oo command |
| `ai:chat:create` | Generate a new AI chat class |
| `ai:tool:create` | Generate a new AI tool class |
| `ai:middleware:create` | Generate a new AI middleware class |
| `analytics:create` | Generate a new analytics class |
| `cache:create` | Generate a new cache class |
| `cron:create` | Generate a new cron class |
| `database:create` | Generate a new database class |
| `docker:create` | Add a docker service to docker-compose.yml |
| `event:create` | Generate a new PubSub event class |
| `flag:create` | Generate a new feature flag class |
| `logger:create` | Generate a new logger class |
| `mailer:create` | Generate a new mailer class |
| `middleware:create` | Generate a new middleware class |
| `migration:create` | Generate a new migration file |
| `permission:create` | Generate a new permission class |
| `repository:create` | Generate a new repository class |
| `seed:create` | Generate a new seed file |
| `storage:create` | Generate a new storage class |
| `translation:create` | Generate a new translation class |
| `vector-database:create` | Generate a new vector database class |
| `claude:init` | Initialize Claude configuration and skills |
| `commitlint:init` | Install a git commit-msg hook that lints commit messages |

## API Reference

### Interfaces

#### `ICommand<Options>`

Interface for creating custom CLI commands.

```typescript
interface ICommand<Options extends Record<string, unknown> = Record<string, unknown>> {
  run: (options: Options) => Promise<void> | void;
  getName: () => string;
  getDescription: () => string;
}
```

### Types

#### `CommandClassType`

```typescript
type CommandClassType = new (...args: any[]) => ICommand;
```

### Decorators

#### `@decorator.command()`

Decorator to register a command with the CLI container.

```typescript
import { decorator } from '@talosjs/cli';
import type { ICommand } from '@talosjs/cli';

@decorator.command()
class MyCustomCommand implements ICommand {
  public getName(): string {
    return 'my:command';
  }

  public getDescription(): string {
    return 'My custom command description';
  }

  public async run(options: Record<string, unknown>): Promise<void> {
    // Command implementation
  }
}
```

## Advanced Usage

### Creating Custom Commands

```typescript
import { decorator } from '@talosjs/cli';
import type { ICommand } from '@talosjs/cli';
import { TerminalLogger } from '@talosjs/logger';

type MyCommandOptions = {
  name?: string;
  verbose?: boolean;
};

@decorator.command()
class MyCustomCommand implements ICommand<MyCommandOptions> {
  private readonly logger = new TerminalLogger();

  public getName(): string {
    return 'custom:generate';
  }

  public getDescription(): string {
    return 'Generate custom files for the project';
  }

  public async run(options: MyCommandOptions): Promise<void> {
    const { name, verbose } = options;

    if (verbose) {
      this.logger.info('Running in verbose mode');
    }

    // Custom generation logic
    await Bun.write('output.ts', 'export const example = true;');

    this.logger.success('File generated successfully', undefined, {
      showTimestamp: false,
      showArrow: false,
      useSymbol: true,
    });
  }
}
```

### Using with Arguments

```bash
talos controller:create --name UserList --route-name api.users.list --route-path /api/users --route-method GET
```

Available CLI flags: `--name`, `--route-name`, `--route-path`, `--route-method`, `--is-socket`, `--dir`, `--channel`, `--table-name`.

### Programmatic Usage

```typescript
import { getCommand } from '@talosjs/cli';

const command = getCommand('controller:create');

if (command) {
  await command.run({
    name: 'UserList',
    isSocket: false,
    route: {
      name: 'api.users.list',
      path: '/api/users',
      method: 'GET'
    }
  });
}
```

### Generated Application Structure

When running `app:create`, the following structure is created:

```
my-app/
├── modules/
│   └── app/
│       ├── src/
│       │   └── AppModule.ts
│       │   └── index.ts
│       ├── tests/
│       │   └── AppModule.spec.ts
│       ├── var/
│       ├── package.json
│       └── tsconfig.json
├── .env
├── .env.example
├── .gitignore
├── biome.jsonc
├── bunfig.toml
├── package.json
└── tsconfig.json
```

### Generated Module Structure

```
modules/
└── user/
    ├── bin/
    │   ├── migration/
    │   │   └── up.ts
    │   └── seed/
    │       └── run.ts
    ├── src/
    │   ├── migrations/
    │   │   └── migrations.ts
    │   ├── seeds/
    │   │   └── seeds.ts
    │   └── UserModule.ts
    ├── tests/
    │   └── UserModule.spec.ts
    ├── package.json
    └── tsconfig.json
```

## Error Handling

The CLI provides informative error messages when something goes wrong:

```typescript
import { CommandException } from '@talosjs/cli';

// Errors are automatically caught and displayed
// with proper formatting via TerminalLogger
```

## Environment

The CLI respects the following environment variables:

| Variable | Description |
|----------|-------------|
| `CWD` | Custom working directory for file generation |

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
