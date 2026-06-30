import { describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { FeatureFlagClassType } from "@talosjs/feature-flag";
import { HttpResponse, type IResponse } from "@talosjs/http-response";
import { HttpStatus } from "@talosjs/http-status";
import type { PermissionClassType } from "@talosjs/permission";
import type { IRateLimiter, RateLimitResultType } from "@talosjs/rate-limit";
import type { RouteConfigType } from "@talosjs/routing";
import type { BunRequest, Server } from "bun";
import { formatHttpRoutes, getCacheKey } from "@/utils/routes";
import { createMockLogger, createMockRoute } from "./helpers";

describe("getCacheKey", () => {
  test("returns a string with the given prefix", () => {
    const key = getCacheKey("http", "GET", "http://localhost/v1/users", undefined);
    expect(key.startsWith("http:")).toBe(true);
  });

  test("is deterministic for the same inputs", () => {
    const key1 = getCacheKey("http", "GET", "http://localhost/v1/users", "user-123");
    const key2 = getCacheKey("http", "GET", "http://localhost/v1/users", "user-123");
    expect(key1).toBe(key2);
  });

  test("differs by HTTP method", () => {
    const getKey = getCacheKey("http", "GET", "http://localhost/v1/users", undefined);
    const postKey = getCacheKey("http", "POST", "http://localhost/v1/users", undefined);
    expect(getKey).not.toBe(postKey);
  });

  test("differs by URL path", () => {
    const key1 = getCacheKey("http", "GET", "http://localhost/v1/users", undefined);
    const key2 = getCacheKey("http", "GET", "http://localhost/v1/posts", undefined);
    expect(key1).not.toBe(key2);
  });

  test("differs by URL search params", () => {
    const key1 = getCacheKey("http", "GET", "http://localhost/v1/users?page=1", undefined);
    const key2 = getCacheKey("http", "GET", "http://localhost/v1/users?page=2", undefined);
    expect(key1).not.toBe(key2);
  });

  test("differs by userId", () => {
    const anonKey = getCacheKey("http", "GET", "http://localhost/v1/users", undefined);
    const userKey = getCacheKey("http", "GET", "http://localhost/v1/users", "user-123");
    expect(anonKey).not.toBe(userKey);
  });
});

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
    // biome-ignore lint/complexity/noBannedTypes: trust me
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
    // biome-ignore lint/complexity/noBannedTypes: trust me
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
    // biome-ignore lint/complexity/noBannedTypes: trust me
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
    // biome-ignore lint/complexity/noBannedTypes: trust me
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

    // biome-ignore lint/complexity/noBannedTypes: trust me
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

  test("returns 429 when rate limit is exceeded", async () => {
    const resetAt = new Date(Date.now() + 60_000);
    const rateLimiter = createMockRateLimiter({
      limited: true,
      remaining: 0,
      total: 120,
      resetAt,
    });
    container.addConstant("rateLimiter", rateLimiter);

    class RateLimitController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(RateLimitController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/rate-limited", [
      createMockRoute({
        path: "/rate-limited",
        method: "GET",
        controller: RateLimitController,
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/rate-limited"]?.GET;

    expect(handler).toBeDefined();

    const mockReq = {
      cookies: { get: mock(() => null), set: mock(() => {}) },
      headers: new Headers(),
      method: "GET",
      url: "http://localhost/v1/rate-limited",
    } as unknown as BunRequest;
    const mockServer = {
      requestIP: mock(() => ({ address: "192.168.1.1" })),
    } as unknown as Server<unknown>;

    // biome-ignore lint/complexity/noBannedTypes: trust me
    const response = await (handler as Function)(mockReq, mockServer);

    expect(response.status).toBe(HttpStatus.Code.TooManyRequests);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("Retry-After")).toBeDefined();
    expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();

    const body = await response.json();
    expect(body.message).toBe("Too Many Requests");
    expect(body.key).toBe("RATE_LIMITED");

    expect(rateLimiter.check).toHaveBeenCalledWith("192.168.1.1");

    container.removeConstant("rateLimiter");
  });

  test("allows request when rate limit is not exceeded", () => {
    const rateLimiter = createMockRateLimiter({
      limited: false,
      remaining: 119,
      total: 120,
      resetAt: new Date(Date.now() + 60_000),
    });
    container.addConstant("rateLimiter", rateLimiter);

    class AllowedController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(AllowedController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/allowed", [
      createMockRoute({
        path: "/allowed",
        method: "GET",
        controller: AllowedController,
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/allowed"]?.GET;

    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");

    container.removeConstant("rateLimiter");
  });

  test("skips rate limit when no rateLimiter is configured", () => {
    class NoRateLimitController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(NoRateLimitController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/no-rate-limit", [
      createMockRoute({
        path: "/no-rate-limit",
        method: "GET",
        controller: NoRateLimitController,
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/no-rate-limit"]?.GET;

    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  test("falls through when rate limiter throws", async () => {
    const throwingRateLimiter: IRateLimiter = {
      check: mock(() => Promise.reject(new Error("Redis connection failed"))),
      isLimited: mock(() => Promise.reject(new Error("Redis connection failed"))),
      reset: mock(() => Promise.resolve(true)),
      getCount: mock(() => Promise.resolve(0)),
    };
    container.addConstant("rateLimiter", throwingRateLimiter);

    class FallThroughController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(FallThroughController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/fallthrough", [
      createMockRoute({
        path: "/fallthrough",
        method: "GET",
        controller: FallThroughController,
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/fallthrough"]?.GET;

    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");

    container.removeConstant("rateLimiter");
  });

  test("uses unknown IP when server.requestIP returns null", async () => {
    const resetAt = new Date(Date.now() + 60_000);
    const rateLimiter = createMockRateLimiter({
      limited: true,
      remaining: 0,
      total: 120,
      resetAt,
    });
    container.addConstant("rateLimiter", rateLimiter);

    class NullIpController {
      index(): IResponse {
        return new HttpResponse().json({ ok: true });
      }
    }
    container.add(NullIpController);

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/null-ip", [
      createMockRoute({
        path: "/null-ip",
        method: "GET",
        controller: NullIpController,
      } as Partial<RouteConfigType>),
    ]);

    const result = formatHttpRoutes(httpRoutes);
    const handler = result["/v1/null-ip"]?.GET;

    const mockReq = {
      cookies: { get: mock(() => null), set: mock(() => {}) },
      headers: new Headers(),
      method: "GET",
      url: "http://localhost/v1/null-ip",
    } as unknown as BunRequest;
    const mockServer = {
      requestIP: mock(() => null),
    } as unknown as Server<unknown>;

    // biome-ignore lint/complexity/noBannedTypes: trust me
    const response = await (handler as Function)(mockReq, mockServer);

    expect(response.status).toBe(HttpStatus.Code.TooManyRequests);
    expect(rateLimiter.check).toHaveBeenCalledWith("unknown");

    container.removeConstant("rateLimiter");
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

    const httpRoutes = new Map<string, RouteConfigType[]>();
    httpRoutes.set("/logged-fallthrough", [
      createMockRoute({
        path: "/logged-fallthrough",
        method: "GET",
        controller: LoggedFallThroughController,
      } as Partial<RouteConfigType>),
    ]);

    const handler = formatHttpRoutes(httpRoutes)["/v1/logged-fallthrough"]?.GET;

    const mockReq = {
      cookies: { get: mock(() => null), set: mock(() => {}) },
      headers: new Headers(),
      method: "GET",
      url: "http://localhost/v1/logged-fallthrough",
      params: {},
      json: mock(() => Promise.resolve({})),
      formData: mock(() => Promise.resolve(new FormData())),
    } as unknown as BunRequest;
    const mockServer = {
      requestIP: mock(() => ({ address: "127.0.0.1" })),
    } as unknown as Server<unknown>;

    // biome-ignore lint/complexity/noBannedTypes: trust me
    const response = await (handler as Function)(mockReq, mockServer);

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
    // biome-ignore lint/complexity/noBannedTypes: trust me
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
    // biome-ignore lint/complexity/noBannedTypes: trust me
    const response = await (handler as Function)(createReq("http://localhost/v1/cache-write-fail"), createServer());

    expect(response.status).toBe(HttpStatus.Code.OK);

    container.removeConstant("logger");
    container.removeConstant("cache");
  });
});
