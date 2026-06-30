import type { Dirent, Stats } from "node:fs";
import { watch } from "node:fs";
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { DirectoryException } from "./DirectoryException";
import { File } from "./File";
import type {
  DirectoryCopyOptionsType,
  DirectoryCreateOptionsType,
  DirectoryDeleteOptionsType,
  DirectoryGetDirectoriesOptionsType,
  DirectoryGetFilesOptionsType,
  DirectoryListOptionsType,
  DirectoryWatchCallbackType,
  DirectoryWatcherType,
  DirectoryWatchOptionsType,
  IDirectory,
  IFile,
} from "./types";

/**
 * A class for performing directory operations using Bun's optimized fs APIs.
 *
 * @example
 * ```typescript
 * import { Directory } from "@talosjs/fs";
 *
 * const dir = new Directory("/path/to/directory");
 *
 * // Create directory
 * await dir.mkdir();
 *
 * // List contents
 * const files = await dir.ls();
 *
 * // Check if empty
 * if (await dir.isEmpty()) {
 *   await dir.rm();
 * }
 * ```
 */
export class Directory implements IDirectory {
  private readonly path: string;

  /**
   * Creates a new Directory instance.
   *
   * @param path - The directory path as a string
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   * const homeDir = new Directory("~/Documents");
   * const relativeDir = new Directory("./src");
   * ```
   */
  constructor(path: string) {
    const isAbsolute = path.startsWith("/");
    const normalized = join(...path.split(/[/\\]/));
    this.path = isAbsolute ? `/${normalized}` : normalized;
  }

  /**
   * Returns the directory path.
   *
   * @returns The absolute or relative path of the directory
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/mydir");
   * console.log(dir.getPath()); // "/path/to/mydir"
   * ```
   */
  public getPath(): string {
    return this.path;
  }

  /**
   * Returns the directory name.
   *
   * @returns The base name of the directory
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/mydir");
   * console.log(dir.getName()); // "mydir"
   * ```
   */
  public getName(): string {
    return basename(this.path);
  }

  /**
   * Returns the parent directory path.
   *
   * @returns The path of the parent directory
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/mydir");
   * console.log(dir.getParent()); // "/path/to"
   * ```
   */
  public getParent(): string {
    return dirname(this.path);
  }

  /**
   * Checks if the directory exists.
   *
   * @returns A promise that resolves to true if the directory exists
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   *
   * if (await dir.exists()) {
   *   console.log("Directory exists!");
   * } else {
   *   await dir.mkdir();
   * }
   * ```
   */
  public async exists(): Promise<boolean> {
    try {
      const stats = await Bun.file(this.path).stat();
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Creates the directory on disk.
   *
   * @param options - Optional configuration for directory creation
   * @param options.recursive - Create parent directories if needed (default: true)
   * @param options.mode - Directory permissions (e.g., 0o755)
   * @throws {DirectoryException} If the directory cannot be created
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/new/nested/directory");
   *
   * // Create with all parent directories (default behavior)
   * await dir.mkdir();
   *
   * // Create with specific permissions
   * await dir.mkdir({ mode: 0o700 });
   *
   * // Create without recursive (fails if parent doesn't exist)
   * await dir.mkdir({ recursive: false });
   * ```
   */
  public async mkdir(options?: DirectoryCreateOptionsType): Promise<void> {
    try {
      await mkdir(this.path, {
        recursive: options?.recursive ?? true,
        mode: options?.mode,
      });
    } catch (error) {
      throw new DirectoryException(`Failed to create directory: ${this.path}`, "CREATE_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Deletes the directory from disk.
   *
   * @param options - Optional configuration for directory deletion
   * @param options.recursive - Delete contents recursively (default: true)
   * @param options.force - Ignore errors if directory doesn't exist (default: false)
   * @throws {DirectoryException} If the directory cannot be deleted
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   *
   * // Delete directory and all contents
   * await dir.rm();
   *
   * // Delete only if empty
   * await dir.rm({ recursive: false });
   *
   * // Delete without throwing if doesn't exist
   * await dir.rm({ force: true });
   * ```
   */
  public async rm(options?: DirectoryDeleteOptionsType): Promise<void> {
    try {
      await rm(this.path, {
        recursive: options?.recursive ?? true,
        force: options?.force ?? false,
      });
    } catch (error) {
      throw new DirectoryException(`Failed to delete directory: ${this.path}`, "DELETE_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Lists the contents of the directory.
   *
   * @param options - Optional configuration for listing
   * @param options.recursive - List contents recursively (default: false)
   * @returns A promise that resolves to an array of file/directory names
   * @throws {DirectoryException} If the directory cannot be listed
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   *
   * // List immediate contents
   * const files = await dir.ls();
   * console.log(files); // ["file1.txt", "file2.txt", "subdir"]
   *
   * // List all contents recursively
   * const allFiles = await dir.ls({ recursive: true });
   * console.log(allFiles); // ["file1.txt", "file2.txt", "subdir", "subdir/nested.txt"]
   * ```
   */
  public async ls(options?: DirectoryListOptionsType): Promise<string[]> {
    try {
      const entries = await readdir(this.path, {
        recursive: options?.recursive ?? false,
      });
      return entries as string[];
    } catch (error) {
      throw new DirectoryException(`Failed to list directory contents: ${this.path}`, "LIST_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Lists the contents of the directory with type information.
   *
   * @param options - Optional configuration for listing
   * @param options.recursive - List contents recursively (default: false)
   * @returns A promise that resolves to an array of Dirent objects
   * @throws {DirectoryException} If the directory cannot be listed
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   * const entries = await dir.lsWithTypes();
   *
   * for (const entry of entries) {
   *   if (entry.isFile()) {
   *     console.log(`File: ${entry.name}`);
   *   } else if (entry.isDirectory()) {
   *     console.log(`Directory: ${entry.name}`);
   *   } else if (entry.isSymbolicLink()) {
   *     console.log(`Symlink: ${entry.name}`);
   *   }
   * }
   * ```
   */
  public async lsWithTypes(options?: DirectoryListOptionsType): Promise<Dirent[]> {
    try {
      return await readdir(this.path, {
        withFileTypes: true,
        recursive: options?.recursive ?? false,
      });
    } catch (error) {
      throw new DirectoryException(`Failed to list directory contents with types: ${this.path}`, "LIST_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Copies the directory to a destination path.
   *
   * @param destination - The destination directory path
   * @param options - Optional configuration for copying
   * @param options.recursive - Copy contents recursively (default: true)
   * @param options.overwrite - Overwrite existing files (default: false)
   * @throws {DirectoryException} If the directory cannot be copied
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/source");
   *
   * // Copy directory and all contents
   * await dir.cp("/path/to/destination");
   *
   * // Copy with overwrite
   * await dir.cp("/path/to/destination", { overwrite: true });
   *
   * // Copy only the directory structure (no files)
   * await dir.cp("/path/to/destination", { recursive: false });
   * ```
   */
  public async cp(destination: string, options?: DirectoryCopyOptionsType): Promise<void> {
    try {
      await cp(this.path, destination, {
        recursive: options?.recursive ?? true,
        force: options?.overwrite ?? false,
      });
    } catch (error) {
      throw new DirectoryException(`Failed to copy directory: ${this.path}`, "COPY_FAILED", {
        path: this.path,
        destination,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Moves (renames) the directory to a new location.
   *
   * @param destination - The new directory path
   * @throws {DirectoryException} If the directory cannot be moved
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/oldname");
   *
   * // Rename directory
   * await dir.mv("/path/to/newname");
   *
   * // Move to different location
   * await dir.mv("/different/path/dirname");
   * ```
   */
  public async mv(destination: string): Promise<void> {
    try {
      await rename(this.path, destination);
    } catch (error) {
      throw new DirectoryException(`Failed to move directory: ${this.path}`, "MOVE_FAILED", {
        path: this.path,
        destination,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Returns the directory statistics.
   *
   * @returns A promise that resolves to a Stats object
   * @throws {DirectoryException} If stats cannot be retrieved
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   * const stats = await dir.stat();
   *
   * console.log(stats.isDirectory()); // true
   * console.log(stats.mode);          // 16877 (permissions)
   * console.log(stats.mtime);         // Date object (modification time)
   * console.log(stats.birthtime);     // Date object (creation time)
   * ```
   */
  public async stat(): Promise<Stats> {
    try {
      return await Bun.file(this.path).stat();
    } catch (error) {
      throw new DirectoryException(`Failed to get directory stats: ${this.path}`, "STATS_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Watches the directory for changes.
   *
   * @param callback - Function called when changes are detected
   * @param options - Optional configuration for watching
   * @param options.recursive - Watch subdirectories recursively (default: false)
   * @returns A FSWatcher that can be closed to stop watching
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   *
   * // Watch for changes
   * const watcher = dir.watch((event, filename) => {
   *   console.log(`${event}: ${filename}`);
   * });
   *
   * // Watch recursively
   * const recursiveWatcher = dir.watch(
   *   (event, filename) => console.log(event, filename),
   *   { recursive: true }
   * );
   *
   * // Stop watching
   * watcher.close();
   *
   * // Handle close with SIGINT
   * process.on("SIGINT", () => {
   *   watcher.close();
   *   process.exit(0);
   * });
   * ```
   */
  public watch(callback: DirectoryWatchCallbackType, options?: DirectoryWatchOptionsType): DirectoryWatcherType {
    return watch(this.path, { recursive: options?.recursive ?? false }, callback);
  }

  /**
   * Checks if the directory is empty.
   *
   * @returns A promise that resolves to true if the directory has no contents
   * @throws {DirectoryException} If the directory cannot be checked
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   *
   * if (await dir.isEmpty()) {
   *   console.log("Directory is empty");
   *   await dir.rm();
   * } else {
   *   console.log("Directory has contents");
   * }
   * ```
   */
  public async isEmpty(): Promise<boolean> {
    try {
      const entries = await readdir(this.path);
      return entries.length === 0;
    } catch (error) {
      throw new DirectoryException(`Failed to check if directory is empty: ${this.path}`, "EMPTY_CHECK_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Calculates the total size of all contents in the directory.
   *
   * @returns A promise that resolves to the total size in bytes
   * @throws {DirectoryException} If the size cannot be calculated
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   * const sizeBytes = await dir.getSize();
   *
   * // Format as human-readable
   * const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
   * console.log(`Directory size: ${sizeMB} MB`);
   * ```
   */
  public async getSize(): Promise<number> {
    try {
      return await this.calculateSize(this.path);
    } catch (error) {
      throw new DirectoryException(`Failed to calculate directory size: ${this.path}`, "SIZE_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Gets files (not directories) in the directory as an async generator.
   *
   * @param options - Optional configuration for getting files
   * @param options.recursive - Get files recursively from subdirectories (default: false)
   * @param options.pattern - Regular expression to filter files by name
   * @returns An async generator that yields File instances
   * @throws {DirectoryException} If the files cannot be listed
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   *
   * // Get immediate files only
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
  public async *getFiles(options?: DirectoryGetFilesOptionsType): AsyncGenerator<IFile> {
    try {
      const entries = await readdir(this.path, {
        withFileTypes: true,
        recursive: options?.recursive ?? false,
      });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        let filePath: string;
        if (entry.parentPath && entry.parentPath !== this.path) {
          const relativePath = entry.parentPath.slice(this.path.length + 1);
          filePath = join(relativePath, entry.name);
        } else {
          filePath = entry.name;
        }

        if (options?.pattern && !options.pattern.test(filePath)) continue;

        yield new File(join(this.path, filePath));
      }
    } catch (error) {
      throw new DirectoryException(`Failed to get files from directory: ${this.path}`, "GET_FILES_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Gets subdirectories (not files) in the directory as an async generator.
   *
   * @param options - Optional configuration for getting directories
   * @param options.recursive - Get directories recursively from subdirectories (default: false)
   * @param options.pattern - Regular expression to filter directories by name
   * @returns An async generator that yields Directory instances
   * @throws {DirectoryException} If the directories cannot be listed
   *
   * @example
   * ```typescript
   * const dir = new Directory("/path/to/directory");
   *
   * // Get immediate subdirectories only
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
  public async *getDirectories(options?: DirectoryGetDirectoriesOptionsType): AsyncGenerator<IDirectory> {
    try {
      const entries = await readdir(this.path, {
        withFileTypes: true,
        recursive: options?.recursive ?? false,
      });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        let dirPath: string;
        if (entry.parentPath && entry.parentPath !== this.path) {
          const relativePath = entry.parentPath.slice(this.path.length + 1);
          dirPath = join(relativePath, entry.name);
        } else {
          dirPath = entry.name;
        }

        if (options?.pattern && !options.pattern.test(dirPath)) continue;

        yield new Directory(join(this.path, dirPath));
      }
    } catch (error) {
      throw new DirectoryException(`Failed to get directories from directory: ${this.path}`, "GET_DIRS_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

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
   * console.log(srcDir.getPath()); // "/path/to/project/src"
   *
   * // Navigate multiple levels with multiple args
   * const componentsDir = dir.cd("src", "components", "ui");
   * console.log(componentsDir.getPath()); // "/path/to/project/src/components/ui"
   *
   * // Navigate to parent
   * const parentDir = dir.cd("..");
   * console.log(parentDir.getPath()); // "/path/to"
   *
   * // Chain navigation
   * const deepDir = dir.cd("src").cd("components").cd("ui");
   * ```
   */
  public cd(...paths: string[]): IDirectory {
    return new Directory(join(this.path, ...paths));
  }

  private async calculateSize(dirPath: string): Promise<number> {
    let totalSize = 0;
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await this.calculateSize(fullPath);
      } else if (entry.isFile()) {
        totalSize += Bun.file(fullPath).size;
      }
    }

    return totalSize;
  }
}
