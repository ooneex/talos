<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/Talos/Talos">
    <img src="assets/logo-full.svg" alt="Talos" width="180" height="38">
  </a>

  <br />
  <br />

  <p align="center">
    A modular TypeScript framework built on Bun — 50+ independent packages for building modern web applications.
    <br />
    <br />
    <a href="https://github.com/Talos/Talos/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/Talos/Talos/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
        <li><a href="#packages">Packages</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#architecture">Architecture</a></li>
    <li><a href="#development">Development</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

<div align="center">
  <img src="assets/banner.svg" alt="Talos Architecture" width="900">
</div>

<br />

Talos is a comprehensive TypeScript monorepo framework designed for the [Bun](https://bun.sh) runtime. It provides a rich ecosystem of 50+ independently versioned packages under the `@talos` namespace, covering everything from dependency injection and routing to database management, caching, authentication, and real-time communication.

**Key highlights:**

- **Modular architecture** — Use only the packages you need. Each package is independently versioned and published to npm.
- **Dependency injection** — Built on [InversifyJS](https://inversify.io/) with decorator-driven service registration and lifecycle management (singleton, transient, request-scoped).
- **Decorator-driven design** — Define routes, services, repositories, and middlewares using clean, expressive decorators.
- **Type-safe** — Strict TypeScript configuration with comprehensive type checking and runtime validation via [ArkType](https://arktype.io/).
- **Bun-first** — Optimized for the Bun runtime with fast builds via [bunup](https://github.com/nicepkg/bunup) and native Bun test runner support.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

[![Bun][Bun-badge]][Bun-url]
[![TypeScript][TypeScript-badge]][TypeScript-url]
[![Nx][Nx-badge]][Nx-url]
[![Biome][Biome-badge]][Biome-url]
[![InversifyJS][Inversify-badge]][Inversify-url]
[![TypeORM][TypeORM-badge]][TypeORM-url]
[![React][React-badge]][React-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Packages

The framework is organized into 50+ packages across several categories:

#### Core
| Package | Description |
|---------|-------------|
| `@talosjs/container` | Dependency injection container built on Inversify |
| `@talosjs/exception` | Base exception classes with HTTP status codes |
| `@talosjs/types` | Shared TypeScript type definitions and utility types |
| `@talosjs/http-status` | HTTP status code definitions |
| `@talosjs/utils` | Common utility functions |

#### Application
| Package | Description |
|---------|-------------|
| `@talosjs/app` | Main application orchestrator with middleware pipelines |
| `@talosjs/app-env` | Application environment configuration |
| `@talosjs/routing` | Decorator-driven HTTP routing with validation constraints |
| `@talosjs/controller` | Controller base classes |
| `@talosjs/middleware` | Middleware pipeline system |
| `@talosjs/module` | Module system for organizing application features |

#### HTTP
| Package | Description |
|---------|-------------|
| `@talosjs/http-request` | HTTP request handling and parsing |
| `@talosjs/http-request-file` | File upload handling |
| `@talosjs/http-response` | HTTP response building |
| `@talosjs/http-header` | HTTP header management |
| `@talosjs/http-mimes` | MIME type definitions |
| `@talosjs/url` | URL parsing and building |
| `@talosjs/fetcher` | HTTP client for external requests |

#### Data
| Package | Description |
|---------|-------------|
| `@talosjs/database` | Database abstraction layer with TypeORM integration |
| `@talosjs/entity` | Entity base classes for ORM models |
| `@talosjs/repository` | Repository pattern implementation |
| `@talosjs/migrations` | Database migration management |
| `@talosjs/seeds` | Database seeding utilities |
| `@talosjs/cache` | High-performance caching with filesystem and Redis backends |
| `@talosjs/validation` | Data validation framework |

#### Security
| Package | Description |
|---------|-------------|
| `@talosjs/auth` | Authentication framework with pluggable strategies |
| `@talosjs/jwt` | JSON Web Token handling |
| `@talosjs/permission` | Permission management system |
| `@talosjs/role` | Role-based access control |
| `@talosjs/rate-limit` | Rate limiting for API protection |
| `@talosjs/user` | User management |

#### Services
| Package | Description |
|---------|-------------|
| `@talosjs/service` | Service base classes and decorators |
| `@talosjs/logger` | Structured logging with multiple output targets |
| `@talosjs/mailer` | Email sending service |
| `@talosjs/storage` | File storage abstraction |
| `@talosjs/cron` | Scheduled task management |
| `@talosjs/event` | Publish/subscribe messaging |
| `@talosjs/analytics` | Analytics tracking |

#### Real-Time & Communication
| Package | Description |
|---------|-------------|
| `@talosjs/socket` | WebSocket server support |
| `@talosjs/socket-client` | WebSocket client |

#### AI & Content
| Package | Description |
|---------|-------------|
| `@talosjs/ai` | AI integration utilities |
| `@talosjs/rag` | Retrieval-Augmented Generation support |
| `@talosjs/pdf` | PDF generation and processing |
| `@talosjs/html` | HTML templating and rendering |
| `@talosjs/translation` | Internationalization and localization |
| `@talosjs/youtube` | YouTube API integration |

#### Utilities
| Package | Description |
|---------|-------------|
| `@talosjs/fs` | File system utilities |
| `@talosjs/country` | Country data and lookup |
| `@talosjs/currencies` | Currency data and formatting |
| `@talosjs/payment` | Payment processing integration |
| `@talosjs/cli` | CLI tools and code generators |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (latest version recommended)

  ```sh
  curl -fsSL https://bun.sh/install | bash
  ```

### Installation

1. Clone the repository

   ```sh
   git clone https://github.com/Talos/Talos.git
   cd Talos
   ```

2. Install dependencies

   ```sh
   bun install
   ```

3. Build all packages

   ```sh
   bun run build
   ```

4. Run the test suite

   ```sh
   bun run test
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE -->
## Usage

Install individual packages from npm as needed:

```sh
bun add @talosjs/app @talosjs/routing @talosjs/container
```

### Defining a Service

```typescript
import { decorator } from "@talosjs/service";

@decorator.service()
class UserService {
  findAll() {
    // ...
  }
}
```

### Defining a Route

```typescript
import { decorator } from "@talosjs/routing";

@decorator.controller()
class UserController {
  @decorator.get("/users")
  index() {
    // ...
  }
}
```

### Using the DI Container

```typescript
import { Container } from "@talosjs/container";

const userService = Container.get<UserService>(UserService);
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ARCHITECTURE -->
## Architecture

```
Talos/
├── packages/           # All 50+ independent packages
│   ├── app/            # Application orchestrator
│   ├── container/      # DI container (core dependency)
│   ├── routing/        # HTTP routing
│   ├── database/       # Database layer
│   └── ...
├── nx.json             # Nx monorepo configuration
├── tsconfig.json       # Shared TypeScript config
├── biome.jsonc         # Linting and formatting rules
└── package.json        # Root workspace configuration
```

### Dependency Injection

The framework uses a centralized DI container based on InversifyJS. Each package provides decorators that register classes with the container using configurable scopes:

- **Singleton** (default) — One instance shared across the entire application
- **Transient** — New instance created on every resolution
- **Request** — One instance per HTTP request lifecycle

### Naming Conventions

Strictly enforced by decorators at registration time:

| Type | Suffix | Example |
|------|--------|---------|
| Service | `Service` | `UserService` |
| Repository | `Repository` | `UserRepository` |
| Middleware | `Middleware` | `AuthMiddleware` |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- DEVELOPMENT -->
## Development

### Commands

| Command | Description |
|---------|-------------|
| `bun run build` | Build all packages |
| `bun run test` | Run all tests |
| `bun run lint` | Lint all packages (Biome + TypeScript) |
| `bun run fmt` | Format code with Biome |
| `bun run dev` | Watch mode — rebuilds on change |
| `bun run check` | Build + lint + test (full validation) |
| `bunx nx graph` | Visualize the dependency graph |

### Running Tests for a Specific Package

```sh
bun test packages/<package-name>/tests
```

### Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint and Husky pre-commit hooks.

```
type(scope): Subject line
```

**Types:** `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `build`, `ci`, `revert`

**Scopes:** Package names (e.g., `routing`, `cache`) or `common` for repo-wide changes.

```sh
# Examples
feat(service): Add decorators and tests
fix(routing): Resolve path parameter parsing
chore(common): Update bun.lock dependencies
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->
## Roadmap

See the [open issues](https://github.com/Talos/Talos/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

Contributions are welcome and appreciated. If you have a suggestion that would make this better, please fork the repo and create a pull request.

1. Fork the project
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat(scope): Add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a pull request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

- [Bun](https://bun.sh) — Fast all-in-one JavaScript runtime
- [Nx](https://nx.dev) — Smart monorepo build system
- [InversifyJS](https://inversify.io/) — Powerful IoC container for TypeScript
- [TypeORM](https://typeorm.io/) — ORM for TypeScript and JavaScript
- [ArkType](https://arktype.io/) — TypeScript's 1:1 validator
- [Biome](https://biomejs.dev/) — Fast formatter and linter
- [bunup](https://github.com/nicepkg/bunup) — Bun-native bundler

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/Talos/Talos.svg?style=for-the-badge&color=432371
[contributors-url]: https://github.com/Talos/Talos/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/Talos/Talos.svg?style=for-the-badge&color=FAAE7B
[forks-url]: https://github.com/Talos/Talos/network/members
[stars-shield]: https://img.shields.io/github/stars/Talos/Talos.svg?style=for-the-badge&color=2ea043
[stars-url]: https://github.com/Talos/Talos/stargazers
[issues-shield]: https://img.shields.io/github/issues/Talos/Talos.svg?style=for-the-badge&color=e34c26
[issues-url]: https://github.com/Talos/Talos/issues
[license-shield]: https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge&color=60A5FA
[license-url]: https://github.com/Talos/Talos/blob/main/LICENSE
[Bun-badge]: https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white
[Bun-url]: https://bun.sh
[TypeScript-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Nx-badge]: https://img.shields.io/badge/Nx-143055?style=for-the-badge&logo=nx&logoColor=white
[Nx-url]: https://nx.dev
[Biome-badge]: https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge&logo=biome&logoColor=white
[Biome-url]: https://biomejs.dev
[Inversify-badge]: https://img.shields.io/badge/InversifyJS-E8542E?style=for-the-badge
[Inversify-url]: https://inversify.io/
[TypeORM-badge]: https://img.shields.io/badge/TypeORM-FE0803?style=for-the-badge&logo=typeorm&logoColor=white
[TypeORM-url]: https://typeorm.io/
[React-badge]: https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black
[React-url]: https://react.dev/
