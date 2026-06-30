import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { ILogger } from "@/types";

describe("decorator.logger", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'Logger' successfully", () => {
    class TestLogger implements ILogger {
      public init(): void {
        // noop
      }
      public error(): void {
        // noop
      }
      public warn(): void {
        // noop
      }
      public info(): void {
        // noop
      }
      public debug(): void {
        // noop
      }
      public log(): void {
        // noop
      }
      public success(): void {
        // noop
      }
    }

    expect(() => {
      decorator.logger()(TestLogger);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonLogger implements ILogger {
      public init(): void {
        // noop
      }
      public error(): void {
        // noop
      }
      public warn(): void {
        // noop
      }
      public info(): void {
        // noop
      }
      public debug(): void {
        // noop
      }
      public log(): void {
        // noop
      }
      public success(): void {
        // noop
      }
    }

    decorator.logger()(SingletonLogger);

    const instance1 = container.get(SingletonLogger);
    const instance2 = container.get(SingletonLogger);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonLogger implements ILogger {
      public init(): void {
        // noop
      }
      public error(): void {
        // noop
      }
      public warn(): void {
        // noop
      }
      public info(): void {
        // noop
      }
      public debug(): void {
        // noop
      }
      public log(): void {
        // noop
      }
      public success(): void {
        // noop
      }
    }

    decorator.logger(EContainerScope.Singleton)(ExplicitSingletonLogger);

    const instance1 = container.get(ExplicitSingletonLogger);
    const instance2 = container.get(ExplicitSingletonLogger);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientLogger implements ILogger {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientLogger.instanceCount++;
        this.instanceId = TransientLogger.instanceCount;
      }

      public init(): void {
        // noop
      }
      public error(): void {
        // noop
      }
      public warn(): void {
        // noop
      }
      public info(): void {
        // noop
      }
      public debug(): void {
        // noop
      }
      public log(): void {
        // noop
      }
      public success(): void {
        // noop
      }
    }

    decorator.logger(EContainerScope.Transient)(TransientLogger);

    const instance1 = container.get(TransientLogger);
    const instance2 = container.get(TransientLogger);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedLogger implements ILogger {
      public init(): void {
        // noop
      }
      public error(): void {
        // noop
      }
      public warn(): void {
        // noop
      }
      public info(): void {
        // noop
      }
      public debug(): void {
        // noop
      }
      public log(): void {
        // noop
      }
      public success(): void {
        // noop
      }
    }

    expect(() => {
      decorator.logger(EContainerScope.Request)(RequestScopedLogger);
    }).not.toThrow();

    const instance = container.get(RequestScopedLogger);
    expect(instance).toBeInstanceOf(RequestScopedLogger);
  });

  test("should register class with complex name ending in 'Logger'", () => {
    class SqliteProductionLogger implements ILogger {
      public init(): void {
        // noop
      }
      public error(): void {
        // noop
      }
      public warn(): void {
        // noop
      }
      public info(): void {
        // noop
      }
      public debug(): void {
        // noop
      }
      public log(): void {
        // noop
      }
      public success(): void {
        // noop
      }
    }

    expect(() => {
      decorator.logger()(SqliteProductionLogger);
    }).not.toThrow();
  });

  test("should allow retrieving registered Logger class from container", () => {
    class RetrievableLogger implements ILogger {
      public readonly name = "retrievable";

      public init(): void {
        // noop
      }
      public error(): void {
        // noop
      }
      public warn(): void {
        // noop
      }
      public info(): void {
        // noop
      }
      public debug(): void {
        // noop
      }
      public log(): void {
        // noop
      }
      public success(): void {
        // noop
      }
    }

    decorator.logger()(RetrievableLogger);

    const instance = container.get(RetrievableLogger);
    expect(instance).toBeInstanceOf(RetrievableLogger);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with Logger class that has async methods", () => {
    class AsyncLogger implements ILogger {
      public async init(): Promise<void> {
        // noop
      }
      public async error(): Promise<void> {
        // noop
      }
      public async warn(): Promise<void> {
        // noop
      }
      public async info(): Promise<void> {
        // noop
      }
      public async debug(): Promise<void> {
        // noop
      }
      public async log(): Promise<void> {
        // noop
      }
      public async success(): Promise<void> {
        // noop
      }
    }

    expect(() => {
      decorator.logger()(AsyncLogger);
    }).not.toThrow();

    const instance = container.get(AsyncLogger);
    expect(instance).toBeInstanceOf(AsyncLogger);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnLogger implements ILogger {
      public init(): void {
        // noop
      }
      public error(): void {
        // noop
      }
      public warn(): void {
        // noop
      }
      public info(): void {
        // noop
      }
      public debug(): void {
        // noop
      }
      public log(): void {
        // noop
      }
      public success(): void {
        // noop
      }
    }

    const result = decorator.logger()(VoidReturnLogger);
    expect(result).toBeUndefined();
  });
});
