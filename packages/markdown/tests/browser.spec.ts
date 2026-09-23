import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";

const canUseWebView =
  typeof Bun.WebView === "function" && (process.platform === "darwin" || !!process.env.BUN_CHROME_PATH);

const bundle = async (): Promise<string> => {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dir, "../src/index.ts")],
    target: "browser",
    format: "esm",
  });

  if (!build.success) {
    throw new AggregateError(build.logs, "Browser build failed");
  }

  return (await build.outputs[0]?.text()) ?? "";
};

describe("browser", () => {
  let script = "";

  beforeAll(async () => {
    script = await bundle();
  });

  test("should bundle without Bun or Node runtime APIs", () => {
    expect(script.length).toBeGreaterThan(0);
    expect(script).not.toMatch(/\bBun\.|from ["']bun["']|["']node:|\bprocess\.|\brequire\(/);
  });

  describe.skipIf(!canUseWebView)("in a real browser engine", () => {
    let server: ReturnType<typeof Bun.serve>;

    beforeAll(() => {
      server = Bun.serve({
        port: 0,
        routes: {
          "/": new Response("<!doctype html><title>markdown</title>", { headers: { "content-type": "text/html" } }),
          "/markdown.js": new Response(script, { headers: { "content-type": "text/javascript" } }),
          "/doc.md": new Response("---\ntitle: Remote\n---\n# Fetched\n\n- [x] ok"),
        },
      });
    });

    afterAll(() => {
      server.stop(true);
    });

    test("should parse, render, extract and fetch Markdown", async () => {
      await using view = new Bun.WebView({ width: 800, height: 600 });
      await view.navigate(server.url.href);

      const result = JSON.parse(
        await view.evaluate(`(async () => {
          const { Markdown, MarkdownException } = await import("/markdown.js");
          const markdown = new Markdown("---\\ntags: [a, b]\\n---\\n# Hello *world*\\n\\n| a |\\n|---|\\n| 1 |\\n\\n\`\`\`ts\\nconst x = 1;\\n\`\`\`");
          const remote = await new Markdown().loadUrl("/doc.md");
          let error = null;
          try {
            new Markdown("---\\n- list\\n---");
          } catch (caught) {
            error = caught instanceof MarkdownException ? caught.key : String(caught);
          }
          return JSON.stringify({
            hasBun: typeof Bun !== "undefined",
            html: markdown.toHtml(),
            frontMatter: markdown.getFrontMatter(),
            headings: markdown.getHeadings(),
            codeBlocks: markdown.getCodeBlocks(),
            content: markdown.getContent(),
            remote: { frontMatter: remote.getFrontMatter(), headings: remote.getHeadings(), tasks: remote.getTasks() },
            error,
          });
        })()`),
      );

      expect(result.hasBun).toBe(false);
      expect(result.html).toContain('<h1 id="hello-world">Hello <em>world</em></h1>');
      expect(result.html).toContain("<td>1</td>");
      expect(result.frontMatter).toEqual({ tags: ["a", "b"] });
      expect(result.headings).toEqual([{ level: 1, text: "Hello world", id: "hello-world" }]);
      expect(result.codeBlocks).toEqual([{ language: "ts", code: "const x = 1;" }]);
      expect(result.content).toContain("Hello world");
      expect(result.remote).toEqual({
        frontMatter: { title: "Remote" },
        headings: [{ level: 1, text: "Fetched", id: "fetched" }],
        tasks: [{ text: "ok", checked: true }],
      });
      expect(result.error).toBe("MARKDOWN_FRONT_MATTER_INVALID");
    });
  });
});
