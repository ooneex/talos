import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { IAuth } from "@/types";

describe("decorator.auth", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'Auth' successfully", () => {
    class TestAuth implements IAuth {
      public async getCurrentUser(_token?: string): Promise<unknown> {
        return null;
      }
    }

    expect(() => {
      decorator.auth()(TestAuth);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonAuth implements IAuth {
      public async getCurrentUser(_token?: string): Promise<unknown> {
        return null;
      }
    }

    decorator.auth()(SingletonAuth);

    const instance1 = container.get(SingletonAuth);
    const instance2 = container.get(SingletonAuth);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonAuth implements IAuth {
      public async getCurrentUser(_token?: string): Promise<unknown> {
        return null;
      }
    }

    decorator.auth(EContainerScope.Singleton)(ExplicitSingletonAuth);

    const instance1 = container.get(ExplicitSingletonAuth);
    const instance2 = container.get(ExplicitSingletonAuth);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientAuth implements IAuth {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientAuth.instanceCount++;
        this.instanceId = TransientAuth.instanceCount;
      }

      public async getCurrentUser(_token?: string): Promise<unknown> {
        return null;
      }
    }

    decorator.auth(EContainerScope.Transient)(TransientAuth);

    const instance1 = container.get(TransientAuth);
    const instance2 = container.get(TransientAuth);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedAuth implements IAuth {
      public async getCurrentUser(_token?: string): Promise<unknown> {
        return null;
      }
    }

    expect(() => {
      decorator.auth(EContainerScope.Request)(RequestScopedAuth);
    }).not.toThrow();

    const instance = container.get(RequestScopedAuth);
    expect(instance).toBeInstanceOf(RequestScopedAuth);
  });

  test("should register class with complex name ending in 'Auth'", () => {
    class ClerkOAuthProviderAuth implements IAuth {
      public async getCurrentUser(_token?: string): Promise<unknown> {
        return null;
      }
    }

    expect(() => {
      decorator.auth()(ClerkOAuthProviderAuth);
    }).not.toThrow();
  });

  test("should allow retrieving registered Auth class from container", () => {
    class RetrievableAuth implements IAuth {
      public readonly name = "retrievable";

      public async getCurrentUser(_token?: string): Promise<unknown> {
        return null;
      }
    }

    decorator.auth()(RetrievableAuth);

    const instance = container.get(RetrievableAuth);
    expect(instance).toBeInstanceOf(RetrievableAuth);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with Auth class that has getCurrentUser", () => {
    class TypedAuth implements IAuth {
      public async getCurrentUser(_token?: string): Promise<unknown> {
        return null;
      }
    }

    expect(() => {
      decorator.auth()(TypedAuth);
    }).not.toThrow();

    const instance = container.get(TypedAuth);
    expect(instance).toBeInstanceOf(TypedAuth);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnAuth implements IAuth {
      public async getCurrentUser(_token?: string): Promise<unknown> {
        return null;
      }
    }

    const result = decorator.auth()(VoidReturnAuth);
    expect(result).toBeUndefined();
  });
});
