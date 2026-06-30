import { Assert, type AssertType } from "@talosjs/validation";
import { AiException } from "../AiException";
import { decorator } from "../decorators";
import type { ITool } from "../types";

/** Arguments the model supplies when calling the Wikipedia search tool. */
export type WikipediaSearchInputType = {
  /** Free-text query to search Wikipedia for. */
  query: string;
  /** Maximum number of articles to return. Defaults to {@link DEFAULT_LIMIT}. */
  limit?: number;
  /** Wikipedia language edition as a code (e.g. `en`, `fr`). Defaults to {@link DEFAULT_LANGUAGE}. */
  language?: string;
  /** `User-Agent` to send with the request. Defaults to {@link USER_AGENT}. */
  agent?: string;
};

/** Compact article projection returned by {@link WikipediaSearchTool} — only model-useful fields. */
export type WikipediaSearchResultType = {
  pageid: number;
  title: string;
  url: string;
  snippet?: string;
  wordcount?: number;
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const DEFAULT_LANGUAGE = "en";
const USER_AGENT = "TalosAI/1.0 (https://talos.com)";

/** Minimal shape of a single search hit and the enclosing Action API response. */
type WikiSearchHit = {
  pageid?: number;
  title?: string;
  snippet?: string;
  wordcount?: number;
};
type WikiSearchResponse = {
  query?: { search?: WikiSearchHit[] };
};

/**
 * Function-calling tool that searches articles on Wikipedia.
 *
 * The model supplies a `query` (and optionally `limit` / `language`); the tool
 * queries the MediaWiki Action API (`action=query&list=search`) of the chosen
 * language edition and returns a trimmed-down projection of each hit — page id,
 * title, a plain-text snippet (Wikipedia returns it with HTML highlight markup,
 * which the tool strips), word count, and a canonical article URL — so the model
 * isn't handed the full API payload.
 *
 * The MediaWiki API needs no key; a descriptive `User-Agent` is sent per
 * Wikimedia's API etiquette.
 *
 * @see https://www.mediawiki.org/wiki/API:Search
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class ResearchChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You research topics on Wikipedia."];
 *   public getTools = () => [WikipediaSearchTool];
 *   public getMiddlewares = () => [];
 * }
 * ```
 */
@decorator.tool()
export class WikipediaSearchTool implements ITool<unknown, Promise<WikipediaSearchResultType[]>> {
  public getName = (): string => "wikipedia_search";

  public getDescription = (): string =>
    "Search Wikipedia for encyclopedia articles. Returns the most relevant pages for a query with their title, a plain-text snippet, word count, and article URL. Optionally choose a language edition (e.g. `en`, `fr`).";

  public getInputSchema = (): AssertType =>
    Assert({
      query: "string > 0",
      "limit?": "number > 0",
      "language?": "string",
      "agent?": "string > 0",
    });

  public handler = async (param: unknown): Promise<WikipediaSearchResultType[]> => {
    const { query, limit, language, agent } = param as WikipediaSearchInputType;
    const max = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const lang = (language ?? DEFAULT_LANGUAGE).toLowerCase();

    const data = await this.fetchJson(lang, { srsearch: query, srlimit: String(max) }, agent);

    return (data.query?.search ?? []).flatMap((hit) => toResult(lang, hit));
  };

  private fetchJson = async (
    language: string,
    params: Record<string, string>,
    agent?: string,
  ): Promise<WikiSearchResponse> => {
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({ action: "query", list: "search", format: "json", ...params }).toString();

    const response = await fetch(url, { headers: { "User-Agent": agent ?? USER_AGENT } });
    if (!response.ok) {
      throw new AiException(
        `Wikipedia search request failed with status ${response.status}`,
        "WIKIPEDIA_REQUEST_FAILED",
        { status: response.status, language },
      );
    }

    return (await response.json()) as WikiSearchResponse;
  };
}

/** Project a search hit down to the fields surfaced to the model. */
const toResult = (language: string, hit: WikiSearchHit): WikipediaSearchResultType[] => {
  if (hit.pageid == null || hit.title == null) return [];

  const snippet = hit.snippet != null ? stripHtml(hit.snippet) : "";

  return [
    {
      pageid: hit.pageid,
      title: hit.title,
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
      ...(snippet.length > 0 ? { snippet } : {}),
      ...(hit.wordcount != null ? { wordcount: hit.wordcount } : {}),
    },
  ];
};

/** Strip the HTML highlight markup and decode the entities Wikipedia returns in snippets. */
const stripHtml = (value: string): string =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
