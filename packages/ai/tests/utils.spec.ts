import { describe, expect, test } from "bun:test";
import type { ChatMiddlewareConfig, ChatMiddlewareContext } from "@tanstack/ai";
import type { IMiddleware, ITool, MessageType } from "@/types";
import {
  buildMessages,
  buildModelOptions,
  composeOnConfig,
  createAdapter,
  toChatMiddleware,
  toServerTools,
  toToolHookMiddleware,
} from "@/utils";

describe("createAdapter", () => {
  test("should build an OpenRouter adapter for the given model", () => {
    Bun.env.OPENROUTER_API_KEY ??= "test-key";

    const adapter = createAdapter("anthropic/claude-sonnet-4.5");

    expect(adapter).toBeDefined();
  });
});

describe("buildMessages", () => {
  test("should return an empty array when no input is provided", () => {
    expect(buildMessages()).toEqual([]);
  });

  test("should append the prompt as a trailing user turn", () => {
    expect(buildMessages({ prompt: "Hello" })).toEqual([{ role: "user", content: "Hello" }]);
  });

  test("should prepend prior messages before the prompt", () => {
    const messages: MessageType[] = [{ role: "assistant", content: "Hi there" }];

    expect(buildMessages({ prompt: "How are you?", messages })).toEqual([
      { role: "assistant", content: "Hi there" },
      { role: "user", content: "How are you?" },
    ]);
  });

  test("should not append an empty prompt", () => {
    const messages: MessageType[] = [{ role: "user", content: "earlier" }];

    expect(buildMessages({ prompt: "", messages })).toEqual([{ role: "user", content: "earlier" }]);
  });

  test("should not mutate the provided messages array", () => {
    const messages: MessageType[] = [{ role: "user", content: "earlier" }];

    buildMessages({ prompt: "next", messages });

    expect(messages).toEqual([{ role: "user", content: "earlier" }]);
  });
});

describe("buildModelOptions", () => {
  test("should return an empty object when no sampling options are set", () => {
    expect(buildModelOptions()).toEqual({});
    expect(buildModelOptions({ prompt: "x" })).toEqual({});
  });

  test("should map temperature, topP, and maxTokens", () => {
    expect(buildModelOptions({ prompt: "x", temperature: 0.7, topP: 0.9, maxTokens: 256 })).toEqual({
      temperature: 0.7,
      topP: 0.9,
      maxCompletionTokens: 256,
    });
  });

  test("should preserve zero values", () => {
    expect(buildModelOptions({ prompt: "x", temperature: 0, topP: 0, maxTokens: 0 })).toEqual({
      temperature: 0,
      topP: 0,
      maxCompletionTokens: 0,
    });
  });

  test("should omit only the unset options", () => {
    expect(buildModelOptions({ prompt: "x", temperature: 1 })).toEqual({ temperature: 1 });
  });
});

describe("composeOnConfig", () => {
  const makeCtx = (phase: string): ChatMiddlewareContext => ({ phase }) as unknown as ChatMiddlewareContext;
  const config = {} as ChatMiddlewareConfig;

  test("should return undefined when neither hook is defined", () => {
    expect(composeOnConfig({ getName: () => "noop" })).toBeUndefined();
  });

  test("should apply the onConfig patch", async () => {
    const middleware: IMiddleware = {
      getName: () => "m",
      onConfig: () => ({ metadata: { a: 1 } }),
    };

    const composed = composeOnConfig(middleware);
    const result = await composed?.(makeCtx("init"), config);

    expect(result).toEqual({ metadata: { a: 1 } });
  });

  test("should treat a null onConfig return as a pass-through", async () => {
    const middleware: IMiddleware = {
      getName: () => "m",
      onConfig: () => null,
    };

    const result = await composeOnConfig(middleware)?.(makeCtx("init"), config);

    expect(result).toBeUndefined();
  });

  test("should apply onBeforeModel only at the beforeModel phase", async () => {
    const middleware: IMiddleware = {
      getName: () => "m",
      onBeforeModel: () => ({ metadata: { beforeModel: true } }),
    };

    const composed = composeOnConfig(middleware);

    expect(await composed?.(makeCtx("init"), config)).toBeUndefined();
    expect(await composed?.(makeCtx("beforeModel"), config)).toEqual({
      metadata: { beforeModel: true },
    });
  });

  test("should merge onConfig and onBeforeModel, exposing the patched config to onBeforeModel", async () => {
    const seen: Partial<ChatMiddlewareConfig>[] = [];
    const middleware: IMiddleware = {
      getName: () => "m",
      onConfig: () => ({ a: 1 }) as Partial<ChatMiddlewareConfig>,
      onBeforeModel: (_ctx, current) => {
        seen.push(current);
        return { b: 2 } as Partial<ChatMiddlewareConfig>;
      },
    };

    const result = await composeOnConfig(middleware)?.(makeCtx("beforeModel"), config);

    expect(result).toEqual({ a: 1, b: 2 } as Partial<ChatMiddlewareConfig>);
    expect(seen[0]).toEqual({ a: 1 } as Partial<ChatMiddlewareConfig>);
  });
});

describe("toChatMiddleware", () => {
  test("should set the name from getName", () => {
    expect(toChatMiddleware({ getName: () => "audit" }).name).toBe("audit");
  });

  test("should not attach onConfig when neither config hook is present", () => {
    expect(toChatMiddleware({ getName: () => "m" }).onConfig).toBeUndefined();
  });

  test("should attach a composed onConfig when a config hook exists", () => {
    const adapted = toChatMiddleware({ getName: () => "m", onConfig: () => undefined });

    expect(typeof adapted.onConfig).toBe("function");
  });

  test("should bind lifecycle hooks to the middleware instance", async () => {
    class Mw implements IMiddleware {
      public marker = "bound";
      public seen: string | null = null;
      public getName = (): string => "m";
      public onStart(): void {
        this.seen = this.marker;
      }
    }

    const instance = new Mw();
    const adapted = toChatMiddleware(instance);

    await adapted.onStart?.({} as ChatMiddlewareContext);

    expect(instance.seen).toBe("bound");
  });

  test("should omit hooks that the middleware does not declare", () => {
    const adapted = toChatMiddleware({ getName: () => "m" });

    expect(adapted.onStart).toBeUndefined();
    expect(adapted.onFinish).toBeUndefined();
    expect(adapted.onChunk).toBeUndefined();
  });
});

describe("toToolHookMiddleware", () => {
  const makeTool = (name: string, hooks: Partial<ITool> = {}): ITool => ({
    getName: () => name,
    getDescription: () => `${name} desc`,
    handler: () => null,
    ...hooks,
  });

  test("should return null when no tool declares a hook", () => {
    expect(toToolHookMiddleware([makeTool("a"), makeTool("b")])).toBeNull();
  });

  test("should expose a stable name", () => {
    const middleware = toToolHookMiddleware([makeTool("a", { onBeforeCall: () => ({}) as never })]);

    expect(middleware?.name).toBe("talos:tool-hooks");
  });

  test("should route onBeforeToolCall to the matching tool by name", async () => {
    const calls: string[] = [];
    const tools = [
      makeTool("alpha", {
        onBeforeCall: () => {
          calls.push("alpha");
          return {} as never;
        },
      }),
      makeTool("beta", {
        onBeforeCall: () => {
          calls.push("beta");
          return {} as never;
        },
      }),
    ];

    const middleware = toToolHookMiddleware(tools);
    // biome-ignore lint/suspicious/noExplicitAny: minimal hook context for the test
    await middleware?.onBeforeToolCall?.({} as any, { toolName: "beta" } as any);

    expect(calls).toEqual(["beta"]);
  });

  test("should route onAfterToolCall to the matching tool by name", async () => {
    const calls: string[] = [];
    const tools = [
      makeTool("alpha", {
        onAfterCall: () => {
          calls.push("alpha");
        },
      }),
    ];

    const middleware = toToolHookMiddleware(tools);
    // biome-ignore lint/suspicious/noExplicitAny: minimal hook info for the test
    await middleware?.onAfterToolCall?.({} as any, { toolName: "alpha" } as any);

    expect(calls).toEqual(["alpha"]);
  });

  test("should no-op when the called tool name has no registered hook", async () => {
    const middleware = toToolHookMiddleware([makeTool("alpha", { onAfterCall: () => {} })]);

    expect(
      // biome-ignore lint/suspicious/noExplicitAny: minimal hook info for the test
      await middleware?.onAfterToolCall?.({} as any, { toolName: "missing" } as any),
    ).toBeUndefined();
  });
});

describe("toServerTools", () => {
  const makeTool = (name: string, withSchema = false): ITool => ({
    getName: () => name,
    getDescription: () => `${name} desc`,
    handler: (param) => ({ echoed: param }),
    ...(withSchema
      ? // biome-ignore lint/suspicious/noExplicitAny: stand-in schema for the test
        { getInputSchema: () => ({}) as any }
      : {}),
  });

  test("should produce one server tool per input tool", () => {
    const tools = toServerTools([makeTool("a"), makeTool("b", true)]);

    expect(tools).toHaveLength(2);
    expect(tools[0]).toBeDefined();
    expect(tools[1]).toBeDefined();
  });

  test("should return an empty array for no tools", () => {
    expect(toServerTools([])).toEqual([]);
  });
});
