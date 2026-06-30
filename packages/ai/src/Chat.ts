import { container } from "@talosjs/container";
import { type AGUIEvent, type ChatMiddleware, chat, createChatOptions } from "@tanstack/ai";
import type { AiMiddlewareClassType, AiToolClassType, ChatInputType, IChat, IMiddleware, ITool } from "./types";
import {
  buildMessages,
  buildModelOptions,
  createAdapter,
  toChatMiddleware,
  toServerTools,
  toToolHookMiddleware,
} from "./utils";

/**
 * Abstract chat driver built on top of TanStack AI's OpenRouter adapter.
 *
 * Subclasses describe *what* the chat is — its model, system prompts, tools,
 * and middleware — by implementing the four abstract getters. The base class
 * owns the *how*: it wires those pieces into a {@link chat} call and exposes a
 * unified {@link Chat.run} (one-shot / structured output) and {@link Chat.stream}
 * (token streaming) surface.
 *
 * Tools and middleware are container-managed classes resolved on demand, so
 * subclasses only ever return the class references. A tool's optional
 * `onBeforeCall` / `onAfterCall` hooks are bridged onto the chat run as a
 * single name-routed middleware.
 *
 * @see https://tanstack.com/ai/latest/docs/adapters/openrouter
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class SupportChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You are a concise support agent."];
 *   public getTools = () => [];
 *   public getMiddlewares = () => [];
 * }
 *
 * const reply = await container.get(SupportChat).run({ prompt: "Hi!" });
 * ```
 */
export abstract class Chat implements IChat {
  /** OpenRouter model identifier in `provider/model` form (e.g. `openai/gpt-5`). */
  public abstract getModel(): string;

  /** System prompts prepended to every conversation, before per-request ones. */
  public abstract getSystemPrompts(): string[];

  /** Tool classes made available to the model for function calling. */
  public abstract getTools(): AiToolClassType[];

  /** Middleware classes applied to every run, before per-request ones. */
  public abstract getMiddlewares(): AiMiddlewareClassType[];

  /**
   * Run the chat to completion and return the result.
   *
   * When {@link ChatInputType.outputSchema} is set, the agentic loop runs to
   * completion and the validated structured object is returned. Otherwise the
   * collected assistant text is returned as a string.
   */
  public async run<T>(input?: ChatInputType): Promise<T> {
    const options = this.buildOptions(input);

    if (input?.outputSchema) {
      const result = await chat({ ...options, outputSchema: input.outputSchema, stream: false });
      return result as T;
    }

    const result = await chat({ ...options, stream: false });
    return result as T;
  }

  /**
   * Stream the raw chat events as they arrive — text deltas, tool calls, and
   * lifecycle events — as a single AG-UI event stream. Callers narrow on
   * `event.type` to handle the chunks they care about.
   */
  public async *stream(input?: ChatInputType): AsyncIterable<AGUIEvent> {
    const options = this.buildOptions(input);
    yield* chat({ ...options, stream: true });
  }

  /** Assemble the shared {@link chat} options from the subclass and request input. */
  private buildOptions(input?: ChatInputType) {
    const tools = this.resolveTools(input);

    return createChatOptions({
      adapter: createAdapter(this.getModel()),
      messages: buildMessages(input),
      systemPrompts: [...this.getSystemPrompts(), ...(input?.systemPrompts ?? [])],
      tools: toServerTools(tools),
      middleware: this.resolveMiddlewares(input, tools),
      metadata: input?.metadata,
      modelOptions: buildModelOptions(input),
      agentLoopStrategy: input?.agentLoopStrategy,
      conversationId: input?.conversationId,
      abortController: input?.abortController,
      context: input?.context,
    });
  }

  /** Resolve the subclass and per-request tool classes to instances. */
  private resolveTools(input?: ChatInputType): ITool[] {
    const classes: AiToolClassType[] = [...this.getTools(), ...(input?.tools ?? [])];

    return classes.map((Tool) => container.get<ITool>(Tool));
  }

  /**
   * Resolve subclass and per-request middleware classes to instances and adapt
   * them to TanStack middleware. A name-routed bridge middleware is appended
   * when any tool declares `onBeforeCall` / `onAfterCall` hooks.
   */
  private resolveMiddlewares(input: ChatInputType | undefined, tools: ITool[]): ChatMiddleware[] {
    const classes: AiMiddlewareClassType[] = [...this.getMiddlewares(), ...(input?.middlewares ?? [])];

    const middleware = classes.map((Middleware) => toChatMiddleware(container.get<IMiddleware>(Middleware)));

    const toolHooks = toToolHookMiddleware(tools);
    if (toolHooks) middleware.push(toolHooks);

    return middleware;
  }
}
