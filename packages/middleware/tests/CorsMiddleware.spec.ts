import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { CorsMiddleware } from "@/CorsMiddleware";

function createMockContext(options: { origin?: string; method?: string } = {}) {
  const responseHeaders = new Map<string, string>();

  return {
    method: options.method ?? "GET",
    header: {
      get: (name: string) => {
        if (name === "Origin") return options.origin ?? null;
        return null;
      },
    },
    response: {
      header: {
        setAccessControlAllowOrigin(origin: string) {
          responseHeaders.set("Access-Control-Allow-Origin", origin);
          return this;
        },
        setAccessControlAllowMethods(methods: string[]) {
          responseHeaders.set("Access-Control-Allow-Methods", methods.join(", "));
          return this;
        },
        setAccessControlAllowHeaders(headers: string[]) {
          responseHeaders.set("Access-Control-Allow-Headers", headers.join(", "));
          return this;
        },
        setAccessControlAllowCredentials(allow: boolean) {
          responseHeaders.set("Access-Control-Allow-Credentials", String(allow));
          return this;
        },
        set(name: string, value: string) {
          responseHeaders.set(name, value);
          return this;
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: mock
      json(_data: any, _status?: number) {},
    },
    _responseHeaders: responseHeaders,
    // biome-ignore lint/suspicious/noExplicitAny: mock
  } as any;
}

function clearCorsEnv() {
  delete Bun.env.CORS_ORIGINS;
  delete Bun.env.CORS_METHODS;
  delete Bun.env.CORS_HEADERS;
  delete Bun.env.CORS_EXPOSED_HEADERS;
  delete Bun.env.CORS_CREDENTIALS;
  delete Bun.env.CORS_MAX_AGE;
}

describe("CorsMiddleware", () => {
  afterEach(() => {
    clearCorsEnv();
  });

  test("should default to wildcard origins when CORS_ORIGINS is not set", async () => {
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://anything.com" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("should use CORS_ORIGINS env var for allowed origins", async () => {
    Bun.env.CORS_ORIGINS = "https://example.com, https://api.example.com";
    const middleware = new CorsMiddleware(new AppEnv());

    const allowed = createMockContext({ origin: "https://example.com" });
    await middleware.handler(allowed);
    expect(allowed._responseHeaders.get("Access-Control-Allow-Origin")).toBe("https://example.com");

    const disallowed = createMockContext({ origin: "https://evil.com" });
    await middleware.handler(disallowed);
    expect(disallowed._responseHeaders.size).toBe(0);
  });

  test("should use CORS_METHODS env var", async () => {
    Bun.env.CORS_METHODS = "GET, POST";
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Allow-Methods")).toBe("GET, POST");
  });

  test("should use default methods when CORS_METHODS is not set", async () => {
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Allow-Methods")).toBe("GET, HEAD, PUT, PATCH, POST, DELETE");
  });

  test("should use CORS_HEADERS env var", async () => {
    Bun.env.CORS_HEADERS = "X-Custom-Header";
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Allow-Headers")).toBe("X-Custom-Header");
  });

  test("should use default headers when CORS_HEADERS is not set", async () => {
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
  });

  test("should set exposed headers from CORS_EXPOSED_HEADERS env var", async () => {
    Bun.env.CORS_EXPOSED_HEADERS = "X-Request-Id, X-Total-Count";
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Expose-Headers")).toBe("X-Request-Id, X-Total-Count");
  });

  test("should not set exposed headers when CORS_EXPOSED_HEADERS is not set", async () => {
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com" });

    await middleware.handler(context);

    expect(context._responseHeaders.has("Access-Control-Expose-Headers")).toBe(false);
  });

  test("should enable credentials when CORS_CREDENTIALS is 'true'", async () => {
    Bun.env.CORS_CREDENTIALS = "true";
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("should disable credentials by default", async () => {
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Allow-Credentials")).toBe("false");
  });

  test("should use CORS_MAX_AGE env var on preflight requests", async () => {
    Bun.env.CORS_MAX_AGE = "3600";
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com", method: "OPTIONS" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Max-Age")).toBe("3600");
  });

  test("should default max age to 86400 on preflight requests", async () => {
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com", method: "OPTIONS" });

    await middleware.handler(context);

    expect(context._responseHeaders.get("Access-Control-Max-Age")).toBe("86400");
  });

  test("should not set CORS headers when no Origin header", async () => {
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext();

    await middleware.handler(context);

    expect(context._responseHeaders.size).toBe(0);
  });

  test("should not set Access-Control-Max-Age on non-preflight requests", async () => {
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com", method: "GET" });

    await middleware.handler(context);

    expect(context._responseHeaders.has("Access-Control-Max-Age")).toBe(false);
  });

  test("should return context from handler", async () => {
    const middleware = new CorsMiddleware(new AppEnv());
    const context = createMockContext({ origin: "https://example.com" });

    const result = await middleware.handler(context);

    expect(result).toBe(context);
  });
});
