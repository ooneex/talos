import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Markdown, MarkdownException } from "@/index";

const DOCUMENT = `---
title: Getting started
tags:
  - bun
  - talos
---
# Getting Started

Read the [guide](https://talosjs.com/guide "Guide") or visit <https://bun.sh>.

![Logo](/logo.png "Talos logo")

## Tasks

- [x] Install Bun
- [ ] Write **docs**

\`\`\`ts
const answer = 42;
\`\`\`
`;

const catchError = async (callback: () => unknown): Promise<MarkdownException> => {
  try {
    await callback();
  } catch (error) {
    return error as MarkdownException;
  }
  throw new Error("Expected callback to throw");
};

describe("Markdown", () => {
  describe("constructor", () => {
    test("should create an empty document by default", () => {
      const markdown = new Markdown();

      expect(markdown.getMarkdown()).toBe("");
      expect(markdown.toHtml()).toBe("");
      expect(markdown.getContent()).toBe("");
      expect(markdown.getFrontMatter()).toEqual({});
    });

    test("should parse the markdown passed to the constructor", () => {
      expect(new Markdown("# Title").toHtml()).toBe('<h1 id="title">Title</h1>\n');
    });

    test("should forward parser options to the renderer", () => {
      const markdown = new Markdown("# Title\n\n| a |\n|---|\n| 1 |", { tables: false, headingIds: false });

      expect(markdown.toHtml()).not.toContain("<table>");
      expect(markdown.getHeadings()).toEqual([{ level: 1, text: "Title", id: null }]);
    });
  });

  describe("load", () => {
    test("should return the same instance and replace the previous document", () => {
      const markdown = new Markdown("# First");
      const result = markdown.load("# Second");

      expect(result).toBe(markdown);
      expect(markdown.getHeadings()).toEqual([{ level: 1, text: "Second", id: "second" }]);
    });

    test("should reset front matter when the new document has none", () => {
      const markdown = new Markdown("---\ntitle: Old\n---\nBody");
      markdown.load("Body");

      expect(markdown.getFrontMatter()).toEqual({});
    });
  });

  describe("front matter", () => {
    test("should parse and strip the leading YAML block", () => {
      const markdown = new Markdown(DOCUMENT);

      expect(markdown.getFrontMatter<{ title: string; tags: string[] }>()).toEqual({
        title: "Getting started",
        tags: ["bun", "talos"],
      });
      expect(markdown.getMarkdown().startsWith("# Getting Started")).toBe(true);
      expect(markdown.toHtml()).not.toContain("<hr");
    });

    test("should accept an empty block, CRLF line endings, a BOM and the ... terminator", () => {
      expect(new Markdown("---\n---\nBody").getFrontMatter()).toEqual({});
      expect(new Markdown("---\r\ntitle: Crlf\r\n---\r\nBody").getFrontMatter()).toEqual({ title: "Crlf" });
      expect(new Markdown("\uFEFF---\ntitle: Bom\n...\nBody").getFrontMatter()).toEqual({ title: "Bom" });
      expect(new Markdown("---\ntitle: Only\n---").getMarkdown()).toBe("");
    });

    test("should ignore a thematic break that is not at the start", () => {
      const markdown = new Markdown("Intro\n\n---\ntitle: nope\n---\n");

      expect(markdown.getFrontMatter()).toEqual({});
      expect(markdown.getMarkdown()).toBe("Intro\n\n---\ntitle: nope\n---\n");
    });

    test("should treat a block holding only comments as empty", () => {
      expect(new Markdown("---\n# just a comment\n---\nBody").getFrontMatter()).toEqual({});
    });

    test("should throw MarkdownException for invalid YAML", async () => {
      const error = await catchError(() => new Markdown("---\ntitle: [unclosed\n---\nBody"));

      expect(error).toBeInstanceOf(MarkdownException);
      expect(error.key).toBe("MARKDOWN_FRONT_MATTER_INVALID");
      expect(typeof error.data.error).toBe("string");
    });

    test("should throw MarkdownException when the YAML is not a map", async () => {
      const list = await catchError(() => new Markdown("---\n- a\n- b\n---\nBody"));
      const scalar = await catchError(() => new Markdown("---\njust text\n---\nBody"));

      expect(list.key).toBe("MARKDOWN_FRONT_MATTER_INVALID");
      expect(list.data).toEqual({ type: "array" });
      expect(scalar.data).toEqual({ type: "string" });
    });
  });

  describe("loadUrl", () => {
    const unreachableUrl = "http://127.0.0.1:1";
    const originalFetch = globalThis.fetch;
    let server: ReturnType<typeof Bun.serve>;

    beforeAll(() => {
      server = Bun.serve({
        port: 0,
        fetch: (request) =>
          new URL(request.url).pathname === "/missing"
            ? new Response("Not found", { status: 404, statusText: "Not Found" })
            : new Response("# Remote page\n\n[Next](/next)"),
      });
    });

    afterAll(() => {
      server.stop(true);
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    test("should fetch and load markdown from a string URL", async () => {
      const markdown = new Markdown();
      const result = await markdown.loadUrl(server.url.toString());

      expect(result).toBe(markdown);
      expect(markdown.getHeadings()).toEqual([{ level: 1, text: "Remote page", id: "remote-page" }]);
      expect(markdown.getLinks()).toEqual([{ href: "/next", text: "Next", title: null }]);
    });

    test("should accept a URL instance", async () => {
      const markdown = await new Markdown().loadUrl(new URL("/doc", server.url));

      expect(markdown.getContent()).toContain("Remote page");
    });

    test("should throw MarkdownException for a non-ok response", async () => {
      const url = new URL("/missing", server.url);
      const error = await catchError(() => new Markdown().loadUrl(url));

      expect(error).toBeInstanceOf(MarkdownException);
      expect(error.key).toBe("MARKDOWN_FETCH_FAILED");
      expect(error.data).toEqual({ url: url.toString(), error: "HTTP 404 Not Found" });
    });

    test("should throw MarkdownException for an unreachable URL", async () => {
      const error = await catchError(() => new Markdown().loadUrl(unreachableUrl));

      expect(error.message).toBe(`Failed to fetch URL: ${unreachableUrl}`);
      expect(error.data.url).toBe(unreachableUrl);
    });

    test("should stringify non-Error rejections", async () => {
      globalThis.fetch = (() => Promise.reject("offline")) as unknown as typeof fetch;
      const error = await catchError(() => new Markdown().loadUrl(unreachableUrl));

      expect(error.data.error).toBe("offline");
    });

    test("should keep the previous document when fetching fails", async () => {
      const markdown = new Markdown("# Kept");
      await catchError(() => markdown.loadUrl(unreachableUrl));

      expect(markdown.getHeadings()[0]?.text).toBe("Kept");
    });
  });

  describe("rendering", () => {
    test("should render GFM to HTML", () => {
      const html = new Markdown("~~gone~~\n\n| a | b |\n|---|---|\n| 1 | 2 |").toHtml();

      expect(html).toContain("<del>gone</del>");
      expect(html).toContain("<th>a</th>");
      expect(html).toContain("<td>2</td>");
    });

    test("should return the plain text content", () => {
      const content = new Markdown("# Title\n\nSome **bold** and `code`.").getContent();

      expect(content).toContain("Title");
      expect(content).toContain("Some bold and code.");
      expect(content).not.toContain("*");
    });
  });

  describe("extraction", () => {
    const markdown = new Markdown(DOCUMENT);

    test("should extract headings with their slug ids", () => {
      expect(markdown.getHeadings()).toEqual([
        { level: 1, text: "Getting Started", id: "getting-started" },
        { level: 2, text: "Tasks", id: "tasks" },
      ]);
    });

    test("should extract links including autolinks", () => {
      expect(markdown.getLinks()).toEqual([
        { href: "https://talosjs.com/guide", text: "guide", title: "Guide" },
        { href: "https://bun.sh", text: "https://bun.sh", title: null },
      ]);
    });

    test("should extract images", () => {
      expect(markdown.getImages()).toEqual([{ src: "/logo.png", alt: "Logo", title: "Talos logo" }]);
    });

    test("should return null for an image without alt text", () => {
      expect(new Markdown("![](/a.png)").getImages()).toEqual([{ src: "/a.png", alt: null, title: null }]);
    });

    test("should extract task list items", () => {
      expect(markdown.getTasks()).toEqual([
        { text: "Install Bun", checked: true },
        { text: "Write docs", checked: false },
      ]);
    });

    test("should extract code blocks with their raw content", () => {
      const blocks = new Markdown("```ts\nconst a = 1 < 2;\n```\n\n    indented\n\n```\n\n```").getCodeBlocks();

      expect(blocks).toEqual([
        { language: "ts", code: "const a = 1 < 2;" },
        { language: null, code: "indented" },
        { language: null, code: "" },
      ]);
    });

    test("should return empty arrays for a document without matches", () => {
      const empty = new Markdown("Just a paragraph.");

      expect(empty.getHeadings()).toEqual([]);
      expect(empty.getLinks()).toEqual([]);
      expect(empty.getImages()).toEqual([]);
      expect(empty.getTasks()).toEqual([]);
      expect(empty.getCodeBlocks()).toEqual([]);
    });
  });
});
