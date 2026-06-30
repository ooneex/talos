import { describe, expect, test } from "bun:test";
import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import type { MiddlewareClassType } from "@talosjs/middleware";
import { runMiddlewares } from "@/utils/middleware";
import { createMockContext } from "./helpers";

describe("runMiddlewares", () => {
  test("returns context unchanged when no middlewares provided", async () => {
    const context = createMockContext();

    const result = await runMiddlewares(context, []);

    expect(result).toBe(context);
  });

  test("runs a single middleware and returns modified context", async () => {
    class TestMiddleware {
      handler = async (ctx: ContextType) => {
        ctx.response.header.set("X-Custom-Test", "value");
        return ctx;
      };
    }
    container.add(TestMiddleware);

    const context = createMockContext();

    const result = await runMiddlewares(context, [TestMiddleware as unknown as MiddlewareClassType]);

    expect(result.response.header.get("X-Custom-Test")).toBe("value");
  });

  test("runs multiple middlewares in order", async () => {
    const order: string[] = [];

    class FirstMiddleware {
      handler = async (ctx: ContextType) => {
        order.push("first");
        ctx.response.header.set("X-Custom-First", "1");
        return ctx;
      };
    }

    class SecondMiddleware {
      handler = async (ctx: ContextType) => {
        order.push("second");
        ctx.response.header.set("X-Custom-Second", "2");
        return ctx;
      };
    }

    container.add(FirstMiddleware);
    container.add(SecondMiddleware);

    const context = createMockContext();

    const result = await runMiddlewares(context, [
      FirstMiddleware as unknown as MiddlewareClassType,
      SecondMiddleware as unknown as MiddlewareClassType,
    ]);

    expect(order).toEqual(["first", "second"]);
    expect(result.response.header.get("X-Custom-First")).toBe("1");
    expect(result.response.header.get("X-Custom-Second")).toBe("2");
  });

  test("runs CORS middleware that sets Access-Control headers", async () => {
    class MockCorsMiddleware {
      handler = async (ctx: ContextType) => {
        ctx.response.header.setAccessControlAllowOrigin("http://localhost:3000");
        ctx.response.header.setAccessControlAllowMethods(["GET", "POST"]);
        ctx.response.header.setAccessControlAllowHeaders(["Content-Type", "Authorization"]);
        return ctx;
      };
    }
    container.add(MockCorsMiddleware);

    const context = createMockContext();

    const result = await runMiddlewares(context, [MockCorsMiddleware as unknown as MiddlewareClassType]);

    expect(result.response.header.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(result.response.header.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(result.response.header.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  test("runs app middlewares followed by CORS middleware", async () => {
    const order: string[] = [];

    class AuthMiddleware {
      handler = async (ctx: ContextType) => {
        order.push("auth");
        return ctx;
      };
    }

    class CorsMiddleware {
      handler = async (ctx: ContextType) => {
        order.push("cors");
        ctx.response.header.setAccessControlAllowOrigin("*");
        return ctx;
      };
    }

    container.add(AuthMiddleware);
    container.add(CorsMiddleware);

    const context = createMockContext();

    const allMiddlewares = [
      AuthMiddleware as unknown as MiddlewareClassType,
      CorsMiddleware as unknown as MiddlewareClassType,
    ];

    const result = await runMiddlewares(context, allMiddlewares);

    expect(order).toEqual(["auth", "cors"]);
    expect(result.response.header.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("runs socket-style middlewares against a socket context", async () => {
    type SocketishContextType = ContextType & { channel: { sent: string[] } };

    class SocketMiddleware {
      handler = async (ctx: SocketishContextType) => {
        ctx.channel.sent.push("middleware-ran");
        return ctx;
      };
    }
    container.add(SocketMiddleware);

    const context = { ...createMockContext(), channel: { sent: [] } } as SocketishContextType;

    const result = await runMiddlewares(context, [SocketMiddleware]);

    expect(result.channel.sent).toEqual(["middleware-ran"]);
  });
});
