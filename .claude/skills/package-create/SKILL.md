---
name: package-create
description: Scaffold a new package under packages/<name>/ following the Talos monorepo conventions — package.json, tsconfig.json, bunup.config.ts, LICENSE, README.md, and empty src/index.ts and src/types.ts. Use when the user asks to create, add, or scaffold a new package.
---

# Package Create

Scaffold a new `@talosjs/<name>` package under `packages/<name>/` with the standard monorepo conventions.

## Important

Always work from the **root of the monorepo**. Packages are picked up automatically by the `packages/*` workspace glob in the root `package.json` — no workspace registration is needed.

## Workflow

### 1. Gather Package Details

Collect the following from the user (ask only for what is missing; infer reasonable defaults for the rest):

| Field | Default | Notes |
|-------|---------|-------|
| `name` | — (required) | Kebab-case directory name under `packages/` (e.g. `workflow`). Becomes `@talosjs/<name>`. |
| `description` | — (required) | One-line summary used in `package.json` and `README.md`. |
| `version` | `0.0.1` | Initial semver. |
| `target` | `bun` | bunup build target — `bun` or `browser`. Use `browser` only for packages meant to run in the browser. |
| `keywords` | inferred | Always includes `bun`, `talos`, `typescript`, plus the package name. |

Validate that `packages/<name>/` does not already exist. If it does, stop and tell the user.

### 2. Create the Files

Create the following files under `packages/<name>/`.

**`package.json`** (substitute `<name>`, `<description>`, `<version>`, keywords):

```json
{
  "name": "@talosjs/<name>",
  "description": "<description>",
  "version": "0.0.1",
  "type": "module",
  "files": [
    "dist",
    "LICENSE",
    "README.md",
    "package.json"
  ],
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      }
    },
    "./package.json": "./package.json"
  },
  "license": "MIT",
  "scripts": {
    "test": "bun test tests",
    "build": "bunup",
    "fmt": "bunx biome check --write",
    "lint": "tsgo --noEmit && bunx biome lint",
  },
  "dependencies": {},
  "keywords": [
    "bun",
    "talos",
    "typescript",
    "<name>"
  ]
}
```

**`tsconfig.json`**:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "types": ["@types/bun"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**`bunup.config.ts`** (use the chosen `target`, default `bun`):

```ts
import { defineConfig } from "bunup";
import { copy } from "bunup/plugins";

export default defineConfig({
  target: "bun",
  format: ["esm"],
  drop: ["console", "debugger"],
  packages: "external",
  sourcemap: "external",
  unused: {
    level: "error",
  },
  exports: true,
  minify: false,
  dts: {
    minify: false,
  },
  plugins: [copy(["../../LICENSE"]).to("../")],
});
```

**`LICENSE`** — the MIT license, `Copyright (c) 2025 Talos` (copy verbatim from any existing package, e.g. `packages/color/LICENSE`).

**`README.md`** (substitute `<name>` and `<description>`):

````md
# @talosjs/<name>

<description>

![Bun](https://img.shields.io/badge/Bun-Compatible-orange?style=flat-square&logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

## Installation

```bash
bun add @talosjs/<name>
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
````

**`src/index.ts`** — empty.

**`src/types.ts`** — empty.

### 3. Confirm Creation

Report the created path (`packages/<name>/`) and list the files written. Note that `src/index.ts` and `src/types.ts` are intentionally empty entry points ready for implementation.

## Notes

- If the user already provided all details, skip prompting and write the files directly.
- Never register the package in the root `package.json` — the `packages/*` glob handles it.
- Keep `src/index.ts` and `src/types.ts` empty; this skill scaffolds structure, not implementation.
