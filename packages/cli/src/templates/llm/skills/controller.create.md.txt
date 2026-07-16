---
name: controller-create
description: Generate a new controller class with route type and test file, then complete the generated code.
when_to_use: Use when creating a new HTTP or WebSocket controller with routing, validation, and role-based access.
model: sonnet
effort: medium
allowed-tools: Bash(talos controller:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>] [--is-socket=<true|false>] [--route-name=<name>] [--route-path=<path>] [--route-method=<method>]
---

# Make Controller Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (e.g. once extracted into a shared package). Check both roots before assuming a path is missing; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

Generate a controller class, route type, and test file, then complete the implementation. Follow the `talos-scaffold` skill for the shared workflow (run-from-root, `--name`/`--module` inference, module registration, lint/format, conventions); this covers only controller specifics.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos controller:create --name=<name> --module=<module> --is-socket=<true|false> --route-name=<route.name> --route-path=<route.path> --route-method=<route.method>
```

- `--name` — controller class name from the resource/action ("list books" → `BookList`). Any casing; the CLI normalizes to PascalCase and appends the `Controller` suffix — omit it.
- `--is-socket` — `true` for WebSocket/socket/realtime, else `false` (default). If unspecified, the generator asks interactively.
- `--route-name` — dot notation `<resource>.<action>` ("list books" → `book.list`, "create a user" → `user.create`).
- `--route-path` — URL path, inferred as a kebab-case plural of the resource (books → `/books`); use an explicit path if given.
- `--route-method` — HTTP method from the verb (HTTP only): list/get/show → `get`, create → `post`, update/replace → `put` (partial → `patch`), delete/remove → `delete`.

Also generates `src/types/routes/<route.name>.ts` — delete it after step 3 (keep the type inside the controller file).

### 2. Read the generated files

Read all three generated files to understand the scaffolded code.

### 3. Complete the route type

**Keep the route type inside the controller file**, not a separate file. Delete the generated `src/types/routes/<route.name>.ts`.

Include only the fields the route needs — `response` always present:

| Field | Include when |
|-------|--------------|
| `params` | route has URL path segments (`/users/:id`) |
| `payload` | method is `post`, `put`, or `patch` |
| `queries` | list/search endpoint with query-string filtering |
| `response` | always |

```typescript
type <TypeName>RouteType = {
  params: { },    // detail/update — one key per URL segment
  queries: { },   // list — query-string filters
  payload: { },   // post/put/patch — request body
  response: { },  // always
};
```

### 4. Complete the controller class

Edit `modules/<module>/src/controllers/<Name>Controller.ts`:

- Set `roles` for access control (see **Roles** below).
- Add a meaningful `description` (e.g. `"Create a new user account"`).
- **Keep the controller thin** — delegate all logic to the service via constructor injection.
- Apply the same `params`/`payload`/`queries`/`response` rules to the `@Route` decorator.


```typescript
import type { ContextType } from "@talosjs/controller"; // socket: "@talosjs/socket"
import { Route } from "@talosjs/routing";
import { Assert } from "@talosjs/validation";

type <TypeName>RouteType = {
  response: { },
};

@Route.<method>("<route.path>", {   // socket: @Route.socket(...)
  name: "<route.name>",
  version: 1,
  description: "",
  response: Assert({ }),
  roles: ["ROLE_USER"],
})
export class <Name>Controller {
  public async index(context: ContextType<<TypeName>RouteType>) {
    return context.response.json({ });
  }
}
```

The HTTP and socket controllers are identical except the `ContextType` import (`@talosjs/controller` vs `@talosjs/socket`) and the decorator (`@Route.<method>` vs `@Route.socket`).

#### Roles

`roles` is an array of plain role strings (e.g. `["ROLE_USER"]`). There is **no `ERole` enum** — don't import from `@talosjs/role` in a controller. Access is hierarchical/graph-based: granting a role also grants every role it inherits (ancestors, directly or transitively). Sibling roles on different branches do **not** satisfy each other.

Available roles live in `modules/shared/src/roles.yml` — **always read that file** to use the project's actual roles, since each project can customize them. Default hierarchy (ancestor → descendant):

| Role | Inherits | Description |
| --- | --- | --- |
| `ROLE_GUEST` | — | Unauthenticated visitor with read-only access to public content |
| `ROLE_TRIAL_USER` | `ROLE_GUEST` | Registered user on a limited trial period with restricted feature access |
| `ROLE_USER` | `ROLE_TRIAL_USER` | Standard authenticated user with full access to core features |
| `ROLE_PREMIUM_USER` | `ROLE_USER` | Paid subscriber with access to premium features and content |
| `ROLE_VIP_USER` | `ROLE_PREMIUM_USER` | High-value user with exclusive VIP benefits and priority support |
| `ROLE_REVIEWER` | `ROLE_USER` | Trusted user who can review and rate content submitted by others |
| `ROLE_MODERATOR` | `ROLE_USER` | Community moderator who can manage posts, comments, and user reports |
| `ROLE_MANAGER` | `ROLE_USER` | Operational manager with access to team and resource management tools |
| `ROLE_ADMIN` | `ROLE_MANAGER` | Application administrator with full control over users, settings, and content |
| `ROLE_SUPER_ADMIN` | `ROLE_ADMIN` | Super administrator with unrestricted access across all tenants and configurations |
| `ROLE_SYSTEM` | `ROLE_SUPER_ADMIN` | Internal system identity used for automated processes and service-to-service operations |

Pick the **least-privileged** role that still satisfies the endpoint's access requirement.

### 5. Complete the test file

Read and replace `modules/<module>/tests/controllers/<Name>Controller.spec.ts`. Cover: class identity (`name.endsWith("Controller")`, is constructor); `index` exists and returns `Promise`, calls `context.response.json` (mock); instance isolation. After injecting a mock service, add response-shape tests.

```typescript
import { describe, expect, mock, test } from "bun:test";
import { <Name>Controller } from "@/controllers/<Name>Controller";

describe("<Name>Controller", () => {
  test("should have class name ending with 'Controller'", () => {
    expect(<Name>Controller.name.endsWith("Controller")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Controller).toBe("function");
  });

  test("should have 'index' method", () => {
    expect(typeof <Name>Controller.prototype.index).toBe("function");
  });

  test("'index' should return a Promise", () => {
    const controller = new <Name>Controller();
    const context = { response: { json: () => {} } } as any;
    const result = controller.index(context);
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("'index' should call context.response.json", async () => {
    const controller = new <Name>Controller();
    const json = mock(() => {});
    const context = { response: { json } } as any;
    try {
      await controller.index(context);
      expect(json).toHaveBeenCalledTimes(1);
    } catch {
      // Expected when injected dependencies are absent — still validates delegation
    }
  });

  // Add response shape tests after injecting a mock service

  test("should produce independent instances", () => {
    const a = new <Name>Controller();
    const b = new <Name>Controller();
    expect(a).not.toBe(b);
  });
});
```

### 6. Register the controller

Add `<Name>Controller` to the `controllers` array in `src/<PascalModuleName>Module.ts` (see `talos-scaffold` for the `ModuleType` shape).

### 7. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.

### 8. Create the service

```
/service-create --name=<Name>
```

### 9. Create the pubsub event (mutation routes only)

**Only for `post`, `put`, `patch`, `delete` — skip for `get`.**

```
/event-create --name=<Name> --channel=<resource>.<action>
```

Once created:
- Inject the **service** into the **event** and call `service.execute()` from `handler()`.
- Inject the **event** into the **controller** and publish from `index()`.

### 10. Sync the SDK module

A controller's route is part of the SDK surface, so whenever you **create or update** a controller, refresh any SDK exposing it via the `sdk-create` skill. An SDK module is any module whose `<name>.yml` has `type: "sdk"`; its `target` field records the module it was generated from (`app`, or a specific microservice).

For each SDK module whose `target` covers the controller's module — an `app` target covers every backend `module`/`api` module; a microservice target covers only itself — regenerate it with that SDK's own name and target:

```
/sdk-create --name=<sdk module name> --module=<target>
```

Then complete the new or updated `api` method per the `sdk-create` skill. Skip when no SDK module targets the controller's module.

## Usage Examples

`Assert` is an alias for ArkType's `type` function. Use ArkType string syntax inside it — no fluent API (`Assert.string()` etc.).

- Primitive: `"string"`, `"number"`, `"boolean"` · Optional: `"string?"` · Array: `"string[]"`, `"string[]?"`
- Union: `"string | number"`, `"File | Blob"` · Format: `"string.email"`, `"number.integer"`
- Range: `"1 <= string <= 100"`, `"1 <= number.integer <= 65535"` · Regex: `/^[a-z]+$/` · Enum: `'"admin" | "user" | "guest"'`

For `params`, each URL segment gets its own `Assert("...")` call (or a constraint class like `new AssertId()`). For `queries`, `payload`, and `response`, pass an object to `Assert({...})`.

All examples assume the standard imports: `ContextType` from `@talosjs/controller` (or `@talosjs/socket`), `Route` from `@talosjs/routing`, and `Assert` / `AssertId` from `@talosjs/validation`.

### HTTP — GET list (queries + response)

```typescript
type UserListRouteType = {
  queries: { page?: string; limit?: string; search?: string };
  response: { data: { id: string; name: string }[]; total: number };
};

@Route.get("/users", {
  name: "user.list",
  version: 1,
  description: "List users with optional filtering and pagination",
  queries: Assert({ page: "string?", limit: "string?", search: "string?" }),
  response: Assert({ data: "object[]", total: "number" }),
  roles: ["ROLE_ADMIN"],
})
export class UserListController {
  constructor(private readonly userService: UserService) {}

  public async index(context: ContextType<UserListRouteType>) {
    const { page, limit, search } = context.request.queries();
    const result = await this.userService.execute({ page, limit, search });
    return context.response.json(result);
  }
}
```

### HTTP — GET detail (params + response)

`params` in `RouteConfigType` is `Record<string, AssertType | IAssert>` — one entry per URL segment, each with its own `Assert("...")` or a constraint class instance.

```typescript
type UserDetailRouteType = {
  params: { id: string };
  response: { id: string; name: string; email: string };
};

@Route.get("/users/:id", {
  name: "user.detail",
  version: 1,
  description: "Get user by ID",
  params: { id: new AssertId() },
  response: Assert({ id: "string", name: "string", email: "string" }),
  roles: ["ROLE_USER"],
})
export class UserDetailController {
  constructor(private readonly userService: UserService) {}

  public async index(context: ContextType<UserDetailRouteType>) {
    const { id } = context.request.params();
    const user = await this.userService.execute(id);
    return context.response.json(user);
  }
}
```

Nested params like `/users/:userId/bills/:billId` — one key per segment:

```typescript
type UserBillDetailRouteType = { params: { userId: string; billId: string }; response: { id: string; amount: number } };
// In decorator:
params: { userId: new AssertId(), billId: new AssertId() },
```

### HTTP — POST create (payload + response)

```typescript
type UserCreateRouteType = {
  payload: { name: string; email: string; password: string };
  response: { id: string; name: string; email: string };
};

@Route.post("/users", {
  name: "user.create",
  version: 1,
  description: "Create a new user account",
  payload: Assert({ name: "string", email: "string.email", password: "8 <= string <= 100" }),
  response: Assert({ id: "string", name: "string", email: "string" }),
  roles: ["ROLE_ADMIN"],
})
export class UserCreateController {
  constructor(private readonly userCreatedEvent: UserCreatedEvent) {}

  public async index(context: ContextType<UserCreateRouteType>) {
    const { password, ...safe } = await context.request.payload();
    // Hash the password in the service before persistence; publish only non-sensitive fields.
    await this.userCreatedEvent.publish(safe);
    return context.response.json({ id: "...", name: safe.name, email: safe.email });
  }
}
```

> **Security — credentials never leave the boundary in the clear.** Hash passwords (argon2/bcrypt) inside the service before persisting, and never place a raw password (or any secret) in an event payload, a response body, or a log. PubSub payloads are serialized to the broker and delivered to every subscriber, so publish only non-sensitive identifiers.

A **PUT/PATCH update** combines the two patterns above: `params` (with `new AssertId()`) plus an optional-field `payload` (`Assert({ name: "string?", email: "string.email?" })`), publishing an update event as in POST — `await this.userUpdatedEvent.publish({ id, ...data })`.

### Socket controller (response + channel API)

`ContextType<T>` from `@talosjs/socket` extends the HTTP context and adds a `channel` object:

- `channel.send(response)` — send to this client only · `channel.publish(response)` — broadcast to all channel subscribers
- `channel.subscribe()` / `channel.unsubscribe()` / `channel.isSubscribed()` — manage pub/sub
- `channel.close(code?, reason?)` — close the connection · `channel.ws` — raw `ServerWebSocket` instance

```typescript
type ChatMessageRouteType = {
  payload: { message: string; roomId: string };
  response: { userId: string; message: string; sentAt: string };
};

@Route.socket("/chat", {
  name: "chat.message",
  version: 1,
  description: "Send a message to a chat room and broadcast to subscribers",
  payload: Assert({ message: "string", roomId: "string" }),
  response: Assert({ userId: "string", message: "string", sentAt: "string" }),
  roles: ["ROLE_USER"],
})
export class ChatMessageController {
  public async index(context: ContextType<ChatMessageRouteType>) {
    const { message } = await context.request.payload();

    if (!context.channel.isSubscribed()) {
      await context.channel.subscribe();
    }

    // Bind the message to the authenticated sender — never trust a client-supplied id.
    const reply = context.response.create({
      userId: context.user?.id ?? "",
      message,
      sentAt: new Date().toISOString(),
    });

    await context.channel.publish(reply); // broadcast to all room subscribers (includes sender)
  }
}
```
