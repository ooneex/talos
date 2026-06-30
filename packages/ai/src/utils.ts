import { type ChatMiddleware, toolDefinition } from "@tanstack/ai";
import { openRouterText, type OpenRouterTextModelOptions } from "@tanstack/ai-openrouter";
import type { ChatInputType, IMiddleware, ITool, MessageType } from "./types";

/** Adapter created by {@link openRouterText}, used as the chat transport. */
export type Adapter = ReturnType<typeof openRouterText>;

/** Create the OpenRouter adapter for a `provider/model` identifier. */
export const createAdapter = (model: string): Adapter => openRouterText(model as Parameters<typeof openRouterText>[0]);

/** Build the conversation messages, appending the prompt as a trailing user turn. */
export const buildMessages = (input?: ChatInputType): MessageType[] => {
  const messages: MessageType[] = [...(input?.messages ?? [])];
  if (input?.prompt) {
    messages.push({ role: "user", content: input.prompt });
  }

  return messages;
};

/** Collect OpenRouter sampling options, omitting unset values. */
export const buildModelOptions = (input?: ChatInputType): OpenRouterTextModelOptions => {
  const modelOptions: OpenRouterTextModelOptions = {};

  if (input?.temperature !== undefined) {
    modelOptions.temperature = input.temperature;
  }
  if (input?.topP !== undefined) modelOptions.topP = input.topP;
  if (input?.maxTokens !== undefined) {
    modelOptions.maxCompletionTokens = input.maxTokens;
  }

  return modelOptions;
};

/** Convert {@link ITool} instances into TanStack server tools. */
// biome-ignore lint/suspicious/noExplicitAny: server-tool generics depend on each tool's schema
export const toServerTools = (tools: ITool[]): any[] =>
  tools.map((tool) => {
    const inputSchema = tool.getInputSchema?.();
    const definition = toolDefinition({
      name: tool.getName(),
      description: tool.getDescription(),
      ...(inputSchema ? { inputSchema } : {}),
      lazy: true
    });

    return definition.server(async (args: unknown) => tool.handler(args));
  });

/**
 * Merge {@link IMiddleware.onConfig} with {@link IMiddleware.onBeforeModel}.
 * Both produce partial config to shallow-merge; `onBeforeModel` runs only at
 * the `beforeModel` phase and sees the config already adjusted by `onConfig`.
 */
export const composeOnConfig = (middleware: IMiddleware): ChatMiddleware["onConfig"] => {
  if (!middleware.onConfig && !middleware.onBeforeModel) return undefined;

  return async (ctx, config) => {
    let merged: Record<string, unknown> | undefined;
    let current = config;

    const apply = (patch: undefined | null | Record<string, unknown>): void => {
      if (!patch) return;
      merged = { ...(merged ?? {}), ...patch };
      current = { ...current, ...patch };
    };

    if (middleware.onConfig) {
      apply((await middleware.onConfig(ctx, current)) ?? undefined);
    }
    if (middleware.onBeforeModel && ctx.phase === "beforeModel") {
      apply((await middleware.onBeforeModel(ctx, current)) ?? undefined);
    }

    return merged;
  };
};

/** Adapt an {@link IMiddleware} instance to TanStack's {@link ChatMiddleware}. */
export const toChatMiddleware = (middleware: IMiddleware): ChatMiddleware => {
  const adapted: ChatMiddleware = { name: middleware.getName() };

  // `onBeforeModel` is sugar over `onConfig` at the `beforeModel` phase;
  // TanStack has no native hook for it, so the two are composed here.
  const onConfig = composeOnConfig(middleware);
  if (onConfig) adapted.onConfig = onConfig;

  const bind = <K extends keyof IMiddleware & keyof ChatMiddleware>(key: K): void => {
    const hook = middleware[key];
    if (hook) {
      // biome-ignore lint/suspicious/noExplicitAny: hooks share identical signatures across both interfaces
      (adapted[key] as any) = (hook as any).bind(middleware);
    }
  };

  bind("setup");
  bind("onStructuredOutputConfig");
  bind("onStart");
  bind("onIteration");
  bind("onChunk");
  bind("onToolPhaseComplete");
  bind("onUsage");
  bind("onFinish");
  bind("onAbort");
  bind("onError");

  return adapted;
};

/**
 * Build a single middleware that routes TanStack's tool-call hooks to the
 * matching tool's `onBeforeCall` / `onAfterCall`. Returns `null` when no tool
 * declares either hook.
 */
export const toToolHookMiddleware = (tools: ITool[]): ChatMiddleware | null => {
  const hooked = tools.filter((tool) => tool.onBeforeCall || tool.onAfterCall);
  if (hooked.length === 0) return null;

  const byName = new Map(hooked.map((tool) => [tool.getName(), tool]));

  return {
    name: "talos:tool-hooks",
    onBeforeToolCall: (ctx, hookCtx) => byName.get(hookCtx.toolName)?.onBeforeCall?.(ctx, hookCtx),
    onAfterToolCall: async (ctx, info) => {
      await byName.get(info.toolName)?.onAfterCall?.(ctx, info);
    },
  };
};
