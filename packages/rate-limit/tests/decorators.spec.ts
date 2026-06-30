import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { IRateLimiter, RateLimitResultType } from "@/types";

describe("decorator.rateLimit", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'RateLimiter' successfully", () => {
    class TestRateLimiter implements IRateLimiter {
      public async check(_key: string): Promise<RateLimitResultType> {
        return { limited: false, remaining: 0, total: 0, resetAt: new Date() };
      }
      public async isLimited(_key: string): Promise<boolean> {
        return false;
      }
      public async reset(_key: string): Promise<boolean> {
        return true;
      }
      public async getCount(_key: string): Promise<number> {
        return 0;
      }
    }

    expect(() => {
      decorator.rateLimit()(TestRateLimiter);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonRateLimiter implements IRateLimiter {
      public async check(_key: string): Promise<RateLimitResultType> {
        return { limited: false, remaining: 0, total: 0, resetAt: new Date() };
      }
      public async isLimited(_key: string): Promise<boolean> {
        return false;
      }
      public async reset(_key: string): Promise<boolean> {
        return true;
      }
      public async getCount(_key: string): Promise<number> {
        return 0;
      }
    }

    decorator.rateLimit()(SingletonRateLimiter);

    const instance1 = container.get(SingletonRateLimiter);
    const instance2 = container.get(SingletonRateLimiter);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonRateLimiter implements IRateLimiter {
      public async check(_key: string): Promise<RateLimitResultType> {
        return { limited: false, remaining: 0, total: 0, resetAt: new Date() };
      }
      public async isLimited(_key: string): Promise<boolean> {
        return false;
      }
      public async reset(_key: string): Promise<boolean> {
        return true;
      }
      public async getCount(_key: string): Promise<number> {
        return 0;
      }
    }

    decorator.rateLimit(EContainerScope.Singleton)(ExplicitSingletonRateLimiter);

    const instance1 = container.get(ExplicitSingletonRateLimiter);
    const instance2 = container.get(ExplicitSingletonRateLimiter);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientRateLimiter implements IRateLimiter {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientRateLimiter.instanceCount++;
        this.instanceId = TransientRateLimiter.instanceCount;
      }

      public async check(_key: string): Promise<RateLimitResultType> {
        return { limited: false, remaining: 0, total: 0, resetAt: new Date() };
      }
      public async isLimited(_key: string): Promise<boolean> {
        return false;
      }
      public async reset(_key: string): Promise<boolean> {
        return true;
      }
      public async getCount(_key: string): Promise<number> {
        return 0;
      }
    }

    decorator.rateLimit(EContainerScope.Transient)(TransientRateLimiter);

    const instance1 = container.get(TransientRateLimiter);
    const instance2 = container.get(TransientRateLimiter);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedRateLimiter implements IRateLimiter {
      public async check(_key: string): Promise<RateLimitResultType> {
        return { limited: false, remaining: 0, total: 0, resetAt: new Date() };
      }
      public async isLimited(_key: string): Promise<boolean> {
        return false;
      }
      public async reset(_key: string): Promise<boolean> {
        return true;
      }
      public async getCount(_key: string): Promise<number> {
        return 0;
      }
    }

    expect(() => {
      decorator.rateLimit(EContainerScope.Request)(RequestScopedRateLimiter);
    }).not.toThrow();

    const instance = container.get(RequestScopedRateLimiter);
    expect(instance).toBeInstanceOf(RequestScopedRateLimiter);
  });

  test("should register class with complex name ending in 'RateLimiter'", () => {
    class UserApiEndpointRateLimiter implements IRateLimiter {
      public async check(_key: string): Promise<RateLimitResultType> {
        return { limited: false, remaining: 0, total: 0, resetAt: new Date() };
      }
      public async isLimited(_key: string): Promise<boolean> {
        return false;
      }
      public async reset(_key: string): Promise<boolean> {
        return true;
      }
      public async getCount(_key: string): Promise<number> {
        return 0;
      }
    }

    expect(() => {
      decorator.rateLimit()(UserApiEndpointRateLimiter);
    }).not.toThrow();
  });

  test("should allow retrieving registered RateLimiter class from container", () => {
    class RetrievableRateLimiter implements IRateLimiter {
      public readonly name = "retrievable";

      public async check(_key: string): Promise<RateLimitResultType> {
        return { limited: false, remaining: 0, total: 0, resetAt: new Date() };
      }
      public async isLimited(_key: string): Promise<boolean> {
        return false;
      }
      public async reset(_key: string): Promise<boolean> {
        return true;
      }
      public async getCount(_key: string): Promise<number> {
        return 0;
      }
    }

    decorator.rateLimit()(RetrievableRateLimiter);

    const instance = container.get(RetrievableRateLimiter);
    expect(instance).toBeInstanceOf(RetrievableRateLimiter);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with RateLimiter class that has custom check parameters", () => {
    class CustomRateLimiter implements IRateLimiter {
      public async check(_key: string): Promise<RateLimitResultType> {
        return { limited: false, remaining: 0, total: 0, resetAt: new Date() };
      }
      public async isLimited(_key: string): Promise<boolean> {
        return false;
      }
      public async reset(_key: string): Promise<boolean> {
        return true;
      }
      public async getCount(_key: string): Promise<number> {
        return 0;
      }
    }

    expect(() => {
      decorator.rateLimit()(CustomRateLimiter);
    }).not.toThrow();

    const instance = container.get(CustomRateLimiter);
    expect(instance).toBeInstanceOf(CustomRateLimiter);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnRateLimiter implements IRateLimiter {
      public async check(_key: string): Promise<RateLimitResultType> {
        return { limited: false, remaining: 0, total: 0, resetAt: new Date() };
      }
      public async isLimited(_key: string): Promise<boolean> {
        return false;
      }
      public async reset(_key: string): Promise<boolean> {
        return true;
      }
      public async getCount(_key: string): Promise<number> {
        return 0;
      }
    }

    const result = decorator.rateLimit()(VoidReturnRateLimiter);
    expect(result).toBeUndefined();
  });
});
