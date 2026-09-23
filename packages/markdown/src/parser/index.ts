import type { MarkdownOptionsType } from "../types";
import { BlockParser } from "./BlockParser";
import { HtmlRenderer } from "./HtmlRenderer";
import type { MarkdownDocumentType } from "./nodes";
import { resolveOptions } from "./utils";

export { BlockParser, splitTableRow } from "./BlockParser";
export { type MarkdownFrontMatterResultType, parseFrontMatter } from "./frontMatter";
export { HtmlRenderer } from "./HtmlRenderer";
export { type InlineNodeType, InlineParser } from "./InlineParser";
export type {
  MarkdownAlignType,
  MarkdownBlockType,
  MarkdownDocumentType,
  MarkdownListItemType,
  MarkdownReferenceType,
} from "./nodes";
export { normalizeUrl, resolveOptions, slugify } from "./utils";
export { parseFlow, parseQuoted, resolveScalar, YamlParser } from "./YamlParser";

/**
 * Parse Markdown source into a block tree
 */
export const parseMarkdown = (markdown: string, options?: MarkdownOptionsType): MarkdownDocumentType =>
  new BlockParser(resolveOptions(options)).parse(markdown);

/**
 * Render a parsed document to HTML
 */
export const renderMarkdown = (document: MarkdownDocumentType, options?: MarkdownOptionsType): string =>
  new HtmlRenderer(resolveOptions(options)).render(document);

/**
 * Convert Markdown source to HTML
 */
export const markdownToHtml = (markdown: string, options?: MarkdownOptionsType): string =>
  renderMarkdown(parseMarkdown(markdown, options), options);
