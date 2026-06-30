import { JsonException } from "./JsonException";
import type { IJson, JsonIgnoreType, JsonLoadOptionsType, JsonToCsvOptionsType, JsonToYamlOptionsType } from "./types";

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
    let buffer = "";
    let depth = 0;
    let inString = false;
    let isEscape = false;
    let objectStart = -1;
    let arrayStarted = false;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let i = 0;
        while (i < buffer.length) {
          const char = buffer[i];

          if (isEscape) {
            isEscape = false;
            i++;
            continue;
          }

          if (char === "\\" && inString) {
            isEscape = true;
            i++;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            i++;
            continue;
          }

          if (inString) {
            i++;
            continue;
          }

          if (char === "[" && !arrayStarted) {
            arrayStarted = true;
            i++;
            continue;
          }

          if (char === "{" || char === "[") {
            if (depth === 0) {
              objectStart = i;
            }
            depth++;
          } else if (char === "}" || char === "]") {
            depth--;
            if (depth === 0 && objectStart !== -1) {
              const jsonStr = buffer.slice(objectStart, i + 1);
              let parsed: T;

              try {
                parsed = JSON.parse(jsonStr) as T;
              } catch (error) {
                throw new JsonException(`Failed to parse JSON file: ${this.path}`, "PARSE_FAILED", {
                  path: this.path,
                  error: error instanceof Error ? error.message : String(error),
                });
              }

              if (!this.isIgnored(parsed, options?.ignore)) {
                yield parsed;
              }

              buffer = buffer.slice(i + 1);
              i = -1;
              objectStart = -1;
            }
          }

          i++;
        }
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
      const row = headers.map((h) => {
        const value = String(record[h] ?? "");
        if (value.includes(separator) || value.includes('"') || value.includes("\n")) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      writer.write(`${row.join(separator)}\n`);
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

  private formatYamlValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "null";
    }

    if (typeof value === "boolean" || typeof value === "number") {
      return String(value);
    }

    const str = String(value);

    if (str.includes('"') || str.includes(":") || str.includes("#") || str.startsWith(" ") || str.endsWith(" ")) {
      return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }

    return str;
  }
}
