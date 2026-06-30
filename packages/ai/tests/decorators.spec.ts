import { beforeEach, describe, expect, test } from "bun:test";
import type { AGUIEvent } from "@tanstack/ai";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { ChatInputType, IChat, IMiddleware, ITool } from "@/types";

class StubChat implements IChat {
  public run<T>(_input?: ChatInputType): Promise<T> {
    return Promise.resolve({} as T);
  }
  public async *stream(_input?: ChatInputType): AsyncIterable<AGUIEvent> {}
  public getModel = (): string => "stub";
  public getSystemPrompts = (): string[] => [];
  public getTools = () => [];
  public getMiddlewares = () => [];
}

class StubTool implements ITool {
  public getName = (): string => "stub";
  public getDescription = (): string => "stub tool";
  public handler = (): unknown => null;
}

class StubMiddleware implements IMiddleware {
  public getName = (): string => "stub";
}

describe("decorator.chat", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register a chat class with the default singleton scope", () => {
    class DefaultChat extends StubChat {}

    decorator.chat()(DefaultChat);

    const instance1 = container.get(DefaultChat);
    const instance2 = container.get(DefaultChat);

    expect(instance1).toBeInstanceOf(DefaultChat);
    expect(instance1).toBe(instance2);
  });

  test("should register a chat class with an explicit transient scope", () => {
    class TransientChat extends StubChat {}

    decorator.chat(EContainerScope.Transient)(TransientChat);

    const instance1 = container.get(TransientChat);
    const instance2 = container.get(TransientChat);

    expect(instance1).not.toBe(instance2);
  });

  test("should return void", () => {
    class VoidChat extends StubChat {}

    expect(decorator.chat()(VoidChat)).toBeUndefined();
  });
});

describe("decorator.tool", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register a tool class with the default singleton scope", () => {
    class DefaultTool extends StubTool {}

    decorator.tool()(DefaultTool);

    const instance1 = container.get(DefaultTool);
    const instance2 = container.get(DefaultTool);

    expect(instance1).toBeInstanceOf(DefaultTool);
    expect(instance1).toBe(instance2);
  });

  test("should register a tool class with an explicit singleton scope", () => {
    class SingletonTool extends StubTool {}

    decorator.tool(EContainerScope.Singleton)(SingletonTool);

    const instance1 = container.get(SingletonTool);
    const instance2 = container.get(SingletonTool);

    expect(instance1).toBe(instance2);
  });

  test("should register a tool class with a transient scope", () => {
    class TransientTool extends StubTool {}

    decorator.tool(EContainerScope.Transient)(TransientTool);

    const instance1 = container.get(TransientTool);
    const instance2 = container.get(TransientTool);

    expect(instance1).not.toBe(instance2);
  });

  test("should allow retrieving the registered tool from the container", () => {
    class RetrievableTool extends StubTool {
      public override getName = (): string => "retrievable";
    }

    decorator.tool()(RetrievableTool);

    const instance = container.get(RetrievableTool);
    expect(instance).toBeInstanceOf(RetrievableTool);
    expect(instance.getName()).toBe("retrievable");
  });

  test("should return void", () => {
    class VoidTool extends StubTool {}

    expect(decorator.tool()(VoidTool)).toBeUndefined();
  });
});

describe("decorator.middleware", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register a middleware class with the default singleton scope", () => {
    class DefaultMiddleware extends StubMiddleware {}

    decorator.middleware()(DefaultMiddleware);

    const instance1 = container.get(DefaultMiddleware);
    const instance2 = container.get(DefaultMiddleware);

    expect(instance1).toBeInstanceOf(DefaultMiddleware);
    expect(instance1).toBe(instance2);
  });

  test("should register a middleware class with a transient scope", () => {
    class TransientMiddleware extends StubMiddleware {}

    decorator.middleware(EContainerScope.Transient)(TransientMiddleware);

    const instance1 = container.get(TransientMiddleware);
    const instance2 = container.get(TransientMiddleware);

    expect(instance1).not.toBe(instance2);
  });

  test("should register a middleware class with a request scope", () => {
    class RequestMiddleware extends StubMiddleware {}

    expect(() => {
      decorator.middleware(EContainerScope.Request)(RequestMiddleware);
    }).not.toThrow();

    expect(container.get(RequestMiddleware)).toBeInstanceOf(RequestMiddleware);
  });

  test("should allow retrieving the registered middleware from the container", () => {
    class RetrievableMiddleware extends StubMiddleware {
      public override getName = (): string => "retrievable";
    }

    decorator.middleware()(RetrievableMiddleware);

    const instance = container.get(RetrievableMiddleware);
    expect(instance).toBeInstanceOf(RetrievableMiddleware);
    expect(instance.getName()).toBe("retrievable");
  });

  test("should return void", () => {
    class VoidMiddleware extends StubMiddleware {}

    expect(decorator.middleware()(VoidMiddleware)).toBeUndefined();
  });
});
