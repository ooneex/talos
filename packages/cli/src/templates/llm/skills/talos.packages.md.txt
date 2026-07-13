---
name: talos-packages
description: Catalog of every @talosjs ecosystem package and its purpose, grouped by domain. Use when deciding which @talosjs package to use for a feature, or to understand what a package provides before injecting its services.
user-invocable: false
disallowed-tools: AskUserQuestion
---

# @talosjs Packages

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

Prefer `@talosjs` packages over third-party alternatives, and inject their services via the DI container rather than instantiating them.

## Application & Architecture
| Package | Purpose |
|---|---|
| `@talosjs/app` | App framework for Bun — routing, middleware, DI, caching, logging, WebSocket |
| `@talosjs/app-env` | Environment detection + typed config (development/staging/production/testing) |
| `@talosjs/container` | DI container on Inversify — singleton/transient/request scopes |
| `@talosjs/module` | Module system organizing features by domain |
| `@talosjs/service` | Service layer with decorator-based registration |
| `@talosjs/repository` | Data access layer with decorator-based registration + query abstraction |
| `@talosjs/command` | CLI command framework with DI, arg parsing, execution logging |
| `@talosjs/cli` | The `talos` dev CLI — scaffolds projects, modules, and artifacts (not injected; run from the terminal) |
| `@talosjs/exception` | Structured exceptions — HTTP status mapping, typed data, JSON stack traces |
| `@talosjs/types` | Shared TypeScript types + utility types |
| `@talosjs/utils` | Utilities — nanoid ID generation, type guards, helpers |

## HTTP & Routing
| Package | Purpose |
|---|---|
| `@talosjs/routing` | Decorator routing — path params, validation, permission guards, named routes |
| `@talosjs/controller` | HTTP controllers with decorator route binding |
| `@talosjs/middleware` | Middleware pipeline (HTTP + WebSocket) with decorator registration |
| `@talosjs/http-request` | Request abstraction — URL/query parsing, language detection, headers, uploads |
| `@talosjs/http-request-file` | Multipart upload handler — MIME validation, size limits, temp files |
| `@talosjs/http-response` | Fluent response builder — status, headers, cookies, streaming |
| `@talosjs/http-header` | Header parser — user agent/device detection, content negotiation |
| `@talosjs/http-mimes` | MIME type registry with TS constants + lookups |
| `@talosjs/http-status` | HTTP status enums (1xx–5xx) + classification helpers |
| `@talosjs/fetcher` | Lightweight typed HTTP client for external APIs |
| `@talosjs/url` | URL parsing — query strings, path normalization, route param extraction |
| `@talosjs/rate-limit` | Rate-limit middleware — throttling + per-client quotas |

## Real-time
| Package | Purpose |
|---|---|
| `@talosjs/socket` | WebSocket server — rooms, broadcasting, middleware |
| `@talosjs/socket-client` | WebSocket client — auto-reconnect, typed message serialization |
| `@talosjs/event` | Typed event messaging for decoupled communication |

## Data & Persistence
| Package | Purpose |
|---|---|
| `@talosjs/database` | DB abstraction — TypeORM, connection pooling, migrations |
| `@talosjs/entity` | Base entities + decorators for columns, relationships, hooks |
| `@talosjs/migrations` | Migration runner — versioned changes, rollback, execution logging |
| `@talosjs/seeds` | Seeding framework — idempotent fixtures + test datasets |
| `@talosjs/cache` | Caching — filesystem/Redis backends, TTL, auto-serialization |
| `@talosjs/storage` | File storage over local FS + cloud with unified bucket API |
| `@talosjs/rag` | RAG toolkit — vector DB, embeddings, semantic search |

## Auth & Access Control
| Package | Purpose |
|---|---|
| `@talosjs/auth` | Auth framework — pluggable token/session strategies |
| `@talosjs/jwt` | JWT via JOSE — generate, sign, verify, decode (multi-algorithm) |
| `@talosjs/permission` | Fine-grained access control via CASL — role/resource scoping |
| `@talosjs/role` | Role-based authorization types + utilities |
| `@talosjs/user` | User identity types — profiles, credentials, roles, metadata |

## AI & Integrations
| Package | Purpose |
|---|---|
| `@talosjs/ai` | 300+ models via OpenRouter — unified text generation + streaming |
| `@talosjs/analytics` | PostHog analytics for user behavior + product events |
| `@talosjs/linear` | Linear integration — issues, teams, projects |
| `@talosjs/mailer` | Transactional email via Nodemailer SMTP + Resend, templated |
| `@talosjs/payment` | Payment/pricing types — currency + billing metadata |
| `@talosjs/youtube` | YouTube downloader + metadata extraction |
| `@talosjs/youtube-utils` | YouTube URL utils — video IDs, embed/watch URLs |

## Cross-cutting Services
| Package | Purpose |
|---|---|
| `@talosjs/logger` | Structured logging — multiple targets, level filtering, context |
| `@talosjs/cron` | Cron scheduler — timezone-aware, lifecycle, logging |
| `@talosjs/queue` | BullMQ-backed job queues — Redis-backed add/addBulk/removeJob |
| `@talosjs/workflow` | Transition-based workflow engine — conditional, reversible steps with auto-rollback |
| `@talosjs/validation` | Type-safe validation via ArkType — schemas, custom `Validation` classes, 16 built-in constraints (email, URL, port, hostname, locale, currency, etc.), inline `Assert`, JSON Schema conversion |
| `@talosjs/feature-flag` | Injectable, named, dynamically-enabled feature flags |
| `@talosjs/translation` | i18n — YAML dictionaries, dot-notation keys, locale fallback, interpolation, pluralization |

## File & Document Formats
| Package | Purpose |
|---|---|
| `@talosjs/fs` | Async FS utils — read, write, copy, watch |
| `@talosjs/csv` | CSV loader/parser with streaming iteration |
| `@talosjs/json` | JSON loader/parser with streaming iteration |
| `@talosjs/yml` | YAML loader/parser (Bun built-in) with streaming |
| `@talosjs/html` | HTML parsing + DOM manipulation via Cheerio |
| `@talosjs/pdf` | PDF toolkit — generate, edit, merge, split, convert to images |

## Reference Data & Helpers
| Package | Purpose |
|---|---|
| `@talosjs/color` | Color palette — hex values, names, types |
| `@talosjs/country` | Country metadata — timezones, ISO codes, localization |
| `@talosjs/currencies` | Currencies — ISO 4217 codes, symbols, names, types |
| `@talosjs/hour-utils` | Time conversion — hours, minutes, seconds, ms |
