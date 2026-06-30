import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { IAnalytics } from "@/types";

describe("decorator.analytics", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'Analytics' successfully", () => {
    class TestAnalytics implements IAnalytics {
      public capture(): void {
        // noop
      }
    }

    expect(() => {
      decorator.analytics()(TestAnalytics);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonAnalytics implements IAnalytics {
      public capture(): void {
        // noop
      }
    }

    decorator.analytics()(SingletonAnalytics);

    const instance1 = container.get(SingletonAnalytics);
    const instance2 = container.get(SingletonAnalytics);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonAnalytics implements IAnalytics {
      public capture(): void {
        // noop
      }
    }

    decorator.analytics(EContainerScope.Singleton)(ExplicitSingletonAnalytics);

    const instance1 = container.get(ExplicitSingletonAnalytics);
    const instance2 = container.get(ExplicitSingletonAnalytics);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientAnalytics implements IAnalytics {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientAnalytics.instanceCount++;
        this.instanceId = TransientAnalytics.instanceCount;
      }

      public capture(): void {
        // noop
      }
    }

    decorator.analytics(EContainerScope.Transient)(TransientAnalytics);

    const instance1 = container.get(TransientAnalytics);
    const instance2 = container.get(TransientAnalytics);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedAnalytics implements IAnalytics {
      public capture(): void {
        // noop
      }
    }

    expect(() => {
      decorator.analytics(EContainerScope.Request)(RequestScopedAnalytics);
    }).not.toThrow();

    const instance = container.get(RequestScopedAnalytics);
    expect(instance).toBeInstanceOf(RequestScopedAnalytics);
  });

  test("should register class with complex name ending in 'Analytics'", () => {
    class PostHogUserTrackingAnalytics implements IAnalytics {
      public capture(): void {
        // noop
      }
    }

    expect(() => {
      decorator.analytics()(PostHogUserTrackingAnalytics);
    }).not.toThrow();
  });

  test("should allow retrieving registered Analytics class from container", () => {
    class RetrievableAnalytics implements IAnalytics {
      public readonly name = "retrievable";

      public capture(): void {
        // noop
      }
    }

    decorator.analytics()(RetrievableAnalytics);

    const instance = container.get(RetrievableAnalytics);
    expect(instance).toBeInstanceOf(RetrievableAnalytics);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with Analytics class that has typed capture options", () => {
    type CustomCaptureOptions = {
      event: string;
      userId: string;
    };

    class TypedAnalytics implements IAnalytics<CustomCaptureOptions> {
      public capture(_options: CustomCaptureOptions): void {
        // noop
      }
    }

    expect(() => {
      decorator.analytics()(TypedAnalytics);
    }).not.toThrow();

    const instance = container.get(TypedAnalytics);
    expect(instance).toBeInstanceOf(TypedAnalytics);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnAnalytics implements IAnalytics {
      public capture(): void {
        // noop
      }
    }

    const result = decorator.analytics()(VoidReturnAnalytics);
    expect(result).toBeUndefined();
  });
});
