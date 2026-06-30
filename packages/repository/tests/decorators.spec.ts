import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import type { FilterResultType } from "@talosjs/types";
import { decorator } from "@/decorators";
import type { IRepository } from "@/types";

describe("decorator.repository", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'Repository' successfully", () => {
    class TestRepository implements IRepository {
      public async open(): Promise<unknown> {
        return null;
      }
      public async close(): Promise<void> {
        // noop
      }
      public async find(): Promise<FilterResultType<unknown>> {
        return { resources: [], total: 0, totalPages: 0, page: 1, limit: 10 };
      }
    }

    expect(() => {
      decorator.repository()(TestRepository);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonRepository implements IRepository {
      public async open(): Promise<unknown> {
        return null;
      }
      public async close(): Promise<void> {
        // noop
      }
      public async find(): Promise<FilterResultType<unknown>> {
        return { resources: [], total: 0, totalPages: 0, page: 1, limit: 10 };
      }
    }

    decorator.repository()(SingletonRepository);

    const instance1 = container.get(SingletonRepository);
    const instance2 = container.get(SingletonRepository);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonRepository implements IRepository {
      public async open(): Promise<unknown> {
        return null;
      }
      public async close(): Promise<void> {
        // noop
      }
      public async find(): Promise<FilterResultType<unknown>> {
        return { resources: [], total: 0, totalPages: 0, page: 1, limit: 10 };
      }
    }

    decorator.repository(EContainerScope.Singleton)(ExplicitSingletonRepository);

    const instance1 = container.get(ExplicitSingletonRepository);
    const instance2 = container.get(ExplicitSingletonRepository);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientRepository implements IRepository {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientRepository.instanceCount++;
        this.instanceId = TransientRepository.instanceCount;
      }

      public async open(): Promise<unknown> {
        return null;
      }
      public async close(): Promise<void> {
        // noop
      }
      public async find(): Promise<FilterResultType<unknown>> {
        return { resources: [], total: 0, totalPages: 0, page: 1, limit: 10 };
      }
    }

    decorator.repository(EContainerScope.Transient)(TransientRepository);

    const instance1 = container.get(TransientRepository);
    const instance2 = container.get(TransientRepository);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedRepository implements IRepository {
      public async open(): Promise<unknown> {
        return null;
      }
      public async close(): Promise<void> {
        // noop
      }
      public async find(): Promise<FilterResultType<unknown>> {
        return { resources: [], total: 0, totalPages: 0, page: 1, limit: 10 };
      }
    }

    expect(() => {
      decorator.repository(EContainerScope.Request)(RequestScopedRepository);
    }).not.toThrow();

    const instance = container.get(RequestScopedRepository);
    expect(instance).toBeInstanceOf(RequestScopedRepository);
  });

  test("should register class with complex name ending in 'Repository'", () => {
    class UserAccountTypeormRepository implements IRepository {
      public async open(): Promise<unknown> {
        return null;
      }
      public async close(): Promise<void> {
        // noop
      }
      public async find(): Promise<FilterResultType<unknown>> {
        return { resources: [], total: 0, totalPages: 0, page: 1, limit: 10 };
      }
    }

    expect(() => {
      decorator.repository()(UserAccountTypeormRepository);
    }).not.toThrow();
  });

  test("should allow retrieving registered Repository class from container", () => {
    class RetrievableRepository implements IRepository {
      public readonly name = "retrievable";

      public async open(): Promise<unknown> {
        return null;
      }
      public async close(): Promise<void> {
        // noop
      }
      public async find(): Promise<FilterResultType<unknown>> {
        return { resources: [], total: 0, totalPages: 0, page: 1, limit: 10 };
      }
    }

    decorator.repository()(RetrievableRepository);

    const instance = container.get(RetrievableRepository);
    expect(instance).toBeInstanceOf(RetrievableRepository);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with Repository class that has typed entity and criteria", () => {
    type UserEntity = {
      id: string;
      name: string;
    };

    type UserCriteria = {
      name?: string;
    };

    class TypedRepository implements IRepository<UserEntity, UserCriteria> {
      public async open(): Promise<unknown> {
        return null;
      }
      public async close(): Promise<void> {
        // noop
      }
      public async find(
        _criteria: UserCriteria & { page?: number; limit?: number; q?: string },
      ): Promise<FilterResultType<UserEntity>> {
        return { resources: [], total: 0, totalPages: 0, page: 1, limit: 10 };
      }
    }

    expect(() => {
      decorator.repository()(TypedRepository);
    }).not.toThrow();

    const instance = container.get(TypedRepository);
    expect(instance).toBeInstanceOf(TypedRepository);
  });

  test("should return void from the decorator function", () => {
    class VoidReturnRepository implements IRepository {
      public async open(): Promise<unknown> {
        return null;
      }
      public async close(): Promise<void> {
        // noop
      }
      public async find(): Promise<FilterResultType<unknown>> {
        return { resources: [], total: 0, totalPages: 0, page: 1, limit: 10 };
      }
    }

    const result = decorator.repository()(VoidReturnRepository);
    expect(result).toBeUndefined();
  });
});
