import { describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { BunRequest, Server } from "bun";
import { buildHttpContext, type RouteInfoType } from "@/utils/context";

const createMockReq = (overrides: Record<string, unknown> = {}): BunRequest => {
  return {
    url: "http://localhost/v1/test",
    method: "GET",
    headers: new Headers({ "content-type": "application/json" }),
    json: mock(() => Promise.resolve({ key: "value" })),
    formData: mock(() => Promise.resolve(new FormData())),
    params: { id: "123" },
    ...overrides,
  } as unknown as BunRequest;
};

const createMockServer = (ip = "192.168.1.1"): Server<unknown> => {
  return {
    requestIP: mock(() => (ip ? { address: ip } : null)),
  } as unknown as Server<unknown>;
};

const setupContainer = (extras: Record<string, unknown> = {}) => {
  const mockLogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    log: () => {},
    success: () => {},
  };
  container.addConstant("logger", mockLogger);
  container.add(AppEnv);

  for (const [key, value] of Object.entries(extras)) {
    container.addConstant(key, value);
  }
};

const cleanupContainer = (extraKeys: string[] = []) => {
  container.removeConstant("logger");
  for (const key of extraKeys) {
    container.removeConstant(key);
  }
};

describe("buildHttpContext", () => {
  test("builds context with correct IP from server", async () => {
    setupContainer();

    const req = createMockReq();
    const server = createMockServer("10.0.0.5");

    const context = await buildHttpContext({ req, server });

    expect(context.ip).toBe("10.0.0.5");

    cleanupContainer();
  });

  test("uses 'unknown' IP when server.requestIP returns null", async () => {
    setupContainer();

    const req = createMockReq();
    const server = {
      requestIP: mock(() => null),
    } as unknown as Server<unknown>;

    const context = await buildHttpContext({ req, server });

    expect(context.ip).toBe("unknown");

    cleanupContainer();
  });

  test("parses JSON payload when content-type is application/json", async () => {
    setupContainer();

    const jsonPayload = { name: "test", value: 42 };
    const req = createMockReq({
      headers: new Headers({ "content-type": "application/json" }),
      json: mock(() => Promise.resolve(jsonPayload)),
    });
    const server = createMockServer();

    const context = await buildHttpContext({ req, server });

    expect(context.payload).toEqual(jsonPayload);

    cleanupContainer();
  });

  test("parses FormData when content-type is not application/json", async () => {
    setupContainer();

    const req = createMockReq({
      headers: new Headers({ "content-type": "multipart/form-data" }),
      json: mock(() => Promise.reject(new Error("not json"))),
      formData: mock(() => Promise.resolve(new FormData())),
    });
    const server = createMockServer();

    const context = await buildHttpContext({ req, server });

    expect(context).toBeDefined();

    cleanupContainer();
  });

  test("sets route info when route is provided", async () => {
    setupContainer();

    const route = {
      name: "api.users.list",
      path: "/users" as const,
      method: "GET" as const,
      version: 1,
      description: "List users",
    };

    const req = createMockReq();
    const server = createMockServer();

    const context = await buildHttpContext({ req, server, route });

    expect(context.route).not.toBeNull();
    expect(context.route?.name).toBe("api.users.list");
    expect(context.route?.path).toBe("/users");
    expect(context.route?.method).toBe("GET");
    expect(context.route?.version).toBe(1);
    expect(context.route?.description).toBe("List users");

    cleanupContainer();
  });

  test("sets route to null when no route is provided", async () => {
    setupContainer();

    const req = createMockReq();
    const server = createMockServer();

    const context = await buildHttpContext({ req, server });

    expect(context.route).toBeNull();

    cleanupContainer();
  });

  test("sets user to null", async () => {
    setupContainer();

    const req = createMockReq();
    const server = createMockServer();

    const context = await buildHttpContext({ req, server });

    expect(context.user).toBeNull();

    cleanupContainer();
  });

  test("handles JSON parse failure gracefully", async () => {
    setupContainer();

    const req = createMockReq({
      headers: new Headers({ "content-type": "application/json" }),
      json: mock(() => Promise.reject(new Error("Invalid JSON"))),
    });
    const server = createMockServer();

    const context = await buildHttpContext({ req, server });

    expect(context).toBeDefined();
    expect(context.payload).toEqual({});

    cleanupContainer();
  });

  test("retrieves optional services from container when available", async () => {
    const mockCache = { get: () => {}, set: () => {} };
    setupContainer({ cache: mockCache });

    const req = createMockReq();
    const server = createMockServer();

    const context = await buildHttpContext({ req, server });

    expect(context.cache).toBeDefined();

    cleanupContainer(["cache"]);
  });

  test("includes route roles when provided", async () => {
    setupContainer();

    const route: RouteInfoType = {
      name: "api.admin.dashboard",
      path: "/admin/dashboard" as const,
      method: "GET" as const,
      version: 1,
      description: "Admin dashboard",
      roles: ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"],
    };

    const req = createMockReq();
    const server = createMockServer();

    const context = await buildHttpContext({ req, server, route });

    expect(context.route?.roles).toEqual(["ROLE_ADMIN", "ROLE_SUPER_ADMIN"]);

    cleanupContainer();
  });
});
