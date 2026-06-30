import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Records every fetched URL and request init so assertions can inspect the
// Action API requests the tool assembles, and replays a queued JSON body per call.
const calls: Array<{ url: string; init?: RequestInit | undefined }> = [];
// biome-ignore lint/suspicious/noExplicitAny: tests queue arbitrary JSON bodies
let responses: any[] = [];
let nextOk = true;

const realFetch = globalThis.fetch;
const mockFetch = mock((url: URL | string, init?: RequestInit) => {
  calls.push({ url: url.toString(), init });
  return Promise.resolve({
    ok: nextOk,
    status: nextOk ? 200 : 503,
    json: () => Promise.resolve(responses.shift() ?? {}),
  } as Response);
});

const { WikipediaSearchTool } = await import("@/tools/WikipediaSearchTool");

const makeTool = () => new WikipediaSearchTool();

// Queues the single search body the next handler call will consume.
const queueSearch = (search: Record<string, unknown>[]) => {
  responses = [{ query: { search } }];
};

const lastUrl = () => new URL(calls[calls.length - 1]?.url ?? "");

beforeEach(() => {
  calls.length = 0;
  responses = [];
  nextOk = true;
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("WikipediaSearchTool metadata", () => {
  test("should expose a stable name and a description", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("wikipedia_search");
    expect(tool.getDescription()).toContain("Wikipedia");
  });

  test("should accept a query and reject an empty or missing one", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ query: "alan turing" })).toEqual({ query: "alan turing" });
    expect((schema({ query: "" }) as { summary?: string }).summary).toBeString();
    expect((schema({}) as { summary?: string }).summary).toBeString();
  });

  test("should accept an agent and reject an empty one", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ query: "ai", agent: "Bot/1.0" })).toEqual({ query: "ai", agent: "Bot/1.0" });
    expect((schema({ query: "ai", agent: "" }) as { summary?: string }).summary).toBeString();
  });
});

describe("WikipediaSearchTool.handler", () => {
  test("should query the English api with the default limit", async () => {
    queueSearch([{ pageid: 1, title: "Alan Turing" }]);

    await makeTool().handler({ query: "alan turing" });

    const url = lastUrl();
    expect(url.origin).toBe("https://en.wikipedia.org");
    expect(url.pathname).toBe("/w/api.php");
    expect(url.searchParams.get("action")).toBe("query");
    expect(url.searchParams.get("list")).toBe("search");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("srsearch")).toBe("alan turing");
    expect(url.searchParams.get("srlimit")).toBe("5");
  });

  test("should cap the limit at the maximum", async () => {
    queueSearch([{ pageid: 1, title: "Alan Turing" }]);

    await makeTool().handler({ query: "ai", limit: 100 });

    expect(lastUrl().searchParams.get("srlimit")).toBe("20");
  });

  test("should target the requested language edition", async () => {
    queueSearch([{ pageid: 1, title: "Alan Turing" }]);

    await makeTool().handler({ query: "ia", language: "FR" });

    expect(lastUrl().origin).toBe("https://fr.wikipedia.org");
  });

  test("should send a descriptive User-Agent header by default", async () => {
    queueSearch([{ pageid: 1, title: "Alan Turing" }]);

    await makeTool().handler({ query: "ai" });

    const headers = calls[calls.length - 1]?.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Talos");
  });

  test("should send the provided agent as the User-Agent header", async () => {
    queueSearch([{ pageid: 1, title: "Alan Turing" }]);

    await makeTool().handler({ query: "ai", agent: "MyResearchBot/2.0 (https://example.com)" });

    const headers = calls[calls.length - 1]?.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("MyResearchBot/2.0 (https://example.com)");
  });

  test("should project hits to model-useful fields with a clean snippet and article URL", async () => {
    queueSearch([
      {
        pageid: 1208,
        title: "Alan Turing",
        snippet: '<span class="searchmatch">Alan</span> Turing was a &quot;British&quot; mathematician &amp; logician.',
        wordcount: 12345,
        ns: 0,
      },
    ]);

    const [result] = await makeTool().handler({ query: "alan turing" });

    expect(result).toEqual({
      pageid: 1208,
      title: "Alan Turing",
      url: "https://en.wikipedia.org/wiki/Alan_Turing",
      snippet: 'Alan Turing was a "British" mathematician & logician.',
      wordcount: 12345,
    });
  });

  test("should omit an empty snippet and absent fields", async () => {
    queueSearch([{ pageid: 42, title: "Answer", snippet: "<span></span>" }]);

    const [result] = await makeTool().handler({ query: "answer" });

    expect(result).toEqual({
      pageid: 42,
      title: "Answer",
      url: "https://en.wikipedia.org/wiki/Answer",
    });
  });

  test("should encode titles with spaces and special characters", async () => {
    queueSearch([{ pageid: 7, title: "C++ (programming language)" }]);

    const [result] = await makeTool().handler({ query: "cpp" });

    expect(result?.url).toBe("https://en.wikipedia.org/wiki/C%2B%2B_(programming_language)");
  });

  test("should skip hits missing a pageid or title", async () => {
    queueSearch([{ title: "No id" }, { pageid: 9 }, { pageid: 10, title: "Kept" }]);

    const results = await makeTool().handler({ query: "ai" });

    expect(results).toEqual([
      {
        pageid: 10,
        title: "Kept",
        url: "https://en.wikipedia.org/wiki/Kept",
      },
    ]);
  });

  test("should return an empty list when there are no matches", async () => {
    queueSearch([]);

    expect(await makeTool().handler({ query: "nothing matches here" })).toEqual([]);
  });

  test("should throw when the search request fails", async () => {
    nextOk = false;
    responses = [{}];

    await expect(makeTool().handler({ query: "ai" })).rejects.toThrow("Wikipedia search request failed");
  });
});
