import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { IEvent } from "@/types";

describe("decorator.event", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'PubSub' successfully", () => {
    class TestPubSub implements IEvent {
      public getChannel(): string {
        return "test-channel";
      }
      public handler(): void {
        // noop
      }
      public publish(_data: Record<string, unknown>): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    expect(() => {
      decorator.event()(TestPubSub);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonPubSub implements IEvent {
      public getChannel(): string {
        return "test-channel";
      }
      public handler(): void {
        // noop
      }
      public publish(_data: Record<string, unknown>): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    decorator.event()(SingletonPubSub);

    const instance1 = container.get(SingletonPubSub);
    const instance2 = container.get(SingletonPubSub);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonPubSub implements IEvent {
      public getChannel(): string {
        return "test-channel";
      }
      public handler(): void {
        // noop
      }
      public publish(_data: Record<string, unknown>): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    decorator.event(EContainerScope.Singleton)(ExplicitSingletonPubSub);

    const instance1 = container.get(ExplicitSingletonPubSub);
    const instance2 = container.get(ExplicitSingletonPubSub);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientPubSub implements IEvent {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientPubSub.instanceCount++;
        this.instanceId = TransientPubSub.instanceCount;
      }

      public getChannel(): string {
        return "test-channel";
      }
      public handler(): void {
        // noop
      }
      public publish(_data: Record<string, unknown>): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    decorator.event(EContainerScope.Transient)(TransientPubSub);

    const instance1 = container.get(TransientPubSub);
    const instance2 = container.get(TransientPubSub);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedPubSub implements IEvent {
      public getChannel(): string {
        return "test-channel";
      }
      public handler(): void {
        // noop
      }
      public publish(_data: Record<string, unknown>): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    expect(() => {
      decorator.event(EContainerScope.Request)(RequestScopedPubSub);
    }).not.toThrow();

    const instance = container.get(RequestScopedPubSub);
    expect(instance).toBeInstanceOf(RequestScopedPubSub);
  });

  test("should register class with complex name ending in 'PubSub'", () => {
    class UserNotificationEventPubSub implements IEvent {
      public getChannel(): string {
        return "user-notification-channel";
      }
      public handler(): void {
        // noop
      }
      public publish(_data: Record<string, unknown>): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    expect(() => {
      decorator.event()(UserNotificationEventPubSub);
    }).not.toThrow();
  });

  test("should allow retrieving registered PubSub class from container", () => {
    class RetrievablePubSub implements IEvent {
      public readonly name = "retrievable";

      public getChannel(): string {
        return "retrievable-channel";
      }
      public handler(): void {
        // noop
      }
      public publish(_data: Record<string, unknown>): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    decorator.event()(RetrievablePubSub);

    const instance = container.get(RetrievablePubSub);
    expect(instance).toBeInstanceOf(RetrievablePubSub);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with PubSub class that has typed data", () => {
    type CustomData = {
      userId: string;
      action: string;
    };

    class TypedPubSub implements IEvent<CustomData> {
      public getChannel(): string {
        return "typed-channel";
      }
      public handler(_context: { data: CustomData; channel: string }): void {
        // noop
      }
      public publish(_data: CustomData): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: testing with typed pubsub
      decorator.event()(TypedPubSub as any);
    }).not.toThrow();

    const instance = container.get(TypedPubSub);
    expect(instance).toBeInstanceOf(TypedPubSub);
  });

  test("should work with async getChannel method", () => {
    class AsyncChannelPubSub implements IEvent {
      public async getChannel(): Promise<string> {
        return "async-channel";
      }
      public handler(): void {
        // noop
      }
      public publish(_data: Record<string, unknown>): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    expect(() => {
      decorator.event()(AsyncChannelPubSub);
    }).not.toThrow();

    const instance = container.get(AsyncChannelPubSub);
    expect(instance).toBeInstanceOf(AsyncChannelPubSub);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnPubSub implements IEvent {
      public getChannel(): string {
        return "void-channel";
      }
      public handler(): void {
        // noop
      }
      public publish(_data: Record<string, unknown>): void {
        // noop
      }
      public subscribe(): void {
        // noop
      }
      public unsubscribe(): void {
        // noop
      }
      public unsubscribeAll(): void {
        // noop
      }
    }

    const result = decorator.event()(VoidReturnPubSub);
    expect(result).toBeUndefined();
  });
});
