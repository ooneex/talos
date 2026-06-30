import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AGUIEvent } from "@tanstack/ai";

// Records every `chat()` invocation so assertions can inspect the assembled
// options. Non-stream calls resolve to `chatResult`; stream calls replay
// `streamEvents`. Both are reset per-test below.
const chatCalls: Array<Record<string, unknown>> = [];
let chatResult: unknown = "";
let streamEvents: AGUIEvent[] = [];

const chatMock = mock((options: Record<string, unknown>) => {
  chatCalls.push(options);
  if (options.stream) {
    return (async function* () {
      for (const event of streamEvents) yield event;
    })();
  }
  return Promise.resolve(chatResult);
});

// `createChatOptions` is the identity here so we can assert directly on what
// `chat()` receives; `toolDefinition` mirrors the real fluent `.server()` shape.
mock.module("@tanstack/ai", () => ({
  chat: chatMock,
  createChatOptions: (options: unknown) => options,
  // biome-ignore lint/suspicious/noExplicitAny: minimal tool-definition stand-in
  toolDefinition: (definition: any) => ({
    server: (handler: unknown) => ({ ...definition, handler }),
  }),
}));

mock.module("@tanstack/ai-openrouter", () => ({
  openRouterText: (model: string) => ({ __model: model }),
}));

const { Chat } = await import("@/Chat");
const { decorator } = await import("@/decorators");
import type { AiMiddlewareClassType, AiToolClassType, IMiddleware, ITool } from "@/types";

class TestChat extends Chat {
  public getModel = (): string => "anthropic/claude-sonnet-4.5";
  public getSystemPrompts = (): string[] => ["base prompt"];
  public getTools = (): AiToolClassType[] => [];
  public getMiddlewares = (): AiMiddlewareClassType[] => [];
}

// biome-ignore lint/suspicious/noExplicitAny: tests read arbitrary option keys off the recorded call
const lastCall = () => chatCalls[chatCalls.length - 1] as Record<string, any>;

beforeEach(() => {
  chatCalls.length = 0;
  chatResult = "";
  streamEvents = [];
});

describe("Chat.run", () => {
  test("should resolve to the assistant text from chat()", async () => {
    chatResult = "the answer";

    const result = await new TestChat().run({ prompt: "hi" });

    expect(result).toBe("the answer");
  });

  test("should call chat() with stream disabled", async () => {
    await new TestChat().run({ prompt: "hi" });

    expect(lastCall().stream).toBe(false);
  });

  test("should forward the adapter built from getModel", async () => {
    await new TestChat().run({ prompt: "hi" });

    expect(lastCall().adapter).toEqual({ __model: "anthropic/claude-sonnet-4.5" });
  });

  test("should append the prompt as a trailing user message", async () => {
    await new TestChat().run({
      prompt: "second",
      messages: [{ role: "assistant", content: "first" }],
    });

    expect(lastCall().messages).toEqual([
      { role: "assistant", content: "first" },
      { role: "user", content: "second" },
    ]);
  });

  test("should merge base system prompts with per-request ones in order", async () => {
    await new TestChat().run({ prompt: "hi", systemPrompts: ["extra"] });

    expect(lastCall().systemPrompts).toEqual(["base prompt", "extra"]);
  });

  test("should forward sampling options as model options", async () => {
    await new TestChat().run({ prompt: "hi", temperature: 0.5, topP: 0.8, maxTokens: 100 });

    expect(lastCall().modelOptions).toEqual({
      temperature: 0.5,
      topP: 0.8,
      maxCompletionTokens: 100,
    });
  });

  test("should forward metadata, conversationId, context, and abortController", async () => {
    const abortController = new AbortController();
    const context = { userId: "u1" };

    await new TestChat().run({
      prompt: "hi",
      metadata: { trace: "t1" },
      conversationId: "conv-1",
      context,
      abortController,
    });

    const call = lastCall();
    expect(call.metadata).toEqual({ trace: "t1" });
    expect(call.conversationId).toBe("conv-1");
    expect(call.context).toBe(context);
    expect(call.abortController).toBe(abortController);
  });

  test("should pass the outputSchema through when structured output is requested", async () => {
    chatResult = { ok: true };
    // biome-ignore lint/suspicious/noExplicitAny: stand-in schema for the test
    const outputSchema = { kind: "object" } as any;

    const result = await new TestChat().run({ prompt: "hi", outputSchema });

    expect(result).toEqual({ ok: true });
    expect(lastCall().outputSchema).toBe(outputSchema);
    expect(lastCall().stream).toBe(false);
  });

  test("should run without any input", async () => {
    chatResult = "no-input";

    const result = await new TestChat().run();

    expect(result).toBe("no-input");
    expect(lastCall().messages).toEqual([]);
  });
});

describe("Chat.stream", () => {
  test("should yield each event produced by chat()", async () => {
    streamEvents = [
      { type: "TEXT_MESSAGE_CONTENT", delta: "a" } as unknown as AGUIEvent,
      { type: "TEXT_MESSAGE_CONTENT", delta: "b" } as unknown as AGUIEvent,
    ];

    const received: AGUIEvent[] = [];
    for await (const event of new TestChat().stream({ prompt: "hi" })) {
      received.push(event);
    }

    expect(received).toEqual(streamEvents);
  });

  test("should call chat() with stream enabled", async () => {
    for await (const _event of new TestChat().stream({ prompt: "hi" })) {
      // drain
    }

    expect(lastCall().stream).toBe(true);
  });
});

describe("Chat tool and middleware resolution", () => {
  test("should resolve subclass and per-request tools into server tools", async () => {
    class EchoTool implements ITool {
      public getName = (): string => "echo";
      public getDescription = (): string => "echoes input";
      public handler = (param: unknown): unknown => param;
    }
    decorator.tool()(EchoTool);

    class WithTool extends TestChat {
      public override getTools = (): AiToolClassType[] => [EchoTool];
    }

    class ExtraTool implements ITool {
      public getName = (): string => "extra";
      public getDescription = (): string => "extra tool";
      public handler = (): unknown => null;
    }
    decorator.tool()(ExtraTool);

    await new WithTool().run({ prompt: "hi", tools: [ExtraTool] });

    expect(lastCall().tools).toHaveLength(2);
  });

  test("should adapt subclass and per-request middleware", async () => {
    class BaseMiddleware implements IMiddleware {
      public getName = (): string => "base";
    }
    decorator.middleware()(BaseMiddleware);

    class RequestMiddleware implements IMiddleware {
      public getName = (): string => "request";
    }
    decorator.middleware()(RequestMiddleware);

    class WithMiddleware extends TestChat {
      public override getMiddlewares = (): AiMiddlewareClassType[] => [BaseMiddleware];
    }

    await new WithMiddleware().run({ prompt: "hi", middlewares: [RequestMiddleware] });

    const middleware = lastCall().middleware as Array<{ name: string }>;
    expect(middleware.map((m) => m.name)).toEqual(["base", "request"]);
  });

  test("should append the tool-hook bridge middleware when a tool declares hooks", async () => {
    class HookedTool implements ITool {
      public getName = (): string => "hooked";
      public getDescription = (): string => "hooked tool";
      public handler = (): unknown => null;
      public onBeforeCall = (): never => ({}) as never;
    }
    decorator.tool()(HookedTool);

    class WithHookedTool extends TestChat {
      public override getTools = (): AiToolClassType[] => [HookedTool];
    }

    await new WithHookedTool().run({ prompt: "hi" });

    const middleware = lastCall().middleware as Array<{ name: string }>;
    expect(middleware.map((m) => m.name)).toContain("talos:tool-hooks");
  });

  test("should not append the tool-hook bridge when no tool declares hooks", async () => {
    await new TestChat().run({ prompt: "hi" });

    const middleware = lastCall().middleware as Array<{ name: string }>;
    expect(middleware).toEqual([]);
  });
});
