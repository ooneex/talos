import type { Dirent, Stats } from "node:fs";
import { watch } from "node:fs";
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createFile, setDirectoryFactory } from "./crossFactories";
import { DirectoryException } from "./DirectoryException";
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

export class Directory implements IDirectory {
  private readonly path: string;

  constructor(path: string) {
    const isAbsolute = path.startsWith("/");
    const normalized = join(...path.split(/[/\\]/));
    this.path = isAbsolute ? `/${normalized}` : normalized;
  }

  public getPath(): string {
    return this.path;
  }

  public getName(): string {
    return basename(this.path);
  }

  public getParent(): string {
    return dirname(this.path);
  }

  public async exists(): Promise<boolean> {
    try {
      const stats = await Bun.file(this.path).stat();
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

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

  public watch(callback: DirectoryWatchCallbackType, options?: DirectoryWatchOptionsType): DirectoryWatcherType {
    return watch(this.path, { recursive: options?.recursive ?? false }, callback);
  }

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

        yield createFile(join(this.path, filePath));
      }
    } catch (error) {
      throw new DirectoryException(`Failed to get files from directory: ${this.path}`, "GET_FILES_FAILED", {
        path: this.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

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

  public cd(...paths: string[]): IDirectory {
    return new Directory(join(this.path, ...paths));
  }

  private async calculateSize(dirPath: string): Promise<number> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return this.calculateSize(fullPath);
        }
        if (entry.isFile()) {
          return Bun.file(fullPath).size;
        }
        return 0;
      }),
    );

    return sizes.reduce((total, size) => total + size, 0);
  }
}

setDirectoryFactory((path: string) => new Directory(path));
