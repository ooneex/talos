import { basename, dirname, extname, join } from "node:path";
import type { BunFile } from "bun";
import { Directory } from "./Directory";
import { FileException } from "./FileException";
import type {
  BunFileSinkType,
  FileOptionsType,
  FileWriteDataType,
  FileWriterOptionsType,
  IDirectory,
  IFile,
} from "./types";

/**
 * A class for performing file operations using Bun's optimized file I/O APIs.
 *
 * @example
 * ```typescript
 * import { File } from "@talosjs/fs";
 *
 * const file = new File("/path/to/file.txt");
 *
 * // Read file content
 * const content = await file.text();
 *
 * // Write to file
 * await file.write("Hello, World!");
 *
 * // Check if file exists
 * if (await file.exists()) {
 *   console.log("File exists!");
 * }
 * ```
 */
export class File implements IFile {
  private readonly path: string;
  private readonly options: FileOptionsType | undefined;

  /**
   * Creates a new File instance.
   *
   * @param path - The file path as a string or URL
   * @param options - Optional configuration options
   *
   * @example
   * ```typescript
   * // Using string path
   * const file = new File("/path/to/file.txt");
   *
   * // Using URL
   * const file = new File(new URL("file:///path/to/file.txt"));
   *
   * // With custom MIME type
   * const file = new File("/path/to/file", { type: "application/json" });
   * ```
   */
  constructor(path: string | URL, options?: FileOptionsType) {
    const pathStr = path instanceof URL ? path.pathname : path;
    const isAbsolute = pathStr.startsWith("/");
    const normalized = join(...pathStr.split(/[/\\]/));
    this.path = isAbsolute ? `/${normalized}` : normalized;
    this.options = options;
  }

  private getBunFile(): BunFile {
    return Bun.file(this.path, this.options);
  }

  /**
   * Returns the file path.
   *
   * @returns The absolute or relative path of the file
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/document.pdf");
   * console.log(file.getPath()); // "/path/to/document.pdf"
   * ```
   */
  public getPath(): string {
    return this.path;
  }

  /**
   * Returns the file name including extension.
   *
   * @returns The base name of the file
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/document.pdf");
   * console.log(file.getName()); // "document.pdf"
   * ```
   */
  public getName(): string {
    return basename(this.path);
  }

  /**
   * Returns the file extension without the leading dot.
   *
   * @returns The file extension or empty string if none
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/document.pdf");
   * console.log(file.getExtension()); // "pdf"
   *
   * const noExt = new File("/path/to/README");
   * console.log(noExt.getExtension()); // ""
   * ```
   */
  public getExtension(): string {
    const ext = extname(this.path);
    return ext.startsWith(".") ? ext.slice(1) : ext;
  }

  /**
   * Returns the directory containing the file.
   *
   * @returns The parent directory as an IDirectory instance
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/document.pdf");
   * const dir = file.getDirectory();
   * console.log(dir.getPath()); // "/path/to"
   * ```
   */
  public getDirectory(): IDirectory {
    return new Directory(dirname(this.path));
  }

  /**
   * Returns the file size in bytes.
   *
   * @returns The size of the file in bytes, or 0 if file doesn't exist
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/document.pdf");
   * console.log(file.getSize()); // 1024
   * ```
   */
  public getSize(): number {
    return this.getBunFile().size;
  }

  /**
   * Returns the MIME type of the file.
   *
   * @returns The MIME type string (e.g., "text/plain", "application/json")
   *
   * @example
   * ```typescript
   * const txtFile = new File("/path/to/file.txt");
   * console.log(txtFile.getType()); // "text/plain;charset=utf-8"
   *
   * const jsonFile = new File("/path/to/data.json");
   * console.log(jsonFile.getType()); // "application/json;charset=utf-8"
   * ```
   */
  public getType(): string {
    return this.getBunFile().type;
  }

  /**
   * Checks if the file exists on disk.
   *
   * @returns A promise that resolves to true if the file exists
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/file.txt");
   *
   * if (await file.exists()) {
   *   console.log("File exists!");
   * } else {
   *   console.log("File not found");
   * }
   * ```
   */
  public async exists(): Promise<boolean> {
    try {
      const stats = await this.getBunFile().stat();
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Reads the file content as a string.
   *
   * @returns A promise that resolves to the file content as a string
   * @throws {FileException} If the file cannot be read
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/file.txt");
   * const content = await file.text();
   * console.log(content); // "Hello, World!"
   * ```
   */
  public async text(): Promise<string> {
    try {
      return await this.getBunFile().text();
    } catch (error) {
      throw new FileException(`Failed to read file as text: ${this.path}`, "READ_TEXT_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Reads and parses the file content as JSON.
   *
   * @typeParam T - The expected type of the parsed JSON
   * @returns A promise that resolves to the parsed JSON object
   * @throws {FileException} If the file cannot be read or parsed
   *
   * @example
   * ```typescript
   * interface Config {
   *   name: string;
   *   version: number;
   * }
   *
   * const file = new File("/path/to/config.json");
   * const config = await file.json<Config>();
   * console.log(config.name); // "my-app"
   * ```
   */
  public async json<T = unknown>(): Promise<T> {
    try {
      return (await this.getBunFile().json()) as T;
    } catch (error) {
      throw new FileException(`Failed to read file as JSON: ${this.path}`, "READ_JSON_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Reads the file content as an ArrayBuffer.
   *
   * @returns A promise that resolves to the file content as an ArrayBuffer
   * @throws {FileException} If the file cannot be read
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/binary.bin");
   * const buffer = await file.arrayBuffer();
   * const view = new DataView(buffer);
   * console.log(view.getInt32(0)); // First 4 bytes as int32
   * ```
   */
  public async arrayBuffer(): Promise<ArrayBuffer> {
    try {
      return await this.getBunFile().arrayBuffer();
    } catch (error) {
      throw new FileException(`Failed to read file as ArrayBuffer: ${this.path}`, "READ_BUFFER_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Reads the file content as a Uint8Array.
   *
   * @returns A promise that resolves to the file content as a Uint8Array
   * @throws {FileException} If the file cannot be read
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/binary.bin");
   * const bytes = await file.bytes();
   * console.log(bytes[0]); // First byte
   * console.log(bytes.length); // Total bytes
   * ```
   */
  public async bytes(): Promise<Uint8Array> {
    try {
      return await this.getBunFile().bytes();
    } catch (error) {
      throw new FileException(`Failed to read file as Uint8Array: ${this.path}`, "READ_BYTES_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Returns an async generator for incremental file reading.
   *
   * @returns An async generator that yields Uint8Array chunks
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/large-file.txt");
   *
   * for await (const chunk of file.stream()) {
   *   console.log(`Received ${chunk.length} bytes`);
   * }
   * ```
   */
  public async *stream(): AsyncGenerator<Uint8Array> {
    const reader = this.getBunFile().stream().getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Returns an async generator for incremental file reading as text.
   *
   * @returns An async generator that yields string chunks
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/large-file.txt");
   *
   * for await (const chunk of file.streamAsText()) {
   *   console.log(`Received text: ${chunk}`);
   * }
   * ```
   */
  public async *streamAsText(): AsyncGenerator<string> {
    const decoder = new TextDecoder();

    for await (const chunk of this.stream()) {
      yield decoder.decode(chunk, { stream: true });
    }
  }

  /**
   * Returns an async generator for incremental JSON parsing from a JSON array file.
   *
   * Reads a file containing a JSON array and yields each parsed element individually.
   * This is useful for processing large JSON array files without loading everything into memory.
   *
   * @typeParam T - The expected type of each JSON element
   * @returns An async generator that yields parsed JSON elements
   *
   * @example
   * ```typescript
   * // For a file containing: [{"id": 1}, {"id": 2}, {"id": 3}]
   * const file = new File("/path/to/data.json");
   *
   * for await (const item of file.streamAsJson<{ id: number }>()) {
   *   console.log(item.id); // 1, 2, 3
   * }
   * ```
   */
  public async *streamAsJson<T = unknown>(): AsyncGenerator<T> {
    let buffer = "";
    let depth = 0;
    let inString = false;
    let isEscape = false;
    let objectStart = -1;
    let arrayStarted = false;

    for await (const chunk of this.streamAsText()) {
      buffer += chunk;

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
            try {
              yield JSON.parse(jsonStr) as T;
            } catch {
              // Skip invalid JSON
            }
            buffer = buffer.slice(i + 1);
            i = -1;
            objectStart = -1;
          }
        }

        i++;
      }
    }
  }

  /**
   * Writes data to the file, overwriting existing content.
   *
   * @param data - The data to write (string, Blob, ArrayBuffer, TypedArray, or Response)
   * @returns A promise that resolves to the number of bytes written
   * @throws {FileException} If the file cannot be written
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/file.txt");
   *
   * // Write string
   * await file.write("Hello, World!");
   *
   * // Write Uint8Array
   * await file.write(new Uint8Array([72, 101, 108, 108, 111]));
   *
   * // Write from Response
   * const response = await fetch("https://example.com/data");
   * await file.write(response);
   * ```
   */
  public async write(data: FileWriteDataType): Promise<number> {
    try {
      return await Bun.write(this.path, data as Parameters<typeof Bun.write>[1]);
    } catch (error) {
      throw new FileException(`Failed to write to file: ${this.path}`, "WRITE_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Appends data to the end of the file.
   *
   * @param data - The data to append (string or Uint8Array)
   * @returns A promise that resolves to the total number of bytes in the file
   * @throws {FileException} If the file cannot be appended to
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/log.txt");
   *
   * // Append string
   * await file.append("New log entry\n");
   *
   * // Append binary data
   * await file.append(new Uint8Array([10, 20, 30]));
   * ```
   */
  public async append(data: string | Uint8Array): Promise<number> {
    try {
      const bunFile = this.getBunFile();
      const fileExists = await bunFile.exists();
      const existingContent = fileExists ? await bunFile.bytes() : new Uint8Array(0);

      const newData = typeof data === "string" ? new TextEncoder().encode(data) : data;

      const combined = new Uint8Array(existingContent.length + newData.length);
      combined.set(existingContent);
      combined.set(newData, existingContent.length);

      return await Bun.write(this.path, combined);
    } catch (error) {
      throw new FileException(`Failed to append to file: ${this.path}`, "APPEND_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Copies the file to a destination path.
   *
   * @param destination - The destination file path
   * @returns A promise that resolves to a new File instance for the copied file
   * @throws {FileException} If the file cannot be copied
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/original.txt");
   * const copiedFile = await file.copy("/path/to/backup.txt");
   *
   * // The original file is preserved
   * console.log(await file.exists()); // true
   * // Access the copied file
   * console.log(await copiedFile.text()); // same content as original
   * ```
   */
  public async copy(destination: string): Promise<IFile> {
    try {
      await Bun.write(destination, this.getBunFile());
      return new File(destination);
    } catch (error) {
      throw new FileException(`Failed to copy file: ${this.path}`, "COPY_FAILED", {
        path: this.path,
        destination,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Deletes the file from disk.
   *
   * @throws {FileException} If the file cannot be deleted
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/temp.txt");
   *
   * if (await file.exists()) {
   *   await file.delete();
   *   console.log("File deleted");
   * }
   * ```
   */
  public async delete(): Promise<void> {
    try {
      await this.getBunFile().delete();
    } catch (error) {
      throw new FileException(`Failed to delete file: ${this.path}`, "DELETE_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public static async download(url: string | URL, out: string): Promise<IFile> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new FileException(`HTTP error: ${response.status} ${response.statusText}`, "DOWNLOAD_HTTP_ERROR");
      }

      await Bun.write(out, response);

      return new File(out);
    } catch (error) {
      throw new FileException(`Failed to download file from URL: ${url.toString()}`, "FILE_DOWNLOAD_FAILED", {
        path: out,
        url: url.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Returns a FileSink for incremental writing.
   *
   * @param options - Optional configuration for the writer
   * @returns A FileSink instance for buffered writing
   *
   * @example
   * ```typescript
   * const file = new File("/path/to/output.txt");
   * const writer = file.writer({ highWaterMark: 1024 * 1024 }); // 1MB buffer
   *
   * writer.write("Line 1\n");
   * writer.write("Line 2\n");
   * writer.flush(); // Flush buffer to disk
   *
   * writer.write("Line 3\n");
   * writer.end(); // Flush and close
   * ```
   */
  public writer(options?: FileWriterOptionsType): BunFileSinkType {
    return this.getBunFile().writer(options);
  }
}
