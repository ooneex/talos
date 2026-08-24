import { basename, join } from "node:path";
import type { BunFile, S3File, S3Options } from "bun";
import { putDirRecursive } from "./putDir";
import type { GetFileOptionsType, IStorage, PutDirOptionsType } from "./types";

export abstract class Storage implements IStorage {
  protected client: Bun.S3Client | null = null;
  public abstract getOptions(): S3Options;
  protected abstract bucket: string;

  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor is required for Bun coverage
  public constructor() {}

  public getBucket(): string {
    return this.bucket;
  }

  public setBucket(name: string): this {
    this.bucket = name;
    this.client = new Bun.S3Client(this.getOptions());

    return this;
  }

  public async list(): Promise<string[]> {
    const client = this.getClient();

    return (await client.list()).contents?.map((content) => content.key) || [];
  }

  public async clearBucket(): Promise<this> {
    const client = this.getClient();
    const keys = await this.list();

    await Promise.all(keys.map((key) => client.delete(key)));

    return this;
  }

  public async exists(key: string): Promise<boolean> {
    const client = this.getClient();

    return await client.exists(key);
  }

  /**
   * How many bytes are filed under the key, or `null` when nothing is. The size comes off the
   * object's metadata rather than its body, so asking costs the same whatever the object weighs.
   */
  public async size(key: string): Promise<number | null> {
    const client = this.getClient();

    try {
      return (await client.stat(key)).size;
    } catch {
      return null;
    }
  }

  public async delete(key: string): Promise<void> {
    const client = this.getClient();

    await client.delete(key);
  }

  public async putFile(key: string, localPath: string): Promise<number> {
    const file = Bun.file(localPath);

    return await this.put(key, file);
  }

  public async putDir(bucket: string, options: PutDirOptionsType): Promise<number> {
    return await putDirRecursive(this, bucket, options);
  }

  public async put(
    key: string,
    content: string | ArrayBuffer | SharedArrayBuffer | Request | Response | BunFile | S3File | Blob,
  ): Promise<number> {
    const s3file: S3File = this.getS3File(key);

    return await s3file.write(content);
  }

  public async getFile(key: string, options: GetFileOptionsType): Promise<number> {
    const arrayBuffer = await this.getAsArrayBuffer(key);
    const filename = options.filename ?? basename(key);
    const localPath = join(options.outputDir, filename);

    return await Bun.write(localPath, arrayBuffer);
  }

  public async getAsJson<T>(key: string): Promise<T> {
    const s3file: S3File = this.getS3File(key);

    return await s3file.json();
  }

  public async getAsArrayBuffer(key: string): Promise<ArrayBuffer> {
    const s3file: S3File = this.getS3File(key);

    return await s3file.arrayBuffer();
  }

  public getAsStream(key: string): ReadableStream {
    const s3file: S3File = this.getS3File(key);

    return s3file.stream();
  }

  protected getClient(): Bun.S3Client {
    if (!this.client) {
      this.client = this.createClient();
    }

    return this.client;
  }

  protected createClient(): Bun.S3Client {
    return new Bun.S3Client(this.getOptions());
  }

  protected getS3File(path: string): S3File {
    const client = this.getClient();

    return client.file(path);
  }
}
