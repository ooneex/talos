import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { IStorage } from "@/types";

describe("decorator.storage", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class successfully", () => {
    class TestStorage implements IStorage {
      public getBucket(): string {
        return "";
      }
      public setBucket(): IStorage {
        return this;
      }
      public async list(): Promise<string[]> {
        return [];
      }
      public async clearBucket(): Promise<this> {
        return this;
      }
      public async exists(): Promise<boolean> {
        return false;
      }
      public async delete(): Promise<void> {
        // noop
      }
      public async putFile(): Promise<number> {
        return 0;
      }
      public async putDir(): Promise<number> {
        return 0;
      }
      public async getFile(): Promise<number> {
        return 0;
      }
      public async put(): Promise<number> {
        return 0;
      }
      public async getAsJson<T = unknown>(): Promise<T> {
        return {} as T;
      }
      public async getAsArrayBuffer(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      }
      public getAsStream(): ReadableStream {
        return new ReadableStream();
      }
    }

    expect(() => {
      decorator.storage()(TestStorage);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonStorage implements IStorage {
      public getBucket(): string {
        return "";
      }
      public setBucket(): IStorage {
        return this;
      }
      public async list(): Promise<string[]> {
        return [];
      }
      public async clearBucket(): Promise<this> {
        return this;
      }
      public async exists(): Promise<boolean> {
        return false;
      }
      public async delete(): Promise<void> {
        // noop
      }
      public async putFile(): Promise<number> {
        return 0;
      }
      public async putDir(): Promise<number> {
        return 0;
      }
      public async getFile(): Promise<number> {
        return 0;
      }
      public async put(): Promise<number> {
        return 0;
      }
      public async getAsJson<T = unknown>(): Promise<T> {
        return {} as T;
      }
      public async getAsArrayBuffer(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      }
      public getAsStream(): ReadableStream {
        return new ReadableStream();
      }
    }

    decorator.storage()(SingletonStorage);

    const instance1 = container.get(SingletonStorage);
    const instance2 = container.get(SingletonStorage);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonStorage implements IStorage {
      public getBucket(): string {
        return "";
      }
      public setBucket(): IStorage {
        return this;
      }
      public async list(): Promise<string[]> {
        return [];
      }
      public async clearBucket(): Promise<this> {
        return this;
      }
      public async exists(): Promise<boolean> {
        return false;
      }
      public async delete(): Promise<void> {
        // noop
      }
      public async putFile(): Promise<number> {
        return 0;
      }
      public async putDir(): Promise<number> {
        return 0;
      }
      public async getFile(): Promise<number> {
        return 0;
      }
      public async put(): Promise<number> {
        return 0;
      }
      public async getAsJson<T = unknown>(): Promise<T> {
        return {} as T;
      }
      public async getAsArrayBuffer(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      }
      public getAsStream(): ReadableStream {
        return new ReadableStream();
      }
    }

    decorator.storage(EContainerScope.Singleton)(ExplicitSingletonStorage);

    const instance1 = container.get(ExplicitSingletonStorage);
    const instance2 = container.get(ExplicitSingletonStorage);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientStorage implements IStorage {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientStorage.instanceCount++;
        this.instanceId = TransientStorage.instanceCount;
      }

      public getBucket(): string {
        return "";
      }
      public setBucket(): IStorage {
        return this;
      }
      public async list(): Promise<string[]> {
        return [];
      }
      public async clearBucket(): Promise<this> {
        return this;
      }
      public async exists(): Promise<boolean> {
        return false;
      }
      public async delete(): Promise<void> {
        // noop
      }
      public async putFile(): Promise<number> {
        return 0;
      }
      public async putDir(): Promise<number> {
        return 0;
      }
      public async getFile(): Promise<number> {
        return 0;
      }
      public async put(): Promise<number> {
        return 0;
      }
      public async getAsJson<T = unknown>(): Promise<T> {
        return {} as T;
      }
      public async getAsArrayBuffer(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      }
      public getAsStream(): ReadableStream {
        return new ReadableStream();
      }
    }

    decorator.storage(EContainerScope.Transient)(TransientStorage);

    const instance1 = container.get(TransientStorage);
    const instance2 = container.get(TransientStorage);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedStorage implements IStorage {
      public getBucket(): string {
        return "";
      }
      public setBucket(): IStorage {
        return this;
      }
      public async list(): Promise<string[]> {
        return [];
      }
      public async clearBucket(): Promise<this> {
        return this;
      }
      public async exists(): Promise<boolean> {
        return false;
      }
      public async delete(): Promise<void> {
        // noop
      }
      public async putFile(): Promise<number> {
        return 0;
      }
      public async putDir(): Promise<number> {
        return 0;
      }
      public async getFile(): Promise<number> {
        return 0;
      }
      public async put(): Promise<number> {
        return 0;
      }
      public async getAsJson<T = unknown>(): Promise<T> {
        return {} as T;
      }
      public async getAsArrayBuffer(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      }
      public getAsStream(): ReadableStream {
        return new ReadableStream();
      }
    }

    expect(() => {
      decorator.storage(EContainerScope.Request)(RequestScopedStorage);
    }).not.toThrow();

    const instance = container.get(RequestScopedStorage);
    expect(instance).toBeInstanceOf(RequestScopedStorage);
  });

  test("should allow retrieving registered storage class from container", () => {
    class RetrievableStorage implements IStorage {
      public readonly name = "retrievable";

      public getBucket(): string {
        return "";
      }
      public setBucket(): IStorage {
        return this;
      }
      public async list(): Promise<string[]> {
        return [];
      }
      public async clearBucket(): Promise<this> {
        return this;
      }
      public async exists(): Promise<boolean> {
        return false;
      }
      public async delete(): Promise<void> {
        // noop
      }
      public async putFile(): Promise<number> {
        return 0;
      }
      public async putDir(): Promise<number> {
        return 0;
      }
      public async getFile(): Promise<number> {
        return 0;
      }
      public async put(): Promise<number> {
        return 0;
      }
      public async getAsJson<T = unknown>(): Promise<T> {
        return {} as T;
      }
      public async getAsArrayBuffer(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      }
      public getAsStream(): ReadableStream {
        return new ReadableStream();
      }
    }

    decorator.storage()(RetrievableStorage);

    const instance = container.get(RetrievableStorage);
    expect(instance).toBeInstanceOf(RetrievableStorage);
    expect(instance.name).toBe("retrievable");
  });

  test("should return void from the decorator function", () => {
    class VoidReturnStorage implements IStorage {
      public getBucket(): string {
        return "";
      }
      public setBucket(): IStorage {
        return this;
      }
      public async list(): Promise<string[]> {
        return [];
      }
      public async clearBucket(): Promise<this> {
        return this;
      }
      public async exists(): Promise<boolean> {
        return false;
      }
      public async delete(): Promise<void> {
        // noop
      }
      public async putFile(): Promise<number> {
        return 0;
      }
      public async putDir(): Promise<number> {
        return 0;
      }
      public async getFile(): Promise<number> {
        return 0;
      }
      public async put(): Promise<number> {
        return 0;
      }
      public async getAsJson<T = unknown>(): Promise<T> {
        return {} as T;
      }
      public async getAsArrayBuffer(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      }
      public getAsStream(): ReadableStream {
        return new ReadableStream();
      }
    }

    const result = decorator.storage()(VoidReturnStorage);
    expect(result).toBeUndefined();
  });
});
