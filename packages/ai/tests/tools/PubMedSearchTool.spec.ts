import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Records every fetched URL so assertions can inspect the E-utilities requests
// the tool assembles, and replays a queued JSON body per call.
const fetchedUrls: string[] = [];
// biome-ignore lint/suspicious/noExplicitAny: tests queue arbitrary JSON bodies
let responses: any[] = [];
let nextOk = true;

const realFetch = globalThis.fetch;
const mockFetch = mock((url: URL | string) => {
  fetchedUrls.push(url.toString());
  return Promise.resolve({
    ok: nextOk,
    status: nextOk ? 200 : 503,
    json: () => Promise.resolve(responses.shift() ?? {}),
  } as Response);
});

// `inject` is a no-op decorator here, so `AppEnv` need only be a stub the test
// supplies directly through the constructor.
mock.module("@talosjs/app-env", () => ({ AppEnv: class {} }));

const { PubMedSearchTool } = await import("@/tools/PubMedSearchTool");

const makeTool = (key: string | undefined = undefined) =>
  new PubMedSearchTool({ SEARCH_PUBMED_API_KEY: key } as never);

// Queues the ESearch (idlist) then ESummary (result) bodies the next handler
// call will consume, in request order.
const queueSearch = (ids: string[], result: Record<string, unknown>) => {
  responses = [{ esearchresult: { idlist: ids } }, { result }];
};

const urlOf = (endpoint: string) => new URL(fetchedUrls.find((u) => u.includes(endpoint)) ?? "");

beforeEach(() => {
  fetchedUrls.length = 0;
  responses = [];
  nextOk = true;
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("PubMedSearchTool metadata", () => {
  test("should expose a stable name and a description", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("pubmed_search");
    expect(tool.getDescription()).toContain("Search PubMed");
  });

  test("should accept a query and reject an empty one", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ query: "crispr cancer" })).toEqual({ query: "crispr cancer" });
    expect((schema({ query: "" }) as { summary?: string }).summary).toBeString();
    expect((schema({}) as { summary?: string }).summary).toBeString();
  });

  test("should reject an unknown sort", () => {
    const schema = makeTool().getInputSchema();

    expect((schema({ query: "ai", sort: "citations" }) as { summary?: string }).summary).toBeString();
  });
});

describe("PubMedSearchTool.handler", () => {
  test("should esearch with the default limit and relevance sort", async () => {
    queueSearch(["1"], { uids: ["1"], "1": { uid: "1" } });

    await makeTool().handler({ query: "crispr cancer" });

    const search = urlOf("esearch.fcgi");
    expect(search.searchParams.get("db")).toBe("pubmed");
    expect(search.searchParams.get("retmode")).toBe("json");
    expect(search.searchParams.get("term")).toBe("crispr cancer");
    expect(search.searchParams.get("retmax")).toBe("5");
    expect(search.searchParams.get("sort")).toBe("relevance");
    expect(search.searchParams.get("api_key")).toBeNull();
  });

  test("should forward pub_date sort and cap the limit at the maximum", async () => {
    queueSearch(["1"], { uids: ["1"], "1": { uid: "1" } });

    await makeTool().handler({ query: "ai", sort: "pub_date", limit: 100 });

    const search = urlOf("esearch.fcgi");
    expect(search.searchParams.get("sort")).toBe("pub_date");
    expect(search.searchParams.get("retmax")).toBe("20");
  });

  test("should esummary the ids returned by esearch", async () => {
    queueSearch(["111", "222"], {
      uids: ["111", "222"],
      "111": { uid: "111" },
      "222": { uid: "222" },
    });

    await makeTool().handler({ query: "ai" });

    expect(urlOf("esummary.fcgi").searchParams.get("id")).toBe("111,222");
  });

  test("should forward the injected api key to every request", async () => {
    queueSearch(["1"], { uids: ["1"], "1": { uid: "1" } });

    await makeTool("ncbi-key").handler({ query: "ai" });

    expect(urlOf("esearch.fcgi").searchParams.get("api_key")).toBe("ncbi-key");
    expect(urlOf("esummary.fcgi").searchParams.get("api_key")).toBe("ncbi-key");
  });

  test("should short-circuit and skip esummary when no ids match", async () => {
    queueSearch([], {});

    const results = await makeTool().handler({ query: "nothing matches" });

    expect(results).toEqual([]);
    expect(fetchedUrls.some((u) => u.includes("esummary.fcgi"))).toBe(false);
  });

  test("should project summaries down to model-useful fields in ranked order", async () => {
    queueSearch(["30684591"], {
      uids: ["30684591"],
      "30684591": {
        uid: "30684591",
        title: "CRISPR-Cas9 for cancer therapy.",
        authors: [{ name: "Chen M" }, { name: "Mao A" }],
        source: "Cancer Lett",
        fulljournalname: "Cancer letters",
        pubdate: "2019 Apr 10",
        articleids: [
          { idtype: "pubmed", value: "30684591" },
          { idtype: "doi", value: "10.1016/j.canlet.2019.01.017" },
        ],
      },
    });

    const [result] = await makeTool().handler({ query: "crispr" });

    expect(result).toEqual({
      pmid: "30684591",
      url: "https://pubmed.ncbi.nlm.nih.gov/30684591/",
      title: "CRISPR-Cas9 for cancer therapy.",
      authors: ["Chen M", "Mao A"],
      journal: "Cancer letters",
      pubdate: "2019 Apr 10",
      doi: "10.1016/j.canlet.2019.01.017",
    });
  });

  test("should fall back to the source journal and omit absent fields", async () => {
    queueSearch(["1"], { uids: ["1"], "1": { uid: "1", source: "Cancer Lett" } });

    const [result] = await makeTool().handler({ query: "ai" });

    expect(result).toEqual({
      pmid: "1",
      url: "https://pubmed.ncbi.nlm.nih.gov/1/",
      authors: [],
      journal: "Cancer Lett",
    });
  });

  test("should throw when an E-utilities request fails", async () => {
    nextOk = false;
    responses = [{ esearchresult: { idlist: ["1"] } }];

    await expect(makeTool().handler({ query: "ai" })).rejects.toThrow("esearch.fcgi request failed");
  });
});
