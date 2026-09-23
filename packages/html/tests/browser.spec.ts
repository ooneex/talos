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
          "/": new Response("<!doctype html><title>html</title>", { headers: { "content-type": "text/html" } }),
          "/html.js": new Response(script, { headers: { "content-type": "text/javascript" } }),
          "/page": new Response(
            '<h1 id="remote">Remote</h1><p><a href="/next">Next</a></p><img src="/pic.png" alt="Pic"><video src="/vid.mp4" controls></video><ul><li><input type="checkbox" checked> Done</li></ul>',
            { headers: { "content-type": "text/html; charset=utf-8" } },
          ),
          "/missing": new Response("Not found", { status: 404 }),
        },
      });
    });

    afterAll(() => {
      server.stop(true);
    });

    test("should parse, extract, convert and fetch HTML", async () => {
      await using view = new Bun.WebView({ width: 800, height: 600 });
      await view.navigate(server.url.href);

      const result = JSON.parse(
        await view.evaluate(`(async () => {
          const { Html, HtmlException, load } = await import("/html.js");
          const html = new Html("<h1 id=hello>Hello <em>world</em></h1><p>Some <strong>bold</strong> and a <a href=/link>link</a>.</p><img src=image.png alt=Alt><video src=video.mp4 controls></video><ul><li><input type=checkbox checked> Done</li></ul>");
          const remote = await new Html().loadUrl("/page");
          const $ = load("<article id=main><p class=lead>Hi</p></article>", { fragment: true });
          let error = null;
          try {
            await new Html().loadUrl("/missing");
          } catch (caught) {
            error = caught instanceof HtmlException ? caught.key : String(caught);
          }
          return JSON.stringify({
            hasBun: typeof Bun !== "undefined",
            content: html.getContent(),
            markup: html.getHtml(),
            markdown: html.toMarkdown(),
            headings: html.getHeadings(),
            links: html.getLinks(),
            images: html.getImages(),
            videos: html.getVideos(),
            tasks: html.getTasks(),
            remote: {
              headings: remote.getHeadings(),
              links: remote.getLinks(),
              images: remote.getImages(),
              videos: remote.getVideos(),
              tasks: remote.getTasks(),
            },
            selection: { id: $("article").attr("id"), text: $(".lead").text() },
            error,
          });
        })()`),
      );

      expect(result.hasBun).toBe(false);
      expect(result.content).toContain("Hello world");
      expect(result.markup).toContain("<h1");
      expect(result.markdown).toBe(
        "# Hello _world_\n\nSome **bold** and a [link](/link).\n\n![Alt](image.png)\n\n- [x] Done",
      );
      expect(result.headings).toEqual([{ level: 1, text: "Hello world", id: "hello" }]);
      expect(result.links).toEqual([{ href: "/link", text: "link", title: null, target: null, rel: null }]);
      expect(result.images).toEqual([{ src: "image.png", alt: "Alt", title: null, width: null, height: null }]);
      expect(result.videos[0]).toMatchObject({ src: "video.mp4", controls: true, sources: [] });
      expect(result.tasks).toEqual([{ text: "Done", checked: true }]);
      expect(result.remote).toEqual({
        headings: [{ level: 1, text: "Remote", id: "remote" }],
        links: [{ href: "/next", text: "Next", title: null, target: null, rel: null }],
        images: [{ src: "/pic.png", alt: "Pic", title: null, width: null, height: null }],
        videos: [
          {
            src: "/vid.mp4",
            poster: null,
            width: null,
            height: null,
            controls: true,
            autoplay: false,
            loop: false,
            muted: false,
            sources: [],
          },
        ],
        tasks: [{ text: "Done", checked: true }],
      });
      expect(result.selection).toEqual({ id: "main", text: "Hi" });
      expect(result.error).toBe("HTML_FETCH_FAILED");
    });
  });
});
