import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";

describe("decorator.middleware", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'Middleware' successfully", () => {
    class TestMiddleware {
      public handler(_context: unknown): unknown {
        return _context;
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.middleware()(TestMiddleware as any);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonMiddleware {
      public handler(_context: unknown): unknown {
        return _context;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.middleware()(SingletonMiddleware as any);

    const instance1 = container.get(SingletonMiddleware);
    const instance2 = container.get(SingletonMiddleware);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonMiddleware {
      public handler(_context: unknown): unknown {
        return _context;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.middleware(EContainerScope.Singleton)(ExplicitSingletonMiddleware as any);

    const instance1 = container.get(ExplicitSingletonMiddleware);
    const instance2 = container.get(ExplicitSingletonMiddleware);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientMiddleware {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientMiddleware.instanceCount++;
        this.instanceId = TransientMiddleware.instanceCount;
      }

      public handler(_context: unknown): unknown {
        return _context;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.middleware(EContainerScope.Transient)(TransientMiddleware as any);

    const instance1 = container.get(TransientMiddleware);
    const instance2 = container.get(TransientMiddleware);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedMiddleware {
      public handler(_context: unknown): unknown {
        return _context;
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.middleware(EContainerScope.Request)(RequestScopedMiddleware as any);
    }).not.toThrow();

    const instance = container.get(RequestScopedMiddleware);
    expect(instance).toBeInstanceOf(RequestScopedMiddleware);
  });

  test("should register class with complex name ending in 'Middleware'", () => {
    class AuthenticationJwtBearerMiddleware {
      public handler(_context: unknown): unknown {
        return _context;
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.middleware()(AuthenticationJwtBearerMiddleware as any);
    }).not.toThrow();
  });

  test("should allow retrieving registered Middleware class from container", () => {
    class RetrievableMiddleware {
      public readonly name = "retrievable";

      public handler(_context: unknown): unknown {
        return _context;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.middleware()(RetrievableMiddleware as any);

    const instance = container.get(RetrievableMiddleware);
    expect(instance).toBeInstanceOf(RetrievableMiddleware);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with Middleware class that has async handler method", () => {
    class AsyncMiddleware {
      public async handler(_context: unknown): Promise<unknown> {
        return _context;
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.middleware()(AsyncMiddleware as any);
    }).not.toThrow();

    const instance = container.get(AsyncMiddleware);
    expect(instance).toBeInstanceOf(AsyncMiddleware);
  });

  test("should work with SocketMiddleware class", () => {
    class SocketTestMiddleware {
      public handler(_context: unknown): unknown {
        return _context;
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.middleware()(SocketTestMiddleware as any);
    }).not.toThrow();

    const instance = container.get(SocketTestMiddleware);
    expect(instance).toBeInstanceOf(SocketTestMiddleware);
  });

  test("should work with async SocketMiddleware class", () => {
    class AsyncSocketMiddleware {
      public async handler(_context: unknown): Promise<unknown> {
        return _context;
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.middleware()(AsyncSocketMiddleware as any);
    }).not.toThrow();

    const instance = container.get(AsyncSocketMiddleware);
    expect(instance).toBeInstanceOf(AsyncSocketMiddleware);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnMiddleware {
      public handler(_context: unknown): unknown {
        return _context;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    const result = decorator.middleware()(VoidReturnMiddleware as any);
    expect(result).toBeUndefined();
  });
});
