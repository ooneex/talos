import { decodeEntities } from "@talosjs/html";
import type { MarkdownReferenceType } from "./nodes";
import {
  ASCII_PUNCTUATION,
  escapeHtml,
  isUnsafeUrl,
  type MarkdownResolvedOptionsType,
  normalizeLabel,
  normalizeUrl,
  resolveOptions,
  unescapeMarkdown,
} from "./utils";

type DelimiterNodeType = {
  kind: "delimiter";
  char: string;
  count: number;
  length: number;
  canOpen: boolean;
  canClose: boolean;
  active: boolean;
};

type BracketNodeType = { kind: "bracket"; image: boolean; active: boolean; position: number };

export type InlineNodeType =
  | { kind: "text"; value: string }
  | { kind: "html"; value: string; plain: string }
  | { kind: "autolink"; href: string; text: string }
  | DelimiterNodeType
  | BracketNodeType;

type LinkTargetType = { href: string; title: string | null; end: number };

const ENTITY = /&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/y;
const URI_AUTOLINK = /<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>\0-\x1f]*)>/y;
const EMAIL_AUTOLINK =
  /<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/y;
const RAW_HTML = new RegExp(
  [
    "<[A-Za-z][A-Za-z0-9-]*(?:\\s+[A-Za-z_:][\\w.:-]*(?:\\s*=\\s*(?:[^\\s\"'=<>`]+|'[^']*'|\"[^\"]*\"))?)*\\s*/?>",
    "</[A-Za-z][A-Za-z0-9-]*\\s*>",
    "<!-->|<!--->|<!--[\\s\\S]*?-->",
    "<\\?[\\s\\S]*?\\?>",
    "<![A-Za-z][^>]*>",
    "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>",
  ].join("|"),
  "y",
);
const EXTENDED_URL = /(?:https?:\/\/|ftp:\/\/|www\.)[\w-]+(?:\.[\w-]+)*[^\s<]*/iy;
const EXTENDED_EMAIL = /[a-zA-Z0-9._+-]+@[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+/y;
const REFERENCE_LABEL = /\[((?:[^\\[\]]|\\.){0,999})\]/y;

const isWhitespace = (char: string): boolean => /^\s$/u.test(char);
const isPunctuation = (char: string): boolean => /^[\p{P}\p{S}]$/u.test(char);

const matchAt = (pattern: RegExp, source: string, position: number): RegExpExecArray | null => {
  pattern.lastIndex = position;
  return pattern.exec(source);
};

/**
 * Drop trailing punctuation that GFM excludes from extended autolinks
 */
const trimAutolink = (url: string): string => {
  let result = url;
  let changed = true;

  while (changed) {
    changed = false;
    const entity = /&[a-zA-Z0-9]+;$/.exec(result);

    if (entity) {
      result = result.slice(0, entity.index);
      changed = true;
    } else if (/[?!.,:*_~'"]$/.test(result)) {
      result = result.slice(0, -1);
      changed = true;
    } else if (result.endsWith(")")) {
      const open = result.split("(").length;
      const close = result.split(")").length;
      if (close > open) {
        result = result.slice(0, -1);
        changed = true;
      }
    }
  }

  return result;
};

/**
 * Parse and render inline Markdown (emphasis, code, links, images, autolinks, raw HTML and line breaks)
 */
export class InlineParser {
  private readonly options: MarkdownResolvedOptionsType;
  private readonly references: Map<string, MarkdownReferenceType>;

  constructor(options?: MarkdownResolvedOptionsType, references?: Map<string, MarkdownReferenceType>) {
    this.options = options ?? resolveOptions();
    this.references = references ?? new Map();
  }

  public render(source: string): string {
    return this.toHtml(this.parse(source));
  }

  public toHtml(nodes: InlineNodeType[], inLink = false): string {
    return nodes
      .map((node) => {
        switch (node.kind) {
          case "text":
            return escapeHtml(node.value);
          case "html":
            return node.value;
          case "autolink":
            return inLink ? escapeHtml(node.text) : `<a href="${escapeHtml(node.href)}">${escapeHtml(node.text)}</a>`;
          case "delimiter":
            return node.char.repeat(node.count);
          default:
            return node.image ? "![" : "[";
        }
      })
      .join("");
  }

  public toPlain(nodes: InlineNodeType[]): string {
    return nodes
      .map((node) => {
        switch (node.kind) {
          case "text":
            return node.value;
          case "html":
            return node.plain;
          case "autolink":
            return node.text;
          case "delimiter":
            return node.char.repeat(node.count);
          default:
            return node.image ? "![" : "[";
        }
      })
      .join("");
  }

  public parse(source: string): InlineNodeType[] {
    const nodes: InlineNodeType[] = [];
    const brackets: BracketNodeType[] = [];
    let text = "";
    let position = 0;

    const flush = (): void => {
      if (text) {
        nodes.push({ kind: "text", value: text });
        text = "";
      }
    };
    const push = (node: InlineNodeType): void => {
      flush();
      nodes.push(node);
    };

    while (position < source.length) {
      const char = source[position] ?? "";

      if (char === "\\") {
        const next = source[position + 1] ?? "";
        if (next === "\n") {
          push({ kind: "html", value: "<br />\n", plain: "\n" });
          position = this.skipLeadingSpaces(source, position + 2);
        } else if (ASCII_PUNCTUATION.test(next)) {
          text += next;
          position += 2;
        } else {
          text += char;
          position++;
        }
      } else if (char === "`") {
        const [node, end] = this.parseCodeSpan(source, position);
        if (node) {
          push(node);
        } else {
          text += source.slice(position, end);
        }
        position = end;
      } else if (char === "*" || char === "_" || (char === "~" && this.options.strikethrough)) {
        const [node, end] = this.parseDelimiter(source, position);
        if (node) {
          push(node);
        } else {
          text += source.slice(position, end);
        }
        position = end;
      } else if (char === "[" || (char === "!" && source[position + 1] === "[")) {
        const image = char === "!";
        const bracket: BracketNodeType = {
          kind: "bracket",
          image,
          active: true,
          position: position + (image ? 2 : 1),
        };
        push(bracket);
        brackets.push(bracket);
        position = bracket.position;
      } else if (char === "]") {
        flush();
        const end = this.closeBracket(source, position, nodes, brackets);
        if (end === null) {
          text += "]";
          position++;
        } else {
          position = end;
        }
      } else if (char === "<") {
        const [node, end] = this.parseAngle(source, position);
        if (node) {
          push(node);
        } else {
          text += char;
        }
        position = end;
      } else if (char === "&") {
        const entity = matchAt(ENTITY, source, position);
        text += entity ? decodeEntities(entity[0]) : char;
        position += entity ? entity[0].length : 1;
      } else if (char === "\n") {
        const hard = / {2,}$/.test(text) || this.options.hardBreaks;
        text = text.replace(/ +$/, "");
        if (hard) {
          push({ kind: "html", value: "<br />\n", plain: "\n" });
        } else {
          text += "\n";
        }
        position = this.skipLeadingSpaces(source, position + 1);
      } else {
        const autolink = this.parseExtendedAutolink(source, position, brackets.length > 0);
        if (autolink) {
          push(autolink[0]);
          position = autolink[1];
        } else {
          text += char;
          position++;
        }
      }
    }

    flush();
    this.processEmphasis(nodes, 0);

    return nodes;
  }

  private skipLeadingSpaces(source: string, position: number): number {
    let cursor = position;
    while (source[cursor] === " ") {
      cursor++;
    }
    return cursor;
  }

  private parseCodeSpan(source: string, position: number): [InlineNodeType | null, number] {
    let length = 0;
    while (source[position + length] === "`") {
      length++;
    }

    const closing = new RegExp(`(?<!\`)\`{${length}}(?!\`)`, "g");
    closing.lastIndex = position + length;
    const match = closing.exec(source);

    if (!match) {
      return [null, position + length];
    }

    let code = source.slice(position + length, match.index).replace(/\n/g, " ");
    if (code.length > 1 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) {
      code = code.slice(1, -1);
    }

    return [{ kind: "html", value: `<code>${escapeHtml(code)}</code>`, plain: code }, match.index + length];
  }

  private parseDelimiter(source: string, position: number): [DelimiterNodeType | null, number] {
    const char = source[position] ?? "";
    let length = 0;
    while (source[position + length] === char) {
      length++;
    }

    if (char === "~" && length > 2) {
      return [null, position + length];
    }

    const before = source[position - 1] ?? "\n";
    const after = source[position + length] ?? "\n";
    const leftFlanking =
      !isWhitespace(after) && (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before));
    const rightFlanking =
      !isWhitespace(before) && (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after));

    const canOpen = char === "_" ? leftFlanking && (!rightFlanking || isPunctuation(before)) : leftFlanking;
    const canClose = char === "_" ? rightFlanking && (!leftFlanking || isPunctuation(after)) : rightFlanking;

    return [{ kind: "delimiter", char, count: length, length, canOpen, canClose, active: true }, position + length];
  }

  private parseAngle(source: string, position: number): [InlineNodeType | null, number] {
    const uri = matchAt(URI_AUTOLINK, source, position);
    if (uri) {
      const url = uri[1] ?? "";
      return [{ kind: "autolink", href: normalizeUrl(url), text: url }, position + uri[0].length];
    }

    const email = matchAt(EMAIL_AUTOLINK, source, position);
    if (email) {
      const address = email[1] ?? "";
      return [{ kind: "autolink", href: `mailto:${normalizeUrl(address)}`, text: address }, position + email[0].length];
    }

    const html = this.options.sanitize ? null : matchAt(RAW_HTML, source, position);
    if (html) {
      return [{ kind: "html", value: html[0], plain: "" }, position + html[0].length];
    }

    return [null, position + 1];
  }

  private parseExtendedAutolink(source: string, position: number, inBracket: boolean): [InlineNodeType, number] | null {
    const before = source[position - 1];
    if (!this.options.autolinks || (before !== undefined && !/[\s*_~(]/.test(before))) {
      return null;
    }

    const url = matchAt(EXTENDED_URL, source, position);
    if (url) {
      const text = trimAutolink(inBracket ? (url[0].split("]")[0] ?? "") : url[0]);
      const href = /^www\./i.test(text) ? `http://${text}` : text;
      return [{ kind: "autolink", href: normalizeUrl(href), text }, position + text.length];
    }

    const email = matchAt(EXTENDED_EMAIL, source, position);
    if (email) {
      const text = email[0].replace(/\.$/, "");
      if (/[-_]$/.test(text)) {
        return null;
      }
      return [{ kind: "autolink", href: `mailto:${normalizeUrl(text)}`, text }, position + text.length];
    }

    return null;
  }

  /**
   * Resolve a closing bracket into a link or image; returns the position after it, or null when it stays literal
   */
  private closeBracket(
    source: string,
    position: number,
    nodes: InlineNodeType[],
    brackets: BracketNodeType[],
  ): number | null {
    const opener = brackets.at(-1);
    if (!opener) {
      return null;
    }
    if (!opener.active) {
      brackets.pop();
      return null;
    }

    const target = this.linkTarget(source, opener, position);
    brackets.pop();
    if (!target) {
      return null;
    }

    const inner = nodes.splice(nodes.indexOf(opener));
    inner.shift();
    this.processEmphasis(inner, 0);

    if (opener.image) {
      nodes.push(this.imageNode(inner, target));
    } else {
      for (const bracket of brackets) {
        if (!bracket.image) {
          bracket.active = false;
        }
      }
      nodes.push(this.linkNode(inner, target));
    }

    return target.end;
  }

  private linkTarget(source: string, opener: BracketNodeType, position: number): LinkTargetType | null {
    const after = position + 1;

    if (source[after] === "(") {
      const inline = this.parseInlineTarget(source, after + 1);
      if (inline) {
        return inline;
      }
    }

    const label = matchAt(REFERENCE_LABEL, source, after);
    const text = source.slice(opener.position, position);
    const explicit = label?.[1]?.trim() ? (label[1] ?? "") : null;
    const reference = this.references.get(normalizeLabel(explicit ?? text));

    if (!reference) {
      return null;
    }

    return { href: reference.href, title: reference.title, end: label ? after + label[0].length : after };
  }

  private parseInlineTarget(source: string, start: number): LinkTargetType | null {
    const skip = (from: number): number => {
      let cursor = from;
      while (/[ \t\n]/.test(source[cursor] ?? "")) {
        cursor++;
      }
      return cursor;
    };

    let position = skip(start);
    let href: string;

    if (source[position] === "<") {
      let cursor = position + 1;
      while (cursor < source.length && source[cursor] !== ">") {
        if (source[cursor] === "\n" || source[cursor] === "<") {
          return null;
        }
        cursor += source[cursor] === "\\" ? 2 : 1;
      }
      if (cursor >= source.length) {
        return null;
      }
      href = source.slice(position + 1, cursor);
      position = cursor + 1;
    } else {
      const begin = position;
      let depth = 0;
      while (position < source.length) {
        const char = source[position] ?? "";
        if (char === "\\" && ASCII_PUNCTUATION.test(source[position + 1] ?? "")) {
          position += 2;
          continue;
        }
        if (char === "(") {
          depth++;
        } else if (char === ")") {
          if (depth === 0) {
            break;
          }
          depth--;
        } else if (/[ \0-\x1f]/.test(char)) {
          break;
        }
        position++;
      }
      if (depth !== 0) {
        return null;
      }
      href = source.slice(begin, position);
    }

    const beforeTitle = position;
    position = skip(position);
    let title: string | null = null;
    const quote = source[position] ?? "";

    if (position > beforeTitle && `"'(`.includes(quote) && quote) {
      const close = quote === "(" ? ")" : quote;
      let cursor = position + 1;
      while (cursor < source.length && source[cursor] !== close) {
        if (close === ")" && source[cursor] === "(") {
          return null;
        }
        cursor += source[cursor] === "\\" ? 2 : 1;
      }
      if (cursor >= source.length) {
        return null;
      }
      title = source.slice(position + 1, cursor);
      position = skip(cursor + 1);
    }

    if (source[position] !== ")") {
      return null;
    }

    return {
      href: unescapeMarkdown(href),
      title: title === null ? null : unescapeMarkdown(title),
      end: position + 1,
    };
  }

  private linkNode(inner: InlineNodeType[], target: LinkTargetType): InlineNodeType {
    const content = this.toHtml(inner, true);
    const plain = this.toPlain(inner);

    if (this.options.sanitize && isUnsafeUrl(target.href)) {
      return { kind: "html", value: content, plain };
    }

    const title = target.title === null ? "" : ` title="${escapeHtml(target.title)}"`;
    return {
      kind: "html",
      value: `<a href="${escapeHtml(normalizeUrl(target.href))}"${title}>${content}</a>`,
      plain,
    };
  }

  private imageNode(inner: InlineNodeType[], target: LinkTargetType): InlineNodeType {
    const alt = this.toPlain(inner);

    if (this.options.sanitize && isUnsafeUrl(target.href)) {
      return { kind: "html", value: escapeHtml(alt), plain: alt };
    }

    const title = target.title === null ? "" : ` title="${escapeHtml(target.title)}"`;
    return {
      kind: "html",
      value: `<img src="${escapeHtml(normalizeUrl(target.href))}" alt="${escapeHtml(alt)}"${title} />`,
      plain: alt,
    };
  }

  private canPair(opener: DelimiterNodeType, closer: DelimiterNodeType): boolean {
    if (closer.char === "~") {
      return opener.count === closer.count;
    }
    const oddMatch =
      (opener.canClose || closer.canOpen) &&
      (opener.length + closer.length) % 3 === 0 &&
      !(opener.length % 3 === 0 && closer.length % 3 === 0);
    return !oddMatch;
  }

  /**
   * Match delimiter runs into emphasis, strong emphasis and strikethrough (CommonMark "process emphasis")
   */
  private processEmphasis(nodes: InlineNodeType[], bottom: number): void {
    const unmatched = new Set<DelimiterNodeType>();
    let closerIndex = bottom;

    while (closerIndex < nodes.length) {
      const closer = nodes[closerIndex];
      if (closer?.kind !== "delimiter" || !closer.canClose || !closer.active || unmatched.has(closer)) {
        closerIndex++;
        continue;
      }

      let openerIndex = closerIndex - 1;
      let opener: DelimiterNodeType | null = null;
      for (; openerIndex >= bottom; openerIndex--) {
        const candidate = nodes[openerIndex];
        if (
          candidate?.kind === "delimiter" &&
          candidate.char === closer.char &&
          candidate.canOpen &&
          candidate.active &&
          this.canPair(candidate, closer)
        ) {
          opener = candidate;
          break;
        }
      }

      if (!opener) {
        unmatched.add(closer);
        closerIndex++;
        continue;
      }

      const use = closer.char === "~" ? closer.count : closer.count >= 2 && opener.count >= 2 ? 2 : 1;
      const tag = closer.char === "~" ? "del" : use === 2 ? "strong" : "em";

      for (let index = openerIndex + 1; index < closerIndex; index++) {
        const node = nodes[index];
        if (node?.kind === "delimiter") {
          node.active = false;
        }
      }

      opener.count -= use;
      closer.count -= use;
      nodes.splice(closerIndex, 0, { kind: "html", value: `</${tag}>`, plain: "" });
      nodes.splice(openerIndex + 1, 0, { kind: "html", value: `<${tag}>`, plain: "" });
      closerIndex += 2;

      if (opener.count === 0) {
        nodes.splice(openerIndex, 1);
        closerIndex--;
      }
      if (closer.count === 0) {
        nodes.splice(closerIndex, 1);
      }
    }
  }
}
