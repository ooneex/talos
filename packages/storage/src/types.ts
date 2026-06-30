import type { BunFile, S3File } from "bun";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type StorageClassType = new (...args: any[]) => IStorage;

export type PutDirOptionsType = {
  path: string;
  filter?: RegExp;
};

export type GetFileOptionsType = {
  outputDir: string;
  filename?: string;
};

export interface IStorage {
  getBucket(): string;
  setBucket(name: string): IStorage;
  list(): Promise<string[]>;
  clearBucket(): Promise<this>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  putFile(key: string, localPath: string): Promise<number>;
  putDir(bucket: string, options: PutDirOptionsType): Promise<number>;
  put(
    key: string,
    content: string | ArrayBufferView | ArrayBuffer | SharedArrayBuffer | Request | Response | BunFile | S3File | Blob,
  ): Promise<number>;
  getFile(key: string, options: GetFileOptionsType): Promise<number>;
  getAsJson<T = unknown>(key: string): Promise<T>;
  getAsArrayBuffer(key: string): Promise<ArrayBuffer>;
  getAsStream(key: string): ReadableStream;
}
