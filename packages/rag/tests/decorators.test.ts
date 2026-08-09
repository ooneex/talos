import { describe, expect, test } from "bun:test";
import { container, EContainerScope } from "@talosjs/container";
import { decorator, type IVectorDatabase } from "@/index";

class MockVectorDatabase implements IVectorDatabase<{ metadata: Record<string, unknown> }> {
  public getDatabaseUri() {
    return "mock://db";
  }
  public connect(): Promise<void> {
    return Promise.resolve();
  }
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  public getDatabase(): any {
    return null;
  }
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  public getEmbeddingModel(): any {
    return { model: "text-embedding-3-small" };
  }
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  public getSchema(): any {
    return {};
  }
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  public open(): any {
    return Promise.resolve(null);
  }
}

describe("decorator.vectorDatabase", () => {
  test("registers class in container with default Singleton scope", () => {
    @decorator.vectorDatabase()
    class SingletonDb extends MockVectorDatabase {}

    expect(container.has(SingletonDb)).toBe(true);

    const a = container.get(SingletonDb);
    const b = container.get(SingletonDb);
    expect(a).toBe(b);
  });

  test("registers class in container with Transient scope", () => {
    @decorator.vectorDatabase(EContainerScope.Transient)
    class TransientDb extends MockVectorDatabase {}

    expect(container.has(TransientDb)).toBe(true);

    const a = container.get(TransientDb);
    const b = container.get(TransientDb);
    expect(a).not.toBe(b);
  });

  test("registers class in container with Request scope", () => {
    @decorator.vectorDatabase(EContainerScope.Request)
    class RequestDb extends MockVectorDatabase {}

    expect(container.has(RequestDb)).toBe(true);
  });

  test("registers class in container with explicit Singleton scope", () => {
    @decorator.vectorDatabase(EContainerScope.Singleton)
    class ExplicitSingletonDb extends MockVectorDatabase {}

    expect(container.has(ExplicitSingletonDb)).toBe(true);

    const a = container.get(ExplicitSingletonDb);
    const b = container.get(ExplicitSingletonDb);
    expect(a).toBe(b);
  });

  test("resolved instance is correct type", () => {
    @decorator.vectorDatabase()
    class TypedDb extends MockVectorDatabase {}

    const instance = container.get(TypedDb);
    expect(instance).toBeInstanceOf(TypedDb);
    expect(instance.getDatabaseUri()).toBe("mock://db");
  });
});
