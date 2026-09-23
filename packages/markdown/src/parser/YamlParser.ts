type MapEntryType = { key: string; rest: string };

const ESCAPES: Record<string, string> = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\u0085",
  _: "\u00a0",
};

const HEX_ESCAPES: Record<string, number> = { x: 2, u: 4, U: 8 };

const isSequenceEntry = (text: string): boolean => text === "-" || text.startsWith("- ");

const skipSpaces = (text: string, position: number): number => {
  let cursor = position;
  while (text[cursor] === " " || text[cursor] === "\t") {
    cursor++;
  }
  return cursor;
};

/**
 * Remove a trailing `# comment`, ignoring hashes inside quotes or glued to a word
 */
const stripComment = (text: string): string => {
  let quote: string | null = null;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\" && quote === '"') {
        index++;
      } else if (char === quote) {
        quote = null;
      }
    } else if ((char === '"' || char === "'") && (index === 0 || /[\s:[{,-]/.test(text[index - 1] ?? ""))) {
      quote = char;
    } else if (char === "#" && (index === 0 || /\s/.test(text[index - 1] ?? ""))) {
      return text.slice(0, index).trimEnd();
    }
  }

  return text.trimEnd();
};

/**
 * Resolve a plain scalar with the YAML 1.2 core schema
 */
export const resolveScalar = (value: string): unknown => {
  if (/^(?:~|null|Null|NULL)?$/.test(value)) return null;
  if (/^(?:true|True|TRUE)$/.test(value)) return true;
  if (/^(?:false|False|FALSE)$/.test(value)) return false;
  if (/^[-+]?[0-9]+$/.test(value)) return Number.parseInt(value, 10);
  if (/^0x[0-9a-fA-F]+$/.test(value)) return Number.parseInt(value.slice(2), 16);
  if (/^0o[0-7]+$/.test(value)) return Number.parseInt(value.slice(2), 8);
  if (/^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/.test(value)) return Number(value);
  if (/^[-+]?\.(?:inf|Inf|INF)$/.test(value))
    return value.startsWith("-") ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  if (/^\.(?:nan|NaN|NAN)$/.test(value)) return Number.NaN;
  return value;
};

const setKey = (target: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
};

/**
 * Read a quoted scalar starting at `position`; returns the value and the position after the closing quote
 */
export const parseQuoted = (text: string, position: number): [string, number] => {
  const quote = text[position];
  let value = "";
  let cursor = position + 1;

  while (cursor < text.length) {
    const char = text[cursor] ?? "";

    if (quote === "'") {
      if (char === "'") {
        if (text[cursor + 1] !== "'") {
          return [value, cursor + 1];
        }
        cursor++;
      }
      value += char;
      cursor++;
      continue;
    }

    if (char === '"') {
      return [value, cursor + 1];
    }

    if (char === "\\") {
      const sequence = text[cursor + 1] ?? "";
      const size = HEX_ESCAPES[sequence];

      if (size !== undefined) {
        const hex = text.slice(cursor + 2, cursor + 2 + size);
        if (!new RegExp(`^[0-9a-fA-F]{${size}}$`).test(hex)) {
          throw new Error(`Invalid escape "\\${sequence}${hex}"`);
        }
        value += String.fromCodePoint(Number.parseInt(hex, 16));
        cursor += 2 + size;
        continue;
      }

      const replacement = ESCAPES[sequence];
      if (replacement === undefined) {
        throw new Error(`Invalid escape "\\${sequence}"`);
      }
      value += replacement;
      cursor += 2;
      continue;
    }

    value += char;
    cursor++;
  }

  throw new Error("Unterminated quoted scalar");
};

/**
 * Read a flow collection (`[a, b]`, `{a: 1}`) or a flow scalar starting at `position`
 */
export const parseFlow = (text: string, position: number): [unknown, number] => {
  let cursor = skipSpaces(text, position);
  const char = text[cursor];

  if (char === '"' || char === "'") {
    return parseQuoted(text, cursor);
  }

  if (char === "[") {
    const items: unknown[] = [];
    cursor = skipSpaces(text, cursor + 1);

    while (text[cursor] !== "]") {
      if (cursor >= text.length) {
        throw new Error("Unterminated flow sequence");
      }
      const [item, end] = parseFlow(text, cursor);
      items.push(item);
      cursor = skipSpaces(text, end);
      if (text[cursor] === ",") {
        cursor = skipSpaces(text, cursor + 1);
      } else if (text[cursor] !== "]") {
        throw new Error("Unterminated flow sequence");
      }
    }

    return [items, cursor + 1];
  }

  if (char === "{") {
    const map: Record<string, unknown> = {};
    cursor = skipSpaces(text, cursor + 1);

    while (text[cursor] !== "}") {
      if (cursor >= text.length) {
        throw new Error("Unterminated flow mapping");
      }

      let key: string;
      if (text[cursor] === '"' || text[cursor] === "'") {
        [key, cursor] = parseQuoted(text, cursor);
      } else {
        const match = /[^,:[\]{}]*/y;
        match.lastIndex = cursor;
        const raw = match.exec(text)?.[0] ?? "";
        key = raw.trim();
        cursor += raw.length;
      }

      cursor = skipSpaces(text, cursor);
      let value: unknown = null;
      if (text[cursor] === ":") {
        [value, cursor] = parseFlow(text, cursor + 1);
        cursor = skipSpaces(text, cursor);
      }
      setKey(map, key, value);

      if (text[cursor] === ",") {
        cursor = skipSpaces(text, cursor + 1);
      } else if (text[cursor] !== "}") {
        throw new Error("Unterminated flow mapping");
      }
    }

    return [map, cursor + 1];
  }

  const match = /[^,[\]{}]*/y;
  match.lastIndex = cursor;
  const raw = match.exec(text)?.[0] ?? "";

  return [resolveScalar(raw.trim()), cursor + raw.length];
};

const foldLines = (lines: string[]): string => {
  let result = "";
  let previousText = false;

  for (const line of lines) {
    if (line === "") {
      result += "\n";
      previousText = false;
      continue;
    }
    const indented = /^[ \t]/.test(line);
    if (previousText && !indented) {
      result += " ";
    } else if (result && !result.endsWith("\n")) {
      result += "\n";
    }
    result += line;
    previousText = !indented;
  }

  return result;
};

/**
 * Parse the block-style YAML subset used by front matter: maps, sequences, flow collections,
 * quoted, plain and block (`|`, `>`) scalars, and comments
 */
export class YamlParser {
  private lines: string[] = [];
  private index = 0;

  public parse(source: string): unknown {
    this.lines = source.replace(/\r\n?/g, "\n").split("\n");
    this.index = 0;
    this.skipEmpty();

    if (this.done()) {
      return null;
    }

    const value = this.parseNode(this.indent());
    this.skipEmpty();
    if (!this.done()) {
      this.fail("Unexpected content");
    }

    return value;
  }

  private done(): boolean {
    return this.index >= this.lines.length;
  }

  private line(): string {
    return this.lines[this.index] ?? "";
  }

  private indent(): number {
    const line = this.line();
    return line.length - line.replace(/^ +/, "").length;
  }

  private content(): string {
    return stripComment(this.line().trimStart());
  }

  private skipEmpty(): void {
    while (!this.done() && this.content() === "") {
      this.index++;
    }
  }

  private fail(message: string): never {
    throw new Error(`${message} at line ${this.index + 1}`);
  }

  private mapEntry(text: string): MapEntryType | null {
    if (text.startsWith('"') || text.startsWith("'")) {
      try {
        const [key, end] = parseQuoted(text, 0);
        const rest = /^[ \t]*:(?:[ \t]+(.*))?$/.exec(text.slice(end));
        return rest ? { key, rest: (rest[1] ?? "").trim() } : null;
      } catch {
        return null;
      }
    }

    const match = /^([^\s#'"[\]{},>|&*!%@`-][^#]*?|-[^\s#][^#]*?)[ \t]*:(?:[ \t]+(.*))?$/.exec(text);
    return match ? { key: match[1] ?? "", rest: (match[2] ?? "").trim() } : null;
  }

  private parseNode(indent: number): unknown {
    const text = this.content();

    if (isSequenceEntry(text)) {
      return this.parseSequence(indent);
    }
    if (this.mapEntry(text)) {
      return this.parseMap(indent);
    }

    return this.parseValue(text, indent - 1);
  }

  private parseMap(indent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    while (true) {
      this.skipEmpty();
      if (this.done() || this.indent() < indent) {
        break;
      }
      if (this.indent() > indent) {
        this.fail("Bad indentation");
      }

      const text = this.content();
      const entry = this.mapEntry(text);
      if (!entry) {
        if (isSequenceEntry(text)) {
          break;
        }
        this.fail("Expected a key/value pair");
      }
      if (Object.hasOwn(result, entry.key)) {
        this.fail(`Duplicate key "${entry.key}"`);
      }

      setKey(
        result,
        entry.key,
        entry.rest === "" ? this.parseNested(indent, true) : this.parseValue(entry.rest, indent),
      );
    }

    return result;
  }

  private parseSequence(indent: number): unknown[] {
    const items: unknown[] = [];

    while (true) {
      this.skipEmpty();
      if (this.done() || this.indent() < indent) {
        break;
      }
      if (this.indent() > indent) {
        this.fail("Bad indentation");
      }

      const text = this.content();
      if (!isSequenceEntry(text)) {
        break;
      }

      const rest = text.slice(1).trimStart();
      if (rest === "") {
        items.push(this.parseNested(indent, false));
        continue;
      }

      const offset = indent + text.length - rest.length;
      if (isSequenceEntry(rest) || this.mapEntry(rest)) {
        this.lines[this.index] = `${" ".repeat(offset)}${rest}`;
        items.push(this.parseNode(offset));
      } else {
        items.push(this.parseValue(rest, indent));
      }
    }

    return items;
  }

  /**
   * Value of a key or sequence entry whose content starts on the following lines
   */
  private parseNested(indent: number, allowSequence: boolean): unknown {
    this.index++;
    this.skipEmpty();

    if (this.done()) {
      return null;
    }

    const next = this.indent();
    if (next > indent) {
      return this.parseNode(next);
    }
    if (allowSequence && next === indent && isSequenceEntry(this.content())) {
      return this.parseSequence(indent);
    }

    return null;
  }

  private parseValue(text: string, parentIndent: number): unknown {
    if (/^[|>]/.test(text)) {
      return this.parseBlockScalar(text, parentIndent);
    }

    this.index++;

    if (/^["'[{]/.test(text)) {
      const [value, end] = text.startsWith("[") || text.startsWith("{") ? parseFlow(text, 0) : parseQuoted(text, 0);
      if (text.slice(end).trim()) {
        this.index--;
        this.fail("Unexpected characters after value");
      }
      return value;
    }

    let value = text;
    while (!this.done()) {
      const line = this.content();
      if (line === "" || this.indent() <= parentIndent) {
        break;
      }
      if (this.mapEntry(line) || isSequenceEntry(line)) {
        this.fail("Bad indentation");
      }
      value += ` ${line}`;
      this.index++;
    }

    return resolveScalar(value);
  }

  private parseBlockScalar(header: string, parentIndent: number): string {
    const match = /^([|>])([+-]?)([1-9]?)([+-]?)$/.exec(header);
    if (!match) {
      this.fail("Invalid block scalar header");
    }

    const folded = match[1] === ">";
    const chomping = match[2] || match[4];
    const base = Math.max(parentIndent, 0);
    let contentIndent: number | null = match[3] ? base + Number(match[3]) : null;
    const lines: string[] = [];

    this.index++;
    while (!this.done()) {
      const line = this.line();
      if (!line.trim()) {
        lines.push("");
        this.index++;
        continue;
      }
      const indent = this.indent();
      if (indent <= parentIndent || (contentIndent !== null && indent < contentIndent)) {
        break;
      }
      contentIndent ??= indent;
      lines.push(line.slice(contentIndent));
      this.index++;
    }

    let end = lines.length;
    while (end > 0 && lines[end - 1] === "") {
      end--;
    }

    const content = lines.slice(0, end);
    const text = folded ? foldLines(content) : content.join("\n");

    if (!text || chomping === "-") {
      return text;
    }
    return chomping === "+" ? `${text}\n${"\n".repeat(lines.length - end)}` : `${text}\n`;
  }
}
