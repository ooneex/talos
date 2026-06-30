import type { Dirent, Stats } from "node:fs";

/**
 * Interface for file operations.
 *
 * Provides methods for reading, writing, and managing files using Bun's optimized file I/O APIs.
 *
 * @example
 * ```typescript
 * import { File, type IFile } from "@talosjs/fs";
 *
 * function processFile(file: IFile): Promise<string> {
 *   return file.text();
 * }
 *
 * const file = new File("/path/to/file.txt");
 * const content = await processFile(file);
 * ```
 */
export interface IFile {
  /**
   * Returns the file path.
   *
   * @returns The absolute or relative path of the file
   *
   * @example
   * ```typescript
   * const path = file.getPath(); // "/path/to/file.txt"
   * ```
   */
  getPath: () => string;

  /**
   * Returns the file name including extension.
   *
   * @returns The base name of the file
   *
   * @example
   * ```typescript
   * const name = file.getName(); // "document.pdf"
   * ```
   */
  getName: () => string;

  /**
   * Returns the file extension without the leading dot.
   *
   * @returns The file extension or empty string if none
   *
   * @example
   * ```typescript
   * const ext = file.getExtension(); // "pdf"
   * ```
   */
  getExtension: () => string;

  /**
   * Returns the directory containing the file.
   *
   * @returns The parent directory as an IDirectory instance
   *
   * @example
   * ```typescript
   * const dir = file.getDirectory();
   * console.log(dir.getPath()); // "/path/to"
   * ```
   */
  getDirectory: () => IDirectory;

  /**
   * Returns the file size in bytes.
   *
   * @returns The size of the file in bytes, or 0 if file doesn't exist
   *
   * @example
   * ```typescript
   * const size = file.getSize(); // 1024
   * ```
   */
  getSize: () => number;

  /**
   * Returns the MIME type of the file.
   *
   * @returns The MIME type string (e.g., "text/plain", "application/json")
   *
   * @example
   * ```typescript
   * const type = file.getType(); // "application/json;charset=utf-8"
   * ```
   */
  getType: () => string;

  /**
   * Checks if the file exists on disk.
   *
   * @returns A promise that resolves to true if the file exists
   *
   * @example
   * ```typescript
   * if (await file.exists()) {
   *   console.log("File found");
   * }
   * ```
   */
  exists: () => Promise<boolean>;

  /**
   * Reads the file content as a string.
   *
   * @returns A promise that resolves to the file content as a string
   *
   * @example
   * ```typescript
   * const content = await file.text();
   * ```
   */
  text: () => Promise<string>;

  /**
   * Reads and parses the file content as JSON.
   *
   * @typeParam T - The expected type of the parsed JSON
   * @returns A promise that resolves to the parsed JSON object
   *
   * @example
   * ```typescript
   * const config = await file.json<{ name: string }>();
   * ```
   */
  json: <T = unknown>() => Promise<T>;

  /**
   * Reads the file content as an ArrayBuffer.
   *
   * @returns A promise that resolves to the file content as an ArrayBuffer
   *
   * @example
   * ```typescript
   * const buffer = await file.arrayBuffer();
   * ```
   */
  arrayBuffer: () => Promise<ArrayBuffer>;

  /**
   * Reads the file content as a Uint8Array.
   *
   * @returns A promise that resolves to the file content as a Uint8Array
   *
   * @example
   * ```typescript
   * const bytes = await file.bytes();
   * ```
   */
  bytes: () => Promise<Uint8Array>;

  /**
   * Returns a ReadableStream for incremental file reading.
   *
   * @returns A ReadableStream of Uint8Array chunks
   *
   * @example
   * ```typescript
   * const stream = file.stream();
   * for await (const chunk of file.stream()) {
   *   console.log(chunk);
   * }
   * ```
   */
  stream: () => AsyncGenerator<Uint8Array>;

  /**
   * Returns an async generator for incremental file reading as text.
   *
   * @returns An async generator that yields string chunks
   *
   * @example
   * ```typescript
   * for await (const chunk of file.streamAsText()) {
   *   console.log(chunk);
   * }
   * ```
   */
  streamAsText: () => AsyncGenerator<string>;

  /**
   * Returns an async generator for incremental JSON parsing from a JSON array file.
   *
   * @typeParam T - The expected type of each JSON element
   * @returns An async generator that yields parsed JSON elements
   *
   * @example
   * ```typescript
   * for await (const item of file.streamAsJson<{ id: number }>()) {
   *   console.log(item.id);
   * }
   * ```
   */
  streamAsJson: <T = unknown>() => AsyncGenerator<T>;

  /**
   * Writes data to the file, overwriting existing content.
   *
   * @param data - The data to write
   * @returns A promise that resolves to the number of bytes written
   *
   * @example
   * ```typescript
   * await file.write("Hello, World!");
   * ```
   */
  write: (data: FileWriteDataType) => Promise<number>;

  /**
   * Appends data to the end of the file.
   *
   * @param data - The data to append (string or Uint8Array)
   * @returns A promise that resolves to the total number of bytes in the file
   *
   * @example
   * ```typescript
   * await file.append("New line\n");
   * ```
   */
  append: (data: string | Uint8Array) => Promise<number>;

  /**
   * Copies the file to a destination path.
   *
   * @param destination - The destination file path
   * @returns A promise that resolves to a new File instance for the copied file
   *
   * @example
   * ```typescript
   * const copiedFile = await file.copy("/path/to/backup.txt");
   * ```
   */
  copy: (destination: string) => Promise<IFile>;

  /**
   * Deletes the file from disk.
   *
   * @example
   * ```typescript
   * await file.delete();
   * ```
   */
  delete: () => Promise<void>;

  /**
   * Returns a FileSink for incremental writing.
   *
   * @param options - Optional configuration for the writer
   * @returns A FileSink instance for buffered writing
   *
   * @example
   * ```typescript
   * const writer = file.writer();
   * writer.write("Line 1\n");
   * writer.end();
   * ```
   */
  writer: (options?: FileWriterOptionsType) => BunFileSinkType;
}

/**
 * Interface for directory operations.
 *
 * Provides methods for creating, listing, copying, and managing directories.
 *
 * @example
 * ```typescript
 * import { Directory, type IDirectory } from "@talosjs/fs";
 *
 * function cleanupDir(dir: IDirectory): Promise<void> {
 *   return dir.rm({ recursive: true });
 * }
 *
 * const dir = new Directory("/tmp/cache");
 * await cleanupDir(dir);
 * ```
 */
export interface IDirectory {
  /**
   * Returns the directory path.
   *
   * @returns The absolute or relative path of the directory
   *
   * @example
   * ```typescript
   * const path = dir.getPath(); // "/path/to/directory"
   * ```
   */
  getPath: () => string;

  /**
   * Returns the directory name.
   *
   * @returns The base name of the directory
   *
   * @example
   * ```typescript
   * const name = dir.getName(); // "mydir"
   * ```
   */
  getName: () => string;

  /**
   * Returns the parent directory path.
   *
   * @returns The path of the parent directory
   *
   * @example
   * ```typescript
   * const parent = dir.getParent(); // "/path/to"
   * ```
   */
  getParent: () => string;

  /**
   * Checks if the directory exists.
   *
   * @returns A promise that resolves to true if the directory exists
   *
   * @example
   * ```typescript
   * if (await dir.exists()) {
   *   console.log("Directory found");
   * }
   * ```
   */
  exists: () => Promise<boolean>;

  /**
   * Creates the directory on disk.
   *
   * @param options - Optional configuration for directory creation
   * @returns A promise that resolves when the directory is created
   *
   * @example
   * ```typescript
   * await dir.mkdir({ recursive: true });
   * ```
   */
  mkdir: (options?: DirectoryCreateOptionsType) => Promise<void>;

  /**
   * Deletes the directory from disk.
   *
   * @param options - Optional configuration for directory deletion
   * @returns A promise that resolves when the directory is deleted
   *
   * @example
   * ```typescript
   * await dir.rm({ recursive: true, force: true });
   * ```
   */
  rm: (options?: DirectoryDeleteOptionsType) => Promise<void>;

  /**
   * Lists the contents of the directory.
   *
   * @param options - Optional configuration for listing
   * @returns A promise that resolves to an array of file/directory names
   *
   * @example
   * ```typescript
   * const files = await dir.ls(); // ["file1.txt", "subdir"]
   * ```
   */
  ls: (options?: DirectoryListOptionsType) => Promise<string[]>;

  /**
   * Lists the contents of the directory with type information.
   *
   * @param options - Optional configuration for listing
   * @returns A promise that resolves to an array of Dirent objects
   *
   * @example
   * ```typescript
   * const entries = await dir.lsWithTypes();
   * entries.filter(e => e.isFile());
   * ```
   */
  lsWithTypes: (options?: DirectoryListOptionsType) => Promise<Dirent[]>;

  /**
   * Copies the directory to a destination path.
   *
   * @param destination - The destination directory path
   * @param options - Optional configuration for copying
   * @returns A promise that resolves when the directory is copied
   *
   * @example
   * ```typescript
   * await dir.cp("/path/to/backup");
   * ```
   */
  cp: (destination: string, options?: DirectoryCopyOptionsType) => Promise<void>;

  /**
   * Moves (renames) the directory to a new location.
   *
   * @param destination - The new directory path
   * @returns A promise that resolves when the directory is moved
   *
   * @example
   * ```typescript
   * await dir.mv("/path/to/newname");
   * ```
   */
  mv: (destination: string) => Promise<void>;

  /**
   * Returns the directory statistics.
   *
   * @returns A promise that resolves to a Stats object
   *
   * @example
   * ```typescript
   * const stats = await dir.stat();
   * console.log(stats.mtime);
   * ```
   */
  stat: () => Promise<Stats>;

  /**
   * Watches the directory for changes.
   *
   * @param callback - Function called when changes are detected
   * @param options - Optional configuration for watching
   * @returns A FSWatcher that can be closed to stop watching
   *
   * @example
   * ```typescript
   * const watcher = dir.watch((event, filename) => {
   *   console.log(event, filename);
   * });
   * ```
   */
  watch: (callback: DirectoryWatchCallbackType, options?: DirectoryWatchOptionsType) => DirectoryWatcherType;

  /**
   * Checks if the directory is empty.
   *
   * @returns A promise that resolves to true if the directory has no contents
   *
   * @example
   * ```typescript
   * if (await dir.isEmpty()) {
   *   await dir.rm();
   * }
   * ```
   */
  isEmpty: () => Promise<boolean>;

  /**
   * Calculates the total size of all contents in the directory.
   *
   * @returns A promise that resolves to the total size in bytes
   *
   * @example
   * ```typescript
   * const size = await dir.getSize();
   * console.log(`${size} bytes`);
   * ```
   */
  getSize: () => Promise<number>;

  /**
   * Gets a list of files (not directories) in the directory.
   *
   * @param options - Optional configuration for getting files
   * @returns An async generator that yields File instances
   *
   * @example
   * ```typescript
   * // Get immediate files
   * for await (const file of dir.getFiles()) {
   *   console.log(file.getName());
   * }
   *
   * // Get all files recursively
   * for await (const file of dir.getFiles({ recursive: true })) {
   *   console.log(file.getName());
   * }
   *
   * // Get only TypeScript files
   * for await (const file of dir.getFiles({ pattern: /\.ts$/ })) {
   *   console.log(file.getName());
   * }
   * ```
   */
  getFiles: (options?: DirectoryGetFilesOptionsType) => AsyncGenerator<IFile>;

  /**
   * Gets a list of subdirectories (not files) in the directory.
   *
   * @param options - Optional configuration for getting directories
   * @returns An async generator that yields Directory instances
   *
   * @example
   * ```typescript
   * // Get immediate subdirectories
   * for await (const subdir of dir.getDirectories()) {
   *   console.log(subdir.getName());
   * }
   *
   * // Get all subdirectories recursively
   * for await (const subdir of dir.getDirectories({ recursive: true })) {
   *   console.log(subdir.getName());
   * }
   *
   * // Get only directories starting with "test"
   * for await (const subdir of dir.getDirectories({ pattern: /^test/ })) {
   *   console.log(subdir.getName());
   * }
   * ```
   */
  getDirectories: (options?: DirectoryGetDirectoriesOptionsType) => AsyncGenerator<IDirectory>;

  /**
   * Changes to a subdirectory and returns a new Directory instance.
   *
   * @param paths - The relative path segments to the subdirectory
   * @returns A new Directory instance pointing to the subdirectory
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/project");
   *
   * // Navigate to subdirectory
   * const srcDir = dir.cd("src");
   *
   * // Navigate multiple levels with multiple args
   * const componentsDir = dir.cd("src", "components", "ui");
   *
   * // Navigate to parent
   * const parentDir = dir.cd("..");
   * ```
   */
  cd: (...paths: string[]) => IDirectory;
}

/**
 * Types of data that can be written to a file.
 *
 * Supports strings, binary data (Blob, ArrayBuffer, TypedArrays), and Response objects.
 *
 * @example
 * ```typescript
 * // String
 * await file.write("Hello, World!");
 *
 * // Uint8Array
 * await file.write(new Uint8Array([72, 101, 108, 108, 111]));
 *
 * // Response from fetch
 * const response = await fetch("https://example.com/data");
 * await file.write(response);
 * ```
 */
export type FileWriteDataType =
  | string
  | Blob
  | ArrayBuffer
  | SharedArrayBuffer
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array
  | Response;

/**
 * Options for configuring the FileSink writer.
 *
 * @example
 * ```typescript
 * const writer = file.writer({
 *   highWaterMark: 1024 * 1024 // 1MB buffer
 * });
 * ```
 */
export type FileWriterOptionsType = {
  /**
   * The buffer size in bytes before auto-flushing.
   * When the internal buffer reaches this size, it will automatically flush to disk.
   *
   * @default undefined (uses Bun's default)
   *
   * @example
   * ```typescript
   * { highWaterMark: 1024 * 1024 } // 1MB buffer
   * ```
   */
  highWaterMark?: number;
};

/**
 * Options for configuring file creation.
 *
 * @example
 * ```typescript
 * const file = new File("/path/to/file.txt", {
 *   type: "text/plain"
 * });
 * ```
 */
export type FileOptionsType = {
  /**
   * The MIME type to use for the file.
   * Overrides automatic MIME type detection.
   *
   * @example
   * ```typescript
   * { type: "application/json" }
   * { type: "text/html;charset=utf-8" }
   * ```
   */
  type?: string;
};

/**
 * Type representing Bun's FileSink for incremental file writing.
 *
 * FileSink provides buffered writing with manual flush control.
 *
 * @example
 * ```typescript
 * const writer: BunFileSinkType = file.writer();
 * writer.write("chunk 1");
 * writer.write("chunk 2");
 * writer.flush(); // Write buffer to disk
 * writer.end();   // Flush and close
 * ```
 */
export type BunFileSinkType = ReturnType<ReturnType<typeof Bun.file>["writer"]>;

/**
 * Options for creating a directory.
 *
 * @example
 * ```typescript
 * await dir.create({
 *   recursive: true,
 *   mode: 0o755
 * });
 * ```
 */
export type DirectoryCreateOptionsType = {
  /**
   * Whether to create parent directories if they don't exist.
   *
   * @default true
   *
   * @example
   * ```typescript
   * // Creates /path/to/nested/directory and all parents
   * await dir.create({ recursive: true });
   * ```
   */
  recursive?: boolean;

  /**
   * The file mode (permissions) for the directory.
   * Uses octal notation (e.g., 0o755 for rwxr-xr-x).
   *
   * @example
   * ```typescript
   * { mode: 0o700 }  // rwx------
   * { mode: 0o755 }  // rwxr-xr-x
   * ```
   */
  mode?: number;
};

/**
 * Options for deleting a directory.
 *
 * @example
 * ```typescript
 * await dir.delete({
 *   recursive: true,
 *   force: true
 * });
 * ```
 */
export type DirectoryDeleteOptionsType = {
  /**
   * Whether to delete contents recursively.
   * Required for non-empty directories.
   *
   * @default true
   *
   * @example
   * ```typescript
   * // Delete directory and all contents
   * await dir.delete({ recursive: true });
   * ```
   */
  recursive?: boolean;

  /**
   * Whether to ignore errors if directory doesn't exist.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // Won't throw if directory doesn't exist
   * await dir.delete({ force: true });
   * ```
   */
  force?: boolean;
};

/**
 * Options for listing directory contents.
 *
 * @example
 * ```typescript
 * const files = await dir.ls({ recursive: true });
 * ```
 */
export type DirectoryListOptionsType = {
  /**
   * Whether to list contents recursively including subdirectories.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // List all files in directory tree
   * const allFiles = await dir.ls({ recursive: true });
   * ```
   */
  recursive?: boolean;
};

/**
 * Options for getting files from a directory.
 *
 * @example
 * ```typescript
 * const tsFiles = await dir.getFiles({ recursive: true, pattern: /\.ts$/ });
 * ```
 */
export type DirectoryGetFilesOptionsType = {
  /**
   * Whether to get files recursively from subdirectories.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // Get all files in directory tree
   * const allFiles = await dir.getFiles({ recursive: true });
   * ```
   */
  recursive?: boolean;

  /**
   * Regular expression pattern to filter files by name.
   * Only files matching the pattern will be returned.
   *
   * @example
   * ```typescript
   * // Get only TypeScript files
   * const tsFiles = await dir.getFiles({ pattern: /\.ts$/ });
   *
   * // Get files starting with "test"
   * const testFiles = await dir.getFiles({ pattern: /^test/ });
   * ```
   */
  pattern?: RegExp;
};

/**
 * Options for getting subdirectories from a directory.
 *
 * @example
 * ```typescript
 * const srcDirs = await dir.getDirectories({ recursive: true, pattern: /^src/ });
 * ```
 */
export type DirectoryGetDirectoriesOptionsType = {
  /**
   * Whether to get directories recursively from subdirectories.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // Get all directories in directory tree
   * const allDirs = await dir.getDirectories({ recursive: true });
   * ```
   */
  recursive?: boolean;

  /**
   * Regular expression pattern to filter directories by name.
   * Only directories matching the pattern will be returned.
   *
   * @example
   * ```typescript
   * // Get only directories starting with "test"
   * const testDirs = await dir.getDirectories({ pattern: /^test/ });
   *
   * // Get directories ending with "-config"
   * const configDirs = await dir.getDirectories({ pattern: /-config$/ });
   * ```
   */
  pattern?: RegExp;
};

/**
 * Options for copying a directory.
 *
 * @example
 * ```typescript
 * await dir.copy("/path/to/destination", {
 *   recursive: true,
 *   overwrite: true
 * });
 * ```
 */
export type DirectoryCopyOptionsType = {
  /**
   * Whether to copy contents recursively.
   *
   * @default true
   *
   * @example
   * ```typescript
   * // Copy directory and all contents
   * await dir.copy(dest, { recursive: true });
   * ```
   */
  recursive?: boolean;

  /**
   * Whether to overwrite existing files at destination.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // Overwrite existing files
   * await dir.copy(dest, { overwrite: true });
   * ```
   */
  overwrite?: boolean;
};

/**
 * Options for watching a directory.
 *
 * @example
 * ```typescript
 * const watcher = dir.watch(callback, { recursive: true });
 * ```
 */
export type DirectoryWatchOptionsType = {
  /**
   * Whether to watch subdirectories recursively.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // Watch all subdirectories
   * dir.watch(callback, { recursive: true });
   * ```
   */
  recursive?: boolean;
};

/**
 * Types of events emitted by the directory watcher.
 *
 * - `"rename"`: A file or directory was created, deleted, or renamed
 * - `"change"`: A file's contents were modified
 *
 * @example
 * ```typescript
 * dir.watch((event: DirectoryWatchEventType, filename) => {
 *   if (event === "rename") {
 *     console.log("File created/deleted:", filename);
 *   } else if (event === "change") {
 *     console.log("File modified:", filename);
 *   }
 * });
 * ```
 */
export type DirectoryWatchEventType = "rename" | "change";

/**
 * Callback function for directory watch events.
 *
 * @param event - The type of change that occurred ("rename" or "change")
 * @param filename - The name of the file that changed, or null if unavailable
 *
 * @example
 * ```typescript
 * const callback: DirectoryWatchCallbackType = (event, filename) => {
 *   console.log(`${event}: ${filename}`);
 * };
 *
 * dir.watch(callback);
 * ```
 */
export type DirectoryWatchCallbackType = (event: DirectoryWatchEventType, filename: string | null) => void;

/**
 * Type representing Node.js FSWatcher returned by the watch method.
 *
 * Use the `.close()` method to stop watching.
 *
 * @example
 * ```typescript
 * const watcher: DirectoryWatcherType = dir.watch((event, filename) => {
 *   console.log(event, filename);
 * });
 *
 * // Stop watching
 * watcher.close();
 *
 * // Or close on SIGINT
 * process.on("SIGINT", () => {
 *   watcher.close();
 *   process.exit(0);
 * });
 * ```
 */
export type DirectoryWatcherType = ReturnType<typeof import("node:fs").watch>;
