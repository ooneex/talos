import { MarkdownException } from "../MarkdownException";
import type { MarkdownFrontMatterType } from "../types";
import { YamlParser } from "./YamlParser";

const FRONT_MATTER = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export type MarkdownFrontMatterResultType = {
  data: MarkdownFrontMatterType;
  body: string;
};

/**
 * Split a leading `---` YAML block from the Markdown body and parse it
 */
export const parseFrontMatter = (markdown: string): MarkdownFrontMatterResultType => {
  const match = FRONT_MATTER.exec(markdown);
  if (!match) {
    return { data: {}, body: markdown };
  }

  let data: unknown;
  try {
    data = new YamlParser().parse(match[1] ?? "");
  } catch (error) {
    throw new MarkdownException("Failed to parse Markdown front matter", "MARKDOWN_FRONT_MATTER_INVALID", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (data !== null && (typeof data !== "object" || Array.isArray(data))) {
    throw new MarkdownException("Markdown front matter must be a key/value map", "MARKDOWN_FRONT_MATTER_INVALID", {
      type: Array.isArray(data) ? "array" : typeof data,
    });
  }

  return { data: (data ?? {}) as MarkdownFrontMatterType, body: markdown.slice(match[0].length) };
};
