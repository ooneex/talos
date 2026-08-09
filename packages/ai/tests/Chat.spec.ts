import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AGUIEvent } from "@tanstack/ai";

// Records every `chat()` invocation so assertions can inspect the assembled
// options. `run`/`stream` now judge automatically before the real call, so a
// judgement request (recognisable by its `outputSchema`) is answered from
// `judgeResult` — defaulting to every skill named in its prompt, i.e. "let
// them all through" — while the real call still resolves to `chatResult`.
const chatCalls: Array<Record<string, unknown>> = [];
let chatResult: unknown = "";
let judgeResult: { names: string[] } | null = null;
let streamEvents: AGUIEvent[] = [];

const chatMock = mock((options: Record<string, unknown>) => {
  chatCalls.push(options);
  if (options.outputSchema === skillJudgementSchema) {
    if (judgeResult) return Promise.resolve(judgeResult);
    const prompt = (options.systemPrompts as string[]).join("\n");
    const names = [...prompt.matchAll(/^- (.+?):/gm)].map((match) => match[1] as string);
    return Promise.resolve({ names });
  }
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
const { skillJudgementSchema } = await import("@/utils");

import type { AiMiddlewareClassType, AiSkillClassType, AiToolClassType, IMiddleware, ISkill, ITool } from "@/types";

class TestChat extends Chat {
  public getModel = (): string => "anthropic/claude-sonnet-4.5";
  public getSystemPrompts = (): string[] => ["base prompt"];
  public getTools = (): AiToolClassType[] => [];
  public getMiddlewares = (): AiMiddlewareClassType[] => [];
  public getSkills = (): AiSkillClassType[] => [];
}

// biome-ignore lint/suspicious/noExplicitAny: tests read arbitrary option keys off the recorded call
const lastCall = () => chatCalls[chatCalls.length - 1] as Record<string, any>;

beforeEach(() => {
  chatCalls.length = 0;
  chatResult = "";
  judgeResult = null;
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

describe("Chat skill resolution", () => {
  class RefundTool implements ITool {
    public getName = (): string => "refund_order";
    public getDescription = (): string => "refunds an order";
    public handler = (): unknown => null;
  }
  decorator.tool()(RefundTool);

  class RefundSkill implements ISkill {
    public getName = (): string => "order-refund";
    public getDescription = (): string => "Issue refunds.";
    public getWhenToUse = (): string => "The user wants money back.";
    public getTools = (): AiToolClassType[] => [RefundTool];
    public getPrompt = (): string => "Check the order, then refund it.";
  }
  decorator.skill()(RefundSkill);

  class OnboardSkill implements ISkill {
    public getName = (): string => "tenant-onboard";
    public getDescription = (): string => "Set a tenant up.";
    public getWhenToUse = (): string => "A new customer signs up.";
    public getTools = (): AiToolClassType[] => [];
    public getPrompt = (): string => "Create the workspace.";
  }
  decorator.skill()(OnboardSkill);

  class WithSkill extends TestChat {
    public override getSkills = (): AiSkillClassType[] => [RefundSkill];
  }

  const toolNames = () => (lastCall().tools as Array<{ name: string }>).map((tool) => tool.name);

  test("should register the skill's own tools", async () => {
    await new WithSkill().run({ prompt: "hi" });

    expect(toolNames()).toEqual(["refund_order"]);
  });

  test("should append the skill's routing surface and its procedure", async () => {
    await new WithSkill().run({ prompt: "hi" });

    const prompts = lastCall().systemPrompts as string[];
    const catalogue = prompts[prompts.length - 1] ?? "";
    expect(catalogue).toContain("## order-refund");
    expect(catalogue).toContain("Issue refunds. Use when: The user wants money back.");
    expect(catalogue).toContain("Check the order, then refund it.");
  });

  test("should keep the chat and per-request system prompts ahead of the catalogue", async () => {
    await new WithSkill().run({ prompt: "hi", systemPrompts: ["request prompt"] });

    const prompts = lastCall().systemPrompts as string[];
    expect(prompts.slice(0, 2)).toEqual(["base prompt", "request prompt"]);
    expect(prompts).toHaveLength(3);
  });

  test("should merge per-request skills with the chat's own", async () => {
    await new WithSkill().run({ prompt: "hi", skills: [OnboardSkill] });

    const prompts = lastCall().systemPrompts as string[];
    const catalogue = prompts[prompts.length - 1] ?? "";
    expect(catalogue).toContain("order-refund");
    expect(catalogue).toContain("tenant-onboard");
  });

  test("should register a tool shared by the chat and a skill only once", async () => {
    class SharedToolChat extends WithSkill {
      public override getTools = (): AiToolClassType[] => [RefundTool];
    }

    await new SharedToolChat().run({ prompt: "hi" });

    expect(toolNames()).toEqual(["refund_order"]);
  });

  test("should leave the prompts and tools untouched when no skill is declared", async () => {
    await new TestChat().run({ prompt: "hi" });

    expect(lastCall().systemPrompts).toEqual(["base prompt"]);
    expect(toolNames()).toEqual([]);
  });

  test("should resolve skills for a streamed run too", async () => {
    for await (const _event of new WithSkill().stream({ prompt: "hi" })) {
      // drain
    }

    expect(toolNames()).toContain("refund_order");
  });

  test("should judge automatically and drop a skill the model didn't name", async () => {
    judgeResult = { names: ["tenant-onboard"] };

    await new WithSkill().run({ prompt: "hi", skills: [OnboardSkill] });

    expect(toolNames()).toEqual([]);
    const prompts = lastCall().systemPrompts as string[];
    const catalogue = prompts[prompts.length - 1] ?? "";
    expect(catalogue).toContain("tenant-onboard");
    expect(catalogue).not.toContain("order-refund");
  });

  test("should skip the judge call entirely when no skill is declared", async () => {
    await new TestChat().run({ prompt: "hi" });

    expect(chatCalls).toHaveLength(1);
    expect(chatCalls[0]?.outputSchema).toBeUndefined();
  });
});

describe("Chat.judge", () => {
  class RefundSkill implements ISkill {
    public getName = (): string => "order-refund";
    public getDescription = (): string => "Issue refunds.";
    public getWhenToUse = (): string => "The user wants money back.";
    public getTools = (): AiToolClassType[] => [];
    public getPrompt = (): string => "Check the order, then refund it.";
  }
  decorator.skill()(RefundSkill);

  class OnboardSkill implements ISkill {
    public getName = (): string => "tenant-onboard";
    public getDescription = (): string => "Set a tenant up.";
    public getWhenToUse = (): string => "A new customer signs up.";
    public getTools = (): AiToolClassType[] => [];
    public getPrompt = (): string => "Create the workspace.";
  }
  decorator.skill()(OnboardSkill);

  class WithSkills extends TestChat {
    public override getSkills = (): AiSkillClassType[] => [RefundSkill, OnboardSkill];
  }

  test("should return the skill classes the model named", async () => {
    judgeResult = { names: ["order-refund"] };

    const skills = await new WithSkills().judgeSkills({ prompt: "I want my money back" });

    expect(skills).toEqual([RefundSkill]);
  });

  test("should match a name the model retyped with different casing and spacing", async () => {
    judgeResult = { names: [" Order-Refund "] };

    const skills = await new WithSkills().judgeSkills({ prompt: "refund me" });

    expect(skills).toEqual([RefundSkill]);
  });

  test("should judge per-request skills alongside the chat's own", async () => {
    class ExtraSkill implements ISkill {
      public getName = (): string => "invoice-send";
      public getDescription = (): string => "Send invoices.";
      public getWhenToUse = (): string => "The user asks for an invoice.";
      public getTools = (): AiToolClassType[] => [];
      public getPrompt = (): string => "Render the invoice, then email it.";
    }
    decorator.skill()(ExtraSkill);
    judgeResult = { names: ["invoice-send"] };

    const skills = await new WithSkills().judgeSkills({ prompt: "send me my invoice", skills: [ExtraSkill] });

    expect(skills).toEqual([ExtraSkill]);
  });

  test("should send only the names and when-to-use lines, never the procedures", async () => {
    judgeResult = { names: [] };

    await new WithSkills().judgeSkills({ prompt: "hello" });

    const prompt = (lastCall().systemPrompts as string[]).join("\n");
    expect(prompt).toContain("- order-refund: The user wants money back.");
    expect(prompt).toContain("- tenant-onboard: A new customer signs up.");
    expect(prompt).not.toContain("Check the order, then refund it.");
  });

  test("should judge with structured output and without tools or middleware", async () => {
    judgeResult = { names: [] };

    await new WithSkills().judgeSkills({ prompt: "hello" });

    const call = lastCall();
    expect(call.stream).toBe(false);
    expect(call.outputSchema).toBeDefined();
    expect(call.tools).toBeUndefined();
    expect(call.middleware).toBeUndefined();
  });

  test("should return nothing when the model names no skill", async () => {
    judgeResult = { names: [] };

    const skills = await new WithSkills().judgeSkills({ prompt: "what time is it?" });

    expect(skills).toEqual([]);
  });

  test("should skip the model call entirely when no skill is declared", async () => {
    const skills = await new TestChat().judgeSkills({ prompt: "hi" });

    expect(skills).toEqual([]);
    expect(chatCalls).toHaveLength(0);
  });
});
