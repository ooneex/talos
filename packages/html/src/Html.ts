import type { CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import { HtmlException } from "./HtmlException";
import type { HtmlHeadingType, HtmlImageType, HtmlLinkType, HtmlTaskType, HtmlVideoType, IHtml } from "./types";

/**
 * HTML document parser and analyzer using Cheerio
 */
export class Html implements IHtml {
  private $: CheerioAPI;

  constructor(html?: string) {
    this.$ = cheerio.load(html ?? "");
  }

  /**
   * Load HTML from a string
   * @param html - HTML string to parse
   * @returns this instance for chaining
   */
  public load(html: string): this {
    this.$ = cheerio.load(html);
    return this;
  }

  /**
   * Load HTML from a URL using Cheerio's fromURL method
   * @param url - URL to fetch HTML from
   * @returns Promise resolving to this instance for chaining
   */
  public async loadUrl(url: string | URL): Promise<this> {
    const urlString = url instanceof URL ? url.toString() : url;

    try {
      this.$ = await cheerio.fromURL(urlString);
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
    return this.$.html().trim() ?? "";
  }

  /**
   * Extract all images from the HTML document
   * @returns Array of image information
   */
  public getImages(): HtmlImageType[] {
    const $ = this.$;
    const images: HtmlImageType[] = [];

    $("img").each((_, element) => {
      const $img = $(element);
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
    });

    return images;
  }

  /**
   * Extract all links from the HTML document
   * @returns Array of link information
   */
  public getLinks(): HtmlLinkType[] {
    const $ = this.$;
    const links: HtmlLinkType[] = [];

    $("a").each((_, element) => {
      const $link = $(element);
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
    });

    return links;
  }

  /**
   * Extract all headings from the HTML document
   * @returns Array of heading information
   */
  public getHeadings(): HtmlHeadingType[] {
    const $ = this.$;
    const headings: HtmlHeadingType[] = [];

    $("h1, h2, h3, h4, h5, h6").each((_, element) => {
      const $heading = $(element);
      const tagName = element.tagName.toLowerCase();
      const level = Number.parseInt(tagName.charAt(1), 10);

      headings.push({
        level,
        text: $heading.text().trim(),
        id: $heading.attr("id") || null,
      });
    });

    return headings;
  }

  /**
   * Extract all videos from the HTML document
   * @returns Array of video information
   */
  public getVideos(): HtmlVideoType[] {
    const $ = this.$;
    const videos: HtmlVideoType[] = [];

    $("video").each((_, element) => {
      const $video = $(element);
      const sources: { src: string; type: string | null }[] = [];

      $video.find("source").each((_, sourceElement) => {
        const $source = $(sourceElement);
        const src = $source.attr("src");

        if (src) {
          sources.push({
            src,
            type: $source.attr("type") || null,
          });
        }
      });

      videos.push({
        src: $video.attr("src") || null,
        poster: $video.attr("poster") || null,
        width: $video.attr("width") || null,
        height: $video.attr("height") || null,
        controls: $video.attr("controls") !== undefined,
        autoplay: $video.attr("autoplay") !== undefined,
        loop: $video.attr("loop") !== undefined,
        muted: $video.attr("muted") !== undefined,
        sources,
      });
    });

    return videos;
  }

  /**
   * Extract all tasks (checkbox list items) from the HTML document
   * @returns Array of task information
   */
  public getTasks(): HtmlTaskType[] {
    const $ = this.$;
    const tasks: HtmlTaskType[] = [];

    $('input[type="checkbox"]').each((_, element) => {
      const $checkbox = $(element);
      const $parent = $checkbox.parent();
      const checked = $checkbox.attr("checked") !== undefined;

      const text = $parent.text().trim();

      tasks.push({
        text,
        checked,
      });
    });

    return tasks;
  }
}
