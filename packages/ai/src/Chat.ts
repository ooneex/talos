import { container } from "@talosjs/container";
import { type AGUIEvent, type ChatMiddleware, chat, createChatOptions } from "@tanstack/ai";
import type {
  AiMiddlewareClassType,
  AiSkillClassType,
  AiToolClassType,
  ChatInputType,
  IChat,
  IMiddleware,
  ISkill,
  ITool,
} from "./types";
import {
  buildJudgePrompt,
  buildMessages,
  buildModelOptions,
  buildSkillPrompts,
  createAdapter,
  isJudged,
  type SkillJudgementType,
  skillJudgementSchema,
  toChatMiddleware,
  toServerTools,
  toToolHookMiddleware,
} from "./utils";

/** A skill class paired with its resolved instance, so a judgement can name one and return the other. */
type SkillEntryType = { Skill: AiSkillClassType; skill: ISkill };

/**
 * Abstract chat driver built on top of TanStack AI's OpenRouter adapter.
 *
 * Subclasses describe *what* the chat is — its model, system prompts, tools,
 * middleware, and skills — by implementing the five abstract getters. The base class
 * owns the *how*: it wires those pieces into a {@link chat} call and exposes a
 * unified {@link Chat.run} (one-shot / structured output), {@link Chat.stream}
 * (token streaming), and {@link Chat.judge} (skill routing) surface.
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
 *   public getSkills = () => [];
 * }
 *
 * const reply = await container.get(SupportChat).run({ prompt: "Hi!" });
 * ```
 */
export abstract class Chat implements IChat {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor is needed for Bun function coverage
  public constructor() {}

  /** OpenRouter model identifier in `provider/model` form (e.g. `openai/gpt-5`). */
  public abstract getModel(): string;

  /** System prompts prepended to every conversation, before per-request ones. */
  public abstract getSystemPrompts(): string[];

  /** Tool classes made available to the model for function calling. */
  public abstract getTools(): AiToolClassType[];

  /** Middleware classes applied to every run, before per-request ones. */
  public abstract getMiddlewares(): AiMiddlewareClassType[];

  /** Skill classes the chat can draw on — each a set of instructions plus its tools. */
  public abstract getSkills(): AiSkillClassType[];

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

  /**
   * Ask the model which of the chat's skills a request calls for.
   *
   * Only the routing surface is sent — each skill's {@link ISkill.getName} and
   * {@link ISkill.getWhenToUse} — so the judgement costs two lines per skill
   * instead of every procedure. What comes back are the skill classes worth
   * putting in play: hand them to {@link Chat.run} or {@link Chat.stream} as
   * `skills` and only their instructions and tools are paid for on the run.
   *
   * The judgement is its own call — no tools, no middleware, no per-request
   * sampling options — so nothing the chat does on a real run can steer it.
   * Returns an empty array when the chat declares no skills, or when the model
   * judges that none of them fit.
   *
   * @example
   * ```ts
   * const skills = await chat.judge({ prompt });
   * const reply = await chat.run({ prompt, skills });
   * ```
   */
  public async judge(input?: ChatInputType): Promise<AiSkillClassType[]> {
    const entries = this.resolveSkillEntries(input);
    if (entries.length === 0) return [];

    const options = createChatOptions({
      adapter: createAdapter(this.getModel()),
      messages: buildMessages(input),
      systemPrompts: buildJudgePrompt(entries.map(({ skill }) => skill)),
      conversationId: input?.conversationId,
      abortController: input?.abortController,
      context: input?.context,
    });

    const { names } = (await chat({
      ...options,
      outputSchema: skillJudgementSchema,
      stream: false,
    })) as SkillJudgementType;

    return entries.filter(({ skill }) => isJudged(skill, names)).map(({ Skill }) => Skill);
  }

  /** Assemble the shared {@link chat} options from the subclass and request input. */
  private buildOptions(input?: ChatInputType) {
    const skills = this.resolveSkills(input);
    const tools = this.resolveTools(input, skills);

    return createChatOptions({
      adapter: createAdapter(this.getModel()),
      messages: buildMessages(input),
      systemPrompts: [...this.getSystemPrompts(), ...(input?.systemPrompts ?? []), ...buildSkillPrompts(skills)],
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

  /** Resolve the subclass and per-request skill classes, keeping each class next to its instance. */
  private resolveSkillEntries(input?: ChatInputType): SkillEntryType[] {
    const classes: AiSkillClassType[] = [...this.getSkills(), ...(input?.skills ?? [])];

    return [...new Set(classes)].map((Skill) => ({ Skill, skill: container.get<ISkill>(Skill) }));
  }

  /** Resolve the subclass and per-request skill classes to instances. */
  private resolveSkills(input?: ChatInputType): ISkill[] {
    return this.resolveSkillEntries(input).map(({ skill }) => skill);
  }

  /**
   * Resolve the subclass and per-request tool classes to instances, along with
   * the tools the resolved skills call — a skill's procedure is worthless if the
   * model can't reach its tools. Classes are deduplicated, so a tool listed both
   * on the chat and inside a skill is registered once.
   */
  private resolveTools(input: ChatInputType | undefined, skills: ISkill[]): ITool[] {
    const classes: AiToolClassType[] = [
      ...this.getTools(),
      ...(input?.tools ?? []),
      ...skills.flatMap((skill) => skill.getTools()),
    ];

    return [...new Set(classes)].map((Tool) => container.get<ITool>(Tool));
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
