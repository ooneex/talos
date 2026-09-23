import { describe, expect, test } from "bun:test";
import { DomComment, DomElement, DomText, parseHtml, toMarkdown } from "@/index";

const md = (html: string): string => toMarkdown(parseHtml(html));

describe("toMarkdown", () => {
  describe("blocks", () => {
    test("should return an empty string for an empty document", () => {
      expect(md("")).toBe("");
    });

    test("should convert headings", () => {
      expect(md("<h1>One</h1><h2>Two <em>x</em></h2><h6>Six</h6><h3> </h3>")).toBe("# One\n\n## Two _x_\n\n###### Six");
    });

    test("should flatten line breaks in headings", () => {
      expect(md("<h1>a<br>b</h1>")).toBe("# a b");
    });

    test("should separate paragraphs and containers with blank lines", () => {
      expect(md("<p>a</p>\n<div>b<p>c</p>d</div><section><article>e</article></section>")).toBe(
        "a\n\nb\n\nc\n\nd\n\ne",
      );
    });

    test("should skip non-content elements", () => {
      expect(
        md(
          "<head><title>T</title></head><p>x</p><script>s</script><style>s</style><template>t</template><svg><text>v</text></svg><select><option>o</option></select><textarea>t</textarea>",
        ),
      ).toBe("x");
    });

    test("should convert horizontal rules", () => {
      expect(md("<p>a</p><hr><p>b</p>")).toBe("a\n\n---\n\nb");
    });

    test("should convert blockquotes, including nested ones", () => {
      expect(md("<blockquote><p>a</p><blockquote>b</blockquote></blockquote><blockquote></blockquote>")).toBe(
        "> a\n>\n> > b",
      );
    });

    test("should convert preformatted code with a language and a long enough fence", () => {
      expect(md('<pre><code class="language-ts">const a = "```";\n</code></pre>')).toBe(
        '````ts\nconst a = "```";\n````',
      );
      expect(md('<pre class="lang-sh">ls  -la</pre>')).toBe("```sh\nls  -la\n```");
      expect(md("<pre><b>x</b> y</pre>")).toBe("```\nx y\n```");
    });

    test("should convert definition lists, summaries and legends", () => {
      expect(md("<dl><dt>Term</dt><dd>Def</dd><dd></dd><dt></dt></dl>")).toBe("**Term**\n\n: Def");
      expect(md("<details><summary>More</summary>Body</details>")).toBe("**More**\n\nBody");
      expect(md("<fieldset><legend>Group</legend></fieldset>")).toBe("**Group**");
    });
  });

  describe("lists", () => {
    test("should convert unordered lists", () => {
      expect(md("<ul><li>a</li>\n<li>b</li></ul>")).toBe("- a\n- b");
    });

    test("should convert ordered lists with a start number", () => {
      expect(md('<ol start="9"><li>a</li><li>b</li></ol><ol start="x"><li>c</li></ol>')).toBe("9. a\n10. b\n\n1. c");
    });

    test("should nest lists", () => {
      expect(md("<ul><li>a<ul><li>b<ol><li>c</li></ol></li></ul></li><li>d</li></ul>")).toBe(
        "- a\n  - b\n    1. c\n- d",
      );
    });

    test("should indent multi-paragraph items", () => {
      expect(md("<ol><li><p>a</p><p>b</p></li></ol>")).toBe("1. a\n\n   b");
    });

    test("should convert task lists", () => {
      expect(md('<ul><li><input type="checkbox" checked>Done</li><li><input type="checkbox"> Todo</li></ul>')).toBe(
        "- [x] Done\n- [ ] Todo",
      );
    });

    test("should render stray list children as items", () => {
      expect(md("<ul>text<p>para</p></ul>")).toBe("- text\n- para");
    });

    test("should render empty items", () => {
      expect(md("<ul><li></li><li>x</li></ul>")).toBe("-\n- x");
    });
  });

  describe("tables", () => {
    test("should convert tables with alignment and escaped pipes", () => {
      expect(
        md(`<table><thead><tr><th>Name</th><th align="center">Qty</th><th style="text-align: right">Price</th><th align="left">Note</th></tr></thead>
<tbody><tr><td>A|B</td><td>1</td><td>$2</td><td>a<br>b</td></tr><tr><td>C</td></tr></tbody></table>`),
      ).toBe("| Name | Qty | Price | Note |\n| --- | :---: | ---: | :--- |\n| A\\|B | 1 | $2 | a b |\n| C |  |  |  |");
    });

    test("should use the first row as header and render the caption", () => {
      expect(md("<table><caption>Cap</caption><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>")).toBe(
        "Cap\n\n| a | b |\n| --- | --- |\n| c |  |",
      );
    });

    test("should render only the caption of an empty table", () => {
      expect(md("<table><caption>Cap</caption></table>")).toBe("Cap");
      expect(md("<table></table>")).toBe("");
    });
  });

  describe("inline", () => {
    test("should convert emphasis, strong and strikethrough", () => {
      expect(md("<p><b>b</b> <strong>s</strong> <i>i</i> <em>e</em> <del>d</del> <s>s</s></p>")).toBe(
        "**b** **s** _i_ _e_ ~~d~~ ~~s~~",
      );
    });

    test("should keep surrounding whitespace outside of delimiters", () => {
      expect(md("<p>a<b> b </b>c<i> </i>d</p>")).toBe("a **b** c d");
    });

    test("should not nest identical delimiters", () => {
      expect(md("<p><b>a <strong>b</strong></b> <i>c <em>d</em></i> <del>e <s>f</s></del></p>")).toBe(
        "**a b** _c d_ ~~e f~~",
      );
    });

    test("should convert inline code with a long enough fence", () => {
      expect(md("<p><code>a  b</code> <code>x`y</code> <kbd>`k</kbd> <code> </code></p>")).toBe(
        "`a b` ``x`y`` `` `k ``",
      );
    });

    test("should convert links", () => {
      expect(md('<p><a href="/a" title="T &quot;q&quot;">A</a> <a href="/b c">B</a> <a href="(x)">C</a></p>')).toBe(
        '[A](/a "T \\"q\\"") [B](</b c>) [C](<(x)>)',
      );
    });

    test("should autolink URLs and empty links", () => {
      expect(
        md(
          '<p><a href="https://x.com">https://x.com</a> <a href="mailto:a@b.c">mailto:a@b.c</a> <a href="/e"></a></p>',
        ),
      ).toBe("<https://x.com> <mailto:a@b.c> </e>");
    });

    test("should keep the text of links without usable href", () => {
      expect(md('<p><a>plain</a> <a href="javascript:void(0)">js</a> <a href=" ">blank</a></p>')).toBe(
        "plain js blank",
      );
    });

    test("should not nest links", () => {
      const outer = new DomElement("a", [["href", "/outer"]]);
      const inner = outer.appendChild(new DomElement("a", [["href", "/inner"]]));
      inner.appendChild(new DomText("x"));

      expect(toMarkdown(outer)).toBe("[x](/outer)");
    });

    test("should convert images", () => {
      expect(md('<p><img src="a.png" alt="A *b*" title="T"> <img alt="no src"> <img src="b.png"></p>')).toBe(
        '![A \\*b\\*](a.png "T") ![](b.png)',
      );
    });

    test("should convert images inside links", () => {
      expect(md('<a href="/p"><img src="i.png" alt="i"></a>')).toBe("[![i](i.png)](/p)");
    });

    test("should convert line breaks", () => {
      expect(md("<p>a<br>b <br> c<br></p><p><br>d</p>")).toBe("a  \nb  \nc\n\nd");
    });

    test("should drop comments and skipped elements inside inline content", () => {
      expect(md("<p><b>a<!-- c --><script>s</script>b</b></p>")).toBe("**ab**");
    });

    test("should ignore non-checkbox inputs", () => {
      expect(md('<p><input type="text">x</p>')).toBe("x");
    });

    test("should flatten blocks nested in inline elements", () => {
      expect(md("<p><span>a<div>b</div>c</span></p>")).toBe("a\n\nb\n\nc");
      expect(md("<a href='/x'><div>a</div><div>b</div></a>")).toBe("[a b](/x)");
    });
  });

  describe("whitespace and escaping", () => {
    test("should collapse whitespace", () => {
      expect(md("<p>  a \n\t b   <span> c </span> </p>")).toBe("a b c");
    });

    test("should escape Markdown characters", () => {
      expect(md("<p>*a* _b_ `c` [d] \\ &lt;e&gt;</p>")).toBe("\\*a\\* \\_b\\_ \\`c\\` \\[d\\] \\\\ \\<e>");
    });

    test("should escape block markers at the start of a paragraph", () => {
      expect(md("<p># h</p><p>&gt; q</p><p>- i</p><p>+ i</p><p>12. n</p><p>===</p><p>-x</p><p>12.5</p>")).toBe(
        "\\# h\n\n\\> q\n\n\\- i\n\n\\+ i\n\n12\\. n\n\n\\===\n\n-x\n\n12.5",
      );
    });
  });

  describe("input nodes", () => {
    test("should convert an inline element", () => {
      const element = parseHtml("<b>x</b>", { fragment: true }).children[0] as DomElement;

      expect(toMarkdown(element)).toBe("**x**");
    });

    test("should convert a text node", () => {
      expect(toMarkdown(new DomText("a *b*"))).toBe("a \\*b\\*");
    });

    test("should return an empty string for comments", () => {
      expect(toMarkdown(new DomComment("c"))).toBe("");
    });

    test("should convert a fragment", () => {
      expect(toMarkdown(parseHtml("<h2>t</h2>text", { fragment: true }))).toBe("## t\n\ntext");
    });
  });
});
