import { describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import type { Server } from "bun";
import { decorator } from "@/decorators";
import type { IAppEventStart } from "@/types";

describe("decorator.app.event.start", () => {
  const container = new Container();

  test("should register the class without throwing", () => {
    class OnAppStart implements IAppEventStart {
      public handle(_server: Server<unknown>): void {
        // noop
      }
    }

    expect(() => {
      decorator.app.event.start()(OnAppStart);
    }).not.toThrow();
  });

  test("should allow retrieving the registered class from the container", () => {
    class RetrievableOnAppStart implements IAppEventStart {
      public readonly name = "retrievable";
      public handle(_server: Server<unknown>): void {
        // noop
      }
    }

    decorator.app.event.start()(RetrievableOnAppStart);

    const instance = container.get(RetrievableOnAppStart);
    expect(instance).toBeInstanceOf(RetrievableOnAppStart);
    expect(instance.name).toBe("retrievable");
  });

  test("should register with default singleton scope", () => {
    class SingletonOnAppStart implements IAppEventStart {
      public handle(_server: Server<unknown>): void {
        // noop
      }
    }

    decorator.app.event.start()(SingletonOnAppStart);

    const instance1 = container.get(SingletonOnAppStart);
    const instance2 = container.get(SingletonOnAppStart);

    expect(instance1).toBe(instance2);
  });

  test("should register with transient scope", () => {
    class TransientOnAppStart implements IAppEventStart {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientOnAppStart.instanceCount++;
        this.instanceId = TransientOnAppStart.instanceCount;
      }

      public handle(_server: Server<unknown>): void {
        // noop
      }
    }

    decorator.app.event.start(EContainerScope.Transient)(TransientOnAppStart);

    const instance1 = container.get(TransientOnAppStart);
    const instance2 = container.get(TransientOnAppStart);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should support an async handle method", () => {
    class AsyncOnAppStart implements IAppEventStart {
      public async handle(_server: Server<unknown>): Promise<void> {
        // noop
      }
    }

    expect(() => {
      decorator.app.event.start()(AsyncOnAppStart);
    }).not.toThrow();

    const instance = container.get(AsyncOnAppStart);
    expect(instance).toBeInstanceOf(AsyncOnAppStart);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnOnAppStart implements IAppEventStart {
      public handle(_server: Server<unknown>): void {
        // noop
      }
    }

    const result = decorator.app.event.start()(VoidReturnOnAppStart);
    expect(result).toBeUndefined();
  });
});
