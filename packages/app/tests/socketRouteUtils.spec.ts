import { describe, expect, mock, spyOn, test } from "bun:test";
import { AppEnv, Environment } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import { Exception } from "@talosjs/exception";
import type { FeatureFlagClassType } from "@talosjs/feature-flag";
import { HttpResponse, type IResponse } from "@talosjs/http-response";
import { HttpStatus } from "@talosjs/http-status";
import type { PermissionClassType } from "@talosjs/permission";
import type { RouteConfigType } from "@talosjs/routing";
import type { ContextType } from "@talosjs/socket";
import { formatSocketRoutes, getSocketCacheKey, socketRouteHandler } from "@/socketRouteUtils";

class DefaultSocketController {
  index(context: ContextType): IResponse {
    context.response.done = true;
    return context.response.json({ message: "success" });
  }
}
container.add(DefaultSocketController);

const createMockHeader = () => ({
  get: mock(() => null),
  getReferer: mock(() => null),
});

const createMockLogger = () => ({
  success: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
});

const createMockSocketContext = (overrides: Record<string, unknown> = {}): ContextType => {
  const response = new HttpResponse();
  return {
    logger: createMockLogger() as unknown as ContextType["logger"],
    cache: {} as ContextType["cache"],
    route: {
      name: "api.socket.test",
      path: "/socket" as const,
      method: "GET" as const,
      version: 1,
      description: "Test socket route",
    },
    env: { env: Environment.DEVELOPMENT } as unknown as ContextType["env"],
    response,
    request: {} as ContextType["request"],
    params: {},
    payload: {},
    queries: {},
    method: "GET",
    header: createMockHeader() as unknown as ContextType["header"],
    files: {},
    ip: "127.0.0.1",
    host: "localhost",
    lang: {} as ContextType["lang"],
    user: null,
    channel: {
      ws: {} as unknown as import("bun").ServerWebSocket<Record<string, unknown>>,
      send: mock(() => Promise.resolve()),
      close: mock(() => {}),
      subscribe: mock(() => Promise.resolve()),
      isSubscribed: mock(() => false),
      unsubscribe: mock(() => Promise.resolve()),
      publish: mock(() => Promise.resolve()),
    },
    ...overrides,
  } as ContextType;
};

const createMockSocketRoute = (overrides: Record<string, unknown> = {}): RouteConfigType => {
  const base = {
    name: "api.socket.list" as const,
    path: "/socket" as const,
    method: "GET" as const,
    version: 1,
    controller: DefaultSocketController,
    description: "Socket route",
    isSocket: true,
  };
  return { ...base, ...overrides } as unknown as RouteConfigType;
};

const createMockWs = (id: string, sendMock: ReturnType<typeof mock>) => ({
  data: { id },
  send: sendMock,
  close: mock(() => {}),
  subscribe: mock(() => {}),
  isSubscribed: mock(() => false),
  unsubscribe: mock(() => {}),
});

const createMockServer = () => ({
  publish: mock(() => {}),
});

container.addConstant("app.roles", {
  roles: {
    GUEST: "ROLE_GUEST",
    TRIAL_USER: "ROLE_TRIAL_USER",
    USER: "ROLE_USER",
    PREMIUM_USER: "ROLE_PREMIUM_USER",
    ADMIN: "ROLE_ADMIN",
    SUPER_ADMIN: "ROLE_SUPER_ADMIN",
    SYSTEM: "ROLE_SYSTEM",
  },
  hierarchy: {
    ROLE_GUEST: { level: 10, description: "Guest" },
    ROLE_TRIAL_USER: { level: 15, description: "Trial user" },
    ROLE_USER: { level: 20, description: "User" },
    ROLE_PREMIUM_USER: { level: 35, description: "Premium user" },
    ROLE_ADMIN: { level: 120, description: "Admin" },
    ROLE_SUPER_ADMIN: { level: 130, description: "Super admin" },
    ROLE_SYSTEM: { level: 999, description: "System" },
  },
});

describe("socketRouteUtils", () => {
  describe("formatSocketRoutes", () => {
    test("returns empty object for empty routes map", () => {
      const socketRoutes = new Map<string, RouteConfigType>();

      const result = formatSocketRoutes(socketRoutes);

      expect(result).toEqual({});
    });

    test("creates handler for each socket path with version prefix", () => {
      const socketRoutes = new Map<string, RouteConfigType>();
      socketRoutes.set("/ws/chat", createMockSocketRoute({ path: "/ws/chat", name: "api.chat.list" }));

      const result = formatSocketRoutes(socketRoutes);

      expect(result["/v1/ws/chat"]).toBeDefined();
      expect(typeof result["/v1/ws/chat"]).toBe("function");
    });

    test("creates handlers for multiple socket paths with version prefix", () => {
      const socketRoutes = new Map<string, RouteConfigType>();
      socketRoutes.set("/ws/chat", createMockSocketRoute({ path: "/ws/chat", name: "api.chat.list" }));
      socketRoutes.set(
        "/ws/notifications",
        createMockSocketRoute({ path: "/ws/notifications", name: "api.notifications.list" }),
      );

      const result = formatSocketRoutes(socketRoutes);

      expect(result["/v1/ws/chat"]).toBeDefined();
      expect(result["/v1/ws/notifications"]).toBeDefined();
      expect(typeof result["/v1/ws/chat"]).toBe("function");
      expect(typeof result["/v1/ws/notifications"]).toBe("function");
    });

    test("prepends prefix to versioned path", () => {
      const socketRoutes = new Map<string, RouteConfigType>();
      socketRoutes.set("/ws/chat", createMockSocketRoute({ path: "/ws/chat", name: "api.chat.list" }));

      const result = formatSocketRoutes(socketRoutes, "api");

      expect(result["/api/v1/ws/chat"]).toBeDefined();
      expect(typeof result["/api/v1/ws/chat"]).toBe("function");
    });

    test("works without prefix", () => {
      const socketRoutes = new Map<string, RouteConfigType>();
      socketRoutes.set("/ws/chat", createMockSocketRoute({ path: "/ws/chat", name: "api.chat.list" }));

      const result = formatSocketRoutes(socketRoutes);

      expect(result["/v1/ws/chat"]).toBeDefined();
      expect(typeof result["/v1/ws/chat"]).toBe("function");
    });
  });

  describe("socketRouteHandler", () => {
    test("sends successful response when controller executes successfully", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      class SuccessSocketController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ message: "socket success" });
        }
      }
      container.add(SuccessSocketController);
      const route = createMockSocketRoute({ controller: SuccessSocketController });

      const wsId = `test-ws-id-success-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: { test: "data" },
        queries: { page: "1" },
        lang: { locale: "en" },
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
    });

    test("sends exception when middleware throws Exception", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();
      const route = createMockSocketRoute();

      const wsId = `test-ws-id-middleware-exception-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      class ThrowingMiddleware {
        handler(): Promise<ContextType> {
          throw new Exception("Middleware error", { status: HttpStatus.Code.Unauthorized });
        }
      }
      container.add(ThrowingMiddleware);

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
        middlewares: [ThrowingMiddleware as unknown as import("@talosjs/middleware").SocketMiddlewareClassType],
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.Unauthorized);
    });

    test("sends exception when middleware throws regular Error", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();
      const route = createMockSocketRoute();

      const wsId = `test-ws-id-middleware-error-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      class ErrorMiddleware {
        handler(): Promise<ContextType> {
          throw new Error("Unexpected middleware error");
        }
      }
      container.add(ErrorMiddleware);

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
        middlewares: [ErrorMiddleware as unknown as import("@talosjs/middleware").SocketMiddlewareClassType],
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.InternalServerError);
    });

    test("sends exception when route validation fails", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      const route = createMockSocketRoute({
        env: [Environment.PRODUCTION],
      });

      const wsId = `test-ws-id-validation-fail-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.NotAcceptable);
      expect(sentData.key).toBe("ROUTE_ENV_NOT_ALLOWED");
    });

    test("sends exception when controller throws Exception", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      class ThrowingSocketController {
        index(): IResponse {
          throw new Exception("Controller exception", { status: HttpStatus.Code.BadRequest });
        }
      }
      container.add(ThrowingSocketController);

      const route = createMockSocketRoute({ controller: ThrowingSocketController });

      const wsId = `test-ws-id-controller-exception-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.BadRequest);
      expect(sentData.message).toBe("Controller exception");
    });

    test("sends exception when controller throws regular Error", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      class ErrorSocketController {
        index(): IResponse {
          throw new Error("Controller error");
        }
      }
      container.add(ErrorSocketController);

      const route = createMockSocketRoute({ controller: ErrorSocketController });

      const wsId = `test-ws-id-controller-error-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.InternalServerError);
      expect(sentData.message).toBe("Controller error");
    });

    test("sends exception when controller throws unknown error", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      class UnknownErrorSocketController {
        index(): IResponse {
          throw "string error";
        }
      }
      container.add(UnknownErrorSocketController);

      const route = createMockSocketRoute({ controller: UnknownErrorSocketController });

      const wsId = `test-ws-id-controller-unknown-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.InternalServerError);
      expect(sentData.message).toBe("An unknown error occurred");
    });

    test("parses message and sets context properties", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      let capturedContext: ContextType | null = null;

      class CaptureContextController {
        index(ctx: ContextType): IResponse {
          capturedContext = ctx;
          ctx.response.done = true;
          return ctx.response.json({ captured: true });
        }
      }
      container.add(CaptureContextController);

      const route = createMockSocketRoute({ controller: CaptureContextController });

      const wsId = `test-ws-id-parse-message-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: { userId: 123, action: "test" },
        queries: { page: "2", limit: "10" },
        lang: { locale: "fr", region: "FR" },
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(capturedContext).not.toBeNull();
      const ctx = capturedContext as unknown as ContextType;
      expect(ctx.payload).toEqual({ userId: 123, action: "test" });
      expect(ctx.queries).toEqual({ page: "2", limit: "10" } as unknown as ContextType["queries"]);
      expect((ctx.lang as Record<string, unknown>).locale).toBe("fr");
      expect((ctx.lang as Record<string, unknown>).region).toBe("FR");
    });

    test("uses PRODUCTION environment as default when app.env.env is undefined", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext({
        env: { env: undefined } as unknown as ContextType["env"],
      });

      class EnvTestController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(EnvTestController);

      const route = createMockSocketRoute({ controller: EnvTestController });

      const wsId = `test-ws-id-env-default-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
    });

    test("channel methods work correctly", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      class ChannelTestController {
        async index(ctx: ContextType): Promise<IResponse> {
          await ctx.channel.subscribe();
          const isSubscribed = ctx.channel.isSubscribed();
          await ctx.channel.publish(ctx.response.json({ published: true }));
          await ctx.channel.unsubscribe();
          ctx.channel.close(1000, "test close");
          ctx.response.done = true;
          return ctx.response.json({ isSubscribed });
        }
      }
      container.add(ChannelTestController);

      const route = createMockSocketRoute({ controller: ChannelTestController });

      const wsId = `test-ws-id-channel-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const subscribeMock = mock(() => {});
      const isSubscribedMock = mock(() => true);
      const unsubscribeMock = mock(() => {});
      const closeMock = mock(() => {});

      const mockWs = {
        data: { id: wsId },
        send: wsSendMock,
        close: closeMock,
        subscribe: subscribeMock,
        isSubscribed: isSubscribedMock,
        unsubscribe: unsubscribeMock,
      };

      const publishMock = mock(() => {});
      const mockServer = {
        publish: publishMock,
      };

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(subscribeMock).toHaveBeenCalledWith(route.name);
      expect(isSubscribedMock).toHaveBeenCalledWith(route.name);
      expect(unsubscribeMock).toHaveBeenCalledWith(route.name);
      expect(closeMock).toHaveBeenCalledWith(1000, "test close");
      expect(publishMock).toHaveBeenCalled();
    });

    test("builds permission and sets context.permission when route has permission", async () => {
      const checkMock = mock(() => true);
      const allowMock = mock(() => mockPermission);
      const setUserPermissionsMock = mock(() => mockPermission);
      const buildMock = mock(() => mockPermission);

      const mockPermission = {
        allow: allowMock,
        setUserPermissions: setUserPermissionsMock,
        build: buildMock,
        check: checkMock,
      };

      class SocketPermission {
        allow = allowMock;
        setUserPermissions = setUserPermissionsMock;
        build = buildMock;
        check = checkMock;
      }
      container.add(SocketPermission);

      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      class PermSocketController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(PermSocketController);

      const route = createMockSocketRoute({
        controller: PermSocketController,
        permission: SocketPermission as unknown as PermissionClassType,
      });

      const wsId = `test-ws-id-permission-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
      expect(allowMock).toHaveBeenCalled();
      expect(setUserPermissionsMock).toHaveBeenCalled();
      expect(buildMock).toHaveBeenCalled();
      expect(checkMock).toHaveBeenCalled();
    });

    test("returns 403 when permission check fails", async () => {
      const checkMock = mock(() => false);
      const allowMock = mock(() => mockDeniedPermission);
      const setUserPermissionsMock = mock(() => mockDeniedPermission);
      const buildMock = mock(() => mockDeniedPermission);

      const mockDeniedPermission = {
        allow: allowMock,
        setUserPermissions: setUserPermissionsMock,
        build: buildMock,
        check: checkMock,
      };

      class DeniedSocketPermission {
        allow = allowMock;
        setUserPermissions = setUserPermissionsMock;
        build = buildMock;
        check = checkMock;
      }
      container.add(DeniedSocketPermission);

      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      class DeniedPermSocketController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(DeniedPermSocketController);

      const route = createMockSocketRoute({
        controller: DeniedPermSocketController,
        permission: DeniedSocketPermission as unknown as PermissionClassType,
      });

      const wsId = `test-ws-id-denied-permission-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(checkMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.Forbidden);
    });

    test("does not set permission when route has no permission", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      class NoPermSocketController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(NoPermSocketController);

      const route = createMockSocketRoute({ controller: NoPermSocketController });

      const wsId = `test-ws-id-no-permission-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
    });

    test("runs multiple middlewares in sequence", async () => {
      const executionOrder: string[] = [];
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext();

      class FirstMiddleware {
        async handler(ctx: ContextType): Promise<ContextType> {
          executionOrder.push("first");
          return ctx;
        }
      }

      class SecondMiddleware {
        async handler(ctx: ContextType): Promise<ContextType> {
          executionOrder.push("second");
          return ctx;
        }
      }

      class SequenceController {
        index(ctx: ContextType): IResponse {
          executionOrder.push("controller");
          ctx.response.done = true;
          return ctx.response.json({ order: executionOrder });
        }
      }

      container.add(FirstMiddleware);
      container.add(SecondMiddleware);
      container.add(SequenceController);

      const route = createMockSocketRoute({ controller: SequenceController });

      const wsId = `test-ws-id-middleware-sequence-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
        middlewares: [
          FirstMiddleware as unknown as import("@talosjs/middleware").SocketMiddlewareClassType,
          SecondMiddleware as unknown as import("@talosjs/middleware").SocketMiddlewareClassType,
        ],
      });

      expect(executionOrder).toEqual(["first", "second", "controller"]);
    });

    test("sends cached response on cache hit", async () => {
      const wsSendMock = mock(() => {});
      const cachedData = '{"data":{"message":"cached"},"status":200}';
      const cacheGetMock = mock(() => Promise.resolve(cachedData));
      const cacheSetMock = mock(() => Promise.resolve());

      const context = createMockSocketContext({
        cache: {
          get: cacheGetMock,
          set: cacheSetMock,
          has: mock(() => Promise.resolve(true)),
          delete: mock(() => Promise.resolve(true)),
        },
      });

      class CacheHitSocketController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ message: "not cached" });
        }
      }
      container.add(CacheHitSocketController);

      const route = createMockSocketRoute({
        controller: CacheHitSocketController,
        cache: "ws",
      });

      const wsId = `test-ws-cache-hit-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(cacheGetMock).toHaveBeenCalled();
      expect(cacheSetMock).not.toHaveBeenCalled();
      expect(wsSendMock).toHaveBeenCalledWith(cachedData);
    });

    test("caches and sends response on cache miss", async () => {
      const wsSendMock = mock(() => {});
      const cacheGetMock = mock(() => Promise.resolve(undefined));
      const cacheSetMock = mock(() => Promise.resolve());

      const context = createMockSocketContext({
        cache: {
          get: cacheGetMock,
          set: cacheSetMock,
          has: mock(() => Promise.resolve(false)),
          delete: mock(() => Promise.resolve(false)),
        },
      });

      class CacheMissSocketController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ message: "fresh" });
        }
      }
      container.add(CacheMissSocketController);

      const route = createMockSocketRoute({
        controller: CacheMissSocketController,
        cache: "ws",
      });

      const wsId = `test-ws-cache-miss-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(cacheGetMock).toHaveBeenCalled();
      expect(cacheSetMock).toHaveBeenCalled();
      expect((cacheSetMock.mock.calls as unknown[][])[0]?.[2]).toBe(300);
      expect(wsSendMock).toHaveBeenCalled();
    });

    test("does not cache response when status is not successful", async () => {
      const wsSendMock = mock(() => {});
      const cacheGetMock = mock(() => Promise.resolve(undefined));
      const cacheSetMock = mock(() => Promise.resolve());

      const context = createMockSocketContext({
        cache: {
          get: cacheGetMock,
          set: cacheSetMock,
          has: mock(() => Promise.resolve(false)),
          delete: mock(() => Promise.resolve(false)),
        },
      });

      class ErrorSocketController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ error: "not found" }, HttpStatus.Code.NotFound);
        }
      }
      container.add(ErrorSocketController);

      const route = createMockSocketRoute({
        controller: ErrorSocketController,
        cache: "ws",
      });

      const wsId = `test-ws-error-no-cache-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(cacheGetMock).toHaveBeenCalled();
      expect(cacheSetMock).not.toHaveBeenCalled();
      expect(wsSendMock).toHaveBeenCalled();
    });

    test("does not use cache when route.cache is false", async () => {
      const wsSendMock = mock(() => {});
      const cacheGetMock = mock(() => Promise.resolve('{"data":"cached"}'));

      const context = createMockSocketContext({
        cache: {
          get: cacheGetMock,
          set: mock(() => Promise.resolve()),
          has: mock(() => Promise.resolve(true)),
          delete: mock(() => Promise.resolve(true)),
        },
      });

      class NoCacheFlagController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ message: "no cache" });
        }
      }
      container.add(NoCacheFlagController);

      const route = createMockSocketRoute({
        controller: NoCacheFlagController,
      });

      const wsId = `test-ws-no-cache-flag-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(cacheGetMock).not.toHaveBeenCalled();
      expect(wsSendMock).toHaveBeenCalled();
    });

    test("does not use cache when context.cache is undefined", async () => {
      const wsSendMock = mock(() => {});

      const context = createMockSocketContext({
        cache: undefined,
      });

      class NoCacheCtxController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ message: "no cache ctx" });
        }
      }
      container.add(NoCacheCtxController);

      const route = createMockSocketRoute({
        controller: NoCacheCtxController,
        cache: "ws",
      });

      const wsId = `test-ws-no-cache-ctx-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
    });

    test("uses correct cache key with params, queries, and payload", async () => {
      const wsSendMock = mock(() => {});
      const cacheGetMock = mock(() => Promise.resolve(undefined));
      const cacheSetMock = mock(() => Promise.resolve());

      const context = createMockSocketContext({
        cache: {
          get: cacheGetMock,
          set: cacheSetMock,
          has: mock(() => Promise.resolve(false)),
          delete: mock(() => Promise.resolve(false)),
        },
        params: { id: "42" },
      });

      class CacheKeyController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(CacheKeyController);

      const route = createMockSocketRoute({
        controller: CacheKeyController,
        cache: "ws",
        name: "api.socket.cachekey",
      });

      const wsId = `test-ws-cache-key-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: { action: "test" },
        queries: { page: "2" },
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      const expectedKey = getSocketCacheKey(
        "ws",
        "api.socket.cachekey",
        undefined,
        { id: "42" },
        { page: "2" },
        { action: "test" },
      );
      expect(cacheGetMock).toHaveBeenCalledWith(expectedKey);
    });

    test("sends Forbidden when user is not in allowed users list", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext({
        env: {
          APP_ENV: "staging",
          STAGING_ALLOWED_USERS: ["allowed@test.com"],
        } as unknown as ContextType["env"],
        user: { email: "notallowed@test.com", roles: [] },
      });

      class AllowedUsersController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(AllowedUsersController);

      const route = createMockSocketRoute({ controller: AllowedUsersController });

      const wsId = `test-ws-id-allowed-users-denied-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.Forbidden);
      expect(sentData.key).toBe("USER_NOT_ALLOWED");
    });

    test("allows user when email is in allowed users list", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext({
        env: {
          APP_ENV: "staging",
          STAGING_ALLOWED_USERS: ["allowed@test.com"],
        } as unknown as ContextType["env"],
        user: { email: "allowed@test.com", roles: [] },
      });

      class AllowedUsersPassController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(AllowedUsersPassController);

      const route = createMockSocketRoute({ controller: AllowedUsersPassController });

      const wsId = `test-ws-id-allowed-users-pass-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.OK);
    });

    test("skips allowed users check when no user is present", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext({
        env: {
          APP_ENV: "staging",
          STAGING_ALLOWED_USERS: ["allowed@test.com"],
        } as unknown as ContextType["env"],
        user: null,
      });

      class NoUserController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(NoUserController);

      const route = createMockSocketRoute({ controller: NoUserController });

      const wsId = `test-ws-id-no-user-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.OK);
    });

    test("skips allowed users check when allowed users list is empty", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext({
        env: {
          APP_ENV: "staging",
          STAGING_ALLOWED_USERS: [],
        } as unknown as ContextType["env"],
        user: { email: "anyone@test.com", roles: [] },
      });

      class EmptyListController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(EmptyListController);

      const route = createMockSocketRoute({ controller: EmptyListController });

      const wsId = `test-ws-id-empty-list-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(wsSendMock).toHaveBeenCalled();
      const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
      expect(sentData.status).toBe(HttpStatus.Code.OK);
    });

    test("adds SYSTEM role when user is in SYSTEM_USERS", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext({
        env: {
          APP_ENV: "production",
          SYSTEM_USERS: ["system@test.com"],
        } as unknown as ContextType["env"],
        user: { email: "system@test.com", roles: [] },
      });

      class SystemUserController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(SystemUserController);

      const route = createMockSocketRoute({ controller: SystemUserController });

      const wsId = `test-ws-id-system-user-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(context.user?.roles).toContain("ROLE_SYSTEM");
    });

    test("adds SUPER_ADMIN role when user is in SUPER_ADMIN_USERS", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext({
        env: {
          APP_ENV: "production",
          SUPER_ADMIN_USERS: ["superadmin@test.com"],
        } as unknown as ContextType["env"],
        user: { email: "superadmin@test.com", roles: [] },
      });

      class SuperAdminUserController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(SuperAdminUserController);

      const route = createMockSocketRoute({ controller: SuperAdminUserController });

      const wsId = `test-ws-id-super-admin-user-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(context.user?.roles).toContain("ROLE_SUPER_ADMIN");
    });

    test("adds ADMIN role when user is in ADMIN_USERS", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext({
        env: {
          APP_ENV: "production",
          ADMIN_USERS: ["admin@test.com"],
        } as unknown as ContextType["env"],
        user: { email: "admin@test.com", roles: [] },
      });

      class AdminUserController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(AdminUserController);

      const route = createMockSocketRoute({ controller: AdminUserController });

      const wsId = `test-ws-id-admin-user-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(context.user?.roles).toContain("ROLE_ADMIN");
    });

    test("adds all roles when user is in SYSTEM_USERS, SUPER_ADMIN_USERS, and ADMIN_USERS", async () => {
      const wsSendMock = mock(() => {});
      const context = createMockSocketContext({
        env: {
          APP_ENV: "production",
          SYSTEM_USERS: ["multi@test.com"],
          SUPER_ADMIN_USERS: ["multi@test.com"],
          ADMIN_USERS: ["multi@test.com"],
        } as unknown as ContextType["env"],
        user: { email: "multi@test.com", roles: [] },
      });

      class MultiRoleUserController {
        index(ctx: ContextType): IResponse {
          ctx.response.done = true;
          return ctx.response.json({ ok: true });
        }
      }
      container.add(MultiRoleUserController);

      const route = createMockSocketRoute({ controller: MultiRoleUserController });

      const wsId = `test-ws-id-multi-role-user-${Date.now()}`;
      container.addConstant(wsId, { context, route });

      const mockWs = createMockWs(wsId, wsSendMock);
      const mockServer = createMockServer();

      const message = JSON.stringify({
        payload: {},
        queries: {},
        lang: {},
      });

      await socketRouteHandler({
        message,
        ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
        server: mockServer as unknown as import("bun").Server<{ id: string }>,
      });

      expect(context.user?.roles).toContain("ROLE_SYSTEM");
      expect(context.user?.roles).toContain("ROLE_SUPER_ADMIN");
      expect(context.user?.roles).toContain("ROLE_ADMIN");
    });
  });
});

describe("socketRouteHandler feature flag", () => {
  test("returns 404 and skips the controller when the feature flag is disabled", async () => {
    const indexMock = mock((ctx: ContextType) => {
      ctx.response.done = true;
      return ctx.response.json({ ok: true });
    });

    class DisabledSocketFeatureFlag {
      isEnabled(): boolean {
        return false;
      }
    }
    container.add(DisabledSocketFeatureFlag);

    class DisabledFlagSocketController {
      index = indexMock;
    }
    container.add(DisabledFlagSocketController);

    const wsSendMock = mock(() => {});
    const context = createMockSocketContext();
    const route = createMockSocketRoute({
      controller: DisabledFlagSocketController,
      featureFlag: DisabledSocketFeatureFlag as unknown as FeatureFlagClassType,
    });

    const wsId = `test-ws-id-disabled-flag-${Date.now()}`;
    container.addConstant(wsId, { context, route });

    const mockWs = createMockWs(wsId, wsSendMock);
    const mockServer = createMockServer();

    await socketRouteHandler({
      message: JSON.stringify({ payload: {}, queries: {}, lang: {} }),
      ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
      server: mockServer as unknown as import("bun").Server<{ id: string }>,
    });

    const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
    expect(sentData.status).toBe(HttpStatus.Code.NotFound);
    expect(indexMock).not.toHaveBeenCalled();
  });

  test("proceeds to the controller when the feature flag is enabled", async () => {
    const indexMock = mock((ctx: ContextType) => {
      ctx.response.done = true;
      return ctx.response.json({ ok: true });
    });

    class EnabledSocketFeatureFlag {
      isEnabled(): boolean {
        return true;
      }
    }
    container.add(EnabledSocketFeatureFlag);

    class EnabledFlagSocketController {
      index = indexMock;
    }
    container.add(EnabledFlagSocketController);

    const wsSendMock = mock(() => {});
    const context = createMockSocketContext();
    const route = createMockSocketRoute({
      controller: EnabledFlagSocketController,
      featureFlag: EnabledSocketFeatureFlag as unknown as FeatureFlagClassType,
    });

    const wsId = `test-ws-id-enabled-flag-${Date.now()}`;
    container.addConstant(wsId, { context, route });

    const mockWs = createMockWs(wsId, wsSendMock);
    const mockServer = createMockServer();

    await socketRouteHandler({
      message: JSON.stringify({ payload: {}, queries: {}, lang: {} }),
      ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
      server: mockServer as unknown as import("bun").Server<{ id: string }>,
    });

    expect(indexMock).toHaveBeenCalled();
    expect(wsSendMock).toHaveBeenCalled();
  });

  test("supports an asynchronous isEnabled that resolves false", async () => {
    const indexMock = mock((ctx: ContextType) => {
      ctx.response.done = true;
      return ctx.response.json({ ok: true });
    });

    class AsyncDisabledSocketFeatureFlag {
      async isEnabled(): Promise<boolean> {
        return false;
      }
    }
    container.add(AsyncDisabledSocketFeatureFlag);

    class AsyncFlagSocketController {
      index = indexMock;
    }
    container.add(AsyncFlagSocketController);

    const wsSendMock = mock(() => {});
    const context = createMockSocketContext();
    const route = createMockSocketRoute({
      controller: AsyncFlagSocketController,
      featureFlag: AsyncDisabledSocketFeatureFlag as unknown as FeatureFlagClassType,
    });

    const wsId = `test-ws-id-async-disabled-flag-${Date.now()}`;
    container.addConstant(wsId, { context, route });

    const mockWs = createMockWs(wsId, wsSendMock);
    const mockServer = createMockServer();

    await socketRouteHandler({
      message: JSON.stringify({ payload: {}, queries: {}, lang: {} }),
      ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
      server: mockServer as unknown as import("bun").Server<{ id: string }>,
    });

    const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
    expect(sentData.status).toBe(HttpStatus.Code.NotFound);
    expect(indexMock).not.toHaveBeenCalled();
  });
});

describe("formatSocketRoutes upgrade handling", () => {
  const createUpgradeReq = (url: string): import("bun").BunRequest =>
    ({
      cookies: { get: mock(() => null), set: mock(() => {}) },
      headers: new Headers(),
      method: "GET",
      url,
      params: {},
      json: mock(() => Promise.resolve({})),
      formData: mock(() => Promise.resolve(new FormData())),
    }) as unknown as import("bun").BunRequest;

  const createUpgradeServer = (upgraded: boolean): import("bun").Server<unknown> =>
    ({
      requestIP: mock(() => ({ address: "127.0.0.1" })),
      upgrade: mock(() => upgraded),
    }) as unknown as import("bun").Server<unknown>;

  test("returns undefined and keeps the constant when the upgrade succeeds", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);
    const removeConstantSpy = spyOn(container, "removeConstant");

    const socketRoutes = new Map<string, RouteConfigType>();
    socketRoutes.set("/ws/up-ok", createMockSocketRoute({ path: "/ws/up-ok", name: "api.upgrade.ok" }));

    const handler = formatSocketRoutes(socketRoutes)["/v1/ws/up-ok"];
    const result = await handler?.(createUpgradeReq("http://localhost/v1/ws/up-ok"), createUpgradeServer(true));

    expect(result).toBeUndefined();
    expect(removeConstantSpy).not.toHaveBeenCalled();

    removeConstantSpy.mockRestore();
    container.removeConstant("logger");
  });

  test("removes the constant and returns an error response when the upgrade fails", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);
    const removeConstantSpy = spyOn(container, "removeConstant");

    const socketRoutes = new Map<string, RouteConfigType>();
    socketRoutes.set("/ws/up-fail", createMockSocketRoute({ path: "/ws/up-fail", name: "api.upgrade.fail" }));

    const handler = formatSocketRoutes(socketRoutes)["/v1/ws/up-fail"];
    const response = await handler?.(createUpgradeReq("http://localhost/v1/ws/up-fail"), createUpgradeServer(false));

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(HttpStatus.Code.UpgradeRequired);
    const body = await response?.json();
    expect(body.key).toBe("UPGRADE_FAILED");
    expect(removeConstantSpy).toHaveBeenCalledTimes(1);

    const removedId = (removeConstantSpy.mock.calls as unknown[][])[0]?.[0] as string;
    expect(container.hasConstant(removedId)).toBe(false);

    removeConstantSpy.mockRestore();
    container.removeConstant("logger");
  });
});

describe("socketRouteHandler missing connection state", () => {
  test("closes the socket without throwing when the constant is missing", async () => {
    const wsSendMock = mock(() => {});
    const mockWs = createMockWs("unregistered-ws-id", wsSendMock);
    const mockServer = createMockServer();

    await socketRouteHandler({
      message: JSON.stringify({ payload: {}, queries: {}, lang: {} }),
      ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
      server: mockServer as unknown as import("bun").Server<{ id: string }>,
    });

    expect(mockWs.close).toHaveBeenCalled();
    expect(wsSendMock).not.toHaveBeenCalled();
  });
});

describe("socketRouteHandler cache after access checks", () => {
  test("does not consult the cache when route access validation fails", async () => {
    const wsSendMock = mock(() => {});
    const cacheGetMock = mock(() => Promise.resolve('{"leaked":true}'));

    const context = createMockSocketContext({
      cache: {
        get: cacheGetMock,
        set: mock(() => Promise.resolve()),
        has: mock(() => Promise.resolve(true)),
        delete: mock(() => Promise.resolve(true)),
      },
    });

    class RestrictedCachedSocketController {
      index(ctx: ContextType): IResponse {
        ctx.response.done = true;
        return ctx.response.json({ ok: true });
      }
    }
    container.add(RestrictedCachedSocketController);

    const route = createMockSocketRoute({
      controller: RestrictedCachedSocketController,
      cache: "ws",
      roles: ["ROLE_ADMIN"],
    });

    const wsId = "test-ws-restricted-cache";
    container.addConstant(wsId, { context, route });

    const mockWs = createMockWs(wsId, wsSendMock);
    const mockServer = createMockServer();

    await socketRouteHandler({
      message: JSON.stringify({ payload: {}, queries: {}, lang: {} }),
      ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
      server: mockServer as unknown as import("bun").Server<{ id: string }>,
    });

    expect(cacheGetMock).not.toHaveBeenCalled();
    const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
    expect(sentData.status).toBe(HttpStatus.Code.Forbidden);
  });

  test("computes the cache key with the user set by middlewares", async () => {
    const wsSendMock = mock(() => {});
    const cacheGetMock = mock(() => Promise.resolve(undefined));
    const cacheSetMock = mock(() => Promise.resolve());

    const context = createMockSocketContext({
      env: { APP_ENV: Environment.DEVELOPMENT } as unknown as ContextType["env"],
      cache: {
        get: cacheGetMock,
        set: cacheSetMock,
        has: mock(() => Promise.resolve(false)),
        delete: mock(() => Promise.resolve(false)),
      },
    });

    class SocketAuthMiddleware {
      handler(ctx: ContextType): ContextType {
        ctx.user = { id: "user-1", email: "user@test.com", roles: [] } as unknown as ContextType["user"];
        return ctx;
      }
    }
    container.add(SocketAuthMiddleware);

    class AuthedCacheSocketController {
      index(ctx: ContextType): IResponse {
        ctx.response.done = true;
        return ctx.response.json({ ok: true });
      }
    }
    container.add(AuthedCacheSocketController);

    const route = createMockSocketRoute({
      controller: AuthedCacheSocketController,
      cache: "ws",
      name: "api.socket.authedcache",
    });

    const wsId = "test-ws-authed-cache";
    container.addConstant(wsId, { context, route });

    const mockWs = createMockWs(wsId, wsSendMock);
    const mockServer = createMockServer();

    await socketRouteHandler({
      message: JSON.stringify({ payload: {}, queries: {}, lang: {} }),
      ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
      server: mockServer as unknown as import("bun").Server<{ id: string }>,
      middlewares: [SocketAuthMiddleware as unknown as import("@talosjs/middleware").SocketMiddlewareClassType],
    });

    const expectedKey = getSocketCacheKey("ws", "api.socket.authedcache", "user-1", {}, {}, {});
    expect(cacheGetMock).toHaveBeenCalledWith(expectedKey);
    expect((cacheSetMock.mock.calls as unknown[][])[0]?.[0]).toBe(expectedKey);
  });

  test("sends the response even when the cache read and write fail", async () => {
    const wsSendMock = mock(() => {});

    const context = createMockSocketContext({
      cache: {
        get: mock(() => Promise.reject(new Error("cache backend down"))),
        set: mock(() => Promise.reject(new Error("cache backend down"))),
        has: mock(() => Promise.resolve(false)),
        delete: mock(() => Promise.resolve(false)),
      },
    });

    class FailingCacheSocketController {
      index(ctx: ContextType): IResponse {
        ctx.response.done = true;
        return ctx.response.json({ ok: true });
      }
    }
    container.add(FailingCacheSocketController);

    const route = createMockSocketRoute({
      controller: FailingCacheSocketController,
      cache: "ws",
    });

    const wsId = "test-ws-failing-cache";
    container.addConstant(wsId, { context, route });

    const mockWs = createMockWs(wsId, wsSendMock);
    const mockServer = createMockServer();

    await socketRouteHandler({
      message: JSON.stringify({ payload: {}, queries: {}, lang: {} }),
      ws: mockWs as unknown as import("bun").ServerWebSocket<{ id: string }>,
      server: mockServer as unknown as import("bun").Server<{ id: string }>,
    });

    const sentData = JSON.parse(String((wsSendMock.mock.calls as unknown[][])?.[0]?.[0]));
    expect(sentData.status).toBe(HttpStatus.Code.OK);
  });
});
