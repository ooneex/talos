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
  <img src="assets/logo-full.svg" alt="Talos" width="220">

  <br />
  <br />

  <p align="center">
    <strong>The TypeScript framework for the AI era, designed for Spec-Driven Development.</strong>
    <br />
    A modular framework built on Bun — 60+ independent packages, from a weekend project to a production SaaS, with no rewrite in between.
    <br />
    <br />
    <a href="https://docs.talosjs.com/getting-started"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://docs.talosjs.com/getting-started/create-app">Create an app</a>
    &middot;
    <a href="https://github.com/ooneex/talos/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/ooneex/talos/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#why-talos">Why Talos</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#create-your-app">Create your app</a></li>
        <li><a href="#build-your-first-resource">Build your first resource</a></li>
      </ul>
    </li>
    <li>
      <a href="#usage">Usage</a>
      <ul>
        <li><a href="#routing--controllers">Routing &amp; Controllers</a></li>
        <li><a href="#validation--access-control">Validation &amp; Access Control</a></li>
      </ul>
    </li>
    <li><a href="#spec-driven-development">Spec-Driven Development</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li>
      <a href="#development">Development</a>
      <ul>
        <li><a href="#working-on-the-monorepo">Working on the Monorepo</a></li>
        <li><a href="#commands">Commands</a></li>
        <li><a href="#commit-conventions">Commit Conventions</a></li>
      </ul>
    </li>
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

**Talos is a modular TypeScript framework built on [Bun](https://bun.sh).** It is the first framework designed around **Spec-Driven Development**, so AI agents work from your real intent rather than guesswork. Its 60+ independent packages — published under the `@talosjs` namespace and each versioned on its own — cover everything from HTTP, data, and security to real-time, AI, and utilities.

Stop prompting blind. With Talos, your work lives as structured **specs** that AI agents can find, plan, and implement against your real conventions, with every step transparent and verifiable. The same framework powers a small side project, a medium product, and a large multi-service platform — start simple, grow without rewrites.

📚 **Full documentation:** [docs.talosjs.com](https://docs.talosjs.com/getting-started)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Why Talos

- **Ship fast** — Decorator-driven routes, services, and repositories with sensible defaults. Go from idea to a running app in minutes, not days.
- **Built for the AI era** — AI agents, RAG, and a Spec-Driven workflow live in the core, so your framework speaks the language of the tools building it.
- **Scales with you** — One framework for side projects, products, and multi-service platforms. No rewrite between stages.
- **Everything a SaaS needs** — Auth, JWT, roles, permissions, payments, caching, queues, mailer, and more, ready to use.
- **Type-safe end to end** — Strict TypeScript with runtime validation via [ArkType](https://arktype.io/); your `params`, `payload`, `queries`, and `response` shapes flow through the whole handler.
- **Easy to extend** — Dependency injection and a clean module system let you add, swap, or override anything without fighting the framework.

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

<!-- GETTING STARTED -->
## Getting Started

Go from an empty machine to a running Talos app with its first domain in a few commands.

### Prerequisites

The CLI runs on [Bun](https://bun.sh). Install it first:

```sh
curl -fsSL https://bun.sh/install | bash
```

Verify the install:

```sh
bun --version
```

### Create your app

1. **Install the CLI globally.** It exposes two interchangeable binaries, `talos` and its short alias `oo`.

   ```sh
   bun add -g @talosjs/cli
   talos help
   ```

   > Prefer not to install globally? Run any command through `bunx`, e.g. `bunx @talosjs/cli@latest app:create`.

2. **Scaffold a complete application.** This creates the `app` and `shared` modules, the entrypoint, the shared database, roles, Docker files, and config, then installs dependencies.

   ```sh
   talos app:create --name=MovieApp --destination=movie-app
   cd movie-app
   ```

3. **Start the development environment.** `app:start` brings up the shared Docker stack, then runs every `api`, `microservice`, and `spa` module concurrently with hot reload. Pass a type flag to narrow what runs.

   ```sh
   talos app:start                            # everything
   talos app:start --api                      # only the api modules
   talos app:start --spa                      # only the spa modules
   talos app:start --microservice=billing     # only the named microservice
   ```

   Stop it again with `talos app:stop`, and build for production with `talos app:build`.

   > The environment file is generated at `modules/shared/.env.yml`. Edit it to point at your database, Redis, and other services before starting.

Every business domain you add becomes its own module under `modules/<name>/` — a self-contained vertical slice with its own controllers, services, repositories, entities, and config, registered automatically into `AppModule`.

### Build your first resource

With the app scaffolded, build a `Movie` domain. Run the generators in order — each scaffolds the class plus a mirrored test file and registers it into the module:

```sh
# 1. Module — generates modules/movie/ and registers it into AppModule
talos module:create --name=movie --destination=app

# 2. Entity — the `Entity` suffix is appended automatically → MovieEntity, table `movies`
talos entity:create --name=Movie --module=movie --table-name=movies

# 3. Repository — full CRUD over the entity
talos repository:create --name=Movie --module=movie

# 4. Controller — one route per controller; repeat per endpoint
talos controller:create \
  --name=MovieList --module=movie \
  --route-name=movie.list --route-path=/movies --route-method=get
```

Prefer an AI agent? Initialize the skills once (`talos claude:init` or `talos codex:init`), then describe the whole `Movie` domain in a single prompt — the agent drives the same `module:create`, `entity:create`, `repository:create`, and `controller:create` generators and writes the tests. See [Create your app](https://docs.talosjs.com/getting-started/create-app) for the full walkthrough.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE -->
## Usage

### Routing & Controllers

Routing is decorator-bound: you never wire a route table by hand. Decorate a controller class with a `@Route` decorator, and the framework registers the path, method, and validation for you. A controller is a class with a single `index(context)` method — there is no base class and no boilerplate. When a request matches, the framework builds a fully typed `context` (request, response builder, logger, cache, user, locale, route metadata) and calls `index`.

```typescript
import type { ContextType, IController } from "@talosjs/controller";
import type { IResponse } from "@talosjs/http-response";
import { Route } from "@talosjs/routing";

@Route.get("/api/users", {
  name: "api.users.list",
  version: 1,
  description: "List all users",
})
export class UserListController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    return context.response.json({
      users: [{ id: 1, name: "John" }],
    });
  }
}
```

Every route carries a unique `name` in `namespace.resource.action` form, so you generate URLs from the name rather than hardcoding paths:

```typescript
import { router } from "@talosjs/routing";

router.generate("api.users.show", { id: "123" }); // "/api/users/123"
```

The same decorator family declares WebSocket endpoints with `@Route.socket(...)`, whose context adds a `channel` API for subscribing and publishing.

### Validation & Access Control

Declare `params`, `queries`, and `payload` schemas on the route and they run **before** your controller, so `index` receives typed, trusted data. Set `roles` (or a `permission` class, or `env`/`ip`/`host` lists) right on the route so the contract states who may reach it.

```typescript
import type { ContextType, IController } from "@talosjs/controller";
import type { IResponse } from "@talosjs/http-response";
import { Route } from "@talosjs/routing";
import { Assert } from "@talosjs/validation";

type UserCreateRouteType = {
  payload: { email: string; name: string; password: string };
  response: { id: string; name: string; email: string };
};

@Route.post("/api/users", {
  name: "api.users.create",
  version: 1,
  description: "Create a new user account",
  payload: Assert({
    email: "string.email",
    name: "string >= 2",
    password: "8 <= string <= 100",
  }),
  response: Assert({ id: "string", name: "string", email: "string" }),
  roles: ["ROLE_ADMIN"],
})
export class UserCreateController implements IController {
  constructor(private readonly userService: UserService) {}

  public async index(
    context: ContextType<UserCreateRouteType>,
  ): Promise<IResponse> {
    const data = await context.request.payload();
    const user = await this.userService.execute(data);

    return context.response.json(user, 201);
  }
}
```

Keep controllers thin: validate and shape the request, hand the work to an injected service, and return through the `context.response` builder — no business logic in `index`. Read the deep dives on [Routing](https://docs.talosjs.com/basics/routing) and [Controllers](https://docs.talosjs.com/components/controller).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- SPEC-DRIVEN DEVELOPMENT -->
## Spec-Driven Development

Talos turns vague requests into structured **specs** — YAML issues with context, goals, a definition of done, and dependencies — that flow through a transparent AI workflow. AI agents find, plan, and implement against your module's real conventions, and each step is verifiable against the spec's definition of done.

| Step | Command | What it does |
|------|---------|--------------|
| **Find** | `/issue:found` | Audits a module's source to surface concrete findings as candidate issues. |
| **Plan** | `/issue:plan` | Turns a free-form request into a precise, reviewable spec before any code is written. |
| **Fix** | `/issue:fix` | Implements each planned issue, runs lint, and verifies every acceptance criterion before marking it done. |

Each unit of work becomes a YAML file under `issues/`, evolving through four fields — `context`, `goal`, `dod` (definition of done), and `dependencies` — and progressing from `Backlog` to `Done`. Get started by initializing the AI skills for your agent:

```sh
talos claude:init   # or: talos codex:init
```

Learn more in the [Spec-Driven Development guide](https://docs.talosjs.com/ai/spec-driven-development).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->
## Roadmap

See the [open issues](https://github.com/ooneex/talos/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- DEVELOPMENT -->
## Development

### Working on the Monorepo

To develop the framework packages themselves:

```sh
git clone https://github.com/ooneex/talos.git
cd Talos
bun install        # install dependencies
bun run build      # build all packages
bun run test       # run the test suite
```

### Commands

| Command | Description |
|---------|-------------|
| `bun run build` | Build all packages (Nx `run-many`) |
| `bun run test` | Run all tests |
| `bun run lint` | Lint all packages (Biome + TypeScript) |
| `bun run fmt` | Format and auto-fix code with Biome |
| `bun run check` | Install + build + lint + test (full validation) |
| `bun run npm:publish` | Publish all packages to npm |
| `bunx nx graph` | Visualize the dependency graph |

Run the tests for a single package with `bun test packages/<package-name>/tests`.

### Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint and Husky pre-commit hooks.

```
type(scope): Subject line
```

**Types:** `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `build`, `ci`, `revert`

**Scopes:** Package names (e.g., `routing`, `cache`) or `common` for repo-wide changes.

```sh
feat(service): Add decorators and tests
fix(routing): Resolve path parameter parsing
chore(common): Update bun.lock dependencies
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open-source community such an amazing place to learn and build. Any contributions you make are **greatly appreciated**.

1. Fork the project
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat(scope): Add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a pull request

Don't forget to give the project a star ⭐ — thanks!

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
[contributors-shield]: https://img.shields.io/github/contributors/ooneex/talos.svg?style=for-the-badge&color=432371
[contributors-url]: https://github.com/ooneex/talos/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/ooneex/talos.svg?style=for-the-badge&color=FAAE7B
[forks-url]: https://github.com/ooneex/talos/network/members
[stars-shield]: https://img.shields.io/github/stars/ooneex/talos.svg?style=for-the-badge&color=2ea043
[stars-url]: https://github.com/ooneex/talos/stargazers
[issues-shield]: https://img.shields.io/github/issues/ooneex/talos.svg?style=for-the-badge&color=e34c26
[issues-url]: https://github.com/ooneex/talos/issues
[license-shield]: https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge&color=60A5FA
[license-url]: https://github.com/ooneex/talos/blob/main/LICENSE
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
