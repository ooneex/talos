import { decodeEntities } from "@talosjs/html";
import type { MarkdownOptionsType } from "../types";

export type MarkdownResolvedOptionsType = Required<MarkdownOptionsType>;

export const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/;

const ESCAPE_OR_ENTITY = /\\([!-/:-@[-`{-~])|&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

const UNSAFE_URL = /^\s*(?:javascript|vbscript|file):/i;
const SAFE_DATA_URL = /^\s*data:image\/(?:png|gif|jpeg|webp);/i;

export const resolveOptions = (options: MarkdownOptionsType = {}): MarkdownResolvedOptionsType => ({
  tables: options.tables ?? true,
  strikethrough: options.strikethrough ?? true,
  tasklists: options.tasklists ?? true,
  autolinks: options.autolinks ?? true,
  headingIds: options.headingIds ?? true,
  hardBreaks: options.hardBreaks ?? false,
  sanitize: options.sanitize ?? false,
});

/**
 * Resolve backslash escapes and character references in link destinations, titles and info strings
 */
export const unescapeMarkdown = (text: string): string =>
  text.replace(ESCAPE_OR_ENTITY, (match, escaped: string | undefined) => escaped ?? decodeEntities(match));

/**
 * Percent-encode the characters a URL may not contain, keeping existing escapes
 */
export const normalizeUrl = (url: string): string =>
  url.replace(/%[0-9A-Fa-f]{2}|[^A-Za-z0-9\-._~:/?#@!$&'()*+,;=]/gu, (match) =>
    match.length === 3 && match.startsWith("%") ? match : encodeURIComponent(match),
  );

export const isUnsafeUrl = (url: string): boolean =>
  UNSAFE_URL.test(url) || (/^\s*data:/i.test(url) && !SAFE_DATA_URL.test(url));

/**
 * Case-fold and collapse whitespace so reference labels compare as CommonMark requires
 */
export const normalizeLabel = (label: string): string => label.trim().replace(/\s+/g, " ").toLowerCase().toUpperCase();

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&quot;";
  });

/**
 * GitHub-style heading slug
 */
export const slugify = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

export const indentOf = (line: string): number => line.length - line.replace(/^ +/, "").length;

export const isBlank = (line: string): boolean => /^[ \t]*$/.test(line);
