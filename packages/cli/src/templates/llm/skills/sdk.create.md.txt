---
name: sdk-create
description: Generate a browser SDK module from a target app or microservice's controllers, then complete the generated api methods. Use when creating a typed client SDK that calls backend controllers over HTTP via @talosjs/fetcher, HTTP streaming / Server-Sent Events via native fetch, or WebSocket via @talosjs/socket-client.
allowed-tools: Bash(talos sdk:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<name>] [--module=<target>]
disallowed-tools: AskUserQuestion
---

# Make SDK Module

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate an SDK module from the controllers of a target module, then complete each generated `api` method. Follow the shared workflow in the `talos-scaffold` skill for the run-from-root rule and lint/format; this skill covers only the SDK-specific parts.

An SDK is **not** a regular artifact: it scaffolds a whole module (one file per source module) rather than a single class with a test. It registers nothing in `AppModule`/`SharedModule` (the generator already keeps it out), and it has no `.spec.ts` to complete. Your job after generating is to fill in the `api` method bodies and the endpoint prefix.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run from the **monorepo root**:

```bash
talos sdk:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the SDK module name (e.g., "a browser SDK for the storefront" → `storefront`). Pass it in any casing; the CLI normalizes to kebab-case and strips a trailing `Module`. Omit to default to `sdk`. The generated package is named `@<root-package-scope>/<name>`.
- `--module` — the **target** the SDK is generated from. Omit to default to `app` (an `api`-typed module).
  - When the target's `type` is `api` (e.g. the `app` module), the SDK aggregates the controllers of every backend `module` and `api` module.
  - When the target's `type` is `microservice`, the SDK exposes only that microservice's own controllers.

The generator creates `modules/<name>/`, marks it `type: "sdk"` in `<name>.yml`, writes `bunup.config.ts`, installs `bunup`, and emits one `src/<module>.ts` per source module plus an aggregating `src/index.ts`.

If the module already exists, complete or update this module — re-run the generator to pick up new or changed controllers, then reconcile the generated files with your existing implementations: fill in any newly generated `api` stubs, update method signatures and endpoints where the controllers changed, and preserve the method bodies you have already implemented.

### 2. Understand the generated shape

Each `src/<module>.ts` exports a const with two halves:

- `definition` — static metadata per method: `key`, `version`, `description`, `roles`, and `endpoint`. The endpoint is a placeholder `"/<prefix>/v<version><path>"`.
- `api` — one method per controller, each a stub that does `throw new Error("Not implemented")`.

Each `api` method takes a single `input` object (`params`, `payload`, `queries`, plus `onSuccess`/`onMessage`/`onOpen`/`onClose`/`onError` callbacks) and returns `Promise<...RouteType["response"]>`. The route `type` is copied verbatim from the controller, so `params`/`payload`/`queries`/`response` are already correctly typed.

**Base URL:** every method takes a required `baseURL: string` in `input` — the backend origin the SDK targets (e.g. `https://api.example.com`). Pass it to the `Fetcher` constructor for HTTP, and prepend it to the endpoint for streaming, SSE, and sockets (see steps 5–7).

**Authenticated routes:** a route requires authentication when its `definition.<method>.roles` is non-empty (or its controller is otherwise auth-guarded). For each such method, add a required `bearerToken: string` to `input` and forward it — `setBearerToken(input.bearerToken)` for HTTP, an `Authorization: Bearer` header for streaming and SSE, the `bearerToken` query param for sockets (see steps 5–7). Leave `bearerToken` off public routes whose `roles` are `[]`.

**Streaming and SSE routes:** a controller returns a stream instead of JSON when its `index` returns `context.response.stream(...)` (server-side streaming) or `context.response.sse(...)` (Server-Sent Events). This is a runtime choice in the controller body and is **not** recorded in the route metadata — you cannot tell from `definition`, so open the controller and look at what `context.response` returns, the same way you confirm the HTTP verb (step 5). Two consequences for these methods:

- `@talosjs/fetcher` buffers and JSON-parses the whole body, so it cannot consume them — implement these with the browser-native `fetch` + `response.body.getReader()` (step 6).
- Streaming and SSE responses bypass the `ResponseDataType` envelope that wraps regular HTTP and socket responses. Each chunk/event carries the **raw** payload, so the per-message callback receives `...RouteType["response"]` directly, not `ResponseDataType<...>`.

### 3. Replace the endpoint prefix

In every generated file, replace the literal `<prefix>` in each `endpoint` with the backend's API route prefix (e.g. `api`), so `"/<prefix>/v1/entitlement/grants"` becomes `"/api/v1/entitlement/grants"`. Use the same prefix the backend mounts its routes under.

### 4. Add a shared endpoint builder

Path templates may contain `:param` segments, and list routes carry queries. Add this helper near the top of each generated file (or factor it into a small shared file imported by each):

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

For each non-socket method, pick the `Fetcher` method that matches the controller's `@Route.<verb>` (the verb is not stored in the SDK — open the controller to confirm; routes with a `payload` are `post`/`put`/`patch`). The callbacks receive the full `ResponseDataType`; the method returns just `response.data`.

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
      // ...the remaining socket-only callbacks stay in the signature, unused for HTTP...
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

For `get`/`delete`/`head`/`options` there is no `payload` — call `new Fetcher().get<...>(endpoint)` with the endpoint only. For a **public** route (empty `roles`), drop both the `bearerToken` input field and the `setBearerToken(...)` call.

### 6. Implement the streaming and SSE api methods

For each method whose controller returns `context.response.stream(...)` or `context.response.sse(...)` (identify these by reading the controller — see step 2), don't use `Fetcher`; it buffers the whole body. Use native `fetch`, read `response.body` with a reader, and deliver each chunk/event through `onMessage`. These responses are **not** wrapped in `ResponseDataType`, so `onMessage` receives `...RouteType["response"]` directly. Forward auth as an `Authorization: Bearer` header (drop it, and the `bearerToken` field, on public routes). Pass an `AbortSignal` so the caller can stop a long-lived stream.

**Server-side streaming** — the body is a sequence of chunks framed by the controller. Match your parsing to how the controller writes them: newline-delimited JSON (split on `\n`, then `JSON.parse` each line, as below), plain text (deliver the decoded string), or binary (deliver the raw `Uint8Array`). Pick the verb the controller uses (`get` for a download-style stream, `post` when it has a `payload`).

```typescript
// ...generated route types and `buildEndpoint`; no @talosjs client import — these use native fetch...

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

**Server-Sent Events** — the controller sets `Content-Type: text/event-stream` and frames each event with `data:` lines (plus optional `event:`/`id:`/`retry:`), separated by a blank line. Parse the frames, `JSON.parse` the joined `data` payload, and skip comment/keep-alive frames (those with no `data:` line). Reading the body to its end (reader `done`) is the clean completion signal — prefer this fetch + reader approach over `EventSource`, which can't send an `Authorization` header and auto-reconnects when a finite stream closes. Resolve with the last event so the return type matches the generated `Promise<...RouteType["response"]>`.

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

For each method whose controller uses `@Route.socket(...)`, use `Socket` from `@talosjs/socket-client`. Wire every callback, send the payload, and resolve when the server marks the stream `done`. `Socket` reads its bearer token from a `bearerToken` query param on the URL, so for authenticated sockets merge `input.bearerToken` into the endpoint queries (omit both for public sockets).

> **Security — tokens in URLs leak.** Query-string tokens get captured by proxy/access logs, browser history, and APM traces. Because `Socket` requires the token as a query param, mitigate it: issue **short-lived** bearer tokens for socket connections and ensure your reverse proxy / log pipeline scrubs query strings. If `@talosjs/socket-client` later supports a header or subprotocol handshake, prefer that over the query param.

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
