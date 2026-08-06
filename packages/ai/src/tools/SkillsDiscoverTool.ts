import { container } from "@talosjs/container";
import { Assert, type AssertSchemaType } from "@talosjs/validation";
import type { ISkill, ITool } from "../types";

/** Arguments the model supplies when calling the skills discovery tool. */
export type SkillsDiscoverInputType = {
  /** Names of the skills to load, as listed in the catalogue. The primary path. */
  names?: string[];
  /** Free-text description of the task, matched against the catalogue when a name isn't known. */
  query?: string;
  /** Maximum number of skills a `query` may load. Defaults to {@link DEFAULT_LIMIT}. */
  limit?: number;
};

/** A skill loaded in full — the instructions the model follows, and the tools they call. */
export type SkillType = {
  name: string;
  description: string;
  whenToUse: string;
  /** Names of the tools the procedure calls, as the model must spell them in a tool call. */
  tools: string[];
  prompt: string;
};

export type SkillsDiscoverResultType = {
  /** The skills that matched, with their full instructions. */
  skills: SkillType[];
  /** Requested names that matched nothing, echoed back so a typo is visible. */
  unmatched: string[];
  /** Every skill name the chat declares, so a failed lookup is self-correcting. */
  available: string[];
};

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;
/** Tokens shorter than this carry no signal ("a", "of", "to") and are dropped when scoring. */
const MIN_TOKEN_LENGTH = 3;
/** A query token hitting the skill's own name is worth more than one hitting its prose. */
const NAME_MATCH_WEIGHT = 3;

/**
 * Function-calling tool that loads a chat's skills on demand.
 *
 * Skills are declared by the chat's `getSkills()`, but their instructions are
 * not pushed into the conversation up front — only a catalogue of names,
 * descriptions, and when-to-use lines is. This tool is the second half of that
 * progressive disclosure: the model calls it with the names it picked out of the
 * catalogue (or a free-text `query` when no name fits), and gets back the full
 * `getPrompt()` of each match, which lands in the context as the tool result.
 *
 * Only the matched prompts are paid for, so a chat can declare far more skills
 * than would fit in a system prompt. The skills' own tools stay registered on
 * the run throughout — discovery hands the model the procedure, not permission,
 * so each tool remains responsible for its own authorization.
 *
 * Unlike the other tools in this package it takes the chat's resolved skills as
 * a constructor argument, so {@link Chat} builds it per run rather than pulling
 * a container singleton.
 *
 * @example
 * ```ts
 * // The model sees `order-refund` in the catalogue and loads it before acting:
 * // → skills_discover({ names: ["order-refund"] })
 * // ← { skills: [{ name: "order-refund", prompt: "Look up the order first…", … }], … }
 * ```
 */
export class SkillsDiscoverTool implements ITool<unknown, SkillsDiscoverResultType> {
  public constructor(private readonly skills: ISkill[]) {}

  public getName = (): string => "skills_discover";

  public getDescription = (): string =>
    "Load the full instructions for one or more of the skills listed in the skills catalogue. Pass `names` with the exact skill names that fit the request, or `query` describing the task when no listed name obviously matches. Call this before following a skill — the catalogue only summarizes what each one covers.";

  public getInputSchema = (): AssertSchemaType =>
    Assert({
      "names?": "string[]",
      "query?": "string > 0",
      "limit?": "number > 0",
    });

  public handler = (param: unknown): SkillsDiscoverResultType => {
    const { names, query, limit } = (param ?? {}) as SkillsDiscoverInputType;
    const requested = names ?? [];
    const byName = new Map(this.skills.map((skill) => [normalize(skill.getName()), skill]));

    const named = requested.flatMap((name) => {
      const skill = byName.get(normalize(name));

      return skill ? [skill] : [];
    });
    const unmatched = requested.filter((name) => !byName.has(normalize(name)));

    const matched = query
      ? [...named, ...this.search(query, named, Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT))]
      : named;

    return {
      skills: matched.map(toSkill),
      unmatched,
      available: this.skills.map((skill) => skill.getName()),
    };
  };

  /** Rank the not-yet-matched skills against a free-text query, best first. */
  private search = (query: string, exclude: ISkill[], limit: number): ISkill[] => {
    const tokens = [...new Set(tokenize(query))];
    if (tokens.length === 0) return [];

    return this.skills
      .filter((skill) => !exclude.includes(skill))
      .map((skill) => ({ skill, score: score(skill, tokens) }))
      .filter((ranked) => ranked.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((ranked) => ranked.skill);
  };
}

/** Names are matched case- and whitespace-insensitively — the model retypes them from the catalogue. */
const normalize = (value: string): string => value.trim().toLowerCase();

/** Split prose into the lowercase words worth matching on. */
const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);

/** Count the query tokens a skill's catalogue entry answers to, weighting its name higher. */
const score = (skill: ISkill, tokens: string[]): number => {
  const name = new Set(tokenize(skill.getName()));
  const prose = new Set(tokenize(`${skill.getDescription()} ${skill.getWhenToUse()}`));

  return tokens.reduce((total, token) => {
    if (name.has(token)) return total + NAME_MATCH_WEIGHT;

    return prose.has(token) ? total + 1 : total;
  }, 0);
};

/** Project a skill down to what the model needs to carry it out. */
const toSkill = (skill: ISkill): SkillType => ({
  name: skill.getName(),
  description: skill.getDescription(),
  whenToUse: skill.getWhenToUse(),
  tools: skill.getTools().map((Tool) => container.get<ITool>(Tool).getName()),
  prompt: skill.getPrompt(),
});
