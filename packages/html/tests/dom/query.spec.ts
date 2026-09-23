import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DomDocument, DomElement, DomSelection, fromUrl, HtmlException, load } from "@/index";

describe("query", () => {
  describe("load", () => {
    test("should parse a full document by default", () => {
      const $ = load("<p>x</p>");

      expect($.document).toBeInstanceOf(DomDocument);
      expect($.html()).toBe("<html><head></head><body><p>x</p></body></html>");
    });

    test("should parse an empty document without arguments", () => {
      expect(load().html()).toBe("<html><head></head><body></body></html>");
    });

    test("should parse a fragment", () => {
      expect(load("<p>x</p>", { fragment: true }).html()).toBe("<p>x</p>");
    });

    test("should wrap an existing document or node", () => {
      const $ = load("<p>x</p>", { fragment: true });

      expect(load($.document).document).toBe($.document);
      expect(load(new DomElement("hr")).html()).toBe("<hr>");
    });

    test("should expose the root selection", () => {
      const $ = load("<p>x</p>");

      expect($.root().get(0)).toBe($.document);
      expect($.root().find("p").length).toBe(1);
    });

    test("should return the whole text or the text of given nodes", () => {
      const $ = load("<title>T</title><p>a</p><p>b</p>");

      expect($.text()).toBe("Tab");
      expect($.text($("p"))).toBe("ab");
      expect($.text("p")).toBe("ab");
    });

    test("should return the outer HTML of given nodes", () => {
      const $ = load("<p>a</p><p>b</p>");

      expect($.html($("p"))).toBe("<p>a</p><p>b</p>");
      expect($.html("p")).toBe("<p>a</p><p>b</p>");
      expect($.html($("p").get(0) as DomElement)).toBe("<p>a</p>");
    });
  });

  describe("$()", () => {
    const $ = load('<ul id="list"><li>a</li><li>b</li></ul><p>c</p>');

    test("should return an empty selection for empty input", () => {
      expect($().length).toBe(0);
      expect($(null).length).toBe(0);
      expect($("").length).toBe(0);
    });

    test("should select from the document", () => {
      expect($("li")).toBeInstanceOf(DomSelection);
      expect($("li").length).toBe(2);
    });

    test("should select within a context", () => {
      expect($("li", "#list").length).toBe(2);
      expect($("li", "p").length).toBe(0);
      expect($("li", $("#list")).length).toBe(2);
      expect($("li", null).length).toBe(2);
    });

    test("should wrap nodes and selections", () => {
      const node = $("p").get(0) as DomElement;

      expect($(node).text()).toBe("c");
      expect($([node]).length).toBe(1);
      expect($($("li")).length).toBe(2);
    });

    test("should create nodes from HTML strings", () => {
      const created = $("<b>x</b><i>y</i>");

      expect(created.length).toBe(2);
      expect(created.text()).toBe("xy");
      expect(created.parent().length).toBe(0);
    });
  });

  describe("fromUrl", () => {
    let server: ReturnType<typeof Bun.serve>;

    beforeAll(() => {
      server = Bun.serve({
        port: 0,
        fetch: (request) => {
          const path = new URL(request.url).pathname;
          const latin1 = new Uint8Array([0x3c, 0x70, 0x3e, 0xe9, 0x3c, 0x2f, 0x70, 0x3e]);

          switch (path) {
            case "/missing":
              return new Response("Not found", { status: 404 });
            case "/latin1-header":
              return new Response(latin1, { headers: { "content-type": "text/html; charset=iso-8859-1" } });
            case "/latin1-meta":
              return new Response(
                new Uint8Array([...new TextEncoder().encode('<meta charset="windows-1252">'), ...latin1]),
              );
            case "/unknown-charset":
              return new Response("<p>ok</p>", { headers: { "content-type": "text/html; charset=nope" } });
            case "/echo":
              return new Response(`<p>${request.headers.get("x-test")}</p>`);
            default:
              return new Response("<p>café</p>", { headers: { "content-type": "text/html" } });
          }
        },
      });
    });

    afterAll(() => {
      server.stop(true);
    });

    test("should fetch and load a page", async () => {
      const $ = await fromUrl(server.url);

      expect($("p").text()).toBe("café");
    });

    test("should accept parse and request options", async () => {
      const $ = await fromUrl(new URL("/echo", server.url).toString(), {
        fragment: true,
        requestInit: { headers: { "x-test": "hello" } },
      });

      expect($.html()).toBe("<p>hello</p>");
    });

    test("should decode with the charset from the content-type header", async () => {
      const $ = await fromUrl(new URL("/latin1-header", server.url));

      expect($("p").text()).toBe("é");
    });

    test("should decode with the charset from a meta tag", async () => {
      const $ = await fromUrl(new URL("/latin1-meta", server.url));

      expect($("p").text()).toBe("é");
    });

    test("should fall back to UTF-8 for unknown charsets", async () => {
      const $ = await fromUrl(new URL("/unknown-charset", server.url));

      expect($("p").text()).toBe("ok");
    });

    test("should throw an HtmlException for non-2xx responses", async () => {
      await expect(fromUrl(new URL("/missing", server.url))).rejects.toThrow(HtmlException);
      await expect(fromUrl(new URL("/missing", server.url))).rejects.toThrow("Request failed with status 404");
    });
  });
});
