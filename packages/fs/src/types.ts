import type { Dirent, Stats } from "node:fs";

export interface IFile {
  getPath: () => string;

  getName: () => string;

  getExtension: () => string;

  getDirectory: () => IDirectory;

  getSize: () => number;

  getType: () => string;

  exists: () => Promise<boolean>;

  text: () => Promise<string>;

  json: <T = unknown>() => Promise<T>;

  arrayBuffer: () => Promise<ArrayBuffer>;

  bytes: () => Promise<Uint8Array>;

  stream: () => AsyncGenerator<Uint8Array>;

  streamAsText: () => AsyncGenerator<string>;

  streamAsJson: <T = unknown>() => AsyncGenerator<T>;

  write: (data: FileWriteDataType) => Promise<number>;

  append: (data: string | Uint8Array) => Promise<number>;

  copy: (destination: string) => Promise<IFile>;

  delete: () => Promise<void>;

  writer: (options?: FileWriterOptionsType) => BunFileSinkType;
}

export interface IDirectory {
  getPath: () => string;

  getName: () => string;

  getParent: () => string;

  exists: () => Promise<boolean>;

  mkdir: (options?: DirectoryCreateOptionsType) => Promise<void>;

  rm: (options?: DirectoryDeleteOptionsType) => Promise<void>;

  ls: (options?: DirectoryListOptionsType) => Promise<string[]>;

  lsWithTypes: (options?: DirectoryListOptionsType) => Promise<Dirent[]>;

  cp: (destination: string, options?: DirectoryCopyOptionsType) => Promise<void>;

  mv: (destination: string) => Promise<void>;

  stat: () => Promise<Stats>;

  watch: (callback: DirectoryWatchCallbackType, options?: DirectoryWatchOptionsType) => DirectoryWatcherType;

  isEmpty: () => Promise<boolean>;

  getSize: () => Promise<number>;

  getFiles: (options?: DirectoryGetFilesOptionsType) => AsyncGenerator<IFile>;

  getDirectories: (options?: DirectoryGetDirectoriesOptionsType) => AsyncGenerator<IDirectory>;

  cd: (...paths: string[]) => IDirectory;
}

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

export type FileWriterOptionsType = {
  highWaterMark?: number;
};

export type FileOptionsType = {
  type?: string;
};

export type BunFileSinkType = ReturnType<ReturnType<typeof Bun.file>["writer"]>;

export type DirectoryCreateOptionsType = {
  recursive?: boolean;

  mode?: number;
};

export type DirectoryDeleteOptionsType = {
  recursive?: boolean;

  force?: boolean;
};

export type DirectoryListOptionsType = {
  recursive?: boolean;
};

export type DirectoryGetFilesOptionsType = {
  recursive?: boolean;

  pattern?: RegExp;
};

export type DirectoryGetDirectoriesOptionsType = {
  recursive?: boolean;

  pattern?: RegExp;
};

export type DirectoryCopyOptionsType = {
  recursive?: boolean;

  overwrite?: boolean;
};

export type DirectoryWatchOptionsType = {
  recursive?: boolean;
};

export type DirectoryWatchEventType = "rename" | "change";

export type DirectoryWatchCallbackType = (event: DirectoryWatchEventType, filename: string | null) => void;

export type DirectoryWatcherType = ReturnType<typeof import("node:fs").watch>;
