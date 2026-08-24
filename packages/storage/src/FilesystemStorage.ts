import { existsSync, mkdirSync } from "node:fs";
import { mkdir, readdir, rm, rmdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import type { BunFile, S3File, S3Options } from "bun";
import { decorator } from "./decorators";
import { Storage } from "./Storage";
import { StorageException } from "./StorageException";
import type { GetFileOptionsType } from "./types";

@decorator.storage()
export class FilesystemStorage extends Storage {
  protected bucket: string;
  private readonly storagePath: string;

  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    super();

    const basePath = this.env.FILESYSTEM_STORAGE_PATH;

    if (!basePath) {
      throw new StorageException(
        "Base path is required. Please provide a base path either through the constructor options or set the FILESYSTEM_STORAGE_PATH environment variable.",
        "STORAGE_ROOT_DIR_REQUIRED",
      );
    }

    this.storagePath = basePath;

    try {
      if (!existsSync(basePath)) {
        mkdirSync(basePath, { recursive: true });
      }
    } catch (error) {
      throw new StorageException(
        `Failed to create base storage directory at ${basePath}: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_CONFIG_REQUIRED",
      );
    }
  }

  public getOptions(): S3Options {
    return {
      accessKeyId: "filesystem",
      secretAccessKey: "filesystem",
      endpoint: this.storagePath,
      bucket: this.bucket,
      region: "local",
    };
  }

  private getBucketPath(): string {
    if (!this.bucket) {
      throw new StorageException("Bucket name is required. Please call setBucket() first.", "STORAGE_BUCKET_REQUIRED");
    }
    return join(this.storagePath, this.bucket);
  }

  private getFilePath(key: string): string {
    return join(this.getBucketPath(), key);
  }

  public override setBucket(name: string): this {
    this.bucket = name;

    const bucketPath = this.getBucketPath();
    try {
      if (!existsSync(bucketPath)) {
        mkdirSync(bucketPath, { recursive: true });
      }
    } catch (error) {
      throw new StorageException(
        `Failed to create bucket directory at ${bucketPath}: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_UPLOAD_FAILED",
      );
    }

    return this;
  }

  public override async list(): Promise<string[]> {
    const bucketPath = this.getBucketPath();

    if (!existsSync(bucketPath)) {
      return [];
    }

    try {
      const files = await this.listFilesRecursive(bucketPath, bucketPath);
      return files;
    } catch (error) {
      throw new StorageException(
        `Failed to list files in bucket: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_LIST_FAILED",
      );
    }
  }

  private async listFilesRecursive(dir: string, baseDir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });

    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          return this.listFilesRecursive(fullPath, baseDir);
        }

        return [fullPath.substring(baseDir.length + 1)];
      }),
    );

    return results.flat();
  }

  public override async clearBucket(): Promise<this> {
    const bucketPath = this.getBucketPath();

    if (!existsSync(bucketPath)) {
      return this;
    }

    try {
      await rm(bucketPath, { recursive: true });
      await mkdir(bucketPath, { recursive: true });
    } catch (error) {
      throw new StorageException(
        `Failed to clear bucket: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_CLEAR_FAILED",
      );
    }

    return this;
  }

  public override async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    const file = Bun.file(filePath);
    return await file.exists();
  }

  public override async size(key: string): Promise<number | null> {
    const file = Bun.file(this.getFilePath(key));

    return (await file.exists()) ? file.size : null;
  }

  public override async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return;
    }

    try {
      await file.delete();
      await this.deleteEmptyParentDirectories(filePath);
    } catch (error) {
      throw new StorageException(
        `Failed to delete file ${key}: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_DELETE_FAILED",
      );
    }
  }

  public override async putFile(key: string, localPath: string): Promise<number> {
    const file = Bun.file(localPath);
    return await this.put(key, file);
  }

  public override async put(
    key: string,
    content: string | ArrayBuffer | SharedArrayBuffer | Request | Response | BunFile | S3File | Blob,
  ): Promise<number> {
    const filePath = this.getFilePath(key);
    await this.ensureDirectory(dirname(filePath), "STORAGE_UPLOAD_FAILED");

    try {
      return await Bun.write(filePath, await this.normalizeContent(content));
    } catch (error) {
      throw new StorageException(
        `Failed to write file ${key}: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_UPLOAD_FAILED",
      );
    }
  }

  public override async getFile(key: string, options: GetFileOptionsType): Promise<number> {
    const filePath = this.getFilePath(key);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new StorageException(`File ${key} does not exist`, "FILE_NOT_FOUND");
    }

    const filename = options.filename ?? basename(key);
    const localPath = join(options.outputDir, filename);
    await this.ensureDirectory(dirname(localPath), "STORAGE_DOWNLOAD_FAILED");

    try {
      return await Bun.write(localPath, file);
    } catch (error) {
      throw new StorageException(
        `Failed to save file ${key} to ${localPath}: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_DOWNLOAD_FAILED",
      );
    }
  }

  public override async getAsJson<T>(key: string): Promise<T> {
    const filePath = this.getFilePath(key);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new StorageException(`File ${key} does not exist`, "FILE_NOT_FOUND");
    }

    try {
      return await file.json();
    } catch (error) {
      throw new StorageException(
        `Failed to read file ${key} as JSON: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_DOWNLOAD_FAILED",
      );
    }
  }

  public override async getAsArrayBuffer(key: string): Promise<ArrayBuffer> {
    const filePath = this.getFilePath(key);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new StorageException(`File ${key} does not exist`, "FILE_NOT_FOUND");
    }

    try {
      return await file.arrayBuffer();
    } catch (error) {
      throw new StorageException(
        `Failed to read file ${key} as ArrayBuffer: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_DOWNLOAD_FAILED",
      );
    }
  }

  public override getAsStream(key: string): ReadableStream {
    const filePath = this.getFilePath(key);

    if (!existsSync(filePath)) {
      throw new StorageException(`File ${key} does not exist`, "FILE_NOT_FOUND");
    }

    const file = Bun.file(filePath);

    try {
      return file.stream();
    } catch (error) {
      throw new StorageException(
        `Failed to read file ${key} as stream: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_DOWNLOAD_FAILED",
      );
    }
  }

  private async deleteEmptyParentDirectories(filePath: string): Promise<void> {
    let parentDir = dirname(filePath);
    const bucketPath = this.getBucketPath();

    while (parentDir !== bucketPath && parentDir !== this.storagePath) {
      const wasDeleted = await this.deleteDirectoryIfEmpty(parentDir);

      if (!wasDeleted) {
        break;
      }

      parentDir = dirname(parentDir);
    }
  }

  private async deleteDirectoryIfEmpty(path: string): Promise<boolean> {
    try {
      const entries = await readdir(path);
      if (entries.length !== 0) {
        return false;
      }

      await rmdir(path);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureDirectory(
    path: string,
    code: "STORAGE_UPLOAD_FAILED" | "STORAGE_DOWNLOAD_FAILED",
  ): Promise<void> {
    try {
      if (!existsSync(path)) {
        await mkdir(path, { recursive: true });
      }
    } catch (error) {
      throw new StorageException(
        `Failed to create directory ${path}: ${error instanceof Error ? error.message : String(error)}`,
        code,
      );
    }
  }

  private async normalizeContent(
    content: string | ArrayBuffer | SharedArrayBuffer | Request | Response | BunFile | S3File | Blob,
  ): Promise<string | ArrayBuffer | Blob> {
    if (typeof content === "string" || content instanceof ArrayBuffer || content instanceof Blob) {
      return content;
    }

    if (content instanceof SharedArrayBuffer) {
      const arrayBuffer = new ArrayBuffer(content.byteLength);
      new Uint8Array(arrayBuffer).set(new Uint8Array(content));
      return arrayBuffer;
    }

    if (content instanceof Request || content instanceof Response) {
      return await content.arrayBuffer();
    }

    return await (content as BunFile | S3File).arrayBuffer();
  }
}
