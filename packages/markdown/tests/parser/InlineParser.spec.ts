import { describe, expect, test } from "bun:test";
import { InlineParser, resolveOptions } from "@/index";

const render = (source: string, options = {}): string =>
  new InlineParser(resolveOptions(options), new Map([["REF", { href: "/ref", title: "Ref" }]])).render(source);

describe("InlineParser", () => {
  test("should render emphasis, strong emphasis and strikethrough", () => {
    expect(render("*a* **b** ***c*** _d_ __e__ ~~f~~ ~g~")).toBe(
      "<em>a</em> <strong>b</strong> <em><strong>c</strong></em> <em>d</em> <strong>e</strong> <del>f</del> <del>g</del>",
    );
  });

  test("should apply flanking and rule-of-three constraints", () => {
    expect(render("snake_case_name")).toBe("snake_case_name");
    expect(render("* a *")).toBe("* a *");
    expect(render("*foo**bar*")).toBe("<em>foo**bar</em>");
    expect(render("~~~no~~~")).toBe("~~~no~~~");
  });

  test("should leave strikethrough as text when disabled", () => {
    expect(render("~~x~~", { strikethrough: false })).toBe("~~x~~");
  });

  test("should render code spans", () => {
    expect(render("`a < b` `` c`d `` ` `")).toBe("<code>a &lt; b</code> <code>c`d</code> <code> </code>");
    expect(render("`unclosed")).toBe("`unclosed");
  });

  test("should render inline, reference and image links", () => {
    expect(render("[a](/u \"t\") [b](<x y>) [c][ref] [ref][] [ref] ![i](/i.png 'T')")).toBe(
      '<a href="/u" title="t">a</a> <a href="x%20y">b</a> <a href="/ref" title="Ref">c</a> <a href="/ref" title="Ref">ref</a> <a href="/ref" title="Ref">ref</a> <img src="/i.png" alt="i" title="T" />',
    );
  });

  test("should resolve escapes and entities in link destinations and titles", () => {
    expect(render('[a](/u\\_v "x &amp; \\"y\\"")')).toBe('<a href="/u_v" title="x &amp; &quot;y&quot;">a</a>');
  });

  test("should not nest links and should keep unmatched brackets", () => {
    expect(render("[a [b](/b) c](/a)")).toBe('[a <a href="/b">b</a> c](/a)');
    expect(render("[missing] ]")).toBe("[missing] ]");
    expect(render("[a](/b (t))")).toBe('<a href="/b" title="t">a</a>');
    expect(render("[a](/b 'unclosed)")).toBe("[a](/b 'unclosed)");
  });

  test("should render autolinks, extended autolinks and emails", () => {
    expect(render("<https://a.com> <me@a.com> https://b.com/x). www.c.com, d@e.io.")).toBe(
      '<a href="https://a.com">https://a.com</a> <a href="mailto:me@a.com">me@a.com</a> <a href="https://b.com/x">https://b.com/x</a>). <a href="http://www.c.com">www.c.com</a>, <a href="mailto:d@e.io">d@e.io</a>.',
    );
    expect(render("www.a.com", { autolinks: false })).toBe("www.a.com");
    expect(render("[see https://a.com](/x)")).toBe('<a href="/x">see https://a.com</a>');
  });

  test("should pass raw HTML through unless sanitizing", () => {
    expect(render("a <b class='x'>b</b> <!-- c -->")).toBe("a <b class='x'>b</b> <!-- c -->");
    expect(render("<script>alert(1)</script>", { sanitize: true })).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("should drop unsafe URLs when sanitizing", () => {
    expect(render("[x](javascript:alert(1)) ![y](data:text/html,z)", { sanitize: true })).toBe("x y");
    expect(render("![p](data:image/png;base64,AA==)", { sanitize: true })).toBe(
      '<img src="data:image/png;base64,AA==" alt="p" />',
    );
  });

  test("should decode entities and backslash escapes", () => {
    expect(render("&copy; &#35; &nope; \\*not\\* \\a")).toBe("© # &amp;nope; *not* \\a");
    expect(render('say "hi" & <3')).toBe("say &quot;hi&quot; &amp; &lt;3");
  });

  test("should render hard and soft line breaks", () => {
    expect(render("a  \nb\\\nc\nd")).toBe("a<br />\nb<br />\nc\nd");
    expect(render("a\nb", { hardBreaks: true })).toBe("a<br />\nb");
  });

  test("should expose plain text of parsed nodes", () => {
    const parser = new InlineParser();

    expect(parser.toPlain(parser.parse("**a** `b` [c](/c) ![d](/d) <https://e.io> *"))).toBe("a b c d https://e.io *");
  });
});
