/** biome-ignore-all lint/suspicious/noAssignInExpressions: trust me */
import { CsvException } from "./CsvException";
import type {
  CsvIgnoreType,
  CsvLoadOptionsType,
  CsvSeparatorType,
  CsvToJsonOptionsType,
  CsvToYamlOptionsType,
  ICsv,
} from "./types";

export class Csv<T = unknown> implements ICsv<T> {
  private readonly path: string;
  private readonly separator: CsvSeparatorType;

  constructor(path: string, separator: CsvSeparatorType = ",") {
    this.path = path;
    this.separator = separator;
  }

  public getPath(): string {
    return this.path;
  }

  public async *load(options?: CsvLoadOptionsType<T>): AsyncGenerator<T> {
    const file = Bun.file(this.path);
    const exists = await file.exists();

    if (!exists) {
      throw new CsvException(`CSV file not found: ${this.path}`, "FILE_NOT_FOUND", {
        path: this.path,
      });
    }

    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let headers: string[] | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            if (!headers) {
              break;
            }
            const item = this.parseRow(buffer, headers);
            if (item && !this.isIgnored(item, options?.ignore)) {
              yield item;
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (!line) {
            continue;
          }

          if (!headers) {
            headers = this.parseCsvFields(line);
            continue;
          }

          const item = this.parseRow(line, headers);
          if (item && !this.isIgnored(item, options?.ignore)) {
            yield item;
          }
        }
      }
    } catch (error) {
      if (error instanceof CsvException) {
        throw error;
      }

      throw new CsvException(`Failed to read CSV file: ${this.path}`, "READ_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      reader.releaseLock();
    }
  }

  public async toJson(options: CsvToJsonOptionsType<T>): Promise<void> {
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

  public async toYaml(options: CsvToYamlOptionsType<T>): Promise<void> {
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

  private parseCsvFields(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === this.separator) {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    fields.push(current);
    return fields;
  }

  private parseRow(line: string, headers: string[]): T | null {
    const fields = this.parseCsvFields(line);
    if (fields.length !== headers.length) {
      return null;
    }

    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      record[headers[i] as string] = fields[i] as string;
    }

    return record as T;
  }

  private isIgnored(item: T, ignore?: CsvIgnoreType<T>): boolean {
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
