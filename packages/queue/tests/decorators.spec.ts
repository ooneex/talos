import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";

describe("decorator.queue", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register a queue class without throwing", () => {
    class TestQueue {
      public async add(): Promise<unknown> {
        return undefined;
      }
      public async addBulk(): Promise<unknown[]> {
        return [];
      }
      public async removeJob(): Promise<number> {
        return 1;
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.queue()(TestQueue as any);
    }).not.toThrow();
  });

  test("should register with default singleton scope", () => {
    class SingletonQueue {
      public async add(): Promise<unknown> {
        return undefined;
      }
      public async addBulk(): Promise<unknown[]> {
        return [];
      }
      public async removeJob(): Promise<number> {
        return 1;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.queue()(SingletonQueue as any);

    const instance1 = container.get(SingletonQueue);
    const instance2 = container.get(SingletonQueue);

    expect(instance1).toBe(instance2);
  });

  test("should register with explicit singleton scope", () => {
    class ExplicitSingletonQueue {
      public async add(): Promise<unknown> {
        return undefined;
      }
      public async addBulk(): Promise<unknown[]> {
        return [];
      }
      public async removeJob(): Promise<number> {
        return 1;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.queue(EContainerScope.Singleton)(ExplicitSingletonQueue as any);

    const instance1 = container.get(ExplicitSingletonQueue);
    const instance2 = container.get(ExplicitSingletonQueue);

    expect(instance1).toBe(instance2);
  });

  test("should register with transient scope", () => {
    class TransientQueue {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientQueue.instanceCount++;
        this.instanceId = TransientQueue.instanceCount;
      }

      public async add(): Promise<unknown> {
        return undefined;
      }
      public async addBulk(): Promise<unknown[]> {
        return [];
      }
      public async removeJob(): Promise<number> {
        return 1;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.queue(EContainerScope.Transient)(TransientQueue as any);

    const instance1 = container.get(TransientQueue);
    const instance2 = container.get(TransientQueue);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register with request scope", () => {
    class RequestScopedQueue {
      public async add(): Promise<unknown> {
        return undefined;
      }
      public async addBulk(): Promise<unknown[]> {
        return [];
      }
      public async removeJob(): Promise<number> {
        return 1;
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing decorator
      decorator.queue(EContainerScope.Request)(RequestScopedQueue as any);
    }).not.toThrow();

    const instance = container.get(RequestScopedQueue);
    expect(instance).toBeInstanceOf(RequestScopedQueue);
  });

  test("should allow retrieving the registered queue class from the container", () => {
    class RetrievableQueue {
      public readonly label = "retrievable";

      public async add(): Promise<unknown> {
        return undefined;
      }
      public async addBulk(): Promise<unknown[]> {
        return [];
      }
      public async removeJob(): Promise<number> {
        return 1;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    decorator.queue()(RetrievableQueue as any);

    const instance = container.get(RetrievableQueue);
    expect(instance).toBeInstanceOf(RetrievableQueue);
    expect(instance.label).toBe("retrievable");
  });

  test("should return void from the decorator function", () => {
    class VoidReturnQueue {
      public async add(): Promise<unknown> {
        return undefined;
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: testing decorator
    const result = decorator.queue()(VoidReturnQueue as any);
    expect(result).toBeUndefined();
  });
});
