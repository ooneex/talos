import { describe, expect, test } from "bun:test";
import { type DomElement, DomSelection, DomText, load } from "@/index";

const html = `<div id="main" class="wrap">
<ul id="list"><li class="item">one</li><li class="item active">two <span>inner</span></li><li class="item">three</li><li>four</li></ul>
<p class="intro">Hello <a href="/a" title="A">A</a><!--c--></p>
<form><input type="checkbox" checked><video controls muted></video></form>
</div>`;

describe("DomSelection", () => {
  describe("collection", () => {
    test("should expose length, get, toArray and iteration", () => {
      const $ = load(html);
      const items = $("li");

      expect(items.length).toBe(4);
      expect(items.get()).toHaveLength(4);
      expect(items.get(0)).toBe(items.toArray()[0] as DomElement);
      expect(items.get(-1)).toBe(items.toArray()[3] as DomElement);
      expect(items.get(10)).toBeUndefined();
      expect([...items]).toHaveLength(4);
      expect(new DomSelection().length).toBe(0);
    });

    test("should keep only elements with elements()", () => {
      const $ = load(html);

      expect(
        $("p")
          .contents()
          .elements()
          .map((element) => element.name),
      ).toEqual(["a"]);
    });

    test("should iterate with each and stop on false", () => {
      const $ = load(html);
      const seen: number[] = [];

      const result = $("li").each((index) => {
        seen.push(index);
        return index < 1;
      });

      expect(seen).toEqual([0, 1]);
      expect(result.length).toBe(4);
    });

    test("should map, flatten arrays and skip null values", () => {
      const $ = load(html);

      expect($("li").map((index, node) => (index === 0 ? null : node.textContent.trim()))).toEqual([
        "two inner",
        "three",
        "four",
      ]);
      expect(
        $("li")
          .slice(0, 2)
          .map((index) => [index, index]),
      ).toEqual([0, 0, 1, 1]);
      expect($("li").map(() => undefined)).toEqual([]);
    });

    test("should pick with first, last, eq and slice", () => {
      const $ = load(html);

      expect($("li").first().text()).toBe("one");
      expect($("li").last().text()).toBe("four");
      expect($("li").eq(1).hasClass("active")).toBe(true);
      expect($("li").eq(-2).text()).toBe("three");
      expect($("li").eq(9).length).toBe(0);
      expect($("li").slice(1, 3).length).toBe(2);
      expect($("li").slice(2).length).toBe(2);
    });
  });

  describe("filtering", () => {
    test("should filter with a selector, a function or nodes", () => {
      const $ = load(html);
      const items = $("li");

      expect(items.filter(".item").length).toBe(3);
      expect(items.filter((index) => index % 2 === 0).text()).toBe("onethree");
      expect(items.filter(items.get(0) as DomElement).text()).toBe("one");
      expect(items.filter($(".active")).length).toBe(1);
      expect(items.filter([items.get(3) as DomElement]).text()).toBe("four");
      expect($("p").contents().filter("a").length).toBe(1);
    });

    test("should exclude with not", () => {
      const $ = load(html);

      expect($("li").not(".item").text()).toBe("four");
      expect(
        $("li")
          .not((index) => index > 0)
          .text(),
      ).toBe("one");
    });

    test("should test with is", () => {
      const $ = load(html);

      expect($("li").is(".active")).toBe(true);
      expect($("li").is("p")).toBe(false);
      expect($("li").is((_, node) => node.textContent === "four")).toBe(true);
    });

    test("should keep elements containing a match with has", () => {
      const $ = load(html);

      expect($("li").has("span").text()).toBe("two inner");
    });
  });

  describe("traversal", () => {
    test("should find descendants", () => {
      const $ = load(html);

      expect($("#main").find("li").length).toBe(4);
      expect($("#list").find("> li.active").length).toBe(1);
      expect($("#list").find("div li").length).toBe(0);
    });

    test("should find given nodes that are descendants", () => {
      const $ = load(html);
      const span = $("span");

      expect($("#list").find(span).length).toBe(1);
      expect($("#list").find(span.get(0) as DomElement).length).toBe(1);
      expect($("p").find(span).length).toBe(0);
    });

    test("should navigate to parents", () => {
      const $ = load(html);

      expect($("span").parent().is("li")).toBe(true);
      expect($("li").parent().length).toBe(1);
      expect($("li").parent("ol").length).toBe(0);
      expect(
        $("span")
          .parents()
          .map((_, node) => (node as DomElement).name),
      ).toEqual(["li", "ul", "div", "body", "html"]);
      expect($("span").parents("ul, div").length).toBe(2);
      expect($.root().parent().length).toBe(0);
    });

    test("should find the closest ancestor", () => {
      const $ = load(html);

      expect($("span").closest("ul").attr("id")).toBe("list");
      expect($("li").closest("li").length).toBe(4);
      expect($("span").closest("table").length).toBe(0);
      expect($("p").contents().first().closest("p").hasClass("intro")).toBe(true);
    });

    test("should list children and contents", () => {
      const $ = load(html);

      expect($("#list").children().length).toBe(4);
      expect($("#list").children(".active").text()).toBe("two inner");
      expect($("p").contents().length).toBe(3);
      expect($("p").contents().children().length).toBe(0);
      expect($("p").contents().contents().length).toBe(1);
    });

    test("should list siblings", () => {
      const $ = load(html);

      expect($(".active").siblings().length).toBe(3);
      expect($(".active").siblings(":not(.item)").text()).toBe("four");
      expect($.root().siblings().length).toBe(0);
      expect($(".active").next().text()).toBe("three");
      expect($(".active").prev().text()).toBe("one");
      expect($("li").last().next().length).toBe(0);
      expect($(".active").nextAll().length).toBe(2);
      expect($(".active").nextAll(".item").length).toBe(1);
      expect($(".active").prevAll().length).toBe(1);
      expect($("li").next("li").length).toBe(3);
      expect($("li").prev(".active").length).toBe(1);
      expect($("li").prevAll("li").length).toBe(3);
    });
  });

  describe("attributes", () => {
    test("should read attributes", () => {
      const $ = load(html);

      expect($("a").attr("href")).toBe("/a");
      expect($("a").attr("missing")).toBeUndefined();
      expect($("missing").attr("href")).toBeUndefined();
      expect($("a").attr()).toEqual({ href: "/a", title: "A" });
      expect($("missing").attr()).toBeUndefined();
    });

    test("should return the name of boolean attributes", () => {
      const $ = load(html);

      expect($("input").attr("checked")).toBe("checked");
      expect($("video").attr("controls")).toBe("controls");
      expect($("video").attr("muted")).toBe("");
    });

    test("should set, map and remove attributes", () => {
      const $ = load(html);

      $("li").attr("data-x", "1");
      expect($("[data-x]").length).toBe(4);

      $("a").attr({ href: "/b", rel: "next", title: null });
      expect($("a").attr()).toEqual({ href: "/b", rel: "next" });

      $("a").attr("rel", null);
      expect($("a").attr("rel")).toBeUndefined();

      $("li").removeAttr("data-x class");
      expect($("li").attr()).toEqual({});
    });

    test("should manage classes", () => {
      const $ = load('<p class="a b">x</p><p>y</p>');
      const paragraphs = $("p");

      expect(paragraphs.hasClass("a")).toBe(true);
      expect(paragraphs.hasClass("z")).toBe(false);

      paragraphs.addClass("c  a");
      expect(paragraphs.eq(0).attr("class")).toBe("a b c");
      expect(paragraphs.eq(1).attr("class")).toBe("c a");

      paragraphs.removeClass("a");
      expect(paragraphs.eq(0).attr("class")).toBe("b c");

      paragraphs.toggleClass("b d");
      expect(paragraphs.eq(0).attr("class")).toBe("c d");
      expect(paragraphs.eq(1).attr("class")).toBe("c b d");

      paragraphs.toggleClass("c", true);
      expect(paragraphs.eq(0).attr("class")).toBe("c d");
      paragraphs.toggleClass("c", false);
      expect(paragraphs.eq(0).attr("class")).toBe("d");

      paragraphs.removeClass();
      expect(paragraphs.attr("class")).toBeUndefined();
    });
  });

  describe("content", () => {
    test("should read text of all nodes", () => {
      const $ = load(html);

      expect($("li").text()).toBe("onetwo innerthreefour");
      expect($("missing").text()).toBe("");
    });

    test("should replace text", () => {
      const $ = load(html);

      $("li").text("<x>");
      expect($("li").first().html()).toBe("&lt;x&gt;");
      expect($("li").length).toBe(4);
      $("p").contents().text("ignored on text nodes");
      expect($("p").text()).toBe("Hello ignored on text nodes");
    });

    test("should read inner HTML of the first node", () => {
      const $ = load(html);

      expect($("p").html()).toBe('Hello <a href="/a" title="A">A</a><!--c-->');
      expect($("missing").html()).toBeNull();
      expect($("p").contents().first().html()).toBe("");
    });

    test("should replace inner HTML", () => {
      const $ = load("<div></div><div></div>");

      $("div").html("<b>x</b>");
      expect($.html($("div"))).toBe("<div><b>x</b></div><div><b>x</b></div>");

      $("div").first().html(new DomText("t"));
      expect($("div").first().html()).toBe("t");
    });
  });

  describe("manipulation", () => {
    test("should append and prepend, cloning for all but the last target", () => {
      const $ = load("<div></div><div></div>");

      $("div").append("<b>1</b><i>2</i>").prepend("<s>0</s>");

      expect($.html($("div"))).toBe("<div><s>0</s><b>1</b><i>2</i></div><div><s>0</s><b>1</b><i>2</i></div>");
    });

    test("should prepend several nodes in order", () => {
      const $ = load("<ul><li>c</li></ul>");

      $("ul").prepend("<li>a</li><li>b</li>");

      expect($("ul").html()).toBe("<li>a</li><li>b</li><li>c</li>");
    });

    test("should move existing nodes", () => {
      const $ = load('<p id="a">a</p><p id="b">b</p>');

      $("#b").append($("#a"));

      expect($.html($("body"))).toBe('<body><p id="b">b<p id="a">a</p></p></body>');
    });

    test("should insert before and after", () => {
      const $ = load("<ul><li>b</li></ul>");

      $("li").before("<li>a</li>").after("<li>c</li><li>d</li>");

      expect($("ul").html()).toBe("<li>a</li><li>b</li><li>c</li><li>d</li>");
    });

    test("should ignore detached nodes for before and after", () => {
      const $ = load("");
      const detached = $("<p>x</p>");

      detached.get(0)?.remove();
      detached.before("<i></i>").after("<b></b>");

      expect(detached.get(0)?.parent).toBeNull();
    });

    test("should replace nodes", () => {
      const $ = load("<ul><li>a</li><li>b</li></ul>");

      $("li").last().replaceWith("<li>z</li>");

      expect($("ul").html()).toBe("<li>a</li><li>z</li>");
    });

    test("should remove nodes, optionally filtered", () => {
      const $ = load('<p>a</p><p class="x">b</p>');

      $("p").remove(".x");
      expect($("p").length).toBe(1);

      $("p").remove();
      expect($("p").length).toBe(0);
    });

    test("should empty nodes", () => {
      const $ = load("<ul><li>a</li></ul>");

      $("ul").empty();

      expect($("ul").html()).toBe("");
    });

    test("should clone nodes", () => {
      const $ = load("<p>a</p>");
      const clone = $("p").clone();

      clone.text("b");

      expect($("p").text()).toBe("a");
      expect(clone.text()).toBe("b");
    });
  });
});
