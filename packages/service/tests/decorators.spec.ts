import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { IService } from "@/types";

describe("decorator.service", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'Service' successfully", () => {
    class TestService implements IService {
      public async execute(): Promise<void> {
        // noop
      }
    }

    expect(() => {
      decorator.service()(TestService);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonService implements IService {
      public async execute(): Promise<void> {
        // noop
      }
    }

    decorator.service()(SingletonService);

    const instance1 = container.get(SingletonService);
    const instance2 = container.get(SingletonService);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonService implements IService {
      public async execute(): Promise<void> {
        // noop
      }
    }

    decorator.service(EContainerScope.Singleton)(ExplicitSingletonService);

    const instance1 = container.get(ExplicitSingletonService);
    const instance2 = container.get(ExplicitSingletonService);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientService implements IService {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientService.instanceCount++;
        this.instanceId = TransientService.instanceCount;
      }

      public async execute(): Promise<void> {
        // noop
      }
    }

    decorator.service(EContainerScope.Transient)(TransientService);

    const instance1 = container.get(TransientService);
    const instance2 = container.get(TransientService);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedService implements IService {
      public async execute(): Promise<void> {
        // noop
      }
    }

    expect(() => {
      decorator.service(EContainerScope.Request)(RequestScopedService);
    }).not.toThrow();

    const instance = container.get(RequestScopedService);
    expect(instance).toBeInstanceOf(RequestScopedService);
  });

  test("should register class with complex name ending in 'Service'", () => {
    class UserNotificationEmailService implements IService {
      public async execute(): Promise<void> {
        // noop
      }
    }

    expect(() => {
      decorator.service()(UserNotificationEmailService);
    }).not.toThrow();
  });

  test("should allow retrieving registered Service class from container", () => {
    class RetrievableService implements IService {
      public readonly name = "retrievable";

      public async execute(): Promise<void> {
        // noop
      }
    }

    decorator.service()(RetrievableService);

    const instance = container.get(RetrievableService);
    expect(instance).toBeInstanceOf(RetrievableService);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with Service class that has typed execute data", () => {
    type ExecuteData = {
      userId: string;
      action: string;
    };

    class TypedService implements IService {
      public async execute(_data?: ExecuteData): Promise<void> {
        // noop
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing with typed service
      decorator.service()(TypedService as any);
    }).not.toThrow();

    const instance = container.get(TypedService);
    expect(instance).toBeInstanceOf(TypedService);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnService implements IService {
      public async execute(): Promise<void> {
        // noop
      }
    }

    const result = decorator.service()(VoidReturnService);
    expect(result).toBeUndefined();
  });
});
