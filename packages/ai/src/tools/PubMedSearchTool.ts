import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { Assert, type AssertType } from "@talosjs/validation";
import { AiException } from "../AiException";
import { decorator } from "../decorators";
import type { ITool } from "../types";

/** How PubMed orders the matched articles. */
export type PubMedSort = "relevance" | "pub_date";

/** Arguments the model supplies when calling the PubMed search tool. */
export type PubMedSearchInputType = {
  /** Free-text query, supporting PubMed's field tags and boolean syntax. */
  query: string;
  /** Maximum number of articles to return. Defaults to {@link DEFAULT_LIMIT}. */
  limit?: number;
  /** Result ordering. `relevance` (default) or `pub_date` (most recent first). */
  sort?: PubMedSort;
};

/** Compact article projection returned by {@link PubMedSearchTool} — only model-useful fields. */
export type PubMedSearchResultType = {
  pmid: string;
  url: string;
  title?: string;
  authors: string[];
  journal?: string;
  pubdate?: string;
  doi?: string;
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PUBMED_ARTICLE_BASE = "https://pubmed.ncbi.nlm.nih.gov";

/** Minimal shape of the ESearch JSON response we rely on. */
type ESearchResponse = {
  esearchresult?: { idlist?: string[] };
};

/** Minimal shape of a single ESummary document and the enclosing response. */
type ESummaryDoc = {
  uid?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  source?: string;
  fulljournalname?: string;
  pubdate?: string;
  articleids?: Array<{ idtype?: string; value?: string }>;
};
type ESummaryResponse = {
  result?: { uids?: string[] } & Record<string, ESummaryDoc>;
};

/**
 * Function-calling tool that searches biomedical literature on PubMed.
 *
 * The model supplies a `query` (and optionally `limit` / `sort`); the tool runs
 * NCBI's two-step E-utilities flow — `esearch` to resolve the query to PubMed
 * IDs, then `esummary` to fetch each article's metadata — and returns a
 * trimmed-down projection (PMID, title, authors, journal, publication date, DOI,
 * and a canonical PubMed URL) so the model isn't handed the full NCBI payload.
 *
 * PubMed needs no key, but an NCBI key from {@link AppEnv.SEARCH_PUBMED_API_KEY}
 * is forwarded when present to raise the request rate limit (3 → 10 req/s).
 *
 * @see https://www.ncbi.nlm.nih.gov/books/NBK25500/
 *
 * @example
 * ```ts
 * @decorator.chat()
 * class ResearchChat extends Chat {
 *   public getModel = () => "anthropic/claude-sonnet-4.5";
 *   public getSystemPrompts = () => ["You research biomedical literature."];
 *   public getTools = () => [PubMedSearchTool];
 *   public getMiddlewares = () => [];
 * }
 * ```
 */
@decorator.tool()
export class PubMedSearchTool implements ITool<unknown, Promise<PubMedSearchResultType[]>> {
  public constructor(@inject(AppEnv) private readonly env: AppEnv) {}

  public getName = (): string => "pubmed_search";

  public getDescription = (): string =>
    "Search PubMed for biomedical and life-sciences literature. Accepts PubMed query syntax (field tags, boolean operators) and returns the most relevant articles with their PMID, title, authors, journal, publication date, DOI, and PubMed URL.";

  public getInputSchema = (): AssertType =>
    Assert({
      query: "string > 0",
      "limit?": "number > 0",
      "sort?": "'relevance' | 'pub_date'",
    });

  public handler = async (param: unknown): Promise<PubMedSearchResultType[]> => {
    const { query, limit, sort } = param as PubMedSearchInputType;
    const max = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const search = await this.fetchJson<ESearchResponse>("esearch.fcgi", {
      term: query,
      retmax: String(max),
      sort: sort === "pub_date" ? "pub_date" : "relevance",
    });

    const ids = search.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    const summary = await this.fetchJson<ESummaryResponse>("esummary.fcgi", { id: ids.join(",") });
    const result = summary.result;
    if (!result) return [];

    // `result.uids` preserves the ranked order; each id keys into its document.
    return (result.uids ?? []).flatMap((uid) => {
      const doc = result[uid];
      return doc ? [toResult(uid, doc)] : [];
    });
  };

  private fetchJson = async <T>(endpoint: string, params: Record<string, string>): Promise<T> => {
    const url = new URL(`${EUTILS_BASE}/${endpoint}`);
    url.search = new URLSearchParams({ db: "pubmed", retmode: "json", ...params }).toString();
    const apiKey = this.env.SEARCH_PUBMED_API_KEY;
    if (apiKey) url.searchParams.set("api_key", apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      throw new AiException(
        `PubMed ${endpoint} request failed with status ${response.status}`,
        "PUBMED_REQUEST_FAILED",
        { status: response.status, endpoint },
      );
    }

    return (await response.json()) as T;
  };
}

/** Project an ESummary document down to the fields surfaced to the model. */
const toResult = (pmid: string, doc: ESummaryDoc): PubMedSearchResultType => {
  const journal = doc.fulljournalname ?? doc.source;
  const doi = doc.articleids?.find((a) => a.idtype === "doi")?.value;

  return {
    pmid,
    url: `${PUBMED_ARTICLE_BASE}/${pmid}/`,
    authors: (doc.authors ?? []).flatMap((a) => (a.name != null ? [a.name] : [])),
    ...(doc.title != null ? { title: doc.title } : {}),
    ...(journal != null ? { journal } : {}),
    ...(doc.pubdate != null ? { pubdate: doc.pubdate } : {}),
    ...(doi != null ? { doi } : {}),
  };
};
