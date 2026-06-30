/** biome-ignore-all lint/suspicious/noAssignInExpressions: trust me */
import { YAML } from "bun";
import type { IYaml, YamlLoadOptionsType, YamlToCsvOptionsType, YamlToJsonOptionsType } from "./types";
import { YamlException } from "./YamlException";

export class Yaml<T = unknown> implements IYaml<T> {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  public getPath(): string {
    return this.path;
  }

  public async *load(options?: YamlLoadOptionsType<T>): AsyncGenerator<T> {
    const file = Bun.file(this.path);
    const exists = await file.exists();

    if (!exists) {
      throw new YamlException(`YAML file not found: ${this.path}`, "FILE_NOT_FOUND", {
        path: this.path,
      });
    }

    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let isArrayFormat: boolean | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            yield* this.filter(this.parse(buffer), options?.ignore);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        if (isArrayFormat === null) {
          const trimmed = buffer.trimStart();
          if (trimmed.length > 0) {
            isArrayFormat = trimmed.startsWith("- ");
          }
        }

        if (isArrayFormat) {
          yield* this.filter(this.drainArrayItems(buffer), options?.ignore);
          const lastSep = buffer.lastIndexOf("\n\n- ");
          if (lastSep !== -1) {
            buffer = buffer.slice(lastSep + 2);
          }
        } else {
          yield* this.filter(this.drainDocuments(buffer), options?.ignore);
          const lastSep = buffer.lastIndexOf("\n---\n");
          if (lastSep !== -1) {
            buffer = buffer.slice(lastSep + 5);
          }
        }
      }
    } catch (error) {
      if (error instanceof YamlException) {
        throw error;
      }

      throw new YamlException(`Failed to read YAML file: ${this.path}`, "READ_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      reader.releaseLock();
    }
  }

  public async toJson(options: YamlToJsonOptionsType<T>): Promise<void> {
    const writer = Bun.file(options.path).writer();
    let first = true;

    writer.write("[");

    for await (const item of this.load(options.ignore ? { ignore: options.ignore } : undefined)) {
      if (!first) {
        writer.write(",");
      }
      writer.write(JSON.stringify(item));
      first = false;
    }

    writer.write("]");
    await writer.end();
  }

  public async toCsv(options: YamlToCsvOptionsType<T>): Promise<void> {
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

  private *drainArrayItems(buffer: string): Generator<T> {
    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf("\n\n- ", 1)) !== -1) {
      const item = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      if (item.trim()) {
        yield* this.parse(item);
      }
    }
  }

  private *drainDocuments(buffer: string): Generator<T> {
    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf("\n---\n")) !== -1) {
      const document = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 5);

      if (document.trim()) {
        yield* this.parse(document);
      }
    }
  }

  private *filter(items: Generator<T>, ignore?: { [K in keyof T]?: RegExp }): Generator<T> {
    if (!ignore) {
      yield* items;
      return;
    }

    for (const item of items) {
      let ignored = false;

      for (const key of Object.keys(ignore) as Array<keyof T>) {
        const pattern = ignore[key];
        if (pattern?.test(String(item[key]))) {
          ignored = true;
          break;
        }
      }

      if (!ignored) {
        yield item;
      }
    }
  }

  private *parse(content: string): Generator<T> {
    let parsed: unknown;

    try {
      parsed = YAML.parse(content);
    } catch (error) {
      throw new YamlException(`Failed to parse YAML file: ${this.path}`, "PARSE_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        yield item as T;
      }
    } else {
      yield parsed as T;
    }
  }
}
