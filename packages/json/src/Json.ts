import { JsonException } from "./JsonException";
import type { IJson, JsonIgnoreType, JsonLoadOptionsType, JsonToCsvOptionsType, JsonToYamlOptionsType } from "./types";

type JsonStreamStateType = {
  buffer: string;
  depth: number;
  inString: boolean;
  isEscape: boolean;
  objectStart: number;
  arrayStarted: boolean;
};

const createStreamState = (): JsonStreamStateType => {
  return {
    buffer: "",
    depth: 0,
    inString: false,
    isEscape: false,
    objectStart: -1,
    arrayStarted: false,
  };
};

export class Json<T = unknown> implements IJson<T> {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  public getPath(): string {
    return this.path;
  }

  public async *load(options?: JsonLoadOptionsType<T>): AsyncGenerator<T> {
    const file = Bun.file(this.path);
    const exists = await file.exists();

    if (!exists) {
      throw new JsonException(`JSON file not found: ${this.path}`, "FILE_NOT_FOUND", {
        path: this.path,
      });
    }

    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    const state = createStreamState();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        state.buffer += decoder.decode(value, { stream: true });
        yield* this.readBufferedItems(state, options?.ignore);
      }
    } catch (error) {
      if (error instanceof JsonException) {
        throw error;
      }

      throw new JsonException(`Failed to read JSON file: ${this.path}`, "READ_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      reader.releaseLock();
    }
  }

  public async toYaml(options: JsonToYamlOptionsType<T>): Promise<void> {
    const writer = Bun.file(options.path).writer();
    let first = true;

    for await (const item of this.load(options.ignore ? { ignore: options.ignore } : undefined)) {
      const record = item as Record<string, unknown>;

      if (!first) {
        writer.write("\n");
      }

      const keys = Object.keys(record);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i] as string;
        const value = record[key];
        const prefix = i === 0 ? "- " : "  ";
        writer.write(`${prefix}${key}: ${this.formatYamlValue(value)}\n`);
      }

      first = false;
    }

    await writer.end();
  }

  public async toCsv(options: JsonToCsvOptionsType<T>): Promise<void> {
    const { path, headers, separator, ignore } = options;
    const writer = Bun.file(path).writer();

    writer.write(`${headers.join(separator)}\n`);

    for await (const item of this.load(ignore ? { ignore } : undefined)) {
      const record = item as Record<string, unknown>;
      writer.write(`${this.buildCsvRow(record, headers, separator)}\n`);
    }

    await writer.end();
  }

  private isIgnored(item: T, ignore?: JsonIgnoreType<T>): boolean {
    if (!ignore) {
      return false;
    }

    for (const key of Object.keys(ignore) as Array<keyof T>) {
      const pattern = ignore[key];
      if (pattern?.test(String(item[key]))) {
        return true;
      }
    }

    return false;
  }

  private *readBufferedItems(state: JsonStreamStateType, ignore?: JsonIgnoreType<T>): Generator<T> {
    let index = 0;

    while (index < state.buffer.length) {
      const outcome = this.consumeCharacter(state, index);
      index = outcome.nextIndex;

      if (!outcome.completedJson) {
        continue;
      }

      const parsed = this.parseItem(outcome.completedJson);
      if (!this.isIgnored(parsed, ignore)) {
        yield parsed;
      }
    }
  }

  private consumeCharacter(
    state: JsonStreamStateType,
    index: number,
  ): {
    nextIndex: number;
    completedJson?: string;
  } {
    const char = state.buffer[index];

    if (!char) {
      return { nextIndex: index + 1 };
    }
    if (this.consumeEscape(state, char)) {
      return { nextIndex: index + 1 };
    }
    if (this.consumeQuote(state, char)) {
      return { nextIndex: index + 1 };
    }
    if (state.inString) {
      return { nextIndex: index + 1 };
    }
    if (this.consumeArrayStart(state, char)) {
      return { nextIndex: index + 1 };
    }

    return this.consumeStructure(state, char, index);
  }

  private consumeEscape(state: JsonStreamStateType, char: string): boolean {
    if (state.isEscape) {
      state.isEscape = false;
      return true;
    }

    if (char === "\\" && state.inString) {
      state.isEscape = true;
      return true;
    }

    return false;
  }

  private consumeQuote(state: JsonStreamStateType, char: string): boolean {
    if (char !== '"') {
      return false;
    }

    state.inString = !state.inString;
    return true;
  }

  private consumeArrayStart(state: JsonStreamStateType, char: string): boolean {
    if (char !== "[" || state.arrayStarted) {
      return false;
    }

    state.arrayStarted = true;
    return true;
  }

  private consumeStructure(
    state: JsonStreamStateType,
    char: string,
    index: number,
  ): {
    nextIndex: number;
    completedJson?: string;
  } {
    if (char === "{" || char === "[") {
      if (state.depth === 0) {
        state.objectStart = index;
      }
      state.depth++;
      return { nextIndex: index + 1 };
    }

    if (char !== "}" && char !== "]") {
      return { nextIndex: index + 1 };
    }

    state.depth--;
    if (state.depth !== 0 || state.objectStart === -1) {
      return { nextIndex: index + 1 };
    }

    const completedJson = state.buffer.slice(state.objectStart, index + 1);
    state.buffer = state.buffer.slice(index + 1);
    state.objectStart = -1;

    return {
      nextIndex: 0,
      completedJson,
    };
  }

  private parseItem(content: string): T {
    try {
      return JSON.parse(content) as T;
    } catch (error) {
      throw new JsonException(`Failed to parse JSON file: ${this.path}`, "PARSE_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private buildCsvRow(record: Record<string, unknown>, headers: string[], separator: string): string {
    return headers.map((header) => this.escapeCsvValue(record[header], separator)).join(separator);
  }

  private escapeCsvValue(value: unknown, separator: string): string {
    const stringValue = String(value ?? "");
    if (!new RegExp(`["\\n${separator === "|" ? "\\|" : separator}]`).test(stringValue)) {
      return stringValue;
    }

    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  private formatYamlValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "null";
    }

    if (typeof value === "boolean" || typeof value === "number") {
      return String(value);
    }

    const str = String(value);

    const needsQuotes =
      ['"', ":", "#"].some((token) => str.includes(token)) || str.startsWith(" ") || str.endsWith(" ");

    if (needsQuotes) {
      return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }

    return str;
  }
}
