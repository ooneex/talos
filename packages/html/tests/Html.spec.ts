import { describe, expect, test } from "bun:test";
import type { HtmlHeadingType, HtmlImageType, HtmlLinkType, HtmlTaskType, HtmlVideoType, IHtml } from "@/index";
import { Html, HtmlException } from "@/index";

describe("Html", () => {
  describe("Types", () => {
    test("should export IHtml interface", () => {
      const html: IHtml = new Html();
      expect(html).toBeDefined();
      expect(typeof html.load).toBe("function");
      expect(typeof html.loadUrl).toBe("function");
      expect(typeof html.getContent).toBe("function");
      expect(typeof html.getHtml).toBe("function");
      expect(typeof html.getImages).toBe("function");
      expect(typeof html.getLinks).toBe("function");
      expect(typeof html.getHeadings).toBe("function");
      expect(typeof html.getVideos).toBe("function");
      expect(typeof html.getTasks).toBe("function");
    });

    test("should export HtmlImageType", () => {
      const image: HtmlImageType = {
        src: "image.png",
        alt: "Test image",
        title: "Title",
        width: "100",
        height: "100",
      };
      expect(image.src).toBe("image.png");
      expect(image.alt).toBe("Test image");
    });

    test("should export HtmlLinkType", () => {
      const link: HtmlLinkType = {
        href: "https://example.com",
        text: "Example",
        title: "Link title",
        target: "_blank",
        rel: "noopener",
      };
      expect(link.href).toBe("https://example.com");
      expect(link.text).toBe("Example");
    });

    test("should export HtmlHeadingType", () => {
      const heading: HtmlHeadingType = {
        level: 1,
        text: "Main Heading",
        id: "main-heading",
      };
      expect(heading.level).toBe(1);
      expect(heading.text).toBe("Main Heading");
    });

    test("should export HtmlVideoType", () => {
      const video: HtmlVideoType = {
        src: "video.mp4",
        poster: "poster.jpg",
        width: "640",
        height: "480",
        controls: true,
        autoplay: false,
        loop: false,
        muted: true,
        sources: [{ src: "video.webm", type: "video/webm" }],
      };
      expect(video.src).toBe("video.mp4");
      expect(video.controls).toBe(true);
    });

    test("should export HtmlTaskType", () => {
      const task: HtmlTaskType = {
        text: "Complete this task",
        checked: false,
      };
      expect(task.text).toBe("Complete this task");
      expect(task.checked).toBe(false);
    });
  });

  describe("Constructor", () => {
    test("should create Html instance", () => {
      const html = new Html();
      expect(html).toBeInstanceOf(Html);
    });

    test("should initialize with empty document", () => {
      const html = new Html();
      expect(html.getContent()).toBe("");
    });
  });

  describe("load", () => {
    test("should load HTML from string", () => {
      const html = new Html();
      const result = html.load("<p>Hello World</p>");

      expect(result).toBe(html);
      expect(html.getContent()).toBe("Hello World");
    });

    test("should return this for chaining", () => {
      const html = new Html();
      const result = html.load("<div>Test</div>");

      expect(result).toBeInstanceOf(Html);
      expect(result).toBe(html);
    });

    test("should replace previous content when loading new HTML", () => {
      const html = new Html();
      html.load("<p>First</p>");
      html.load("<p>Second</p>");

      expect(html.getContent()).toBe("Second");
    });

    test("should handle empty string", () => {
      const html = new Html();
      html.load("");

      expect(html.getContent()).toBe("");
    });

    test("should handle complex HTML", () => {
      const html = new Html();
      html.load(`
        <!DOCTYPE html>
        <html>
          <head><title>Test</title></head>
          <body>
            <div class="container">
              <h1>Title</h1>
              <p>Paragraph</p>
            </div>
          </body>
        </html>
      `);

      expect(html.getContent()).toContain("Title");
      expect(html.getContent()).toContain("Paragraph");
    });
  });

  describe("loadUrl", () => {
    test("should throw HtmlException for invalid URL", async () => {
      const html = new Html();

      try {
        await html.loadUrl("http://invalid-url-that-does-not-exist.local");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(HtmlException);
        expect((error as HtmlException).message).toContain("Failed to fetch URL");
      }
    });

    test("should accept URL object", async () => {
      const html = new Html();

      try {
        await html.loadUrl(new URL("http://invalid-url.local"));
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(HtmlException);
        const data = (error as HtmlException).data?.data as { url: string; error: string } | undefined;
        expect(data?.url).toBe("http://invalid-url.local/");
      }
    });

    test("should include URL in error data", async () => {
      const html = new Html();
      const testUrl = "http://nonexistent-domain-12345.local";

      try {
        await html.loadUrl(testUrl);
        expect(true).toBe(false);
      } catch (error) {
        const data = (error as HtmlException).data?.data as { url: string; error: string } | undefined;
        expect(data?.url).toBe(testUrl);
        expect(data?.error).toBeDefined();
      }
    });
  });

  describe("getContent", () => {
    test("should return trimmed text content", () => {
      const html = new Html();
      html.load("<p>  Hello World  </p>");

      expect(html.getContent()).toBe("Hello World");
    });

    test("should return text from nested elements", () => {
      const html = new Html();
      html.load("<div><span>Hello</span> <span>World</span></div>");

      expect(html.getContent()).toBe("Hello World");
    });

    test("should exclude script and style content", () => {
      const html = new Html();
      html.load(`
        <div>
          <style>.test { color: red; }</style>
          <script>console.log('test');</script>
          <p>Content</p>
        </div>
      `);

      const content = html.getContent();
      expect(content).toContain("Content");
    });

    test("should handle whitespace correctly", () => {
      const html = new Html();
      html.load("<p>   Multiple   spaces   </p>");

      expect(html.getContent()).toContain("Multiple");
      expect(html.getContent()).toContain("spaces");
    });
  });

  describe("getHtml", () => {
    test("should return full HTML string", () => {
      const html = new Html();
      html.load("<p>Test</p>");

      const result = html.getHtml();
      expect(result).toContain("<p>");
      expect(result).toContain("Test");
      expect(result).toContain("</p>");
    });

    test("should return trimmed HTML", () => {
      const html = new Html();
      html.load("  <p>Test</p>  ");

      const result = html.getHtml();
      expect(result.startsWith(" ")).toBe(false);
      expect(result.endsWith(" ")).toBe(false);
    });

    test("should return empty string for empty document", () => {
      const html = new Html();
      const result = html.getHtml();

      expect(typeof result).toBe("string");
    });

    test("should preserve HTML structure", () => {
      const html = new Html();
      html.load('<div class="container"><span id="test">Content</span></div>');

      const result = html.getHtml();
      expect(result).toContain('class="container"');
      expect(result).toContain('id="test"');
    });
  });

  describe("getImages", () => {
    test("should extract images with all attributes", () => {
      const html = new Html();
      html.load(`
        <img src="image.png" alt="Alt text" title="Title" width="100" height="200">
      `);

      const images = html.getImages();
      expect(images).toHaveLength(1);
      expect(images[0]).toEqual({
        src: "image.png",
        alt: "Alt text",
        title: "Title",
        width: "100",
        height: "200",
      });
    });

    test("should return null for missing optional attributes", () => {
      const html = new Html();
      html.load('<img src="image.png">');

      const images = html.getImages();
      expect(images).toHaveLength(1);
      expect(images[0]).toEqual({
        src: "image.png",
        alt: null,
        title: null,
        width: null,
        height: null,
      });
    });

    test("should extract multiple images", () => {
      const html = new Html();
      html.load(`
        <img src="image1.png" alt="First">
        <img src="image2.png" alt="Second">
        <img src="image3.png" alt="Third">
      `);

      const images = html.getImages();
      expect(images).toHaveLength(3);
      expect(images[0]?.src).toBe("image1.png");
      expect(images[1]?.src).toBe("image2.png");
      expect(images[2]?.src).toBe("image3.png");
    });

    test("should skip images without src attribute", () => {
      const html = new Html();
      html.load(`
        <img alt="No src">
        <img src="valid.png">
      `);

      const images = html.getImages();
      expect(images).toHaveLength(1);
      expect(images[0]?.src).toBe("valid.png");
    });

    test("should return empty array when no images", () => {
      const html = new Html();
      html.load("<p>No images here</p>");

      const images = html.getImages();
      expect(images).toEqual([]);
    });

    test("should extract images from nested elements", () => {
      const html = new Html();
      html.load(`
        <div>
          <section>
            <article>
              <img src="nested.png">
            </article>
          </section>
        </div>
      `);

      const images = html.getImages();
      expect(images).toHaveLength(1);
      expect(images[0]?.src).toBe("nested.png");
    });
  });

  describe("getLinks", () => {
    test("should extract links with all attributes", () => {
      const html = new Html();
      html.load(`
        <a href="https://example.com" title="Example" target="_blank" rel="noopener">Visit</a>
      `);

      const links = html.getLinks();
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        href: "https://example.com",
        text: "Visit",
        title: "Example",
        target: "_blank",
        rel: "noopener",
      });
    });

    test("should return null for missing optional attributes", () => {
      const html = new Html();
      html.load('<a href="https://example.com"></a>');

      const links = html.getLinks();
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        href: "https://example.com",
        text: null,
        title: null,
        target: null,
        rel: null,
      });
    });

    test("should extract multiple links", () => {
      const html = new Html();
      html.load(`
        <a href="/page1">Page 1</a>
        <a href="/page2">Page 2</a>
        <a href="/page3">Page 3</a>
      `);

      const links = html.getLinks();
      expect(links).toHaveLength(3);
      expect(links[0]?.href).toBe("/page1");
      expect(links[1]?.href).toBe("/page2");
      expect(links[2]?.href).toBe("/page3");
    });

    test("should skip links without href attribute", () => {
      const html = new Html();
      html.load(`
        <a name="anchor">Named anchor</a>
        <a href="/valid">Valid link</a>
      `);

      const links = html.getLinks();
      expect(links).toHaveLength(1);
      expect(links[0]?.href).toBe("/valid");
    });

    test("should return empty array when no links", () => {
      const html = new Html();
      html.load("<p>No links here</p>");

      const links = html.getLinks();
      expect(links).toEqual([]);
    });

    test("should trim link text", () => {
      const html = new Html();
      html.load('<a href="/test">   Trimmed text   </a>');

      const links = html.getLinks();
      expect(links[0]?.text).toBe("Trimmed text");
    });

    test("should handle links with nested elements", () => {
      const html = new Html();
      html.load('<a href="/test"><span>Nested</span> <strong>Text</strong></a>');

      const links = html.getLinks();
      expect(links[0]?.text).toBe("Nested Text");
    });
  });

  describe("getHeadings", () => {
    test("should extract all heading levels", () => {
      const html = new Html();
      html.load(`
        <h1>Heading 1</h1>
        <h2>Heading 2</h2>
        <h3>Heading 3</h3>
        <h4>Heading 4</h4>
        <h5>Heading 5</h5>
        <h6>Heading 6</h6>
      `);

      const headings = html.getHeadings();
      expect(headings).toHaveLength(6);
      expect(headings[0]).toEqual({ level: 1, text: "Heading 1", id: null });
      expect(headings[1]).toEqual({ level: 2, text: "Heading 2", id: null });
      expect(headings[2]).toEqual({ level: 3, text: "Heading 3", id: null });
      expect(headings[3]).toEqual({ level: 4, text: "Heading 4", id: null });
      expect(headings[4]).toEqual({ level: 5, text: "Heading 5", id: null });
      expect(headings[5]).toEqual({ level: 6, text: "Heading 6", id: null });
    });

    test("should extract heading with id attribute", () => {
      const html = new Html();
      html.load('<h1 id="main-title">Main Title</h1>');

      const headings = html.getHeadings();
      expect(headings).toHaveLength(1);
      expect(headings[0]).toEqual({
        level: 1,
        text: "Main Title",
        id: "main-title",
      });
    });

    test("should return empty array when no headings", () => {
      const html = new Html();
      html.load("<p>No headings here</p>");

      const headings = html.getHeadings();
      expect(headings).toEqual([]);
    });

    test("should trim heading text", () => {
      const html = new Html();
      html.load("<h1>   Trimmed heading   </h1>");

      const headings = html.getHeadings();
      expect(headings[0]?.text).toBe("Trimmed heading");
    });

    test("should preserve heading order", () => {
      const html = new Html();
      html.load(`
        <h2>Second level first</h2>
        <h1>First level</h1>
        <h3>Third level</h3>
      `);

      const headings = html.getHeadings();
      expect(headings[0]?.level).toBe(2);
      expect(headings[1]?.level).toBe(1);
      expect(headings[2]?.level).toBe(3);
    });

    test("should handle headings with nested elements", () => {
      const html = new Html();
      html.load("<h1><span>Nested</span> <em>Heading</em></h1>");

      const headings = html.getHeadings();
      expect(headings[0]?.text).toBe("Nested Heading");
    });
  });

  describe("getVideos", () => {
    test("should extract video with all attributes", () => {
      const html = new Html();
      html.load(`
        <video src="video.mp4" poster="poster.jpg" width="640" height="480" controls autoplay loop muted>
        </video>
      `);

      const videos = html.getVideos();
      expect(videos).toHaveLength(1);
      expect(videos[0]).toEqual({
        src: "video.mp4",
        poster: "poster.jpg",
        width: "640",
        height: "480",
        controls: true,
        autoplay: true,
        loop: true,
        muted: true,
        sources: [],
      });
    });

    test("should return null for missing optional attributes", () => {
      const html = new Html();
      html.load("<video></video>");

      const videos = html.getVideos();
      expect(videos).toHaveLength(1);
      expect(videos[0]).toEqual({
        src: null,
        poster: null,
        width: null,
        height: null,
        controls: false,
        autoplay: false,
        loop: false,
        muted: false,
        sources: [],
      });
    });

    test("should extract video sources", () => {
      const html = new Html();
      html.load(`
        <video controls>
          <source src="video.webm" type="video/webm">
          <source src="video.mp4" type="video/mp4">
        </video>
      `);

      const videos = html.getVideos();
      expect(videos).toHaveLength(1);
      expect(videos[0]?.sources).toHaveLength(2);
      expect(videos[0]?.sources[0]).toEqual({
        src: "video.webm",
        type: "video/webm",
      });
      expect(videos[0]?.sources[1]).toEqual({
        src: "video.mp4",
        type: "video/mp4",
      });
    });

    test("should return null for source type if not specified", () => {
      const html = new Html();
      html.load(`
        <video>
          <source src="video.mp4">
        </video>
      `);

      const videos = html.getVideos();
      expect(videos[0]?.sources[0]?.type).toBe(null);
    });

    test("should skip sources without src attribute", () => {
      const html = new Html();
      html.load(`
        <video>
          <source type="video/webm">
          <source src="valid.mp4" type="video/mp4">
        </video>
      `);

      const videos = html.getVideos();
      expect(videos[0]?.sources).toHaveLength(1);
      expect(videos[0]?.sources[0]?.src).toBe("valid.mp4");
    });

    test("should extract multiple videos", () => {
      const html = new Html();
      html.load(`
        <video src="video1.mp4"></video>
        <video src="video2.mp4"></video>
      `);

      const videos = html.getVideos();
      expect(videos).toHaveLength(2);
      expect(videos[0]?.src).toBe("video1.mp4");
      expect(videos[1]?.src).toBe("video2.mp4");
    });

    test("should return empty array when no videos", () => {
      const html = new Html();
      html.load("<p>No videos here</p>");

      const videos = html.getVideos();
      expect(videos).toEqual([]);
    });
  });

  describe("getTasks", () => {
    test("should extract checked task", () => {
      const html = new Html();
      html.load(`
        <li><input type="checkbox" checked> Completed task</li>
      `);

      const tasks = html.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.checked).toBe(true);
      expect(tasks[0]?.text).toContain("Completed task");
    });

    test("should extract unchecked task", () => {
      const html = new Html();
      html.load(`
        <li><input type="checkbox"> Pending task</li>
      `);

      const tasks = html.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.checked).toBe(false);
      expect(tasks[0]?.text).toContain("Pending task");
    });

    test("should extract multiple tasks", () => {
      const html = new Html();
      html.load(`
        <ul>
          <li><input type="checkbox" checked> Task 1</li>
          <li><input type="checkbox"> Task 2</li>
          <li><input type="checkbox" checked> Task 3</li>
        </ul>
      `);

      const tasks = html.getTasks();
      expect(tasks).toHaveLength(3);
      expect(tasks[0]?.checked).toBe(true);
      expect(tasks[1]?.checked).toBe(false);
      expect(tasks[2]?.checked).toBe(true);
    });

    test("should return empty array when no tasks", () => {
      const html = new Html();
      html.load("<p>No tasks here</p>");

      const tasks = html.getTasks();
      expect(tasks).toEqual([]);
    });

    test("should trim task text", () => {
      const html = new Html();
      html.load(`
        <li><input type="checkbox">   Trimmed text   </li>
      `);

      const tasks = html.getTasks();
      expect(tasks[0]?.text).toBe("Trimmed text");
    });

    test("should handle checkboxes not in list items", () => {
      const html = new Html();
      html.load(`
        <div><input type="checkbox"> Task in div</div>
      `);

      const tasks = html.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.text).toContain("Task in div");
    });

    test("should only consider checkbox inputs", () => {
      const html = new Html();
      html.load(`
        <li><input type="text"> Not a task</li>
        <li><input type="checkbox"> Real task</li>
        <li><input type="radio"> Not a task</li>
      `);

      const tasks = html.getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.text).toContain("Real task");
    });
  });

  describe("Method chaining", () => {
    test("should support method chaining after load", () => {
      const html = new Html();
      const content = html.load("<p>Test</p>").getContent();

      expect(content).toBe("Test");
    });

    test("should support multiple operations", () => {
      const html = new Html();
      html.load(`
        <h1>Title</h1>
        <p><a href="/link">Link</a></p>
        <img src="image.png">
      `);

      const headings = html.getHeadings();
      const links = html.getLinks();
      const images = html.getImages();

      expect(headings).toHaveLength(1);
      expect(links).toHaveLength(1);
      expect(images).toHaveLength(1);
    });
  });
});

describe("HtmlException", () => {
  describe("Constructor", () => {
    test("should create HtmlException with message", () => {
      const exception = new HtmlException("Test error", "test_error");

      expect(exception).toBeInstanceOf(HtmlException);
      expect(exception.message).toBe("Test error");
      expect(exception.name).toBe("HtmlException");
      expect(exception.status).toBe(500);
    });

    test("should create HtmlException with message and data", () => {
      const data = { url: "https://example.com", error: "Not found" };
      const exception = new HtmlException("Failed to fetch", "fetch_failed", data);

      expect(exception.message).toBe("Failed to fetch");
      expect(exception.data).toEqual(data);
    });

    test("should have correct HTTP status code", () => {
      const exception = new HtmlException("Internal error", "internal_error");

      expect(exception.status).toBe(500);
    });

    test("should have date property", () => {
      const beforeDate = Date.now();
      const exception = new HtmlException("Test", "test");
      const afterDate = Date.now();

      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.date.getTime()).toBeGreaterThanOrEqual(beforeDate);
      expect(exception.date.getTime()).toBeLessThanOrEqual(afterDate);
    });

    test("should have stack trace", () => {
      const exception = new HtmlException("Test", "test");

      expect(exception.stack).toBeDefined();
      expect(typeof exception.stack).toBe("string");
    });

    test("should support stackToJson method", () => {
      const exception = new HtmlException("JSON stack test", "json_stack_test");
      const stackJson = exception.stackToJson();

      expect(stackJson).toBeDefined();
      if (stackJson) {
        expect(Array.isArray(stackJson)).toBe(true);
        expect(stackJson.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Inheritance", () => {
    test("should inherit from Error", () => {
      const exception = new HtmlException("Test", "test");

      expect(exception).toBeInstanceOf(Error);
    });

    test("should be catchable as Error", () => {
      try {
        throw new HtmlException("Test error", "test_error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(HtmlException);
      }
    });
  });

  describe("Serialization", () => {
    test("should be JSON serializable", () => {
      const exception = new HtmlException("Serialization test", "serialization_test", {
        url: "https://example.com",
        statusCode: 404,
      });

      const serialized = JSON.stringify({
        message: exception.message,
        name: exception.name,
        status: exception.status,
        data: exception.data,
        date: exception.date,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.message).toBe("Serialization test");
      expect(parsed.name).toBe("HtmlException");
      expect(parsed.status).toBe(500);
      expect(parsed.data.url).toBe("https://example.com");
      expect(parsed.data.statusCode).toBe(404);
    });

    test("should have correct toString representation", () => {
      const exception = new HtmlException("ToString test", "to_string_test");
      const stringRep = exception.toString();

      expect(stringRep).toContain("HtmlException");
      expect(stringRep).toContain("ToString test");
    });
  });
});
