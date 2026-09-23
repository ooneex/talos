import { describe, expect, test } from "bun:test";
import {
  DomComment,
  DomDoctype,
  DomDocument,
  DomElement,
  DomParser,
  DomText,
  parseHtml,
  serializeChildren,
} from "@/index";

const render = (html: string, fragment = false): string => serializeChildren(parseHtml(html, { fragment }));

describe("DomParser", () => {
  describe("document structure", () => {
    test.each([
      ["", "<html><head></head><body></body></html>"],
      ["<p>x</p>", "<html><head></head><body><p>x</p></body></html>"],
      [
        "<!-- c1 --><html><!-- c2 --><head></head><body>x</body></html><!-- c3 -->",
        "<!-- c1 --><html><!-- c2 --><head></head><body>x</body></html><!-- c3 -->",
      ],
      [
        "<html lang=en><head>  <title>a</title> </head>  <body>b</body>  <!-- end --></html>  <!-- after -->",
        '<html lang="en"><head>  <title>a</title> </head>  <body>b    </body><!-- end --></html><!-- after -->',
      ],
      [
        "<head><meta charset=utf-8><link rel=stylesheet href=a.css></head>text",
        '<html><head><meta charset="utf-8"><link rel="stylesheet" href="a.css"></head><body>text</body></html>',
      ],
      [
        "<meta charset=utf8><p>x</p><title>late</title>",
        '<html><head><meta charset="utf8"></head><body><p>x</p><title>late</title></body></html>',
      ],
      [
        "<!doctype html><title>x</title><link rel=a><style>s</style> <p>y",
        '<!DOCTYPE html><html><head><title>x</title><link rel="a"><style>s</style> </head><body><p>y</p></body></html>',
      ],
      ["<head></head><script>x</script>", "<html><head><script>x</script></head><body></body></html>"],
      ["<body class=a><p>x</p><body class=b id=c>", '<html><head></head><body class="a" id="c"><p>x</p></body></html>'],
      ["<html><html lang=fr><body>x", '<html lang="fr"><head></head><body>x</body></html>'],
      ["<head lang=en><head><html dir=rtl></head>", '<html dir="rtl"><head lang="en"></head><body></body></html>'],
      ["</div><head>x", "<html><head></head><body>x</body></html>"],
      ["<head></foo><!--c--><!doctype html></head>x", "<html><head><!--c--></head><body>x</body></html>"],
      [
        "<head></head> <!--c--><!doctype x><html a=1><head></foo>x",
        '<html a="1"><head></head> <!--c--><body>x</body></html>',
      ],
      ["<head></head><meta name=a>x", '<html><head><meta name="a"></head><body>x</body></html>'],
      ["<head></head></br>", "<html><head></head><body><br></body></html>"],
      ["<head></head><body></body><!--c-->x", "<html><head></head><body>x</body><!--c--></html>"],
      ["<body></body><!doctype html><html x=1> ", '<html x="1"><head></head><body> </body></html>'],
      ["<body></body></html><!doctype html><html x=1> x", '<html x="1"><head></head><body> x</body></html>'],
      ["<head></head></body>", "<html><head></head><body></body></html>"],
      ["<!doctype html><!doctype x>x", "<!DOCTYPE html><html><head></head><body>x</body></html>"],
      [
        "<html><head><title>x</title></head><frameset></frameset>",
        "<html><head><title>x</title></head><body></body></html>",
      ],
      ["<body><head><frameset>x", "<html><head></head><body>x</body></html>"],
    ])("parses %p", (input, expected) => {
      expect(render(input)).toBe(expected);
    });

    test("should create html, head and body elements", () => {
      const document = parseHtml("<p>x</p>");
      const html = document.children[0] as DomElement;

      expect(document).toBeInstanceOf(DomDocument);
      expect(html.name).toBe("html");
      expect(html.elementChildren.map((element) => element.name)).toEqual(["head", "body"]);
    });

    test("should keep a doctype node", () => {
      const doctype = parseHtml("<!DOCTYPE html><p>x</p>").children[0];

      expect(doctype).toBeInstanceOf(DomDoctype);
      expect((doctype as DomDoctype).name).toBe("html");
    });

    test("should be usable through the class", () => {
      expect(new DomParser("<i>x</i>", { fragment: true }).parse().children[0]).toBeInstanceOf(DomElement);
    });
  });

  describe("fragments", () => {
    test("should not wrap fragments in html/head/body", () => {
      expect(render("<p>a</p>b<!--c-->", true)).toBe("<p>a</p>b<!--c-->");
    });

    test("should ignore html, head and body tags in fragments", () => {
      expect(render("<html lang=x><head></head><body class=y><p>a</p></body></html>", true)).toBe("<p>a</p>");
    });

    test("should keep text and comments at the top level", () => {
      const document = parseHtml("text<!--c-->", { fragment: true });

      expect(document.children[0]).toBeInstanceOf(DomText);
      expect(document.children[1]).toBeInstanceOf(DomComment);
    });
  });

  describe("implied end tags", () => {
    test.each([
      ["<p>one<p>two<div>three</div>", "<p>one</p><p>two</p><div>three</div>"],
      [
        "<ul><li>a<li>b</ul><dl><dt>x<dd>y<dt>z</dl>",
        "<ul><li>a</li><li>b</li></ul><dl><dt>x</dt><dd>y</dd><dt>z</dt></dl>",
      ],
      ["<ul><li>a<div>b<li>c</div></ul>", "<ul><li>a<div>b</div></li><li>c</li></ul>"],
      ["<li>a<address>b<li>c", "<li>a<address>b</address></li><li>c</li>"],
      [
        "<select><option>a<option>b<optgroup><option>c<optgroup>d</select>",
        "<select><option>a</option><option>b</option><optgroup><option>c</option></optgroup><optgroup>d</optgroup></select>",
      ],
      ["<h1>a<h2>b</h2>", "<h1>a</h1><h2>b</h2>"],
      ["<h1>a</h2>b", "<h1>a</h1>b"],
      ["<button>a<button>b", "<button>a</button><button>b</button>"],
      ["<div>a</span>b</div></p>c", "<div>ab</div><p></p>c"],
      ["text</p>", "text<p></p>"],
      ["a<br/>b</br>c<hr/>", "a<br>b<br>c<hr>"],
      ["<p>a</br>b", "<p>a<br>b</p>"],
      ["<image src=a>", '<img src="a">'],
      ["<li>a</li></ul></li>b", "<li>a</li>b"],
      ["<div><span>a</div>b", "<div><span>a</span></div>b"],
      ["<p><span>a</x></p>", "<p><span>a</span></p>"],
      ["<div><p>a</div>b", "<div><p>a</p></div>b"],
      ["<p><div>x</div>", "<p></p><div>x</div>"],
    ])("parses %p", (input, expected) => {
      expect(render(input, true)).toBe(expected);
    });
  });

  describe("tables", () => {
    test.each([
      [
        "<table><tr><td>1<td>2<tr><th>3</table>",
        "<table><tbody><tr><td>1</td><td>2</td></tr><tr><th>3</th></tr></tbody></table>",
      ],
      ["<table><td>a</td></table>", "<table><tbody><tr><td>a</td></tr></tbody></table>"],
      ["<table><tr><th>h<td>d</table>", "<table><tbody><tr><th>h</th><td>d</td></tr></tbody></table>"],
      ["<table><col></table>", "<table><colgroup><col></colgroup></table>"],
      [
        "<table><caption>c</caption><colgroup><col></colgroup><tbody><tr><td>x</td></tr></tbody></table>",
        "<table><caption>c</caption><colgroup><col></colgroup><tbody><tr><td>x</td></tr></tbody></table>",
      ],
      [
        "<table><tbody><tr><td>a</td></tr><tbody><tr><td>b</td></tr></table>",
        "<table><tbody><tr><td>a</td></tr></tbody><tbody><tr><td>b</td></tr></tbody></table>",
      ],
      [
        "<table><thead><tr><td>h<tbody><tr><td>b</table>",
        "<table><thead><tr><td>h</td></tr></thead><tbody><tr><td>b</td></tr></tbody></table>",
      ],
      ["<caption>c</caption>", "c"],
      ["<td>x</td><tr>", "x"],
      ["<template><td>x</td></template>", "<template><td>x</td></template>"],
      ["<table><tr><td>a</td></tr></tbody></table>", "<table><tbody><tr><td>a</td></tr></tbody></table>"],
    ])("parses %p", (input, expected) => {
      expect(render(input, true)).toBe(expected);
    });

    test("should not let a table close a paragraph in quirks mode", () => {
      expect(render("<p>a<table><tr><td>b</td></tr></table>c")).toBe(
        "<html><head></head><body><p>a<table><tbody><tr><td>b</td></tr></tbody></table>c</p></body></html>",
      );
    });

    test("should let a table close a paragraph with an HTML5 doctype", () => {
      expect(render("<!DOCTYPE html><p>a<table><tr><td>b</td></tr></table>c")).toBe(
        "<!DOCTYPE html><html><head></head><body><p>a</p><table><tbody><tr><td>b</td></tr></tbody></table>c</body></html>",
      );
    });
  });

  describe("formatting elements", () => {
    test.each([
      ["<b><i>bold italic</b> text</i>", "<b><i>bold italic</i></b><i> text</i>"],
      ["<a><div>x</a>y", "<a></a><div><a>x</a>y</div>"],
      ["<p><b>x</p>y", "<p><b>x</b></p><b>y</b>"],
      ["<b>1<p>2</b>3</p>", "<b>1</b><p><b>2</b>3</p>"],
      ["<a href=1>x<a href=2>y</a>", '<a href="1">x</a><a href="2">y</a>'],
      [
        "<p><b class=x><b class=x><b class=x><b class=x>four</p>five",
        '<p><b class="x"><b class="x"><b class="x"><b class="x">four</b></b></b></b></p><b class="x"><b class="x"><b class="x">five</b></b></b>',
      ],
      ["<b><div><i><p>x</b>y</i>z", "<b></b><div><b><i></i></b><i></i><p><i><b>x</b>y</i>z</p></div>"],
      [
        "<table><tr><td><b>cell</td><td>next</b></td></tr></table>after",
        "<table><tbody><tr><td><b>cell</b></td><td>next</td></tr></tbody></table>after",
      ],
      ["<nobr>a<nobr>b</nobr>", "<nobr>a</nobr><nobr>b</nobr>"],
      [
        "<div><b><u><s><i><em><p>deep</b>rest",
        "<div><b><u><s><i><em></em></i></s></u></b><s><i><em><p><b>deep</b>rest</p></em></i></s></div>",
      ],
      ["<object><b>x</object>y", "<object><b>x</b></object>y"],
      ["<b>1</b></b>2", "<b>1</b>2"],
      ["<i>x<b>y</i>z</b>", "<i>x<b>y</b></i><b>z</b>"],
      ["<div><b>x</div></b>y", "<div><b>x</b></div>y"],
      ["<b><table><td></b>x</table>", "<b><table><tbody><tr><td>x</td></tr></tbody></table></b>"],
      ["<a><p><a>x</a>", "<a></a><p><a></a><a>x</a></p>"],
      [
        "<b><p><u><i><s><em><strong>x</b>y",
        "<b></b><p><b><u><i><s><em><strong>x</strong></em></s></i></u></b><u><i><s><em><strong>y</strong></em></s></i></u></p>",
      ],
    ])("parses %p", (input, expected) => {
      expect(render(input, true)).toBe(expected);
    });

    test("should not reopen formatting elements inside raw text", () => {
      expect(render("<p><b>x</p><script>y</script>", true)).toBe("<p><b>x</b></p><script>y</script>");
    });
  });

  describe("raw text and special content", () => {
    test.each([
      [
        "<script>if (a < b) { x = '</div>'; }</script><style>a > b { }</style>",
        "<script>if (a < b) { x = '</div>'; }</script><style>a > b { }</style>",
      ],
      [
        "<textarea>\nfoo &amp; <b>bar</b></textarea><pre>\n\nline</pre>",
        "<textarea>foo &amp; &lt;b&gt;bar&lt;/b&gt;</textarea><pre>\nline</pre>",
      ],
      ["<pre>\n</pre><listing>\nx</listing>", "<pre></pre><listing>x</listing>"],
      [
        "<noscript><p>x</p></noscript><iframe><b>y</b></iframe>",
        "<noscript><p>x</p></noscript><iframe><b>y</b></iframe>",
      ],
      ["<plaintext><b>x</b>", "<plaintext><b>x</b></plaintext>"],
      ["<title>a &amp; <b>b</b></title>", "<title>a &amp; &lt;b&gt;b&lt;/b&gt;</title>"],
    ])("parses %p", (input, expected) => {
      expect(render(input, true)).toBe(expected);
    });
  });

  describe("foreign content", () => {
    test.each([
      [
        "<svg viewbox='0 0 10 10'><clippath id=c><circle r=1 /></clippath><foreignobject><p>hi</p></foreignobject></svg><p>after",
        '<svg viewBox="0 0 10 10"><clipPath id="c"><circle r="1"></circle></clipPath><foreignObject><p>hi</p></foreignObject></svg><p>after</p>',
      ],
      ["<svg><title>t</title><path d=x></path></svg>", '<svg><title>t</title><path d="x"></path></svg>'],
      [
        "<math><mi>x</mi><annotation-xml definitionurl=u></annotation-xml></math>",
        '<math><mi>x</mi><annotation-xml definitionURL="u"></annotation-xml></math>',
      ],
      ["<svg><p>breakout</p></svg>", "<svg></svg><p>breakout</p>"],
      ["<svg><font color=red>x</font></svg>", '<svg></svg><font color="red">x</font>'],
      ["<svg><font>x</font></svg>", "<svg><font>x</font></svg>"],
      ["<svg><style>a<g></g></style></svg>", "<svg><style>a<g></g></style></svg>"],
      ["<svg><style>a<b></b></style></svg>", "<svg><style>a</style></svg><b></b>"],
      ["<svg><g><rect></svg>x", "<svg><g><rect></rect></g></svg>x"],
      ["<svg/><p>x", "<svg></svg><p>x</p>"],
    ])("parses %p", (input, expected) => {
      expect(render(input, true)).toBe(expected);
    });

    test("should assign namespaces", () => {
      const document = parseHtml("<svg><circle/></svg><math><mi/></math>", { fragment: true });
      const [svg, math] = document.elementChildren;

      expect(svg?.namespace).toBe("svg");
      expect(svg?.elementChildren[0]?.namespace).toBe("svg");
      expect(math?.namespace).toBe("math");
    });
  });

  describe("malformed markup", () => {
    test.each([
      ["<div <p>x</p>", '<div <p="">x<p></p></div>'],
      ["<div a=1 a=2 B=3>x</div>", '<div a="1" b="3">x</div>'],
      ["</>x</ y>z<3", "x<!-- y-->z&lt;3"],
      ["<?xml version='1.0'?><![CDATA[x]]><p>q</p>", "<!--?xml version='1.0'?--><!--[CDATA[x]]--><p>q</p>"],
      ["<div", ""],
      ["<a href='x", ""],
      ["a\r\nb\rc", "a\nb\nc"],
    ])("parses %p", (input, expected) => {
      expect(render(input, true)).toBe(expected);
    });
  });
});
