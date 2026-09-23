/**
 * Parser and renderer options
 */
export type MarkdownOptionsType = {
  /**
   * GFM tables. Default: `true`
   */
  tables?: boolean;
  /**
   * GFM strikethrough (`~~text~~`). Default: `true`
   */
  strikethrough?: boolean;
  /**
   * GFM task list items (`- [x] done`). Default: `true`
   */
  tasklists?: boolean;
  /**
   * GFM extended autolinks for bare `www.`, `http(s)://` URLs and emails. Default: `true`
   */
  autolinks?: boolean;
  /**
   * Add GitHub-style slug ids to headings. Default: `true`
   */
  headingIds?: boolean;
  /**
   * Render soft line breaks as `<br />`. Default: `false`
   */
  hardBreaks?: boolean;
  /**
   * Escape raw HTML and drop `javascript:`, `vbscript:`, `file:` and non-image `data:` URLs.
   * Enable for untrusted input. Default: `false`
   */
  sanitize?: boolean;
};

/**
 * Front matter data parsed from the leading YAML block
 */
export type MarkdownFrontMatterType = Record<string, unknown>;

/**
 * Heading information extracted from Markdown
 */
export type MarkdownHeadingType = {
  /**
   * Heading level (1-6)
   */
  level: number;
  /**
   * Heading text content
   */
  text: string;
  /**
   * Heading slug id
   */
  id: string | null;
};

/**
 * Link information extracted from Markdown
 */
export type MarkdownLinkType = {
  /**
   * Link destination URL
   */
  href: string;
  /**
   * Link text content
   */
  text: string | null;
  /**
   * Link title
   */
  title: string | null;
};

/**
 * Image information extracted from Markdown
 */
export type MarkdownImageType = {
  /**
   * Image source URL
   */
  src: string;
  /**
   * Image alt text
   */
  alt: string | null;
  /**
   * Image title
   */
  title: string | null;
};

/**
 * Task information extracted from Markdown task list items
 */
export type MarkdownTaskType = {
  /**
   * Task text content
   */
  text: string;
  /**
   * Whether the task is checked/completed
   */
  checked: boolean;
};

/**
 * Code block information extracted from Markdown
 */
export type MarkdownCodeBlockType = {
  /**
   * Language from the fence info string
   */
  language: string | null;
  /**
   * Raw code content
   */
  code: string;
};

/**
 * Interface for Markdown class
 */
export interface IMarkdown {
  /**
   * Load Markdown from a string
   * @param markdown - Markdown string to parse
   * @returns this instance for chaining
   */
  load(markdown: string): this;

  /**
   * Fetch a URL and load its Markdown
   * @param url - URL to fetch Markdown from
   * @returns Promise resolving to this instance for chaining
   */
  loadUrl(url: string | URL): Promise<this>;

  /**
   * Get the Markdown body without its front matter
   * @returns Markdown string
   */
  getMarkdown(): string;

  /**
   * Get the data parsed from the front matter
   * @returns Front matter data, empty when absent
   */
  getFrontMatter<T extends MarkdownFrontMatterType = MarkdownFrontMatterType>(): T;

  /**
   * Get the plain text content of the document
   * @returns Trimmed text content
   */
  getContent(): string;

  /**
   * Render the document to HTML
   * @returns HTML string
   */
  toHtml(): string;

  /**
   * Extract all headings from the document
   * @returns Array of heading information
   */
  getHeadings(): MarkdownHeadingType[];

  /**
   * Extract all links from the document
   * @returns Array of link information
   */
  getLinks(): MarkdownLinkType[];

  /**
   * Extract all images from the document
   * @returns Array of image information
   */
  getImages(): MarkdownImageType[];

  /**
   * Extract all task list items from the document
   * @returns Array of task information
   */
  getTasks(): MarkdownTaskType[];

  /**
   * Extract all code blocks from the document
   * @returns Array of code block information
   */
  getCodeBlocks(): MarkdownCodeBlockType[];
}
