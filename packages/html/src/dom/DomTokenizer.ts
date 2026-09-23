import { decodeEntities } from "./entities";

export type DomTokenType =
  | { type: "startTag"; name: string; attributes: [string, string][]; selfClosing: boolean }
  | { type: "endTag"; name: string }
  | { type: "text"; data: string }
  | { type: "comment"; data: string }
  | { type: "doctype"; name: string };

export type DomTextModeType = "rawtext" | "rcdata" | "plaintext";

const WHITESPACE = /[\t\n\f\r ]/;
const ASCII_LETTER = /[a-zA-Z]/;

const isWhitespace = (char: string | undefined): boolean => char !== undefined && WHITESPACE.test(char);

/**
 * Splits an HTML string into tokens following the HTML5 tokenization rules
 */
export class DomTokenizer {
  private readonly input: string;
  private position = 0;
  private textMode: DomTextModeType | null = null;
  private textModeTag = "";

  constructor(input: string) {
    this.input = input.replace(/\r\n?/g, "\n");
  }

  /**
   * Switch the content model after a start tag whose content is not markup (script, style, title, ...)
   */
  public setTextMode(mode: DomTextModeType, tag: string): void {
    this.textMode = mode;
    this.textModeTag = tag;
  }

  public next(): DomTokenType | null {
    while (this.position < this.input.length) {
      const token = this.textMode ? this.readRawText(this.textMode) : this.readToken();
      if (token) {
        return token;
      }
    }

    return null;
  }

  private readRawText(mode: DomTextModeType): DomTokenType | null {
    let end = this.input.length;

    if (mode !== "plaintext") {
      const closing = new RegExp(`</${this.textModeTag}(?=[\\t\\n\\f\\r />]|$)`, "gi");
      closing.lastIndex = this.position;
      end = closing.exec(this.input)?.index ?? this.input.length;
    }

    const data = this.input.slice(this.position, end);
    this.position = end;
    this.textMode = null;

    if (!data) {
      return null;
    }

    return { type: "text", data: mode === "rcdata" ? decodeEntities(data) : data };
  }

  private readToken(): DomTokenType | null {
    const input = this.input;
    const start = this.position;

    if (input[start] !== "<") {
      const end = input.indexOf("<", start + 1);
      this.position = end === -1 ? input.length : end;
      return { type: "text", data: decodeEntities(input.slice(start, this.position)) };
    }

    const next = input[start + 1];

    if (next === "!") {
      return this.readMarkupDeclaration();
    }

    if (next === "?") {
      return this.readBogusComment(start + 1);
    }

    if (next === "/") {
      return this.readEndTag();
    }

    if (next !== undefined && ASCII_LETTER.test(next)) {
      return this.readStartTag();
    }

    this.position = start + 1;
    return { type: "text", data: "<" };
  }

  private readMarkupDeclaration(): DomTokenType {
    const input = this.input;
    const start = this.position;

    if (input.startsWith("<!--", start)) {
      for (const empty of [">", "->"]) {
        if (input.startsWith(empty, start + 4)) {
          this.position = start + 4 + empty.length;
          return { type: "comment", data: "" };
        }
      }

      const end = input.indexOf("-->", start + 4);
      this.position = end === -1 ? input.length : end + 3;
      return { type: "comment", data: input.slice(start + 4, end === -1 ? undefined : end) };
    }

    if (input.slice(start + 2, start + 9).toLowerCase() === "doctype") {
      const end = input.indexOf(">", start);
      this.position = end === -1 ? input.length : end + 1;
      const content = input.slice(start + 9, end === -1 ? undefined : end).trim();
      return { type: "doctype", name: (content.split(/[\t\n\f\r ]+/)[0] ?? "").toLowerCase() };
    }

    return this.readBogusComment(start + 2);
  }

  private readBogusComment(dataStart: number): DomTokenType {
    const end = this.input.indexOf(">", dataStart);
    this.position = end === -1 ? this.input.length : end + 1;
    return { type: "comment", data: this.input.slice(dataStart, end === -1 ? undefined : end) };
  }

  private readEndTag(): DomTokenType | null {
    const input = this.input;
    const start = this.position;
    const first = input[start + 2];

    if (first === ">") {
      this.position = start + 3;
      return null;
    }

    if (first === undefined) {
      this.position = input.length;
      return { type: "text", data: "</" };
    }

    if (!ASCII_LETTER.test(first)) {
      return this.readBogusComment(start + 2);
    }

    this.position = start + 2;
    const name = this.readTagName();
    const tag = this.readAttributes();

    return tag ? { type: "endTag", name } : null;
  }

  private readStartTag(): DomTokenType | null {
    this.position += 1;
    const name = this.readTagName();
    const tag = this.readAttributes();

    return tag ? { type: "startTag", name, ...tag } : null;
  }

  private readTagName(): string {
    const input = this.input;
    const start = this.position;

    while (this.position < input.length) {
      const char = input[this.position];
      if (isWhitespace(char) || char === "/" || char === ">") {
        break;
      }
      this.position++;
    }

    return input.slice(start, this.position).toLowerCase();
  }

  /**
   * Reads attributes up to and including the closing `>`; returns null when the input ends inside the tag
   */
  private readAttributes(): { attributes: [string, string][]; selfClosing: boolean } | null {
    const input = this.input;
    const attributes: [string, string][] = [];
    const seen = new Set<string>();

    while (this.position < input.length) {
      const char = input[this.position];

      if (isWhitespace(char)) {
        this.position++;
        continue;
      }

      if (char === ">") {
        this.position++;
        return { attributes, selfClosing: false };
      }

      if (char === "/") {
        this.position++;
        if (input[this.position] === ">") {
          this.position++;
          return { attributes, selfClosing: true };
        }
        continue;
      }

      const nameStart = this.position;
      this.position++;
      while (this.position < input.length) {
        const nameChar = input[this.position];
        if (isWhitespace(nameChar) || nameChar === "/" || nameChar === ">" || nameChar === "=") {
          break;
        }
        this.position++;
      }
      const name = input.slice(nameStart, this.position).toLowerCase();

      this.skipWhitespace();
      let value = "";

      if (input[this.position] === "=") {
        this.position++;
        this.skipWhitespace();
        const readValue = this.readAttributeValue();
        if (readValue === null) {
          return null;
        }
        value = readValue;
      }

      if (!seen.has(name)) {
        seen.add(name);
        attributes.push([name, value]);
      }
    }

    return null;
  }

  private readAttributeValue(): string | null {
    const input = this.input;
    const quote = input[this.position];

    if (quote === '"' || quote === "'") {
      const end = input.indexOf(quote, this.position + 1);
      if (end === -1) {
        this.position = input.length;
        return null;
      }
      const raw = input.slice(this.position + 1, end);
      this.position = end + 1;
      return decodeEntities(raw, true);
    }

    const start = this.position;
    while (this.position < input.length) {
      const char = input[this.position];
      if (isWhitespace(char) || char === ">") {
        break;
      }
      this.position++;
    }

    return decodeEntities(input.slice(start, this.position), true);
  }

  private skipWhitespace(): void {
    while (isWhitespace(this.input[this.position])) {
      this.position++;
    }
  }
}
