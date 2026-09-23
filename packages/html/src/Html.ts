import { type DomQueryType, type DomSelection, fromUrl, load, toMarkdown } from "./dom";
import { HtmlException } from "./HtmlException";
import type { HtmlHeadingType, HtmlImageType, HtmlLinkType, HtmlTaskType, HtmlVideoType, IHtml } from "./types";

/**
 * HTML document parser and analyzer
 */
export class Html implements IHtml {
  private $: DomQueryType;

  constructor(html?: string) {
    this.$ = load(html ?? "");
  }

  /**
   * Load HTML from a string
   * @param html - HTML string to parse
   * @returns this instance for chaining
   */
  public load(html: string): this {
    this.$ = load(html);
    return this;
  }

  /**
   * Fetch a page and load its HTML
   * @param url - URL to fetch HTML from
   * @returns Promise resolving to this instance for chaining
   */
  public async loadUrl(url: string | URL): Promise<this> {
    const urlString = url instanceof URL ? url.toString() : url;

    try {
      this.$ = await fromUrl(urlString);
      return this;
    } catch (error) {
      throw new HtmlException(`Failed to fetch URL: ${urlString}`, "HTML_FETCH_FAILED", {
        status: 500,
        data: {
          url: urlString,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Get the text content of the HTML document
   * @returns Trimmed text content
   */
  public getContent(): string {
    return this.$.text().trim();
  }

  /**
   * Get the full HTML string of the document
   * @returns HTML string
   */
  public getHtml(): string {
    return this.$.html().trim();
  }

  /**
   * Convert the HTML document to GitHub-flavored Markdown
   * @returns Markdown string
   */
  public toMarkdown(): string {
    return toMarkdown(this.$.document);
  }

  /**
   * Extract all images from the HTML document
   * @returns Array of image information
   */
  public getImages(): HtmlImageType[] {
    const images: HtmlImageType[] = [];

    for (const element of this.$("img")) {
      const $img = this.$(element);
      const src = $img.attr("src");

      if (src) {
        images.push({
          src,
          alt: $img.attr("alt") || null,
          title: $img.attr("title") || null,
          width: $img.attr("width") || null,
          height: $img.attr("height") || null,
        });
      }
    }

    return images;
  }

  /**
   * Extract all links from the HTML document
   * @returns Array of link information
   */
  public getLinks(): HtmlLinkType[] {
    const links: HtmlLinkType[] = [];

    for (const element of this.$("a")) {
      const $link = this.$(element);
      const href = $link.attr("href");

      if (href) {
        links.push({
          href,
          text: $link.text().trim() || null,
          title: $link.attr("title") || null,
          target: $link.attr("target") || null,
          rel: $link.attr("rel") || null,
        });
      }
    }

    return links;
  }

  /**
   * Extract all headings from the HTML document
   * @returns Array of heading information
   */
  public getHeadings(): HtmlHeadingType[] {
    return this.$("h1, h2, h3, h4, h5, h6")
      .elements()
      .map((element) => ({
        level: Number.parseInt(element.tagName.charAt(1), 10),
        text: element.textContent.trim(),
        id: element.getAttribute("id") || null,
      }));
  }

  /**
   * Extract all videos from the HTML document
   * @returns Array of video information
   */
  public getVideos(): HtmlVideoType[] {
    const videos: HtmlVideoType[] = [];

    for (const element of this.$("video")) {
      const $video = this.$(element);
      videos.push({
        src: $video.attr("src") || null,
        poster: $video.attr("poster") || null,
        width: $video.attr("width") || null,
        height: $video.attr("height") || null,
        controls: $video.attr("controls") !== undefined,
        autoplay: $video.attr("autoplay") !== undefined,
        loop: $video.attr("loop") !== undefined,
        muted: $video.attr("muted") !== undefined,
        sources: this.getVideoSources($video),
      });
    }

    return videos;
  }

  /**
   * Extract all tasks (checkbox list items) from the HTML document
   * @returns Array of task information
   */
  public getTasks(): HtmlTaskType[] {
    const tasks: HtmlTaskType[] = [];

    for (const element of this.$('input[type="checkbox"]')) {
      const $checkbox = this.$(element);

      tasks.push({
        text: $checkbox.parent().text().trim(),
        checked: $checkbox.attr("checked") !== undefined,
      });
    }

    return tasks;
  }

  private getVideoSources($video: DomSelection): Array<{ src: string; type: string | null }> {
    const sources: Array<{ src: string; type: string | null }> = [];

    for (const element of $video.find("source")) {
      const $source = this.$(element);
      const src = $source.attr("src");

      if (src) {
        sources.push({
          src,
          type: $source.attr("type") || null,
        });
      }
    }

    return sources;
  }
}
