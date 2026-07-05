import { beforeEach, describe, expect, mock, test } from "bun:test";

// Records every `search.google` call so assertions can inspect the query and
// options the tool assembles, and replays `searchResult` back as the response.
const googleCalls: Array<{ query: string; options: Record<string, unknown> }> = [];
let searchResult = "";

const google = mock((query: string, options: Record<string, unknown>) => {
  googleCalls.push({ query, options });
  return Promise.resolve(searchResult);
});

// Records the options the tool hands to the bdclient so injection can be asserted.
const clientOptions: Array<Record<string, unknown>> = [];

// Stand in for the real Bright Data SDK so the tool can be constructed without
// an API key. `bdclient` is a named export exposing `search.google`.
mock.module("@brightdata/sdk", () => ({
  bdclient: class {
    search = { google };
    constructor(options: Record<string, unknown>) {
      clientOptions.push(options);
    }
  },
}));

// `inject` is a no-op decorator here, so `AppEnv` need only be a stub the test
// supplies directly through the constructor.
mock.module("@talosjs/app-env", () => ({ AppEnv: class {} }));

const { BrightDataSearchTool } = await import("@/tools/BrightDataSearchTool");

const makeTool = (env: Record<string, string | undefined> = { SEARCH_BRIGHTDATA_API_KEY: "brd-key" }) =>
  new BrightDataSearchTool(env as never);

const serp = (organic: unknown[]) => JSON.stringify({ organic });

beforeEach(() => {
  googleCalls.length = 0;
  clientOptions.length = 0;
  searchResult = serp([]);
});

describe("BrightDataSearchTool metadata", () => {
  test("should expose a stable name and a description", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("brightdata_search");
    expect(tool.getDescription()).toContain("Search Google");
  });

  test("should accept a query and reject an empty one", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ query: "best laptops 2026" })).toEqual({ query: "best laptops 2026" });
    expect((schema({ query: "" }) as { summary?: string }).summary).toBeString();
    expect((schema({}) as { summary?: string }).summary).toBeString();
  });
});

describe("BrightDataSearchTool.handler", () => {
  test("should search with the default result count", async () => {
    await makeTool().handler({ query: "best laptops 2026" });

    expect(googleCalls[0]?.query).toBe("best laptops 2026");
    expect(googleCalls[0]?.options).toEqual({ numResults: 5 });
  });

  test("should forward country and language and cap the result count", async () => {
    await makeTool().handler({ query: "ai", limit: 100, country: "us", language: "en" });

    expect(googleCalls[0]?.options).toEqual({ numResults: 20, country: "us", language: "en" });
  });

  test("should build the client with the injected api key and serp zone", async () => {
    await makeTool({ SEARCH_BRIGHTDATA_API_KEY: "k1", SEARCH_BRIGHTDATA_SERP_ZONE: "z1" }).handler({
      query: "ai",
    });

    expect(clientOptions[0]).toEqual({ apiKey: "k1", serpZone: "z1" });
  });

  test("should omit absent client options", async () => {
    await makeTool({}).handler({ query: "ai" });

    expect(clientOptions[0]).toEqual({});
  });

  test("should reuse a single client across calls", async () => {
    const tool = makeTool();
    await tool.handler({ query: "a" });
    await tool.handler({ query: "b" });

    expect(clientOptions).toHaveLength(1);
  });

  test("should project organic results down to model-useful fields", async () => {
    searchResult = serp([
      {
        link: "https://example.com/pizza",
        title: "Best Pizza in NYC",
        description: "Authentic New York slices.",
        rank: 1,
      },
    ]);

    const [result] = await makeTool().handler({ query: "pizza" });

    expect(result).toEqual({
      url: "https://example.com/pizza",
      title: "Best Pizza in NYC",
      description: "Authentic New York slices.",
      rank: 1,
    });
  });

  test("should fall back to url/global_rank and drop entries without a link", async () => {
    searchResult = serp([{ url: "https://example.com/a", global_rank: 2 }, { title: "No link here" }]);

    const results = await makeTool().handler({ query: "ai" });

    expect(results).toEqual([{ url: "https://example.com/a", rank: 2 }]);
  });

  test("should cap projected results at the requested limit", async () => {
    searchResult = serp([{ link: "https://a" }, { link: "https://b" }, { link: "https://c" }]);

    const results = await makeTool().handler({ query: "ai", limit: 2 });

    expect(results.map((r) => r.url)).toEqual(["https://a", "https://b"]);
  });

  test("should return an empty list when there are no organic results", async () => {
    searchResult = JSON.stringify({});

    expect(await makeTool().handler({ query: "ai" })).toEqual([]);
  });

  test("should throw when the SERP response is not valid JSON", async () => {
    searchResult = "<html>not json</html>";

    await expect(makeTool().handler({ query: "ai" })).rejects.toThrow("not valid JSON");
  });
});
