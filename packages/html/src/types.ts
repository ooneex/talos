/**
 * Heading information extracted from HTML
 */
export type HtmlHeadingType = {
  /**
   * Heading level (1-6)
   */
  level: number;
  /**
   * Heading text content
   */
  text: string;
  /**
   * Heading id attribute
   */
  id: string | null;
};

/**
 * Link information extracted from HTML
 */
export type HtmlLinkType = {
  /**
   * Link href URL
   */
  href: string;
  /**
   * Link text content
   */
  text: string | null;
  /**
   * Link title attribute
   */
  title: string | null;
  /**
   * Link target attribute
   */
  target: string | null;
  /**
   * Link rel attribute
   */
  rel: string | null;
};

/**
 * Image information extracted from HTML
 */
export type HtmlImageType = {
  /**
   * Image source URL
   */
  src: string;
  /**
   * Image alt text
   */
  alt: string | null;
  /**
   * Image title attribute
   */
  title: string | null;
  /**
   * Image width attribute
   */
  width: string | null;
  /**
   * Image height attribute
   */
  height: string | null;
};

/**
 * Task information extracted from HTML (checkbox list items)
 */
export type HtmlTaskType = {
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
 * Video information extracted from HTML
 */
export type HtmlVideoType = {
  /**
   * Video source URL
   */
  src: string | null;
  /**
   * Video poster image URL
   */
  poster: string | null;
  /**
   * Video width attribute
   */
  width: string | null;
  /**
   * Video height attribute
   */
  height: string | null;
  /**
   * Video controls attribute
   */
  controls: boolean;
  /**
   * Video autoplay attribute
   */
  autoplay: boolean;
  /**
   * Video loop attribute
   */
  loop: boolean;
  /**
   * Video muted attribute
   */
  muted: boolean;
  /**
   * Video source elements
   */
  sources: { src: string; type: string | null }[];
};

/**
 * Interface for HTML class
 */
export interface IHtml {
  /**
   * Load HTML from a string
   * @param html - HTML string to parse
   * @returns this instance for chaining
   */
  load(html: string): this;

  /**
   * Load HTML from a URL using Cheerio's fromURL method
   * @param url - URL to fetch HTML from
   * @returns Promise resolving to this instance for chaining
   */
  loadUrl(url: string | URL): Promise<this>;

  /**
   * Get the text content of the HTML document
   * @returns Trimmed text content
   */
  getContent(): string;

  /**
   * Get the full HTML string of the document
   * @returns HTML string
   */
  getHtml(): string;

  /**
   * Extract all images from the HTML document
   * @returns Array of image information
   */
  getImages(): HtmlImageType[];

  /**
   * Extract all links from the HTML document
   * @returns Array of link information
   */
  getLinks(): HtmlLinkType[];

  /**
   * Extract all headings from the HTML document
   * @returns Array of heading information
   */
  getHeadings(): HtmlHeadingType[];

  /**
   * Extract all videos from the HTML document
   * @returns Array of video information
   */
  getVideos(): HtmlVideoType[];

  /**
   * Extract all tasks (checkbox list items) from the HTML document
   * @returns Array of task information
   */
  getTasks(): HtmlTaskType[];
}
