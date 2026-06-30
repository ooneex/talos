import { beforeEach, describe, expect, mock, test } from "bun:test";

// Records every `search` call so assertions can inspect the query and options
// the tool assembles, and replays `searchResult` back as the response.
const searchCalls: Array<{ query: string; options: Record<string, unknown> }> = [];
// biome-ignore lint/suspicious/noExplicitAny: tests stub arbitrary result shapes
let searchResult: Record<string, any[]> = {};

const search = mock((query: string, options: Record<string, unknown>) => {
  searchCalls.push({ query, options });
  return Promise.resolve(searchResult);
});

// Records the key the tool hands to the Firecrawl client so injection can be asserted.
const firecrawlKeys: Array<string | undefined> = [];

// Stand in for the real Firecrawl SDK client so the tool can be constructed
// without an API key. `Firecrawl` is a named export.
mock.module("firecrawl", () => ({
  Firecrawl: class {
    constructor(config?: { apiKey?: string }) {
      firecrawlKeys.push(config?.apiKey);
    }
    search = search;
  },
}));

// `inject` is a no-op decorator here, so `AppEnv` need only be a stub the test
// supplies directly through the constructor.
mock.module("@talosjs/app-env", () => ({ AppEnv: class {} }));

const { FirecrawlSearchTool } = await import("@/tools/FirecrawlSearchTool");

const makeTool = (key: string | undefined = "fc-key") =>
  new FirecrawlSearchTool({ SEARCH_FIRECRAWL_API_KEY: key } as never);

beforeEach(() => {
  searchCalls.length = 0;
  firecrawlKeys.length = 0;
  searchResult = {};
});

describe("FirecrawlSearchTool metadata", () => {
  test("should expose a stable name and a description", () => {
    const tool = makeTool();

    expect(tool.getName()).toBe("firecrawl_search");
    expect(tool.getDescription()).toContain("Search the web");
  });

  test("should accept a query and reject an empty one", () => {
    const schema = makeTool().getInputSchema();

    expect(schema({ query: "hottest AI startups" })).toEqual({ query: "hottest AI startups" });
    expect((schema({ query: "" }) as { summary?: string }).summary).toBeString();
    expect((schema({}) as { summary?: string }).summary).toBeString();
  });

  test("should reject an unknown source", () => {
    const schema = makeTool().getInputSchema();

    expect((schema({ query: "ai", sources: ["video"] }) as { summary?: string }).summary).toBeString();
  });
});

describe("FirecrawlSearchTool.handler", () => {
  test("should search with the default limit", async () => {
    await makeTool().handler({ query: "hottest AI startups" });

    expect(searchCalls[0]?.query).toBe("hottest AI startups");
    expect(searchCalls[0]?.options).toEqual({ limit: 5 });
  });

  test("should forward sources, domain filters and location", async () => {
    await makeTool().handler({
      query: "ai",
      sources: ["web", "news"],
      includeDomains: ["example.com"],
      excludeDomains: ["spam.com"],
      location: "US",
    });

    expect(searchCalls[0]?.options).toEqual({
      limit: 5,
      sources: ["web", "news"],
      includeDomains: ["example.com"],
      excludeDomains: ["spam.com"],
      location: "US",
    });
  });

  test("should cap the requested limit at the maximum", async () => {
    await makeTool().handler({ query: "ai", limit: 50 });

    expect(searchCalls[0]?.options.limit).toBe(10);
  });

  test("should build the Firecrawl client with the injected SEARCH_FIRECRAWL_API_KEY", async () => {
    await makeTool("injected-key").handler({ query: "ai" });

    expect(firecrawlKeys).toEqual(["injected-key"]);
  });

  test("should project web, news and image results with their source", async () => {
    searchResult = {
      web: [
        {
          url: "https://www.adept.ai/",
          title: "Adept",
          description: "Adept builds AI agents.",
          category: "company",
        },
      ],
      news: [
        {
          url: "https://news.example/ai",
          title: "AI news",
          snippet: "Big AI news today.",
          date: "2024-01-16",
          imageUrl: "https://news.example/ai.png",
        },
      ],
      images: [{ url: "https://img.example", title: "Chart", imageUrl: "https://img.example/c.png" }],
    };

    const results = await makeTool().handler({ query: "ai" });

    expect(results).toEqual([
      {
        source: "web",
        url: "https://www.adept.ai/",
        title: "Adept",
        description: "Adept builds AI agents.",
        category: "company",
      },
      {
        source: "news",
        url: "https://news.example/ai",
        title: "AI news",
        description: "Big AI news today.",
        date: "2024-01-16",
        imageUrl: "https://news.example/ai.png",
      },
      {
        source: "images",
        url: "https://img.example",
        title: "Chart",
        imageUrl: "https://img.example/c.png",
      },
    ]);
  });

  test("should default to an empty list when no sources are returned", async () => {
    const results = await makeTool().handler({ query: "ai" });

    expect(results).toEqual([]);
  });

  test("should omit absent optional fields", async () => {
    searchResult = { web: [{ url: "https://bare.example" }] };

    const [result] = await makeTool().handler({ query: "ai" });

    expect(result).toEqual({ source: "web", url: "https://bare.example" });
  });
});
