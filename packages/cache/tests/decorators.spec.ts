import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";

describe("decorator.cache", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'Cache' successfully", () => {
    class TestCache {
      public async get(): Promise<unknown> {
        return undefined;
      }
      public async set(): Promise<void> {
        // noop
      }
      public async delete(): Promise<boolean> {
        return true;
      }
      public async has(): Promise<boolean> {
        return false;
      }
      public async mget(): Promise<unknown[]> {
        return [];
      }
      public async mset(): Promise<void> {
        // noop
      }
      public async ttl(): Promise<number | null> {
        return null;
      }
      public async expire(): Promise<boolean> {
        return true;
      }
      public async incr(): Promise<number> {
        return 0;
      }
      public async decr(): Promise<number> {
        return 0;
      }
      public async keys(): Promise<string[]> {
        return [];
      }
      public async flush(): Promise<void> {
        // noop
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.cache()(TestCache as any);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonCache {
      public async get(): Promise<unknown> {
        return undefined;
      }
      public async set(): Promise<void> {
        // noop
      }
      public async delete(): Promise<boolean> {
        return true;
      }
      public async has(): Promise<boolean> {
        return false;
      }
      public async mget(): Promise<unknown[]> {
        return [];
      }
      public async mset(): Promise<void> {
        // noop
      }
      public async ttl(): Promise<number | null> {
        return null;
      }
      public async expire(): Promise<boolean> {
        return true;
      }
      public async incr(): Promise<number> {
        return 0;
      }
      public async decr(): Promise<number> {
        return 0;
      }
      public async keys(): Promise<string[]> {
        return [];
      }
      public async flush(): Promise<void> {
        // noop
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.cache()(SingletonCache as any);

    const instance1 = container.get(SingletonCache);
    const instance2 = container.get(SingletonCache);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonCache {
      public async get(): Promise<unknown> {
        return undefined;
      }
      public async set(): Promise<void> {
        // noop
      }
      public async delete(): Promise<boolean> {
        return true;
      }
      public async has(): Promise<boolean> {
        return false;
      }
      public async mget(): Promise<unknown[]> {
        return [];
      }
      public async mset(): Promise<void> {
        // noop
      }
      public async ttl(): Promise<number | null> {
        return null;
      }
      public async expire(): Promise<boolean> {
        return true;
      }
      public async incr(): Promise<number> {
        return 0;
      }
      public async decr(): Promise<number> {
        return 0;
      }
      public async keys(): Promise<string[]> {
        return [];
      }
      public async flush(): Promise<void> {
        // noop
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.cache(EContainerScope.Singleton)(ExplicitSingletonCache as any);

    const instance1 = container.get(ExplicitSingletonCache);
    const instance2 = container.get(ExplicitSingletonCache);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientCache {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientCache.instanceCount++;
        this.instanceId = TransientCache.instanceCount;
      }

      public async get(): Promise<unknown> {
        return undefined;
      }
      public async set(): Promise<void> {
        // noop
      }
      public async delete(): Promise<boolean> {
        return true;
      }
      public async has(): Promise<boolean> {
        return false;
      }
      public async mget(): Promise<unknown[]> {
        return [];
      }
      public async mset(): Promise<void> {
        // noop
      }
      public async ttl(): Promise<number | null> {
        return null;
      }
      public async expire(): Promise<boolean> {
        return true;
      }
      public async incr(): Promise<number> {
        return 0;
      }
      public async decr(): Promise<number> {
        return 0;
      }
      public async keys(): Promise<string[]> {
        return [];
      }
      public async flush(): Promise<void> {
        // noop
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.cache(EContainerScope.Transient)(TransientCache as any);

    const instance1 = container.get(TransientCache);
    const instance2 = container.get(TransientCache);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedCache {
      public async get(): Promise<unknown> {
        return undefined;
      }
      public async set(): Promise<void> {
        // noop
      }
      public async delete(): Promise<boolean> {
        return true;
      }
      public async has(): Promise<boolean> {
        return false;
      }
      public async mget(): Promise<unknown[]> {
        return [];
      }
      public async mset(): Promise<void> {
        // noop
      }
      public async ttl(): Promise<number | null> {
        return null;
      }
      public async expire(): Promise<boolean> {
        return true;
      }
      public async incr(): Promise<number> {
        return 0;
      }
      public async decr(): Promise<number> {
        return 0;
      }
      public async keys(): Promise<string[]> {
        return [];
      }
      public async flush(): Promise<void> {
        // noop
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.cache(EContainerScope.Request)(RequestScopedCache as any);
    }).not.toThrow();

    const instance = container.get(RequestScopedCache);
    expect(instance).toBeInstanceOf(RequestScopedCache);
  });

  test("should register class with complex name ending in 'Cache'", () => {
    class RedisDistributedSessionCache {
      public async get(): Promise<unknown> {
        return undefined;
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.cache()(RedisDistributedSessionCache as any);
    }).not.toThrow();
  });

  test("should allow retrieving registered Cache class from container", () => {
    class RetrievableCache {
      public readonly name = "retrievable";

      public async get(): Promise<unknown> {
        return undefined;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.cache()(RetrievableCache as any);

    const instance = container.get(RetrievableCache);
    expect(instance).toBeInstanceOf(RetrievableCache);
    expect(instance.name).toBe("retrievable");
  });

  test("should return void from the decorator function", () => {
    class VoidReturnCache {
      public async get(): Promise<unknown> {
        return undefined;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    const result = decorator.cache()(VoidReturnCache as any);
    expect(result).toBeUndefined();
  });
});
