import { basename, dirname, extname, join } from "node:path";
import type { BunFile } from "bun";
import { createDirectory, setFileFactory } from "./crossFactories";
import { FileException } from "./FileException";
import type {
  BunFileSinkType,
  FileOptionsType,
  FileWriteDataType,
  FileWriterOptionsType,
  IDirectory,
  IFile,
} from "./types";

type JsonStreamStateType = {
  buffer: string;
  depth: number;
  inString: boolean;
  isEscape: boolean;
  objectStart: number;
  arrayStarted: boolean;
};

const createJsonStreamState = (): JsonStreamStateType => ({
  buffer: "",
  depth: 0,
  inString: false,
  isEscape: false,
  objectStart: -1,
  arrayStarted: false,
});

export class File implements IFile {
  private readonly path: string;
  private readonly options: FileOptionsType | undefined;

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

  public getPath(): string {
    return this.path;
  }

  public getName(): string {
    return basename(this.path);
  }

  public getExtension(): string {
    const ext = extname(this.path);
    return ext.startsWith(".") ? ext.slice(1) : ext;
  }

  public getDirectory(): IDirectory {
    return createDirectory(dirname(this.path));
  }

  public getSize(): number {
    return this.getBunFile().size;
  }

  public getType(): string {
    return this.getBunFile().type;
  }

  public async exists(): Promise<boolean> {
    try {
      const stats = await this.getBunFile().stat();
      return stats.isFile();
    } catch {
      return false;
    }
  }

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

  public async *streamAsText(): AsyncGenerator<string> {
    const decoder = new TextDecoder();

    for await (const chunk of this.stream()) {
      yield decoder.decode(chunk, { stream: true });
    }
  }

  public async *streamAsJson<T = unknown>(): AsyncGenerator<T> {
    const state = createJsonStreamState();

    for await (const chunk of this.streamAsText()) {
      state.buffer += chunk;
      yield* this.readBufferedJsonItems<T>(state);
    }
  }

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

  public writer(options?: FileWriterOptionsType): BunFileSinkType {
    return this.getBunFile().writer(options);
  }

  private *readBufferedJsonItems<T>(state: JsonStreamStateType): Generator<T> {
    let index = 0;

    while (index < state.buffer.length) {
      const outcome = this.consumeJsonCharacter(state, index);
      index = outcome.nextIndex;

      if (!outcome.completedJson) {
        continue;
      }

      try {
        yield JSON.parse(outcome.completedJson) as T;
      } catch {}
    }
  }

  private consumeJsonCharacter(
    state: JsonStreamStateType,
    index: number,
  ): { nextIndex: number; completedJson?: string } {
    const char = state.buffer[index];

    if (!char) {
      return { nextIndex: index + 1 };
    }
    const nextIndex = this.advanceJsonState(state, char, index);
    if (nextIndex !== null) {
      return { nextIndex };
    }

    return this.consumeStructure(state, char, index);
  }

  private advanceJsonState(state: JsonStreamStateType, char: string, index: number): number | null {
    if (state.isEscape) {
      state.isEscape = false;
      return index + 1;
    }

    if (char === "\\" && state.inString) {
      state.isEscape = true;
      return index + 1;
    }

    if (char === '"') {
      state.inString = !state.inString;
      return index + 1;
    }

    if (state.inString) {
      return index + 1;
    }

    if (char === "[" && !state.arrayStarted) {
      state.arrayStarted = true;
      return index + 1;
    }

    return null;
  }

  private consumeStructure(
    state: JsonStreamStateType,
    char: string,
    index: number,
  ): { nextIndex: number; completedJson?: string } {
    const isOpen = char === "{" || char === "[";
    const isClose = char === "}" || char === "]";

    if (!isOpen && !isClose) {
      return { nextIndex: index + 1 };
    }

    if (isOpen) {
      state.objectStart = state.depth === 0 ? index : state.objectStart;
      state.depth += 1;
      return { nextIndex: index + 1 };
    }

    state.depth -= 1;
    const hasCompleteObject = state.depth === 0 && state.objectStart !== -1;
    if (!hasCompleteObject) {
      return { nextIndex: index + 1 };
    }

    const completedJson = state.buffer.slice(state.objectStart, index + 1);
    state.buffer = state.buffer.slice(index + 1);
    state.objectStart = -1;

    return { nextIndex: 0, completedJson };
  }
}

setFileFactory((path: string) => new File(path));
