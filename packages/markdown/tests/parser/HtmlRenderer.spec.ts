import { describe, expect, test } from "bun:test";
import { HtmlRenderer, markdownToHtml, parseMarkdown, renderMarkdown } from "@/index";

describe("HtmlRenderer", () => {
  test("should render every block type", () => {
    expect(markdownToHtml("# H\n\np\n\n> q\n\n***\n\n<div></div>\n\n```js\nx\n```", { headingIds: false })).toBe(
      '<h1>H</h1>\n<p>p</p>\n<blockquote>\n<p>q</p>\n</blockquote>\n<hr />\n<div></div>\n<pre><code class="language-js">x\n</code></pre>\n',
    );
  });

  test("should deduplicate heading ids and skip empty slugs", () => {
    expect(markdownToHtml("# A\n# A\n# !!")).toBe('<h1 id="a">A</h1>\n<h1 id="a-1">A</h1>\n<h1>!!</h1>\n');
  });

  test("should render tight and loose lists", () => {
    expect(markdownToHtml("- a\n  - b\n\n2. c\n\n   d")).toBe(
      '<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n<ol start="2">\n<li>\n<p>c</p>\n<p>d</p>\n</li>\n</ol>\n',
    );
  });

  test("should render task list checkboxes in tight and loose items", () => {
    expect(markdownToHtml("- [x] a\n- [ ] b")).toBe(
      '<ul>\n<li class="task-list-item"><input type="checkbox" disabled="" checked="" /> a</li>\n<li class="task-list-item"><input type="checkbox" disabled="" /> b</li>\n</ul>\n',
    );
    expect(markdownToHtml("- [x] a\n\n- [ ] b")).toContain('<li class="task-list-item">\n<p><input type="checkbox"');
    expect(markdownToHtml("- [ ] ```\n  x\n  ```")).toContain('<input type="checkbox" disabled="" /> \n<pre>');
  });

  test("should render empty list items", () => {
    expect(markdownToHtml("-\n- a")).toBe("<ul>\n<li></li>\n<li>a</li>\n</ul>\n");
  });

  test("should render tables with alignment and without a body", () => {
    expect(markdownToHtml("| a | b |\n|:-:|---|")).toBe(
      '<table>\n<thead>\n<tr>\n<th align="center">a</th>\n<th>b</th>\n</tr>\n</thead>\n</table>\n',
    );
  });

  test("should reset heading slugs between renders", () => {
    const renderer = new HtmlRenderer();
    const document = parseMarkdown("# A");

    expect(renderer.render(document)).toBe(renderer.render(document));
    expect(renderMarkdown(document)).toBe('<h1 id="a">A</h1>\n');
  });
});
