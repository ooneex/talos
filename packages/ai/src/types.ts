import type {
  AbortInfo,
  AfterToolCallInfo,
  AGUIEvent,
  AgentLoopStrategy,
  BeforeToolCallDecision,
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ContentPart,
  ErrorInfo,
  FinishInfo,
  IterationInfo,
  StreamChunk,
  StructuredOutputMiddlewareConfig,
  ToolCallHookContext,
  ToolPhaseCompleteInfo,
  UsageInfo,
} from "@tanstack/ai";
import type { AssertType } from "@talosjs/validation";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type AiChatClassType = new (...args: any[]) => IChat;

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type AiToolClassType = new (...args: any[]) => ITool;

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type AiMiddlewareClassType = new (...args: any[]) => IMiddleware;

export type ChatInputType = {
  /** User message prompt to send to the model. */
  prompt: string;
  /** Prior conversation messages to prepend before the {@link ChatInputType.prompt}. */
  messages?: MessageType[];
  /** System prompts to prepend to the conversation. */
  systemPrompts?: string[];
  /** Tools for function calling (auto-executed when called). */
  tools?: AiToolClassType[];
  /** Controls the randomness of the output. Higher values are more random. Range: [0.0, 2.0] */
  temperature?: number;
  /** Nucleus sampling parameter. The model considers tokens with topP probability mass. */
  topP?: number;
  /** The maximum number of tokens to generate in the response. */
  maxTokens?: number;
  /**
   * Arbitrary metadata attached to the request and carried through the chat
   * pipeline. Unlike {@link ChatInputType.context}, metadata is part of the request
   * config: it is shallow-merged across the run and can be read or transformed
   * by middleware (e.g. in `onConfig`). Use it for request-scoped tracking data
   * such as user/session ids, tracing tags, or feature flags — it is never sent
   * to the model.
   *
   * @example
   * ```ts
   * await chat.run({
   *   prompt: "Summarize this thread",
   *   metadata: { userId: "user_123", sessionId: "sess_456" },
   * });
   *
   * // A middleware can read or augment it:
   * const tracking: ChatMiddleware = {
   *   name: "tracking",
   *   onConfig: (ctx, config) => ({
   *     metadata: { ...config.metadata, traceId: ctx.requestId },
   *   }),
   * };
   * ```
   */
  metadata?: Record<string, unknown>;
  /** Strategy for controlling the agent loop. */
  agentLoopStrategy?: AgentLoopStrategy;
  /** Unique conversation identifier for tracking. */
  conversationId?: string;
  /** AbortController for request cancellation. */
  abortController?: AbortController;
  /** Standard Schema for structured output. */
  outputSchema?: AssertType;
  /** Middleware array for observing/transforming chat behavior. */
  middlewares?: AiMiddlewareClassType[];
  /**
   * Runtime context: request-scoped application state made available to tools
   * and middleware hooks. Unlike {@link ChatInputType.metadata}, context is not part
   * of the request config and is never sent to the model — it carries live
   * dependencies such as the authenticated user, a database client, tenancy
   * info, or an audit logger. Tools and middleware read it via `ctx.context`.
   *
   * @example
   * ```ts
   * type AppContext = {
   *   userId: string;
   *   db: DatabaseClient;
   *   audit: { write(event: object): Promise<void> };
   * };
   *
   * await chat.run({
   *   prompt: "List my notes",
   *   tools: [listNotes],
   *   middlewares: [auditMiddleware],
   *   context: { userId: user.id, db, audit } satisfies AppContext,
   * });
   *
   * // Accessed inside a tool or middleware hook:
   * const auditMiddleware: ChatMiddleware<AppContext> = {
   *   name: "audit",
   *   onStart: (ctx) =>
   *     ctx.defer(ctx.context.audit.write({ userId: ctx.context.userId })),
   * };
   * ```
   */
  context?: unknown;
};

export interface IChat {
  run: <T>(input?: ChatInputType) => Promise<T>;
  stream: (input?: ChatInputType) => AsyncIterable<AGUIEvent>;
  getModel: () => string;
  getSystemPrompts: () => string[];
  getTools: () => AiToolClassType[];
  getMiddlewares: () => AiMiddlewareClassType[];
}

export type MessageType = {
  role: "user" | "assistant";
  content: string | ContentPart[];
};

export interface ITool<P = unknown, R = unknown> {
  getName: () => string;
  getDescription: () => string;
  handler: (param: P) => R;
  getInputSchema?: () => AssertType;
  onBeforeCall?: (
    ctx: ChatMiddlewareContext,
    hookCtx: ToolCallHookContext,
  ) => BeforeToolCallDecision | Promise<BeforeToolCallDecision>;
  onAfterCall?: (
    ctx: ChatMiddlewareContext,
    info: AfterToolCallInfo,
  ) => void | Promise<void>;
}

/**
 * Class-friendly middleware contract over TanStack AI's {@link ChatMiddleware}.
 *
 * Hooks fire across the `chat()` lifecycle and may observe, transform, or
 * short-circuit behavior without touching the adapter or tools. All hooks are
 * optional; the only required member is {@link IMiddleware.getName}. Composition
 * follows array order: `onConfig`/`onStructuredOutputConfig`/`onChunk` are piped
 * (each receives the previous middleware's output), `onBeforeToolCall` is
 * first-win, and the remaining hooks run sequentially.
 *
 * @typeParam TContext - Shape of the runtime context read via `ctx.context`.
 *
 * @see https://tanstack.com/ai/latest/docs/advanced/middleware
 *
 * @example
 * ```ts
 * class AuditMiddleware implements IMiddleware<{ userId: string }> {
 *   getName = () => "audit";
 *   onStart = (ctx) =>
 *     ctx.defer(audit.write({ userId: ctx.context.userId, requestId: ctx.requestId }));
 * }
 * ```
 */
export interface IMiddleware<TContext = unknown> {
  /** Name used for debugging, identification, and capability checks. */
  getName: () => string;
  /**
   * Provisioning hook. Runs first — before `onConfig` (init) — across all
   * middleware in array order. Call `provide` accessors here so later middleware
   * can consume the capabilities. Receives the stable context, not the config.
   */
  setup?: (ctx: ChatMiddlewareContext<TContext>) => void | Promise<void>;
  /**
   * Observe or transform the chat configuration. Called once at `init` and once
   * per agent iteration at `beforeModel` (and again at the structured-output
   * boundary when `outputSchema` is set). Return a partial config to
   * shallow-merge, or void to pass through.
   */
  onConfig?: (
    ctx: ChatMiddlewareContext<TContext>,
    config: ChatMiddlewareConfig,
  ) =>
    | void
    | null
    | Partial<ChatMiddlewareConfig>
    | Promise<void | null | Partial<ChatMiddlewareConfig>>;
  /**
   * Transform the final structured-output call's config — including the JSON
   * Schema sent to the provider. Fires only when `outputSchema` is set and the
   * adapter takes the legacy finalization path. Fires before the
   * `structuredOutput`-phase `onConfig`. Return a partial to merge, or void.
   */
  onStructuredOutputConfig?: (
    ctx: ChatMiddlewareContext<TContext>,
    config: StructuredOutputMiddlewareConfig,
  ) =>
    | void
    | null
    | Partial<StructuredOutputMiddlewareConfig>
    | Promise<void | null | Partial<StructuredOutputMiddlewareConfig>>;
  /**
   * Observe or transform the configuration immediately before each model call,
   * once per agent iteration (`ctx.phase === "beforeModel"`). A focused slice of
   * {@link IMiddleware.onConfig} that skips the `init` and `structuredOutput`
   * boundaries — use it to adjust per-iteration knobs (e.g. raising temperature
   * on retries or filtering tools). Return a partial config to shallow-merge, or
   * void to pass through.
   */
  onBeforeModel?: (
    ctx: ChatMiddlewareContext<TContext>,
    config: ChatMiddlewareConfig,
  ) =>
    | void
    | null
    | Partial<ChatMiddlewareConfig>
    | Promise<void | null | Partial<ChatMiddlewareConfig>>;
  /** Called once when the run starts, after the initial `onConfig`. */
  onStart?: (ctx: ChatMiddlewareContext<TContext>) => void | Promise<void>;
  /** Called at the start of each agent loop iteration, after its message ID is created. */
  onIteration?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: IterationInfo,
  ) => void | Promise<void>;
  /**
   * Called for every chunk streamed by `chat()`. Narrow on `chunk.type`.
   *
   * @returns void to pass through, a chunk to replace, a chunk array to expand,
   * or null to drop. Dropped chunks are not seen by later middleware.
   */
  onChunk?: (
    ctx: ChatMiddlewareContext<TContext>,
    chunk: StreamChunk,
  ) =>
    | void
    | StreamChunk
    | Array<StreamChunk>
    | null
    | Promise<void | StreamChunk | Array<StreamChunk> | null>;
  /** Called after all tool calls in an iteration have been processed. */
  onToolPhaseComplete?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: ToolPhaseCompleteInfo,
  ) => void | Promise<void>;
  /** Called once per model iteration that reports usage in its RUN_FINISHED chunk. */
  onUsage?: (
    ctx: ChatMiddlewareContext<TContext>,
    usage: UsageInfo,
  ) => void | Promise<void>;
  /** Terminal hook — the run completed normally. Mutually exclusive with onAbort/onError. */
  onFinish?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: FinishInfo,
  ) => void | Promise<void>;
  /** Terminal hook — the run was aborted. Mutually exclusive with onFinish/onError. */
  onAbort?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: AbortInfo,
  ) => void | Promise<void>;
  /** Terminal hook — an unhandled error occurred. Mutually exclusive with onFinish/onAbort. */
  onError?: (
    ctx: ChatMiddlewareContext<TContext>,
    info: ErrorInfo,
  ) => void | Promise<void>;
}
