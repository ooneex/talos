import { describe, expect, mock, spyOn, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import type { FeatureFlagClassType } from "@talosjs/feature-flag";
import { HttpResponse, type IResponse } from "@talosjs/http-response";
import { HttpStatus } from "@talosjs/http-status";
import type { PermissionClassType } from "@talosjs/permission";
import type { IRateLimiter, RateLimitResultType } from "@talosjs/rate-limit";
import type { RouteConfigType } from "@talosjs/routing";
import type { BunRequest, Server } from "bun";
import { formatHttpRoutes } from "@/utils/routes";
import { createMockLogger, createMockRoute } from "./helpers";

describe("formatHttpRoutes", () => {
  test("returns empty object for empty routes map", () => {
    const httpRoutes = new Map<string, RouteConfigType[]>();

    const result = formatHttpRoutes(httpRoutes);

    expect(result).toEqual({});
  });

  test("creates route handlers for each path and method with version prefix", () => {
    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/users", [
      createMockRoute({ path: "/users", method: "GET" }),
      createMockRoute({ path: "/users", method: "POST" }),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const usersRoute = result["/v1/users"];

    expect(usersRoute).toBeDefined();
    expect(typeof usersRoute?.GET).toBe("function");
    expect(typeof usersRoute?.POST).toBe("function");
  });

  test("creates handlers for multiple paths with version prefix", () => {
    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/users", [createMockRoute({ path: "/users", method: "GET" })]);
    httpRoutes.set("/posts", [createMockRoute({ path: "/posts", method: "GET" })]);

    const result = formatHttpRoutes(httpRoutes);
    const usersRoute = result["/v1/users"];
    const postsRoute = result["/v1/posts"];

    expect(usersRoute).toBeDefined();
    expect(postsRoute).toBeDefined();
    expect(typeof usersRoute?.GET).toBe("function");
    expect(typeof postsRoute?.GET).toBe("function");
  });

  test("handles routes with different HTTP methods", () => {
    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/api/resource", [
      createMockRoute({ path: "/api/resource", method: "GET" }),
      createMockRoute({ path: "/api/resource", method: "POST" }),
      createMockRoute({ path: "/api/resource", method: "PUT" }),
      createMockRoute({ path: "/api/resource", method: "DELETE" }),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const resourceRoute = result["/v1/api/resource"];

    expect(typeof resourceRoute?.GET).toBe("function");
    expect(typeof resourceRoute?.POST).toBe("function");
    expect(typeof resourceRoute?.PUT).toBe("function");
    expect(typeof resourceRoute?.DELETE).toBe("function");
  });

  test("accepts empty middlewares array", () => {
    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/test", [createMockRoute({ path: "/test", method: "GET" })]);

    const result = formatHttpRoutes(httpRoutes, []);
    const testRoute = result["/v1/test"];

    expect(testRoute).toBeDefined();
    expect(typeof testRoute?.GET).toBe("function");
  });

  test("groups routes by versioned path when versions differ", () => {
    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/users", [
      createMockRoute({ path: "/users", method: "GET", version: 1 }),
      createMockRoute({ path: "/users", method: "GET", version: 2 }),
    ]);

    const result = formatHttpRoutes(httpRoutes);

    expect(result["/v1/users"]).toBeDefined();
    expect(result["/v2/users"]).toBeDefined();
    expect(typeof result["/v1/users"]?.GET).toBe("function");
    expect(typeof result["/v2/users"]?.GET).toBe("function");
  });

  test("prepends prefix to versioned path", () => {
    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/users", [createMockRoute({ path: "/users", method: "GET" })]);

    const result = formatHttpRoutes(httpRoutes, [], "api");

    expect(result["/api/v1/users"]).toBeDefined();
    expect(typeof result["/api/v1/users"]?.GET).toBe("function");
  });

  test("works without prefix", () => {
    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/users", [createMockRoute({ path: "/users", method: "GET" })]);

    const result = formatHttpRoutes(httpRoutes, []);

    expect(result["/v1/users"]).toBeDefined();
    expect(typeof result["/v1/users"]?.GET).toBe("function");
  });
});

describe("formatHttpRoutes permission", () => {
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

    class TestPermission {
      allow = allowMock;
      setUserPermissions = setUserPermissionsMock;
      build = buildMock;
      check = checkMock;
    }
    container.add(TestPermission);

    class PermController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(PermController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/test", [
      createMockRoute({
        path: "/test",
        method: "GET",
        controller: PermController,
        permission: TestPermission as unknown as PermissionClassType,
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/test"]?.GET;

    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  test("does not set permission when route has no permission", async () => {
    class NoPermController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(NoPermController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/test", [
      createMockRoute({
        path: "/test",
        method: "GET",
        controller: NoPermController,
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/test"]?.GET;

    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });
});

describe("formatHttpRoutes middleware and access control", () => {
  const createReq = (url: string): BunRequest =>
    ({
      cookies: { get: mock(() => null), set: mock(() => {}) },
      headers: new Headers(),
      method: "GET",
      url,
      params: {},
      json: mock(() => Promise.resolve({})),
      formData: mock(() => Promise.resolve(new FormData())),
    }) as unknown as BunRequest;

  const createServer = (): Server<unknown> =>
    ({ requestIP: mock(() => ({ address: "127.0.0.1" })) }) as unknown as Server<unknown>;

  test("returns an exception response when a middleware throws", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    class ThrowingMiddleware {
      async handler(): Promise<never> {
        throw new Error("Middleware exploded");
      }
    }
    container.add(ThrowingMiddleware);

    class ThrowingMiddlewareController {
      index = indexMock;
    }
    container.add(ThrowingMiddlewareController);

    const handler = formatHttpRoutes(
      new Map([
        [
          "/middleware-error",
          [
            createMockRoute({
              path: "/middleware-error",
              method: "GET",
              controller: ThrowingMiddlewareController,
            } as Partial<RouteConfigType>),
          ],
        ],
      ]),
      [ThrowingMiddleware as unknown as import("@talosjs/middleware").MiddlewareClassType],
    )["/v1/middleware-error"]?.GET;

    const response = await (handler as Function)(createReq("http://localhost/v1/middleware-error"), createServer());
    const body = await response.json();

    expect(response.status).toBe(HttpStatus.Code.InternalServerError);
    expect(body.message).toBe("Middleware exploded");
    expect(indexMock).not.toHaveBeenCalled();

    container.removeConstant("logger");
  });

  test("keeps the headers an earlier middleware set when a later one throws", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    class HeaderMiddleware {
      async handler(context: ContextType): Promise<ContextType> {
        context.response.header.set("Access-Control-Allow-Origin", "http://localhost:3031");

        return context;
      }
    }
    container.add(HeaderMiddleware);

    class RejectingMiddleware {
      async handler(): Promise<never> {
        throw new Error("Authentication required");
      }
    }
    container.add(RejectingMiddleware);

    class HeaderCarryOverController {
      index = mock(() => new HttpResponse().json({ ok: true }));
    }
    container.add(HeaderCarryOverController);

    const handler = formatHttpRoutes(
      new Map([
        [
          "/header-carry-over",
          [
            createMockRoute({
              path: "/header-carry-over",
              method: "GET",
              controller: HeaderCarryOverController,
            } as Partial<RouteConfigType>),
          ],
        ],
      ]),
      [HeaderMiddleware, RejectingMiddleware] as unknown as import("@talosjs/middleware").MiddlewareClassType[],
    )["/v1/header-carry-over"]?.GET;

    const response = await (handler as Function)(createReq("http://localhost/v1/header-carry-over"), createServer());

    expect(response.status).toBe(HttpStatus.Code.InternalServerError);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3031");

    container.removeConstant("logger");
  });

  test("returns forbidden when the authenticated user is not allowed in the current environment", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    class RestrictedUsersMiddleware {
      async handler(context: import("@talosjs/controller").ContextType) {
        context.user = {
          id: "user-1",
          email: "blocked@example.com",
          roles: ["ROLE_USER"],
        } as unknown as typeof context.user;
        context.env = {
          ...context.env,
          APP_ENV: "staging",
          STAGING_ALLOWED_USERS: ["allowed@example.com"],
        } as typeof context.env;

        return context;
      }
    }
    container.add(RestrictedUsersMiddleware);

    class RestrictedUsersController {
      index = indexMock;
    }
    container.add(RestrictedUsersController);

    const handler = formatHttpRoutes(
      new Map([
        [
          "/allowed-users",
          [
            createMockRoute({
              path: "/allowed-users",
              method: "GET",
              controller: RestrictedUsersController,
            } as Partial<RouteConfigType>),
          ],
        ],
      ]),
      [RestrictedUsersMiddleware as unknown as import("@talosjs/middleware").MiddlewareClassType],
    )["/v1/allowed-users"]?.GET;

    const response = await (handler as Function)(createReq("http://localhost/v1/allowed-users"), createServer());
    const body = await response.json();

    expect(response.status).toBe(HttpStatus.Code.Forbidden);
    expect(body.key).toBe("USER_NOT_ALLOWED");
    expect(body.message).toContain('User "blocked@example.com" is not allowed');
    expect(indexMock).not.toHaveBeenCalled();

    container.removeConstant("logger");
  });

  test("returns forbidden when permission.build().check denies the request", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    const checkMock = mock(() => Promise.resolve(false));
    const buildMock = mock(() => Promise.resolve({ check: checkMock }));
    const setUserPermissionsMock = mock(() => Promise.resolve({ build: buildMock }));
    const allowMock = mock(() => Promise.resolve({ setUserPermissions: setUserPermissionsMock }));

    class DeniedPermission {
      allow = allowMock;
    }
    container.add(DeniedPermission);

    class DeniedPermissionController {
      index = indexMock;
    }
    container.add(DeniedPermissionController);

    const handler = formatHttpRoutes(
      new Map([
        [
          "/permission-denied",
          [
            createMockRoute({
              path: "/permission-denied",
              method: "GET",
              controller: DeniedPermissionController,
              permission: DeniedPermission as unknown as PermissionClassType,
            } as Partial<RouteConfigType>),
          ],
        ],
      ]),
    )["/v1/permission-denied"]?.GET;

    const response = await (handler as Function)(createReq("http://localhost/v1/permission-denied"), createServer());
    const body = await response.json();

    expect(response.status).toBe(HttpStatus.Code.Forbidden);
    expect(body.key).toBe("PERMISSION_DENIED");
    expect(allowMock).toHaveBeenCalledTimes(1);
    expect(setUserPermissionsMock).toHaveBeenCalledTimes(1);
    expect(buildMock).toHaveBeenCalledTimes(1);
    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(indexMock).not.toHaveBeenCalled();

    container.removeConstant("logger");
  });

  test("allows the request when permission.build().check grants access", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    const checkMock = mock(() => Promise.resolve(true));
    const buildMock = mock(() => Promise.resolve({ check: checkMock }));
    const setUserPermissionsMock = mock(() => Promise.resolve({ build: buildMock }));
    const allowMock = mock(() => Promise.resolve({ setUserPermissions: setUserPermissionsMock }));

    class AllowedPermission {
      allow = allowMock;
    }
    container.add(AllowedPermission);

    class AllowedPermissionController {
      index = indexMock;
    }
    container.add(AllowedPermissionController);

    const handler = formatHttpRoutes(
      new Map([
        [
          "/permission-allowed",
          [
            createMockRoute({
              path: "/permission-allowed",
              method: "GET",
              controller: AllowedPermissionController,
              permission: AllowedPermission as unknown as PermissionClassType,
            } as Partial<RouteConfigType>),
          ],
        ],
      ]),
    )["/v1/permission-allowed"]?.GET;

    const response = await (handler as Function)(createReq("http://localhost/v1/permission-allowed"), createServer());
    const body = await response.json();

    expect(response.status).toBe(HttpStatus.Code.OK);
    expect(body.data.ok).toBe(true);
    expect(indexMock).toHaveBeenCalledTimes(1);
    expect(checkMock).toHaveBeenCalledTimes(1);

    container.removeConstant("logger");
  });
});

describe("formatHttpRoutes feature flag", () => {
  const setupConstants = () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);
  };

  const teardownConstants = () => {
    container.removeConstant("logger");
  };

  const createReq = (url: string): BunRequest =>
    ({
      cookies: { get: mock(() => null), set: mock(() => {}) },
      headers: new Headers(),
      method: "GET",
      url,
      params: {},
      json: mock(() => Promise.resolve({})),
      formData: mock(() => Promise.resolve(new FormData())),
    }) as unknown as BunRequest;

  const createServer = (): Server<unknown> =>
    ({ requestIP: mock(() => ({ address: "127.0.0.1" })) }) as unknown as Server<unknown>;

  test("returns 404 and skips the controller when the feature flag is disabled", async () => {
    setupConstants();
    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    class DisabledFeatureFlag {
      isEnabled(): boolean {
        return false;
      }
    }
    container.add(DisabledFeatureFlag);

    class DisabledFlagController {
      index = indexMock;
    }
    container.add(DisabledFlagController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/flagged", [
      createMockRoute({
        path: "/flagged",
        method: "GET",
        controller: DisabledFlagController,
        featureFlag: DisabledFeatureFlag as unknown as FeatureFlagClassType,
      } as Partial<RouteConfigType>),
    ]);

    const handler = formatHttpRoutes(httpRoutes)["/v1/flagged"]?.GET;
    const response = await (handler as Function)(createReq("http://localhost/v1/flagged"), createServer());

    expect(response.status).toBe(HttpStatus.Code.NotFound);
    expect(indexMock).not.toHaveBeenCalled();

    teardownConstants();
  });

  test("proceeds to the controller when the feature flag is enabled", async () => {
    setupConstants();
    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    class EnabledFeatureFlag {
      isEnabled(): boolean {
        return true;
      }
    }
    container.add(EnabledFeatureFlag);

    class EnabledFlagController {
      index = indexMock;
    }
    container.add(EnabledFlagController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/enabled", [
      createMockRoute({
        path: "/enabled",
        method: "GET",
        controller: EnabledFlagController,
        featureFlag: EnabledFeatureFlag as unknown as FeatureFlagClassType,
      } as Partial<RouteConfigType>),
    ]);

    const handler = formatHttpRoutes(httpRoutes)["/v1/enabled"]?.GET;
    const response = await (handler as Function)(createReq("http://localhost/v1/enabled"), createServer());

    expect(response.status).toBe(HttpStatus.Code.OK);
    expect(indexMock).toHaveBeenCalled();

    teardownConstants();
  });

  test("supports an asynchronous isEnabled that resolves false", async () => {
    setupConstants();
    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    class AsyncDisabledFeatureFlag {
      async isEnabled(): Promise<boolean> {
        return false;
      }
    }
    container.add(AsyncDisabledFeatureFlag);

    class AsyncFlagController {
      index = indexMock;
    }
    container.add(AsyncFlagController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/async-flag", [
      createMockRoute({
        path: "/async-flag",
        method: "GET",
        controller: AsyncFlagController,
        featureFlag: AsyncDisabledFeatureFlag as unknown as FeatureFlagClassType,
      } as Partial<RouteConfigType>),
    ]);

    const handler = formatHttpRoutes(httpRoutes)["/v1/async-flag"]?.GET;
    const response = await (handler as Function)(createReq("http://localhost/v1/async-flag"), createServer());

    expect(response.status).toBe(HttpStatus.Code.NotFound);
    expect(indexMock).not.toHaveBeenCalled();

    teardownConstants();
  });

  test("does not gate when the route has no feature flag", async () => {
    setupConstants();
    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    class NoFlagController {
      index = indexMock;
    }
    container.add(NoFlagController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/no-flag", [
      createMockRoute({
        path: "/no-flag",
        method: "GET",
        controller: NoFlagController,
      } as Partial<RouteConfigType>),
    ]);

    const handler = formatHttpRoutes(httpRoutes)["/v1/no-flag"]?.GET;
    const response = await (handler as Function)(createReq("http://localhost/v1/no-flag"), createServer());

    expect(response.status).toBe(HttpStatus.Code.OK);
    expect(indexMock).toHaveBeenCalled();

    teardownConstants();
  });
});

describe("formatHttpRoutes cache", () => {
  test("creates handler when route has cache enabled", () => {
    class CacheRouteController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(CacheRouteController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/cached", [
      createMockRoute({
        path: "/cached",
        method: "GET",
        controller: CacheRouteController,
        cache: "http",
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/cached"]?.GET;

    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  test("creates handler when route has cache disabled", () => {
    class NoCacheRouteController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(NoCacheRouteController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/no-cache", [
      createMockRoute({
        path: "/no-cache",
        method: "GET",
        controller: NoCacheRouteController,
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/no-cache"]?.GET;

    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  test("cache.set receives correct structure with body, status, headers, and TTL", async () => {
    const cacheSetMock = mock((_key: string, _data: unknown, _ttl: number) => Promise.resolve());
    const cacheData = {
      body: '{"data":{"cached":true},"status":200}',
      status: 200,
      headers: { "content-type": "application/json" },
    };

    await cacheSetMock("cache-key-123", cacheData, 300);

    expect(cacheSetMock).toHaveBeenCalledWith("cache-key-123", cacheData, 300);
    expect(cacheSetMock.mock.calls[0]?.[2]).toBe(300);
  });

  test("calls logRequest with cached status on cache hit", async () => {
    const cachedBody = '{"data":"from-cache"}';
    const cachedStatus = 200;

    const loggerMock = {
      success: mock((..._args: unknown[]) => {}),
      info: mock((..._args: unknown[]) => {}),
      warn: mock((..._args: unknown[]) => {}),
      error: mock((..._args: unknown[]) => {}),
    };
    container.addConstant("logger", loggerMock);
    container.add(AppEnv);

    const cacheMock = {
      get: mock(() =>
        Promise.resolve({
          body: cachedBody,
          status: cachedStatus,
          headers: { "content-type": "application/json" },
        }),
      ),
      set: mock(() => Promise.resolve()),
      delete: mock(() => Promise.resolve()),
      has: mock(() => Promise.resolve(true)),
      clear: mock(() => Promise.resolve()),
    };
    container.addConstant("cache", cacheMock);

    class CacheHitLogController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(CacheHitLogController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/cache-hit-log", [
      createMockRoute({
        path: "/cache-hit-log",
        method: "GET",
        controller: CacheHitLogController,
        cache: "http",
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/cache-hit-log"]?.GET;

    expect(handler).toBeDefined();

    const mockReq = {
      cookies: { get: mock(() => null), set: mock(() => {}) },
      headers: new Headers(),
      method: "GET",
      url: "http://localhost/v1/cache-hit-log",
      params: {},
      json: mock(() => Promise.resolve({})),
      formData: mock(() => Promise.resolve(new FormData())),
    } as unknown as BunRequest;

    const mockServer = {
      requestIP: mock(() => ({ address: "127.0.0.1" })),
    } as unknown as Server<unknown>;

    const response = await (handler as Function)(mockReq, mockServer);

    expect(response.status).toBe(cachedStatus);
    expect(await response.text()).toBe(cachedBody);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(loggerMock.success).toHaveBeenCalled();

    container.removeConstant("logger");
    container.removeConstant("cache");
  });
});

describe("formatHttpRoutes rate limit", () => {
  const createMockRateLimiter = (result: RateLimitResultType): IRateLimiter => ({
    check: mock(() => Promise.resolve(result)),
    isLimited: mock(() => Promise.resolve(result.limited)),
    reset: mock(() => Promise.resolve(true)),
    getCount: mock(() => Promise.resolve(result.total - result.remaining)),
  });

  const createLimitedRateLimiter = (): IRateLimiter =>
    createMockRateLimiter({
      limited: true,
      remaining: 0,
      total: 120,
      resetAt: new Date(Date.now() + 60_000),
    });

  const createReq = (url: string): BunRequest =>
    ({
      cookies: { get: mock(() => null), set: mock(() => {}) },
      headers: new Headers(),
      method: "GET",
      url,
      params: {},
      json: mock(() => Promise.resolve({})),
      formData: mock(() => Promise.resolve(new FormData())),
    }) as unknown as BunRequest;

  const createServer = (address: string | null = "192.168.1.1"): Server<unknown> =>
    ({ requestIP: mock(() => (address ? { address } : null)) }) as unknown as Server<unknown>;

  const buildHandler = (
    path: string,
    controller: unknown,
    middlewares: import("@talosjs/middleware").MiddlewareClassType[] = [],
  ): Function => {
    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set(path, [createMockRoute({ path, method: "GET", controller } as Partial<RouteConfigType>)]);

    return formatHttpRoutes(httpRoutes, middlewares)[`/v1${path}`]?.GET as Function;
  };

  test("returns 429 with the rate-limit headers and skips the controller when the limit is exceeded", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const rateLimiter = createLimitedRateLimiter();
    container.addConstant("rateLimiter", rateLimiter);

    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    class RateLimitController {
      index = indexMock;
    }
    container.add(RateLimitController);

    const handler = buildHandler("/rate-limited", RateLimitController);
    const response = await handler(createReq("http://localhost/v1/rate-limited"), createServer());

    expect(response.status).toBe(HttpStatus.Code.TooManyRequests);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("Retry-After")).toBeDefined();
    expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();

    const body = await response.json();
    expect(body.message).toBe("Too Many Requests");
    expect(body.key).toBe("RATE_LIMITED");
    expect(indexMock).not.toHaveBeenCalled();

    container.removeConstant("rateLimiter");
    container.removeConstant("logger");
  });

  test("keys anonymous requests on the IP alone", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const rateLimiter = createLimitedRateLimiter();
    container.addConstant("rateLimiter", rateLimiter);

    class AnonymousKeyController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(AnonymousKeyController);

    const handler = buildHandler("/anonymous-key", AnonymousKeyController);
    await handler(createReq("http://localhost/v1/anonymous-key"), createServer());

    expect(rateLimiter.check).toHaveBeenCalledWith("192.168.1.1:anon");

    container.removeConstant("rateLimiter");
    container.removeConstant("logger");
  });

  test("keys requests on the IP and the user a middleware authenticated", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const rateLimiter = createLimitedRateLimiter();
    container.addConstant("rateLimiter", rateLimiter);

    class AuthenticatingMiddleware {
      async handler(context: ContextType): Promise<ContextType> {
        context.user = { id: "user-1", email: "user@example.com", roles: [] } as unknown as typeof context.user;

        return context;
      }
    }
    container.add(AuthenticatingMiddleware);

    class UserKeyController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(UserKeyController);

    const handler = buildHandler("/user-key", UserKeyController, [
      AuthenticatingMiddleware as unknown as import("@talosjs/middleware").MiddlewareClassType,
    ]);
    const response = await handler(createReq("http://localhost/v1/user-key"), createServer());

    expect(response.status).toBe(HttpStatus.Code.TooManyRequests);
    expect(rateLimiter.check).toHaveBeenCalledWith("192.168.1.1:user-1");

    container.removeConstant("rateLimiter");
    container.removeConstant("logger");
  });

  test("keeps the headers a middleware set on the 429 response", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    container.addConstant("rateLimiter", createLimitedRateLimiter());

    class CorsHeaderMiddleware {
      async handler(context: ContextType): Promise<ContextType> {
        context.response.header.set("Access-Control-Allow-Origin", "http://localhost:3031");

        return context;
      }
    }
    container.add(CorsHeaderMiddleware);

    class CorsRateLimitController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(CorsRateLimitController);

    const handler = buildHandler("/cors-rate-limited", CorsRateLimitController, [
      CorsHeaderMiddleware as unknown as import("@talosjs/middleware").MiddlewareClassType,
    ]);
    const response = await handler(createReq("http://localhost/v1/cors-rate-limited"), createServer());

    expect(response.status).toBe(HttpStatus.Code.TooManyRequests);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3031");

    container.removeConstant("rateLimiter");
    container.removeConstant("logger");
  });

  test("allows the request through to the controller when the limit is not exceeded", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const rateLimiter = createMockRateLimiter({
      limited: false,
      remaining: 119,
      total: 120,
      resetAt: new Date(Date.now() + 60_000),
    });
    container.addConstant("rateLimiter", rateLimiter);

    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    class AllowedController {
      index = indexMock;
    }
    container.add(AllowedController);

    const handler = buildHandler("/allowed", AllowedController);
    const response = await handler(createReq("http://localhost/v1/allowed"), createServer());

    expect(response.status).toBe(HttpStatus.Code.OK);
    expect(rateLimiter.check).toHaveBeenCalledTimes(1);
    expect(indexMock).toHaveBeenCalledTimes(1);

    container.removeConstant("rateLimiter");
    container.removeConstant("logger");
  });

  test("reaches the controller without a quota check when no rateLimiter is configured", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);
    container.removeConstant("rateLimiter");

    const indexMock = mock(() => new HttpResponse().json({ ok: true }));

    class NoRateLimitController {
      index = indexMock;
    }
    container.add(NoRateLimitController);

    const handler = buildHandler("/no-rate-limit", NoRateLimitController);
    const response = await handler(createReq("http://localhost/v1/no-rate-limit"), createServer());

    expect(response.status).toBe(HttpStatus.Code.OK);
    expect(indexMock).toHaveBeenCalledTimes(1);

    container.removeConstant("logger");
  });

  test("uses unknown IP when server.requestIP returns null", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const rateLimiter = createLimitedRateLimiter();
    container.addConstant("rateLimiter", rateLimiter);

    class NullIpController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(NullIpController);

    const handler = buildHandler("/null-ip", NullIpController);
    const response = await handler(createReq("http://localhost/v1/null-ip"), createServer(null));

    expect(response.status).toBe(HttpStatus.Code.TooManyRequests);
    expect(rateLimiter.check).toHaveBeenCalledWith("unknown:anon");

    container.removeConstant("rateLimiter");
    container.removeConstant("logger");
  });

  test("logs through the container logger and fails open when rate limiter throws", async () => {
    const loggerMock = createMockLogger();
    container.addConstant("logger", loggerMock);
    container.add(AppEnv);

    const throwingRateLimiter: IRateLimiter = {
      check: mock(() => Promise.reject(new Error("Redis connection failed"))),
      isLimited: mock(() => Promise.reject(new Error("Redis connection failed"))),
      reset: mock(() => Promise.resolve(true)),
      getCount: mock(() => Promise.resolve(0)),
    };
    container.addConstant("rateLimiter", throwingRateLimiter);

    class LoggedFallThroughController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(LoggedFallThroughController);

    const handler = buildHandler("/logged-fallthrough", LoggedFallThroughController);
    const response = await handler(createReq("http://localhost/v1/logged-fallthrough"), createServer("127.0.0.1"));

    expect(response.status).toBe(HttpStatus.Code.OK);
    expect(loggerMock.error).toHaveBeenCalled();
    expect((loggerMock.error.mock.calls as unknown[][])[0]?.[0]).toContain("Redis connection failed");

    container.removeConstant("rateLimiter");
    container.removeConstant("logger");
  });
});

describe("formatHttpRoutes cache after access checks", () => {
  const createReq = (url: string): BunRequest =>
    ({
      cookies: { get: mock(() => null), set: mock(() => {}) },
      headers: new Headers(),
      method: "GET",
      url,
      params: {},
      json: mock(() => Promise.resolve({})),
      formData: mock(() => Promise.resolve(new FormData())),
    }) as unknown as BunRequest;

  const createServer = (): Server<unknown> =>
    ({ requestIP: mock(() => ({ address: "127.0.0.1" })) }) as unknown as Server<unknown>;

  test("does not consult the cache when route access validation fails", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    const cacheGetMock = mock(() => Promise.resolve({ body: '{"leaked":true}', status: 200, headers: {} }));
    container.addConstant("cache", {
      get: cacheGetMock,
      set: mock(() => Promise.resolve()),
      has: mock(() => Promise.resolve(true)),
      delete: mock(() => Promise.resolve(true)),
      clear: mock(() => Promise.resolve()),
    });

    class RestrictedCachedController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(RestrictedCachedController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/restricted-cached", [
      createMockRoute({
        path: "/restricted-cached",
        method: "GET",
        controller: RestrictedCachedController,
        cache: "http",
        roles: ["ROLE_ADMIN"],
      } as Partial<RouteConfigType>),
    ]);

    const handler = formatHttpRoutes(httpRoutes)["/v1/restricted-cached"]?.GET;
    const response = await (handler as Function)(createReq("http://localhost/v1/restricted-cached"), createServer());

    expect(response.status).toBe(HttpStatus.Code.Forbidden);
    expect(cacheGetMock).not.toHaveBeenCalled();

    container.removeConstant("logger");
    container.removeConstant("cache");
  });

  test("returns the response even when the cache write fails", async () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);

    container.addConstant("cache", {
      get: mock(() => Promise.resolve(undefined)),
      set: mock(() => Promise.reject(new Error("cache backend down"))),
      has: mock(() => Promise.resolve(false)),
      delete: mock(() => Promise.resolve(false)),
      clear: mock(() => Promise.resolve()),
    });

    class CacheWriteFailController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(CacheWriteFailController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/cache-write-fail", [
      createMockRoute({
        path: "/cache-write-fail",
        method: "GET",
        controller: CacheWriteFailController,
        cache: "http",
      } as Partial<RouteConfigType>),
    ]);

    const handler = formatHttpRoutes(httpRoutes)["/v1/cache-write-fail"]?.GET;
    const response = await (handler as Function)(createReq("http://localhost/v1/cache-write-fail"), createServer());

    expect(response.status).toBe(HttpStatus.Code.OK);

    container.removeConstant("logger");
    container.removeConstant("cache");
  });
});

describe("formatHttpRoutes body size", () => {
  const KB = 1024;

  const createServer = (): Server<unknown> =>
    ({ requestIP: mock(() => ({ address: "127.0.0.1" })) }) as unknown as Server<unknown>;

  const toBunRequest = (req: Request): BunRequest => Object.assign(req, { params: {} }) as unknown as BunRequest;

  const chunkedStream = (chunks: number, chunkSize: number, onPull: () => void = () => {}) => {
    let sent = 0;
    return new ReadableStream<Uint8Array>({
      pull: (controller) => {
        onPull();
        if (sent === chunks) {
          controller.close();
          return;
        }
        sent++;
        controller.enqueue(new Uint8Array(chunkSize).fill(97));
      },
    });
  };

  const createRoutes = (path: string, controller: RouteConfigType["controller"], maxBodySize?: number) =>
    new Map([
      [
        path,
        [
          createMockRoute({
            path,
            method: "POST",
            controller,
            ...(maxBodySize !== undefined && { maxBodySize }),
          } as Partial<RouteConfigType>),
        ],
      ],
    ]);

  const setup = () => {
    container.addConstant("logger", createMockLogger());
    container.add(AppEnv);
  };

  test("hands a body within the app limit to the controller", async () => {
    setup();
    const indexMock = mock((context: ContextType) => new HttpResponse().json({ received: context.payload }));
    class UnderLimitController {
      index = indexMock;
    }
    container.add(UnderLimitController);

    const handler = formatHttpRoutes(createRoutes("/under-limit", UnderLimitController), [], undefined, KB)[
      "/v1/under-limit"
    ]?.POST as Function;
    const body = JSON.stringify({ text: "hello" });
    const response = await handler(
      toBunRequest(
        new Request("http://localhost/v1/under-limit", {
          method: "POST",
          headers: { "content-type": "application/json", "content-length": String(body.length) },
          body,
        }),
      ),
      createServer(),
    );

    expect(response.status).toBe(HttpStatus.Code.OK);
    expect((await response.json()).data).toEqual({ received: { text: "hello" } });

    container.removeConstant("logger");
  });

  test("answers 413 on a declared length over the limit without reading the body", async () => {
    setup();
    const indexMock = mock(() => new HttpResponse().json({ ok: true }));
    class DeclaredOverController {
      index = indexMock;
    }
    container.add(DeclaredOverController);

    const handler = formatHttpRoutes(createRoutes("/declared-over", DeclaredOverController), [], undefined, KB)[
      "/v1/declared-over"
    ]?.POST as Function;
    const req = new Request("http://localhost/v1/declared-over", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(2 * KB) },
      body: JSON.stringify({ text: "a".repeat(2 * KB - 11) }),
    });
    const jsonSpy = spyOn(req, "json");

    const response = await handler(toBunRequest(req), createServer());
    const body = await response.json();

    expect(response.status).toBe(HttpStatus.Code.ContentTooLarge);
    expect(body.key).toBe("REQUEST_BODY_TOO_LARGE");
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
    expect(indexMock).not.toHaveBeenCalled();

    container.removeConstant("logger");
  });

  test("answers 413 once a chunked body passes the limit", async () => {
    setup();
    const indexMock = mock(() => new HttpResponse().json({ ok: true }));
    class ChunkedOverController {
      index = indexMock;
    }
    container.add(ChunkedOverController);

    const handler = formatHttpRoutes(createRoutes("/chunked-over", ChunkedOverController), [], undefined, KB)[
      "/v1/chunked-over"
    ]?.POST as Function;
    let pulls = 0;
    const req = new Request("http://localhost/v1/chunked-over", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: chunkedStream(64, KB / 4, () => pulls++),
    });

    const response = await handler(toBunRequest(req), createServer());

    expect(response.status).toBe(HttpStatus.Code.ContentTooLarge);
    expect((await response.json()).key).toBe("REQUEST_BODY_TOO_LARGE");
    expect(pulls).toBeLessThan(64);
    expect(indexMock).not.toHaveBeenCalled();

    container.removeConstant("logger");
  });

  test("lets a route raise its own limit above the app default", async () => {
    setup();
    class OverrideController {
      index(context: ContextType): IResponse {
        return new HttpResponse().json({ size: (context.payload as { text: string }).text.length });
      }
    }
    container.add(OverrideController);

    const handler = formatHttpRoutes(createRoutes("/override", OverrideController, 8 * KB), [], undefined, KB)[
      "/v1/override"
    ]?.POST as Function;
    const body = JSON.stringify({ text: "a".repeat(4 * KB) });
    const response = await handler(
      toBunRequest(
        new Request("http://localhost/v1/override", {
          method: "POST",
          headers: { "content-type": "application/json", "content-length": String(body.length) },
          body,
        }),
      ),
      createServer(),
    );

    expect(response.status).toBe(HttpStatus.Code.OK);
    expect((await response.json()).data).toEqual({ size: 4 * KB });

    container.removeConstant("logger");
  });

  test("streams a raw body to a controller that reads it itself, without buffering it", async () => {
    setup();
    const chunks = 64;
    const chunkSize = 16 * KB;
    let pulls = 0;
    let pullsAtController = -1;
    class RawStreamController {
      async index(context: ContextType): Promise<IResponse> {
        pullsAtController = pulls;
        let received = 0;
        const reader = (context.request.native.body as ReadableStream<Uint8Array>).getReader();
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
          received += chunk.value.byteLength;
        }
        return new HttpResponse().json({ received });
      }
    }
    container.add(RawStreamController);

    const handler = formatHttpRoutes(
      createRoutes("/raw-stream", RawStreamController, chunks * chunkSize),
      [],
      undefined,
      KB,
    )["/v1/raw-stream"]?.POST as Function;
    const response = await handler(
      toBunRequest(
        new Request("http://localhost/v1/raw-stream", {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: chunkedStream(chunks, chunkSize, () => pulls++),
        }),
      ),
      createServer(),
    );

    expect(response.status).toBe(HttpStatus.Code.OK);
    expect((await response.json()).data).toEqual({ received: chunks * chunkSize });
    expect(pullsAtController).toBeLessThan(4);

    container.removeConstant("logger");
  });

  test("answers 413 when a raw stream passes the route limit while the controller reads it", async () => {
    setup();
    class RawStreamOverController {
      async index(context: ContextType): Promise<IResponse> {
        await new Response(context.request.native.body).arrayBuffer();
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(RawStreamOverController);

    const handler = formatHttpRoutes(createRoutes("/raw-stream-over", RawStreamOverController, 4 * KB))[
      "/v1/raw-stream-over"
    ]?.POST as Function;
    const response = await handler(
      toBunRequest(
        new Request("http://localhost/v1/raw-stream-over", {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: chunkedStream(8, KB),
        }),
      ),
      createServer(),
    );

    expect(response.status).toBe(HttpStatus.Code.ContentTooLarge);
    expect((await response.json()).key).toBe("REQUEST_BODY_TOO_LARGE");

    container.removeConstant("logger");
  });

  test("answers 413 to a chunked upload over the limit on a running server", async () => {
    setup();
    class ServedController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(ServedController);

    const server = Bun.serve({
      port: 0,
      routes: formatHttpRoutes(createRoutes("/served", ServedController), [], undefined, KB),
    } as unknown as Parameters<typeof Bun.serve>[0]);

    try {
      const response = await fetch(`${server.url}v1/served`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: chunkedStream(16, KB),
      });

      expect(response.status).toBe(HttpStatus.Code.ContentTooLarge);
      expect((await response.json()).key).toBe("REQUEST_BODY_TOO_LARGE");
    } finally {
      server.stop(true);
      container.removeConstant("logger");
    }
  });

  test("rethrows an error that is not about the body size", async () => {
    setup();
    class UnreachedController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(UnreachedController);

    const handler = formatHttpRoutes(createRoutes("/ip-failure", UnreachedController), [], undefined, KB)[
      "/v1/ip-failure"
    ]?.POST as Function;
    const server = {
      requestIP: mock(() => {
        throw new Error("socket closed");
      }),
    } as unknown as Server<unknown>;

    await expect(
      handler(toBunRequest(new Request("http://localhost/v1/ip-failure", { method: "POST" })), server),
    ).rejects.toThrow("socket closed");

    container.removeConstant("logger");
  });
});
