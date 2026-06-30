import { mkdir } from "node:fs/promises";
import { AbstractCache } from "./AbstractCache";
import { CacheException } from "./CacheException";
import { decorator } from "./decorators";
import type { FilesystemCacheOptionsType } from "./types";

type CacheEntryType<T = unknown> = {
  value: T;
  ttl?: number;
  createdAt: number;
  originalKey: string;
};

@decorator.cache()
export class FilesystemCache extends AbstractCache {
  private cacheDir: string;
  private maxFileSize: number;

  constructor(options: FilesystemCacheOptionsType = {}) {
    super();
    this.cacheDir = options.cacheDir || `${process.cwd()}/.cache`;
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
  }

  private async ensureCacheDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  public async get<T = unknown>(key: string): Promise<T | undefined> {
    await this.ensureCacheDir();
    const entry = await this.readCacheEntry<T>(key);

    return entry?.value;
  }

  public async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    await this.ensureCacheDir();

    const entry: CacheEntryType<T> = {
      value,
      createdAt: Date.now(),
      originalKey: key,
      ...(ttl !== undefined && { ttl }),
    };

    await this.writeCacheEntry(key, entry);
  }

  public async delete(key: string): Promise<boolean> {
    await this.ensureCacheDir();
    const file = Bun.file(this.getFilePath(key));

    if (!(await file.exists())) {
      return false;
    }

    await file.delete();

    return true;
  }

  public async has(key: string): Promise<boolean> {
    await this.ensureCacheDir();
    const entry = await this.readCacheEntry(key);

    return entry !== undefined;
  }

  private getFilePath(key: string): string {
    if (key.length > 200) {
      const hash = Bun.hash(key);
      return `${this.cacheDir}/${hash.toString(36)}.cache`;
    }

    const sanitizedKey = key.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");

    return `${this.cacheDir}/${sanitizedKey}.cache`;
  }

  private isExpired(entry: CacheEntryType): boolean {
    if (!entry.ttl) return false;

    if (entry.ttl === 0) {
      return false;
    }

    return entry.createdAt + entry.ttl * 1000 < Date.now();
  }

  private async readCacheEntry<T>(key: string): Promise<CacheEntryType<T> | undefined> {
    try {
      const file = Bun.file(this.getFilePath(key));

      if (!(await file.exists())) {
        return;
      }

      const content = await file.text();
      const entry: CacheEntryType<T> = JSON.parse(content);

      if (this.isExpired(entry)) {
        await file.delete().catch(() => {});
        return;
      }

      return entry;
    } catch {
      return;
    }
  }

  public async deleteByPrefix(prefix: string): Promise<number> {
    await this.ensureCacheDir();
    const sanitizedPrefix = prefix.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    const glob = new Bun.Glob(`${sanitizedPrefix}*.cache`);
    const files = await Array.fromAsync(glob.scan({ cwd: this.cacheDir }));
    let deleted = 0;

    await Promise.all(
      files.map(async (file) => {
        const f = Bun.file(`${this.cacheDir}/${file}`);
        if (await f.exists()) {
          await f.delete();
          deleted++;
        }
      }),
    );

    return deleted;
  }

  public async clear(): Promise<void> {
    await this.ensureCacheDir();
    const glob = new Bun.Glob("*.cache");
    const files = await Array.fromAsync(glob.scan({ cwd: this.cacheDir }));

    await Promise.all(
      files.map((file) =>
        Bun.file(`${this.cacheDir}/${file}`)
          .delete()
          .catch(() => {}),
      ),
    );
  }

  private async writeCacheEntry<T>(key: string, entry: CacheEntryType<T>): Promise<void> {
    const content = JSON.stringify(entry);

    if (Buffer.byteLength(content, "utf-8") > this.maxFileSize) {
      throw new CacheException(
        `Cache entry exceeds maximum file size of ${this.maxFileSize} bytes`,
        "MAX_SIZE_EXCEEDED",
      );
    }

    await Bun.write(this.getFilePath(key), content);
  }
}
