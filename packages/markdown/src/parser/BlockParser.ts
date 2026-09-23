import type { MarkdownAlignType, MarkdownBlockType, MarkdownDocumentType, MarkdownReferenceType } from "./nodes";
import {
  indentOf,
  isBlank,
  type MarkdownResolvedOptionsType,
  normalizeLabel,
  resolveOptions,
  unescapeMarkdown,
} from "./utils";

type ParsedType = [MarkdownBlockType | null, number];

type ListMarkerType = {
  ordered: boolean;
  delimiter: string;
  start: number;
  offset: number;
  content: string;
  empty: boolean;
};

type HtmlBlockStartType = { end: RegExp | null; interrupts: boolean };

const ATX_HEADING = /^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$/;
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const BLOCKQUOTE = /^ {0,3}>/;
const BULLET = /^( {0,3})([*+-])(?=[ \t]|$)/;
const ORDERED = /^( {0,3})(\d{1,9})([.)])(?=[ \t]|$)/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const TASK = /^\[([ xX])\][ \t]+(?=\S)/;
const REFERENCE =
  /^ {0,3}\[((?:[^\\[\]]|\\.){0,999})\]:[ \t]*\n?[ \t]*(<(?:[^<>\n\\]|\\.)*>|[^\s<]\S*)(?:(?:[ \t]+|[ \t]*\n[ \t]*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?[ \t]*(?:\n|$)/;

const BLOCK_TAGS =
  "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";

const HTML_BLOCKS: [RegExp, HtmlBlockStartType][] = [
  [
    /^ {0,3}<(?:script|pre|style|textarea)(?:[ \t>]|$)/i,
    { end: /<\/(?:script|pre|style|textarea)>/i, interrupts: true },
  ],
  [/^ {0,3}<!--/, { end: /-->/, interrupts: true }],
  [/^ {0,3}<\?/, { end: /\?>/, interrupts: true }],
  [/^ {0,3}<![A-Za-z]/, { end: />/, interrupts: true }],
  [/^ {0,3}<!\[CDATA\[/, { end: /\]\]>/, interrupts: true }],
  [new RegExp(`^ {0,3}</?(?:${BLOCK_TAGS})(?:[ \\t>]|/>|$)`, "i"), { end: null, interrupts: true }],
  [
    /^ {0,3}(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)[ \t]*$/,
    { end: null, interrupts: false },
  ],
];

const expandTabs = (line: string): string => {
  const leading = /^[ \t]*/.exec(line)?.[0] ?? "";
  if (!leading.includes("\t")) {
    return line;
  }
  let expanded = "";
  for (const char of leading) {
    expanded += char === "\t" ? " ".repeat(4 - (expanded.length % 4)) : char;
  }
  return expanded + line.slice(leading.length);
};

const removeIndent = (line: string, count: number): string => line.slice(Math.min(count, indentOf(line)));

/**
 * Split a table row into cells, turning escaped pipes into literal ones
 */
export const splitTableRow = (line: string): string[] => {
  let row = line.trim();
  if (row.startsWith("|")) {
    row = row.slice(1);
  }
  if (row.endsWith("|") && !row.endsWith("\\|")) {
    row = row.slice(0, -1);
  }

  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < row.length; index++) {
    const char = row[index];
    if (char === "\\" && row[index + 1] === "|") {
      cell += "|";
      index++;
    } else if (char === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
};

const hasOpenFence = (lines: string[]): boolean => {
  let fence: string | null = null;
  for (const line of lines) {
    const match = FENCE_OPEN.exec(line);
    if (!match) {
      continue;
    }
    const marker = match[2] ?? "";
    if (fence === null) {
      fence = marker;
    } else if (marker[0] === fence[0] && marker.length >= fence.length && !(match[3] ?? "").trim()) {
      fence = null;
    }
  }
  return fence !== null;
};

/**
 * Parse Markdown source into a tree of blocks (CommonMark with GFM tables and task lists)
 */
export class BlockParser {
  private readonly options: MarkdownResolvedOptionsType;
  private references = new Map<string, MarkdownReferenceType>();
  private spaced = new WeakSet<MarkdownBlockType>();

  constructor(options?: MarkdownResolvedOptionsType) {
    this.options = options ?? resolveOptions();
  }

  public parse(markdown: string): MarkdownDocumentType {
    this.references = new Map();
    this.spaced = new WeakSet();

    const lines = markdown.replace(/\r\n?/g, "\n").replace(/\0/g, "\uFFFD").split("\n").map(expandTabs);
    if (lines.at(-1) === "") {
      lines.pop();
    }

    return { blocks: this.parseLines(lines), references: this.references };
  }

  private parseLines(lines: string[]): MarkdownBlockType[] {
    const blocks: MarkdownBlockType[] = [];
    let index = 0;
    let blank = false;

    while (index < lines.length) {
      if (isBlank(lines[index] ?? "")) {
        blank = true;
        index++;
        continue;
      }

      const [block, next] = this.parseBlock(lines, index);
      if (block) {
        if (blank && blocks.length > 0) {
          this.spaced.add(block);
        }
        blocks.push(block);
      }
      blank = false;
      index = next;
    }

    return blocks;
  }

  private parseBlock(lines: string[], index: number): ParsedType {
    const line = lines[index] ?? "";

    if (indentOf(line) >= 4) {
      return this.parseIndentedCode(lines, index);
    }

    const fence = this.fenceOpen(line);
    if (fence) {
      return this.parseFence(lines, index, fence);
    }

    if (ATX_HEADING.test(line)) {
      return [this.parseAtxHeading(line), index + 1];
    }

    if (THEMATIC_BREAK.test(line)) {
      return [{ type: "thematicBreak" }, index + 1];
    }

    if (BLOCKQUOTE.test(line)) {
      return this.parseBlockquote(lines, index);
    }

    const marker = this.listMarker(line);
    if (marker) {
      return this.parseList(lines, index, marker);
    }

    const html = this.htmlBlockStart(line);
    if (html) {
      return this.parseHtmlBlock(lines, index, html.end);
    }

    if (this.isTableStart(lines, index)) {
      return this.parseTable(lines, index);
    }

    return this.parseParagraph(lines, index);
  }

  private fenceOpen(line: string): RegExpExecArray | null {
    const match = FENCE_OPEN.exec(line);
    if (!match || (match[2]?.startsWith("`") && match[3]?.includes("`"))) {
      return null;
    }
    return match;
  }

  private parseIndentedCode(lines: string[], index: number): ParsedType {
    const code: string[] = [];
    let end = index;
    let cursor = index;

    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      if (!isBlank(line) && indentOf(line) < 4) {
        break;
      }
      code.push(line.slice(4));
      cursor++;
      if (!isBlank(line)) {
        end = cursor;
      }
    }

    return [{ type: "code", language: null, code: `${code.slice(0, end - index).join("\n")}\n` }, end];
  }

  private parseFence(lines: string[], index: number, fence: RegExpExecArray): ParsedType {
    const padding = fence[1]?.length ?? 0;
    const marker = fence[2] ?? "```";
    const closing = new RegExp(`^ {0,3}\\${marker[0]}{${marker.length},}[ \\t]*$`);
    const code: string[] = [];
    let cursor = index + 1;

    while (cursor < lines.length && !closing.test(lines[cursor] ?? "")) {
      code.push(removeIndent(lines[cursor] ?? "", padding));
      cursor++;
    }

    const info = unescapeMarkdown((fence[3] ?? "").trim());
    const language = info.split(/\s+/)[0] || null;

    return [
      { type: "code", language, code: code.length > 0 ? `${code.join("\n")}\n` : "" },
      Math.min(cursor + 1, lines.length),
    ];
  }

  private parseAtxHeading(line: string): MarkdownBlockType {
    const match = ATX_HEADING.exec(line);
    const level = match?.[1]?.length ?? 1;
    let content = (match?.[2] ?? "").trim();

    content = /^#+$/.test(content) ? "" : content.replace(/[ \t]+#+$/, "").trim();

    return { type: "heading", level, content };
  }

  private parseBlockquote(lines: string[], index: number): ParsedType {
    const inner: string[] = [];
    let cursor = index;

    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";

      if (BLOCKQUOTE.test(line)) {
        inner.push(expandTabs(line.replace(/^ {0,3}> ?/, "")));
      } else if (!isBlank(line) && this.isLazyContinuation(inner, line)) {
        inner.push(line);
      } else {
        break;
      }
      cursor++;
    }

    return [{ type: "blockquote", children: this.parseLines(inner) }, cursor];
  }

  private isLazyContinuation(previous: string[], line: string): boolean {
    const last = previous.at(-1);

    return (
      last !== undefined &&
      !isBlank(last) &&
      indentOf(last) < 4 &&
      !THEMATIC_BREAK.test(last) &&
      !ATX_HEADING.test(last) &&
      !hasOpenFence(previous) &&
      !this.interruptsParagraph(line) &&
      !SETEXT_UNDERLINE.test(line)
    );
  }

  private listMarker(line: string): ListMarkerType | null {
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    const match = bullet ?? ordered;

    if (!match || THEMATIC_BREAK.test(line)) {
      return null;
    }

    const markerEnd = match[0].length;
    const rest = line.slice(markerEnd).replace(/^\t/, "  ");
    const spaces = indentOf(rest);
    const empty = isBlank(rest);
    const padding = empty || spaces > 4 ? 1 : spaces;

    return {
      ordered: ordered !== null,
      delimiter: bullet?.[2] ?? ordered?.[3] ?? "",
      start: ordered ? Number.parseInt(ordered[2] ?? "1", 10) : 1,
      offset: markerEnd + padding,
      content: empty ? "" : rest.slice(padding),
      empty,
    };
  }

  private parseList(lines: string[], index: number, first: ListMarkerType): ParsedType {
    const items: { checked: boolean | null; children: MarkdownBlockType[] }[] = [];
    let tight = true;
    let cursor = index;

    while (cursor < lines.length) {
      const marker = this.listMarker(lines[cursor] ?? "");
      if (!marker || marker.ordered !== first.ordered || marker.delimiter !== first.delimiter) {
        break;
      }

      const content = [marker.content];
      let next = cursor + 1;

      if (!(marker.empty && (next >= lines.length || isBlank(lines[next] ?? "")))) {
        while (next < lines.length) {
          const line = lines[next] ?? "";

          if (isBlank(line)) {
            content.push("");
          } else if (indentOf(line) >= marker.offset) {
            content.push(line.slice(marker.offset));
          } else if (!this.listMarker(line) && this.isLazyContinuation(content, line)) {
            content.push(line);
          } else {
            break;
          }
          next++;
        }
      }

      let end = content.length;
      while (end > 1 && isBlank(content[end - 1] ?? "")) {
        end--;
      }
      next -= content.length - end;

      const itemLines = content.slice(0, end);
      let checked: boolean | null = null;
      const task = this.options.tasklists ? TASK.exec(itemLines[0] ?? "") : null;
      if (task) {
        checked = task[1] !== " ";
        itemLines[0] = (itemLines[0] ?? "").slice(task[0].length);
      }

      const children = this.parseLines(itemLines);
      if (children.slice(1).some((child) => this.spaced.has(child))) {
        tight = false;
      }
      items.push({ checked, children });

      let after = next;
      while (after < lines.length && isBlank(lines[after] ?? "")) {
        after++;
      }
      const following = after < lines.length ? this.listMarker(lines[after] ?? "") : null;
      const continues =
        following !== null && following.ordered === first.ordered && following.delimiter === first.delimiter;

      if (after > next && continues) {
        tight = false;
      }
      cursor = continues ? after : next;
      if (!continues) {
        break;
      }
    }

    return [{ type: "list", ordered: first.ordered, start: first.start, tight, items }, cursor];
  }

  private htmlBlockStart(line: string, interrupting = false): HtmlBlockStartType | null {
    if (this.options.sanitize) {
      return null;
    }
    for (const [pattern, start] of HTML_BLOCKS) {
      if (pattern.test(line) && (!interrupting || start.interrupts)) {
        return start;
      }
    }
    return null;
  }

  private parseHtmlBlock(lines: string[], index: number, end: RegExp | null): ParsedType {
    const content: string[] = [];
    let cursor = index;

    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      if (end === null && isBlank(line)) {
        break;
      }
      content.push(line);
      cursor++;
      if (end?.test(line)) {
        break;
      }
    }

    return [{ type: "html", content: content.join("\n") }, cursor];
  }

  private isTableStart(lines: string[], index: number): boolean {
    const header = lines[index] ?? "";
    const delimiter = lines[index + 1];

    return (
      this.options.tables &&
      delimiter !== undefined &&
      indentOf(header) < 4 &&
      header.includes("|") &&
      TABLE_DELIMITER.test(delimiter) &&
      splitTableRow(header).length === splitTableRow(delimiter).length
    );
  }

  private parseTable(lines: string[], index: number): ParsedType {
    const header = splitTableRow(lines[index] ?? "");
    const align = splitTableRow(lines[index + 1] ?? "").map((cell): MarkdownAlignType => {
      const left = cell.startsWith(":");
      const right = cell.endsWith(":");
      if (left && right) return "center";
      if (right) return "right";
      if (left) return "left";
      return null;
    });
    const rows: string[][] = [];
    let cursor = index + 2;

    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      if (isBlank(line) || this.interruptsParagraph(line)) {
        break;
      }
      const cells = splitTableRow(line);
      rows.push(header.map((_, column) => cells[column] ?? ""));
      cursor++;
    }

    return [{ type: "table", align, header, rows }, cursor];
  }

  private interruptsParagraph(line: string): boolean {
    if (indentOf(line) >= 4) {
      return false;
    }
    if (ATX_HEADING.test(line) || THEMATIC_BREAK.test(line) || BLOCKQUOTE.test(line) || this.fenceOpen(line)) {
      return true;
    }
    const marker = this.listMarker(line);
    if (marker && !marker.empty && (!marker.ordered || marker.start === 1)) {
      return true;
    }
    return this.htmlBlockStart(line, true) !== null;
  }

  private parseParagraph(lines: string[], index: number): ParsedType {
    const content = [lines[index] ?? ""];
    let cursor = index + 1;

    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      if (isBlank(line)) {
        break;
      }

      if (SETEXT_UNDERLINE.test(line)) {
        const text = this.extractReferences(this.joinParagraph(content));
        return text
          ? [{ type: "heading", level: line.trim().startsWith("=") ? 1 : 2, content: text }, cursor + 1]
          : [null, cursor];
      }

      if (this.interruptsParagraph(line) || this.isTableStart(lines, cursor)) {
        break;
      }
      content.push(line);
      cursor++;
    }

    const text = this.extractReferences(this.joinParagraph(content));
    return [text ? { type: "paragraph", content: text } : null, cursor];
  }

  private joinParagraph(lines: string[]): string {
    return lines
      .map((line) => line.replace(/^[ \t]+/, ""))
      .join("\n")
      .replace(/[ \t]+$/, "");
  }

  /**
   * Strip leading link reference definitions from a paragraph and register them
   */
  private extractReferences(text: string): string {
    let rest = text;
    let match = REFERENCE.exec(rest);

    while (match) {
      const label = normalizeLabel(match[1] ?? "");
      if (!label) {
        break;
      }

      const destination = match[2] ?? "";
      const title = match[3];

      if (!this.references.has(label)) {
        this.references.set(label, {
          href: unescapeMarkdown(destination.startsWith("<") ? destination.slice(1, -1) : destination),
          title: title === undefined ? null : unescapeMarkdown(title.slice(1, -1)),
        });
      }

      rest = rest.slice(match[0].length);
      match = REFERENCE.exec(rest);
    }

    return rest.trim();
  }
}
