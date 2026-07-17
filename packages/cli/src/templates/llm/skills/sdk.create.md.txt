---
name: sdk-create
description: Generate a browser SDK module from a target app or microservice's controllers, then complete the generated api methods.
when_to_use: Use when creating a typed client SDK that calls backend controllers over HTTP via @talosjs/fetcher, HTTP streaming / Server-Sent Events via native fetch, or WebSocket via @talosjs/socket-client.
model: sonnet
effort: high
allowed-tools: Bash(talos sdk:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<name>] [--module=<target>]
---

# Make SDK Module

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

Generate an SDK module from a target module's controllers, then complete each generated `api` method. Follow `talos-scaffold` for run-from-root and lint/format; this covers only SDK-specific parts.

- **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/`. Check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.
- An SDK is **not** a regular artifact: it scaffolds a whole module (one file per source module), registers nothing in `AppModule`/`SharedModule`, and has no `.spec.ts`. After generating, fill in the `api` bodies and the endpoint prefix.

## Steps

### 1. Run the generator

From the **monorepo root**:

```bash
talos sdk:create --name=<name> --module=<module>
```

- `--name` — SDK module name ("browser SDK for the storefront" → `storefront`). Normalized to kebab-case, trailing `Module` stripped. Defaults to `sdk`. Package: `@<root-package-scope>/<name>`.
- `--module` — the **target** to generate from. Defaults to `app` (an `api`-typed module).
  - Target `type: api` → aggregates controllers of every backend `module` and `api` module.
  - Target `type: microservice` → exposes only that microservice's own controllers.

The generator creates `modules/<name>/`, marks it `type: "sdk"` in `<name>.yml`, writes `bunup.config.ts`, installs `bunup`, and emits one `src/<module>.ts` per source module plus an aggregating `src/index.ts`.

**If the SDK module already exists:** do **not** re-generate existing files. Update them in place and add only what's missing — new `src/<module>.ts` files, new `api` methods for new controllers, and updated signatures/endpoints/`definition` metadata for changed controllers. Preserve method bodies you already implemented for unchanged controllers.

### 2. Understand the generated shape

Each `src/<module>.ts` exports a const with two halves:

- `definition` — static metadata per method: `key`, `version`, `description`, `roles`, `endpoint` (placeholder `"/<prefix>/v<version><path>"`).
- `api` — one method per controller, each stubbed with `throw Error("Not implemented")`.

Each `api` method takes one `input` object (`params`, `payload`, `queries`, plus `onSuccess`/`onMessage`/`onOpen`/`onClose`/`onError` callbacks) and returns `Promise<...RouteType["response"]>`. The route `type` is copied from the controller, so `params`/`payload`/`queries`/`response` are already typed.

Rules for every method (forwarded per-transport in steps 5–7):

- **Base URL** — every method takes a required `baseURL: string` (backend origin): pass to the `Fetcher` constructor for HTTP, prepend to the endpoint for streaming/SSE/sockets.
- **Auth** — a route needs auth when `definition.<method>.roles` is non-empty. Add a required `bearerToken: string` and forward it: `setBearerToken(...)` for HTTP, `Authorization: Bearer` header for streaming/SSE, `bearerToken` query param for sockets. Omit field and forwarding on public routes (`roles: []`).
- **Streaming/SSE detection** — a controller streams instead of returning JSON when its `index` returns `context.response.stream(...)` (streaming) or `context.response.sse(...)` (SSE). This is **not** in route metadata — open the controller to tell (as with the HTTP verb, step 5). Consequences: `@talosjs/fetcher` buffers/JSON-parses the whole body so it can't consume them — use native `fetch` + `response.body.getReader()` (step 6); and these responses bypass the `ResponseDataType` envelope, so the per-message callback receives the **raw** `...RouteType["response"]`, not `ResponseDataType<...>`.

### 3. Replace the endpoint prefix

In every file, replace the literal `<prefix>` in each `endpoint` with the backend's route prefix (e.g. `api`): `"/<prefix>/v1/entitlement/grants"` → `"/api/v1/entitlement/grants"`. Use the same prefix the backend mounts routes under.

### 4. Add a shared endpoint builder

Path templates may contain `:param` segments and list routes carry queries. Add this helper to each file (or factor into a small shared file):

```typescript
const buildEndpoint = (
  template: string,
  params: Record<string, unknown> = {},
  queries: Record<string, unknown> = {},
): string => {
  const path = template.replace(/:(\w+)/g, (_, key) => encodeURIComponent(String(params[key] ?? "")));
  const search = new URLSearchParams(
    Object.entries(queries)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return search ? `${path}?${search}` : path;
};
```

### 5. Implement the HTTP api methods

Pick the `Fetcher` method matching the controller's `@Route.<verb>` (not stored in the SDK — open the controller; routes with a `payload` are `post`/`put`/`patch`). Callbacks receive the full `ResponseDataType`; the method returns `response.data`.

```typescript
import { Fetcher } from "@talosjs/fetcher";
import type { ResponseDataType } from "@talosjs/http-response";

// ...generated route types and `buildEndpoint`...

export const entitlement = {
  api: {
    grant: async (input: {
      baseURL: string;
      params: GrantEntitlementRouteType["params"];
      payload: GrantEntitlementRouteType["payload"];
      queries: GrantEntitlementRouteType["queries"];
      bearerToken: string; // required: `grant`'s roles are non-empty
      onSuccess?: (response: ResponseDataType<GrantEntitlementRouteType["response"]>) => void;
      onError?: (response?: ResponseDataType<GrantEntitlementRouteType["response"]>) => void;
      // ...remaining socket-only callbacks stay in the signature, unused for HTTP...
    }): Promise<GrantEntitlementRouteType["response"]> => {
      const endpoint = buildEndpoint(entitlement.definition.grant.endpoint, input.params, input.queries);
      const response = await new Fetcher(input.baseURL)
        .setBearerToken(input.bearerToken)
        .post<GrantEntitlementRouteType["response"]>(endpoint, input.payload);
      if (response.success) {
        input.onSuccess?.(response);
      } else {
        input.onError?.(response);
      }
      return response.data;
    },
  },
  definition: {
    // ...generated, with <prefix> replaced...
  },
};
```

For `get`/`delete`/`head`/`options` there is no `payload` — call `new Fetcher().get<...>(endpoint)` with the endpoint only.

### 6. Implement the streaming and SSE api methods

Identify by reading the controller (step 2). Use native `fetch`, read `response.body` with a reader, and deliver each chunk/event through `onMessage` (raw `...RouteType["response"]`). Pass an `AbortSignal` so the caller can stop a long-lived stream.

**Server-side streaming** — match parsing to how the controller writes chunks: newline-delimited JSON (split on `\n`, `JSON.parse` each line, below), plain text (deliver the decoded string), or binary (deliver the raw `Uint8Array`). Verb: `get` for a download-style stream, `post` when it has a `payload`.

```typescript
// ...generated route types and `buildEndpoint`; native fetch, no @talosjs client import...

export: async (input: {
  baseURL: string;
  params: ExportReportRouteType["params"];
  queries: ExportReportRouteType["queries"];
  bearerToken: string; // required: `export`'s roles are non-empty
  signal?: AbortSignal;
  onMessage?: (chunk: ExportReportRouteType["response"]) => void;
  onError?: (error: unknown) => void;
}): Promise<void> => {
  const endpoint = buildEndpoint(report.definition.export.endpoint, input.params, input.queries);
  try {
    const response = await fetch(`${input.baseURL}${endpoint}`, {
      headers: { Authorization: `Bearer ${input.bearerToken}` },
      signal: input.signal,
    });
    if (!response.ok || !response.body) {
      input.onError?.(response);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          input.onMessage?.(JSON.parse(line) as ExportReportRouteType["response"]);
        }
      }
    }
  } catch (error) {
    input.onError?.(error);
  }
},
```

**Server-Sent Events** — the controller sets `Content-Type: text/event-stream` and frames each event with `data:` lines (plus optional `event:`/`id:`/`retry:`), separated by a blank line. Parse frames, `JSON.parse` the joined `data`, skip comment/keep-alive frames (no `data:` line). Reader `done` is clean completion — prefer this over `EventSource`, which can't send `Authorization` and auto-reconnects when a finite stream closes. Resolve with the last event to match `Promise<...RouteType["response"]>`.

```typescript
notifications: async (input: {
  baseURL: string;
  params: NotificationsRouteType["params"];
  queries: NotificationsRouteType["queries"];
  bearerToken: string; // required: `notifications`'s roles are non-empty
  signal?: AbortSignal;
  onMessage?: (data: NotificationsRouteType["response"]) => void;
  onOpen?: () => void;
  onError?: (error: unknown) => void;
}): Promise<NotificationsRouteType["response"] | undefined> => {
  const endpoint = buildEndpoint(notification.definition.notifications.endpoint, input.params, input.queries);
  let last: NotificationsRouteType["response"] | undefined;
  try {
    const response = await fetch(`${input.baseURL}${endpoint}`, {
      headers: { Authorization: `Bearer ${input.bearerToken}`, Accept: "text/event-stream" },
      signal: input.signal,
    });
    if (!response.ok || !response.body) {
      input.onError?.(response);
      return undefined;
    }
    input.onOpen?.();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue; // comment / keep-alive frame
        last = JSON.parse(data) as NotificationsRouteType["response"];
        input.onMessage?.(last);
      }
    }
  } catch (error) {
    input.onError?.(error);
  }
  return last;
},
```

### 7. Implement the socket api methods

For each `@Route.socket(...)` controller, use `Socket` from `@talosjs/socket-client`. Wire every callback, send the payload, resolve when the server marks the stream `done`. `Socket` reads its token from a `bearerToken` query param, so for authenticated sockets merge `input.bearerToken` into the endpoint queries (omit for public).

> **Security — tokens in URLs leak** (proxy/access logs, browser history, APM traces). Since `Socket` requires the token as a query param, mitigate: issue **short-lived** bearer tokens and scrub query strings in your reverse proxy / log pipeline. Prefer a header or subprotocol handshake if `@talosjs/socket-client` later supports one.

```typescript
import { Socket } from "@talosjs/socket-client";

stream: (input: {
  baseURL: string;
  params: StreamRouteType["params"];
  payload: StreamRouteType["payload"];
  queries: StreamRouteType["queries"];
  bearerToken: string; // required: `stream`'s roles are non-empty
  onMessage?: (response: ResponseDataType<StreamRouteType["response"]>) => void;
  onOpen?: (event?: Event) => void;
  onClose?: (event?: CloseEvent) => void;
  onError?: (event?: Event, response?: ResponseDataType<StreamRouteType["response"]>) => void;
}): Promise<StreamRouteType["response"]> => {
  const endpoint = buildEndpoint(catalog.definition.stream.endpoint, input.params, {
    ...input.queries,
    bearerToken: input.bearerToken,
  });
  const socket = new Socket<StreamRouteType["payload"], StreamRouteType["response"]>(`${input.baseURL}${endpoint}`);

  socket.onOpen((event) => input.onOpen?.(event));
  socket.onClose((event) => input.onClose?.(event));
  socket.onError((event, response) => input.onError?.(event, response));

  return new Promise((resolve) => {
    socket.onMessage((response) => {
      input.onMessage?.(response);
      if (response.done) {
        resolve(response.data);
      }
    });
    socket.send(input.payload);
  });
},
```

### 8. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
