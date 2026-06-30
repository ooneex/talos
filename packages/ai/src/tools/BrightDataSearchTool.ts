import { AppEnv } from "@talosjs/app-env";
import { bdclient } from "@brightdata/sdk";
import { inject } from "@talosjs/container";
import { Assert, type AssertType } from "@talosjs/validation";
import { AiException } from "../AiException";
import { decorator } from "../decorators";
import type { ITool } from "../types";

/** Arguments the model supplies when calling the Bright Data SERP search tool. */
export type BrightDataSearchInputType = {
  /** Free-text query to search Google for. */
  query: string;
  /** Maximum number of organic results to return. Defaults to {@link DEFAULT_NUM_RESULTS}. */
  limit?: number;
  /** Two-letter ISO country code to localize results (Google `gl`), e.g. `us`. */
  country?: string;
  /** Two-letter language code for results (Google `hl`), e.g. `en`. */
  language?: string;
};

/** Compact organic-result projection returned by {@link BrightDataSearchTool}. */
export type BrightDataSearchResultType = {
  title?: string;
  url: string;
  description?: string;
  rank?: number;
};

const DEFAULT_NUM_RESULTS = 5;
const MAX_NUM_RESULTS = 20;

/** A single organic entry from Bright Data's parsed (`brd_json`) Google SERP response. */
type SerpOrganic = {
  link?: string;
  url?: string;
  title?: string;
  description?: string;
  rank?: number;
  global_rank?: number;
};
type SerpResponse = { organic?: SerpOrganic[] };

/**
 * Function-calling tool that searches Google via Bright Data's SERP API.
 *
 * The model supplies a `query` (and optionally `limit`, `country`, `language`);
 * the tool delegates to the Bright Data SDK's `search.google` method, which
 * targets the SERP API with `brd_json=1` so the response is structured JSON, and
 * returns a trimmed-down projection of each organic result (title, URL,
 * description, rank) so the model isn't handed the full SERP payload.
 *
 * The SDK client reads its key from {@link AppEnv.SEARCH_BRIGHTDATA_API_KEY} and
 * an optional SERP zone from {@link AppEnv.SEARCH_BRIGHTDATA_SERP_ZONE} (the SDK
 * auto-creates a zone when omitted). It is built lazily on first use so tool
 * registration never requires the key.
 *
 * @see https://docs.brightdata.com/scraping-automation/serp-api/introduction
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class ResearchChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You research topics on the web."];
 *   public getTools = () => [BrightDataSearchTool];
 *   public getMiddlewares = () => [];
 * }
 * ```
 */
@decorator.tool()
export class BrightDataSearchTool implements ITool<unknown, Promise<BrightDataSearchResultType[]>> {
  private client: bdclient | undefined;

  public constructor(@inject(AppEnv) private readonly env: AppEnv) {}

  // Created lazily so the missing-key failure surfaces at call time, not when
  // the DI container instantiates the singleton.
  private getClient = (): bdclient => {
    if (!this.client) {
      const apiKey = this.env.SEARCH_BRIGHTDATA_API_KEY;
      const serpZone = this.env.SEARCH_BRIGHTDATA_SERP_ZONE;
      this.client = new bdclient({
        ...(apiKey != null ? { apiKey } : {}),
        ...(serpZone != null ? { serpZone } : {}),
      });
    }
    return this.client;
  };

  public getName = (): string => "brightdata_search";

  public getDescription = (): string =>
    "Search Google through Bright Data's SERP API. Returns the top organic results for a query with their title, URL, description, and rank. Optionally localize by country and language.";

  public getInputSchema = (): AssertType =>
    Assert({
      query: "string > 0",
      "limit?": "number > 0",
      "country?": "string",
      "language?": "string",
    });

  // `param` is validated against `getInputSchema` by the chat runtime before it
  // reaches here, so the narrowing cast is safe.
  public handler = async (param: unknown): Promise<BrightDataSearchResultType[]> => {
    const { query, limit, country, language } = param as BrightDataSearchInputType;
    const max = Math.min(limit ?? DEFAULT_NUM_RESULTS, MAX_NUM_RESULTS);

    // Default (`raw`) format returns the SERP body as a string; because the SDK
    // appends `brd_json=1` for Google, that body is the parsed JSON document.
    const raw = await this.getClient().search.google(query, {
      numResults: max,
      ...(country != null ? { country } : {}),
      ...(language != null ? { language } : {}),
    });

    let parsed: SerpResponse;
    try {
      parsed = JSON.parse(raw) as SerpResponse;
    } catch {
      throw new AiException("Bright Data SERP response was not valid JSON", "BRIGHT_DATA_INVALID_JSON", { query });
    }

    return (parsed.organic ?? []).slice(0, max).flatMap(toResult);
  };
}

/** Project a SERP organic entry down to the fields surfaced to the model. */
const toResult = (organic: SerpOrganic): BrightDataSearchResultType[] => {
  const url = organic.link ?? organic.url;
  if (url == null) return [];

  const rank = organic.rank ?? organic.global_rank;
  return [
    {
      url,
      ...(organic.title != null ? { title: organic.title } : {}),
      ...(organic.description != null ? { description: organic.description } : {}),
      ...(rank != null ? { rank } : {}),
    },
  ];
};
