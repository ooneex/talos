import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { Assert, type AssertType } from "@talosjs/validation";
import { Firecrawl } from "firecrawl";
import { decorator } from "../decorators";
import type { ITool } from "../types";

/** Result source Firecrawl can search — web pages, news, or images. */
export type FirecrawlSource = "web" | "news" | "images";

/** Arguments the model supplies when calling the Firecrawl search tool. */
export type FirecrawlSearchInputType = {
  /** Free-text query to search the web for. */
  query: string;
  /** Maximum number of results to return. Defaults to {@link DEFAULT_LIMIT}. */
  limit?: number;
  /** Which result sources to search. Defaults to web results only. */
  sources?: FirecrawlSource[];
  /** Only return results from these domains. */
  includeDomains?: string[];
  /** Never return results from these domains. */
  excludeDomains?: string[];
  /** Two-letter ISO country code to localize results, e.g. `US`. */
  location?: string;
};

/** Compact result projection returned by {@link FirecrawlSearchTool} — only model-useful fields. */
export type FirecrawlSearchResultType = {
  source: FirecrawlSource;
  url?: string;
  title?: string;
  description?: string;
  category?: string;
  date?: string;
  imageUrl?: string;
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

/**
 * Function-calling tool that searches the web with Firecrawl.
 *
 * The model supplies a `query` (and optionally `limit`, `sources`, domain
 * filters, and a `location`); the tool delegates to the Firecrawl SDK's `search`
 * method and returns a trimmed-down, source-tagged projection of each web, news,
 * and image result so the model isn't handed the full Firecrawl payload.
 *
 * The Firecrawl client reads its key from {@link AppEnv.SEARCH_FIRECRAWL_API_KEY}
 * and is created lazily on first use so tool registration never requires the key
 * (Firecrawl's `search` also works keyless on a rate-limited free tier).
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class ResearchChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You research topics on the web."];
 *   public getTools = () => [FirecrawlSearchTool];
 *   public getMiddlewares = () => [];
 * }
 * ```
 */
@decorator.tool()
export class FirecrawlSearchTool implements ITool<unknown, Promise<FirecrawlSearchResultType[]>> {
  private client: Firecrawl | undefined;

  public constructor(@inject(AppEnv) private readonly env: AppEnv) {}

  // Created lazily so the missing-key failure surfaces at call time, not when
  // the DI container instantiates the singleton.
  private getClient = (): Firecrawl => {
    const apiKey = this.env.SEARCH_FIRECRAWL_API_KEY;
    this.client ??= new Firecrawl(apiKey != null ? { apiKey } : undefined);
    return this.client;
  };

  public getName = (): string => "firecrawl_search";

  public getDescription = (): string =>
    "Search the web with Firecrawl. Returns the most relevant web pages, news, and images for a query with their URL, title, description, and (for news/images) date and image URL. Optionally restrict to specific sources, include/exclude domains, or localize by country.";

  public getInputSchema = (): AssertType =>
    Assert({
      query: "string > 0",
      "limit?": "number > 0",
      "sources?": "('web' | 'news' | 'images')[]",
      "includeDomains?": "string[]",
      "excludeDomains?": "string[]",
      "location?": "string",
    });

  // `param` is validated against `getInputSchema` by the chat runtime before it
  // reaches here, so the narrowing cast is safe.
  public handler = async (param: unknown): Promise<FirecrawlSearchResultType[]> => {
    const { query, limit, sources, includeDomains, excludeDomains, location } = param as FirecrawlSearchInputType;

    const data = await this.getClient().search(query, {
      limit: Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT),
      ...(sources != null ? { sources } : {}),
      ...(includeDomains != null ? { includeDomains } : {}),
      ...(excludeDomains != null ? { excludeDomains } : {}),
      ...(location != null ? { location } : {}),
    });

    // Without `scrapeOptions` the SDK returns the lightweight result shapes
    // (not scraped `Document`s), so the cast to {@link RawResult} is safe.
    return [
      ...(data.web ?? []).map((r) => toResult("web", r as RawResult)),
      ...(data.news ?? []).map((r) => toResult("news", r as RawResult)),
      ...(data.images ?? []).map((r) => toResult("images", r as RawResult)),
    ];
  };
}

/** A lightweight Firecrawl search result before scraping — fields vary by source. */
type RawResult = {
  url?: string;
  title?: string;
  description?: string;
  snippet?: string;
  category?: string;
  date?: string;
  imageUrl?: string;
};

/** Project a raw Firecrawl result down to the source-tagged fields surfaced to the model. */
const toResult = (source: FirecrawlSource, result: RawResult): FirecrawlSearchResultType => {
  const description = result.description ?? result.snippet;
  return {
    source,
    ...(result.url != null ? { url: result.url } : {}),
    ...(result.title != null ? { title: result.title } : {}),
    ...(description != null ? { description } : {}),
    ...(result.category != null ? { category: result.category } : {}),
    ...(result.date != null ? { date: result.date } : {}),
    ...(result.imageUrl != null ? { imageUrl: result.imageUrl } : {}),
  };
};
