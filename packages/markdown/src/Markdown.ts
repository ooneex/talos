import { Html } from "@talosjs/html";
import { MarkdownException } from "./MarkdownException";
import { BlockParser, HtmlRenderer, type MarkdownBlockType, parseFrontMatter, resolveOptions } from "./parser";
import type { MarkdownResolvedOptionsType } from "./parser/utils";
import type {
  IMarkdown,
  MarkdownCodeBlockType,
  MarkdownFrontMatterType,
  MarkdownHeadingType,
  MarkdownImageType,
  MarkdownLinkType,
  MarkdownOptionsType,
  MarkdownTaskType,
} from "./types";

const collectCodeBlocks = (blocks: MarkdownBlockType[]): MarkdownCodeBlockType[] =>
  blocks.flatMap((block): MarkdownCodeBlockType[] => {
    switch (block.type) {
      case "code":
        return [{ language: block.language, code: block.code.replace(/\n$/, "") }];
      case "blockquote":
        return collectCodeBlocks(block.children);
      case "list":
        return block.items.flatMap((item) => collectCodeBlocks(item.children));
      default:
        return [];
    }
  });

/**
 * Markdown document parser and analyzer
 */
export class Markdown implements IMarkdown {
  private readonly options: MarkdownResolvedOptionsType;
  private markdown = "";
  private frontMatter: MarkdownFrontMatterType = {};
  private html = "";
  private codeBlocks: MarkdownCodeBlockType[] = [];
  private document = new Html();

  constructor(markdown?: string, options?: MarkdownOptionsType) {
    this.options = resolveOptions(options);
    this.load(markdown ?? "");
  }

  /**
   * Load Markdown from a string
   * @param markdown - Markdown string to parse
   * @returns this instance for chaining
   */
  public load(markdown: string): this {
    const { data, body } = parseFrontMatter(markdown);
    const parsed = new BlockParser(this.options).parse(body);

    this.frontMatter = data;
    this.markdown = body;
    this.html = new HtmlRenderer(this.options).render(parsed);
    this.codeBlocks = collectCodeBlocks(parsed.blocks);
    this.document = new Html(this.html);

    return this;
  }

  /**
   * Fetch a URL and load its Markdown
   * @param url - URL to fetch Markdown from
   * @returns Promise resolving to this instance for chaining
   */
  public async loadUrl(url: string | URL): Promise<this> {
    const urlString = url instanceof URL ? url.toString() : url;
    let markdown: string;

    try {
      const response = await fetch(urlString);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }

      markdown = await response.text();
    } catch (error) {
      throw new MarkdownException(`Failed to fetch URL: ${urlString}`, "MARKDOWN_FETCH_FAILED", {
        url: urlString,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return this.load(markdown);
  }

  /**
   * Get the Markdown body without its front matter
   * @returns Markdown string
   */
  public getMarkdown(): string {
    return this.markdown;
  }

  /**
   * Get the data parsed from the front matter
   * @returns Front matter data, empty when absent
   */
  public getFrontMatter<T extends MarkdownFrontMatterType = MarkdownFrontMatterType>(): T {
    return this.frontMatter as T;
  }

  /**
   * Get the plain text content of the document
   * @returns Trimmed text content
   */
  public getContent(): string {
    return this.document.getContent();
  }

  /**
   * Render the document to HTML
   * @returns HTML string
   */
  public toHtml(): string {
    return this.html;
  }

  /**
   * Extract all headings from the document
   * @returns Array of heading information
   */
  public getHeadings(): MarkdownHeadingType[] {
    return this.document.getHeadings();
  }

  /**
   * Extract all links from the document
   * @returns Array of link information
   */
  public getLinks(): MarkdownLinkType[] {
    return this.document.getLinks().map(({ href, text, title }) => ({ href, text, title }));
  }

  /**
   * Extract all images from the document
   * @returns Array of image information
   */
  public getImages(): MarkdownImageType[] {
    return this.document.getImages().map(({ src, alt, title }) => ({ src, alt, title }));
  }

  /**
   * Extract all task list items from the document
   * @returns Array of task information
   */
  public getTasks(): MarkdownTaskType[] {
    return this.document.getTasks();
  }

  /**
   * Extract all code blocks from the document
   * @returns Array of code block information
   */
  public getCodeBlocks(): MarkdownCodeBlockType[] {
    return this.codeBlocks.map((block) => ({ ...block }));
  }
}
