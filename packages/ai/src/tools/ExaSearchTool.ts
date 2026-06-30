import Exa from "exa-js";
import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { Assert, type AssertType } from "@talosjs/validation";
import { decorator } from "../decorators";
import type { ITool } from "../types";

/** Search type accepted by Exa — trades latency for depth. */
export type ExaSearchType = "auto" | "fast" | "deep-lite" | "deep" | "deep-reasoning" | "instant";

/** Data category Exa can bias the search toward. */
export type ExaCategory =
  | "company"
  | "research paper"
  | "news"
  | "pdf"
  | "personal site"
  | "financial report"
  | "people";

/** Arguments the model supplies when calling the Exa web search tool. */
export type ExaSearchInputType = {
  /** Free-text query to search the web for. */
  query: string;
  /** Maximum number of results to return. Defaults to {@link DEFAULT_NUM_RESULTS}. */
  numResults?: number;
  /** Search strategy: `auto` (default) balances depth and latency; `fast`/`instant` minimize latency. */
  type?: ExaSearchType;
  /** Bias results toward a single data category. */
  category?: ExaCategory;
  /** Only return results from these domains. */
  includeDomains?: string[];
  /** Never return results from these domains. */
  excludeDomains?: string[];
};

/** Compact result projection returned by {@link ExaSearchTool} — only model-useful fields. */
export type ExaSearchResultType = {
  title?: string;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  highlights?: string[];
  text?: string;
};

const DEFAULT_NUM_RESULTS = 5;
const MAX_NUM_RESULTS = 10;

/**
 * Function-calling tool that searches the web with Exa.
 *
 * The model supplies a `query` (and optionally `numResults`, `type`, `category`,
 * and domain filters); the tool delegates to the Exa SDK's `search` method —
 * requesting per-result highlights — and returns a trimmed-down projection of
 * each result so the model isn't handed the full Exa payload.
 *
 * The Exa client reads its key from {@link AppEnv.SEARCH_EXA_API_KEY} and is
 * created lazily on first use so tool registration never requires the key.
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class ResearchChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You research topics on the web."];
 *   public getTools = () => [ExaWebSearchTool];
 *   public getMiddlewares = () => [];
 * }
 * ```
 */
@decorator.tool()
export class ExaSearchTool implements ITool<unknown, Promise<ExaSearchResultType[]>> {
  private client: Exa | undefined;

  public constructor(@inject(AppEnv) private readonly env: AppEnv) {}

  // Created lazily so the missing-key failure surfaces at call time, not when
  // the DI container instantiates the singleton.
  private getClient = (): Exa => {
    this.client ??= new Exa(this.env.SEARCH_EXA_API_KEY);
    return this.client;
  };

  public getName = (): string => "exa_web_search";

  public getDescription = (): string =>
    "Search the web with Exa. Returns the most relevant pages for a query with their title, URL, published date, author, relevance score, and highlighted snippets. Optionally bias the search by type, category, or include/exclude specific domains.";

  public getInputSchema = (): AssertType =>
    Assert({
      query: "string > 0",
      "numResults?": "number > 0",
      "type?": "'auto' | 'fast' | 'deep-lite' | 'deep' | 'deep-reasoning' | 'instant'",
      "category?":
        "'company' | 'research paper' | 'news' | 'pdf' | 'personal site' | 'financial report' | 'people'",
      "includeDomains?": "string[]",
      "excludeDomains?": "string[]",
    });

  // `param` is validated against `getInputSchema` by the chat runtime before it
  // reaches here, so the narrowing cast is safe.
  public handler = async (param: unknown): Promise<ExaSearchResultType[]> => {
    const { query, numResults, type, category, includeDomains, excludeDomains } =
      param as ExaSearchInputType;

    const { results } = await this.getClient().search(query, {
      numResults: Math.min(numResults ?? DEFAULT_NUM_RESULTS, MAX_NUM_RESULTS),
      contents: { highlights: true },
      ...(type != null ? { type } : {}),
      ...(category != null ? { category } : {}),
      ...(includeDomains != null ? { includeDomains } : {}),
      ...(excludeDomains != null ? { excludeDomains } : {}),
    });

    return results.map(toWebSearchResult);
  };
}

/** Project an Exa search result down to the fields surfaced to the model. */
const toWebSearchResult = (result: {
  title?: string | null;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  highlights?: string[];
  text?: string;
}): ExaSearchResultType => ({
  url: result.url,
  ...(result.title != null ? { title: result.title } : {}),
  ...(result.publishedDate != null ? { publishedDate: result.publishedDate } : {}),
  ...(result.author != null ? { author: result.author } : {}),
  ...(result.score != null ? { score: result.score } : {}),
  ...(result.highlights != null && result.highlights.length > 0 ? { highlights: result.highlights } : {}),
  ...(result.text != null ? { text: result.text } : {}),
});
