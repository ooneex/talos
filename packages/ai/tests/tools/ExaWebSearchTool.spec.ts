import { ExaSearchTool } from "@/tools/ExaSearchTool";
import { beforeEach, describe, expect, mock, test } from "bun:test";

// Records every `search` call so assertions can inspect the query and options
// the tool assembles, and replays `searchResult` back as the response.
const searchCalls: Array<{ query: string; options: Record<string, unknown> }> = [];
// biome-ignore lint/suspicious/noExplicitAny: tests stub arbitrary result shapes
let searchResult: { results: any[] } = { results: [] };

const search = mock((query: string, options: Record<string, unknown>) => {
  searchCalls.push({ query, options });
  return Promise.resolve(searchResult);
});

// Records the key the tool hands to the Exa client so injection can be asserted.
const exaKeys: Array<string | undefined> = [];

// Stand in for the real Exa SDK client so the tool can be constructed without an
// API key. The default export is the `Exa` class.
mock.module("exa-js", () => ({
  default: class {
    constructor(apiKey?: string) {
      exaKeys.push(apiKey);
    }
    search = search;
  },
}));

// `inject` is a no-op decorator here, so `AppEnv` need only be a stub the test
// supplies directly through the constructor.
mock.module("@talosjs/app-env", () => ({ AppEnv: class {} }));

const makeTool = (key: string | undefined = "exa-key") =>
  new ExaSearchTool({ SEARCH_EXA_API_KEY: key } as never);

beforeEach(() => {
  searchCalls.length = 0;
  exaKeys.length = 0;
  searchResult = { results: [] };
});

describe("ExaWebSearchTool metadata", () => {
  test("should expose a stable name and a description", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("exa_web_search");
    expect(tool.getDescription()).toContain("Search the web");
  });

  test("should accept a query and reject an empty one", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ query: "hottest AI startups" })).toEqual({ query: "hottest AI startups" });
    expect((schema({ query: "" }) as { summary?: string }).summary).toBeString();
    expect((schema({}) as { summary?: string }).summary).toBeString();
  });

  test("should reject an unknown search type", () => {
    const schema = makeTool().getInputSchema();

    expect((schema({ query: "ai", type: "turbo" }) as { summary?: string }).summary).toBeString();
  });
});

describe("ExaWebSearchTool.handler", () => {
  test("should search with the default result count and request highlights", async () => {
    await makeTool().handler({ query: "hottest AI startups" });

    expect(searchCalls[0]?.query).toBe("hottest AI startups");
    expect(searchCalls[0]?.options).toEqual({
      numResults: 5,
      contents: { highlights: true },
    });
  });

  test("should forward type, category and domain filters", async () => {
    await makeTool().handler({
      query: "ai",
      type: "fast",
      category: "news",
      includeDomains: ["example.com"],
      excludeDomains: ["spam.com"],
    });

    expect(searchCalls[0]?.options).toEqual({
      numResults: 5,
      contents: { highlights: true },
      type: "fast",
      category: "news",
      includeDomains: ["example.com"],
      excludeDomains: ["spam.com"],
    });
  });

  test("should cap the requested result count at the maximum", async () => {
    await makeTool().handler({ query: "ai", numResults: 50 });

    expect(searchCalls[0]?.options.numResults).toBe(10);
  });

  test("should build the Exa client with the injected SEARCH_EXA_API_KEY", async () => {
    await makeTool("injected-key").handler({ query: "ai" });

    expect(exaKeys).toEqual(["injected-key"]);
  });

  test("should project results down to model-useful fields", async () => {
    searchResult = {
      results: [
        {
          title: "Adept: Useful General Intelligence",
          id: "https://www.adept.ai/",
          url: "https://www.adept.ai/",
          publishedDate: "2024-01-16T00:00:00.000Z",
          author: "Adept",
          score: 0.92,
          highlights: ["Adept builds AI agents."],
          highlightScores: [0.84],
        },
      ],
    };

    const [result] = await makeTool().handler({ query: "ai" });

    expect(result).toEqual({
      title: "Adept: Useful General Intelligence",
      url: "https://www.adept.ai/",
      publishedDate: "2024-01-16T00:00:00.000Z",
      author: "Adept",
      score: 0.92,
      highlights: ["Adept builds AI agents."],
    });
  });

  test("should omit absent optional fields and empty highlights", async () => {
    searchResult = { results: [{ url: "https://bare.example" }] };

    const [result] = await makeTool().handler({ query: "ai" });

    expect(result).toEqual({ url: "https://bare.example" });
  });
});
