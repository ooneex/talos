import { beforeEach, describe, expect, test } from "bun:test";
import type { S3File, S3Options } from "bun";
import { Storage } from "@/Storage";

// Mock S3File for testing
class MockS3File {
  private content: string | ArrayBuffer | null = null;

  async write(data: string | ArrayBuffer | SharedArrayBuffer | Blob): Promise<number> {
    if (typeof data === "string") {
      this.content = data;
      return data.length;
    }
    if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
      this.content = data instanceof SharedArrayBuffer ? new ArrayBuffer(data.byteLength) : data;
      return data.byteLength;
    }
    if (data instanceof Blob) {
      const buffer = await data.arrayBuffer();
      this.content = buffer;
      return buffer.byteLength;
    }
    return 0;
  }

  async json<T>(): Promise<T> {
    if (typeof this.content === "string") {
      return JSON.parse(this.content) as T;
    }
    throw new Error("Cannot parse non-string content as JSON");
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.content instanceof ArrayBuffer) {
      return this.content;
    }
    if (typeof this.content === "string") {
      return new TextEncoder().encode(this.content).buffer as ArrayBuffer;
    }
    return new ArrayBuffer(0);
  }

  stream(): ReadableStream {
    const content = this.content;
    return new ReadableStream({
      start(controller) {
        if (typeof content === "string") {
          controller.enqueue(new TextEncoder().encode(content));
        } else if (content instanceof ArrayBuffer) {
          controller.enqueue(new Uint8Array(content));
        }
        controller.close();
      },
    });
  }
}

// Mock S3Client for testing
class MockS3Client {
  private files: Map<string, MockS3File> = new Map();
  private existsMap: Map<string, boolean> = new Map();
  private deletedKeys: Set<string> = new Set();
  private listResult: { contents?: Array<{ key: string }> } = { contents: [] };

  setListResult(keys: string[]): void {
    this.listResult = {
      contents: keys.map((key) => ({ key })),
    };
  }

  setExists(key: string, exists: boolean): void {
    this.existsMap.set(key, exists);
  }

  async list(): Promise<{ contents?: Array<{ key: string }> }> {
    return this.listResult;
  }

  async exists(key: string): Promise<boolean> {
    return this.existsMap.get(key) ?? false;
  }

  async delete(key: string): Promise<void> {
    this.deletedKeys.add(key);
    this.existsMap.set(key, false);
  }

  file(key: string): MockS3File {
    if (!this.files.has(key)) {
      this.files.set(key, new MockS3File());
    }
    return this.files.get(key) as MockS3File;
  }

  getDeletedKeys(): string[] {
    return Array.from(this.deletedKeys);
  }
}

// Concrete implementation for testing
class TestStorage extends Storage {
  protected bucket = "test-bucket";
  private mockClient: MockS3Client;

  constructor() {
    super();
    this.mockClient = new MockS3Client();
  }

  public getOptions(): S3Options {
    return {
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      endpoint: "https://test.endpoint.com",
      bucket: this.bucket,
      region: "us-east-1",
    };
  }

  public getMockClient(): MockS3Client {
    return this.mockClient;
  }

  public getBucketName(): string {
    return this.bucket;
  }

  // Override getClient to return our mock
  protected override getClient(): Bun.S3Client {
    return this.mockClient as unknown as Bun.S3Client;
  }

  // Override getS3File to return our mock
  protected override getS3File(path: string): S3File {
    return this.mockClient.file(path) as unknown as S3File;
  }
}

describe("Storage", () => {
  let storage: TestStorage;
  let mockClient: MockS3Client;

  beforeEach(() => {
    storage = new TestStorage();
    mockClient = storage.getMockClient();
  });

  describe("getBucket", () => {
    test("should return the current bucket name", () => {
      const result = storage.getBucket();

      expect(result).toBe("test-bucket");
    });

    test("should return updated bucket after setBucket", () => {
      storage.setBucket("new-bucket");

      expect(storage.getBucket()).toBe("new-bucket");
    });
  });

  describe("setBucket", () => {
    test("should set bucket and return this for chaining", () => {
      const result = storage.setBucket("new-bucket");

      expect(result).toBe(storage);
    });

    test("should update bucket name", () => {
      storage.setBucket("updated-bucket");

      const options = storage.getOptions();
      expect(options.bucket).toBe("updated-bucket");
    });
  });

  describe("list", () => {
    test("should return empty array when no files exist", async () => {
      mockClient.setListResult([]);

      const result = await storage.list();

      expect(result).toEqual([]);
    });

    test("should return array of file keys", async () => {
      mockClient.setListResult(["file1.txt", "file2.txt", "folder/file3.txt"]);

      const result = await storage.list();

      expect(result).toEqual(["file1.txt", "file2.txt", "folder/file3.txt"]);
    });

    test("should handle list result with undefined contents", async () => {
      // Simulate a response with no contents property
      mockClient.setListResult([]);
      const originalList = mockClient.list.bind(mockClient);
      mockClient.list = async () => ({});

      const result = await storage.list();

      expect(result).toEqual([]);

      // Restore
      mockClient.list = originalList;
    });
  });

  describe("clearBucket", () => {
    test("should delete all files in bucket", async () => {
      mockClient.setListResult(["file1.txt", "file2.txt"]);

      await storage.clearBucket();

      const deletedKeys = mockClient.getDeletedKeys();
      expect(deletedKeys).toContain("file1.txt");
      expect(deletedKeys).toContain("file2.txt");
    });

    test("should return this for chaining", async () => {
      mockClient.setListResult([]);

      const result = await storage.clearBucket();

      expect(result).toBe(storage);
    });

    test("should handle empty bucket", async () => {
      mockClient.setListResult([]);

      const result = await storage.clearBucket();

      expect(result).toBe(storage);
      expect(mockClient.getDeletedKeys()).toHaveLength(0);
    });
  });

  describe("exists", () => {
    test("should return true when file exists", async () => {
      mockClient.setExists("existing-file.txt", true);

      const result = await storage.exists("existing-file.txt");

      expect(result).toBe(true);
    });

    test("should return false when file does not exist", async () => {
      mockClient.setExists("non-existing-file.txt", false);

      const result = await storage.exists("non-existing-file.txt");

      expect(result).toBe(false);
    });
  });

  describe("delete", () => {
    test("should delete file by key", async () => {
      await storage.delete("file-to-delete.txt");

      const deletedKeys = mockClient.getDeletedKeys();
      expect(deletedKeys).toContain("file-to-delete.txt");
    });
  });

  describe("put", () => {
    test("should write string content and return bytes written", async () => {
      const content = "Hello, World!";

      const result = await storage.put("test.txt", content);

      expect(result).toBe(content.length);
    });

    test("should write ArrayBuffer content", async () => {
      const content = new ArrayBuffer(10);

      const result = await storage.put("test.bin", content);

      expect(result).toBe(10);
    });

    test("should write Blob content", async () => {
      const content = new Blob(["Hello, Blob!"]);

      const result = await storage.put("test.txt", content);

      expect(result).toBe(12);
    });
  });

  describe("putFile", () => {
    test("should be callable with key and path", async () => {
      // We can't easily mock Bun.file, so we test the method signature exists
      expect(typeof storage.putFile).toBe("function");
    });
  });

  describe("putDir", () => {
    test("should be callable with bucket and options", () => {
      expect(typeof storage.putDir).toBe("function");
    });
  });

  describe("getAsJson", () => {
    test("should return parsed JSON content", async () => {
      const jsonData = { name: "test", value: 42 };
      const s3File = mockClient.file("data.json");
      await s3File.write(JSON.stringify(jsonData));

      const result = await storage.getAsJson<{ name: string; value: number }>("data.json");

      expect(result).toEqual(jsonData);
    });

    test("should handle nested JSON objects", async () => {
      const nestedData = {
        level1: {
          level2: {
            value: "deep",
          },
        },
        array: [1, 2, 3],
      };
      const s3File = mockClient.file("nested.json");
      await s3File.write(JSON.stringify(nestedData));

      const result = await storage.getAsJson<typeof nestedData>("nested.json");

      expect(result).toEqual(nestedData);
    });
  });

  describe("getAsArrayBuffer", () => {
    test("should return ArrayBuffer content", async () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5]);
      const s3File = mockClient.file("binary.bin");
      await s3File.write(originalData.buffer as ArrayBuffer);

      const result = await storage.getAsArrayBuffer("binary.bin");

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(5);
    });

    test("should return ArrayBuffer from string content", async () => {
      const s3File = mockClient.file("text.txt");
      await s3File.write("Hello");

      const result = await storage.getAsArrayBuffer("text.txt");

      expect(result).toBeInstanceOf(ArrayBuffer);
    });
  });

  describe("getAsStream", () => {
    test("should return ReadableStream", async () => {
      const s3File = mockClient.file("stream.txt");
      await s3File.write("Stream content");

      const result = storage.getAsStream("stream.txt");

      expect(result).toBeInstanceOf(ReadableStream);
    });

    test("should be readable stream with content", async () => {
      const content = "Readable stream content";
      const s3File = mockClient.file("readable.txt");
      await s3File.write(content);

      const stream = storage.getAsStream("readable.txt");
      const reader = stream.getReader();
      const { value } = await reader.read();

      expect(value).toBeInstanceOf(Uint8Array);
      const decoded = new TextDecoder().decode(value);
      expect(decoded).toBe(content);
    });
  });

  describe("getOptions (abstract method)", () => {
    test("should return S3Options with required fields", () => {
      const options = storage.getOptions();

      expect(options).toHaveProperty("accessKeyId");
      expect(options).toHaveProperty("secretAccessKey");
      expect(options).toHaveProperty("endpoint");
      expect(options).toHaveProperty("bucket");
      expect(options).toHaveProperty("region");
    });

    test("should return correct test values", () => {
      const options = storage.getOptions();

      expect(options.accessKeyId).toBe("test-key");
      expect(options.secretAccessKey).toBe("test-secret");
      expect(options.endpoint).toBe("https://test.endpoint.com");
      expect(options.region).toBe("us-east-1");
    });
  });

  describe("method chaining", () => {
    test("should support chaining setBucket with operations", async () => {
      mockClient.setListResult(["file.txt"]);

      const result = storage.setBucket("chained-bucket");

      expect(result).toBe(storage);
      expect(storage.getBucketName()).toBe("chained-bucket");
    });

    test("should support chaining clearBucket", async () => {
      mockClient.setListResult([]);

      const result = await storage.clearBucket();

      expect(result).toBe(storage);
    });
  });

  describe("IStorage interface compliance", () => {
    test("should implement all IStorage methods", () => {
      expect(typeof storage.getBucket).toBe("function");
      expect(typeof storage.setBucket).toBe("function");
      expect(typeof storage.list).toBe("function");
      expect(typeof storage.clearBucket).toBe("function");
      expect(typeof storage.exists).toBe("function");
      expect(typeof storage.delete).toBe("function");
      expect(typeof storage.putFile).toBe("function");
      expect(typeof storage.putDir).toBe("function");
      expect(typeof storage.put).toBe("function");
      expect(typeof storage.getAsJson).toBe("function");
      expect(typeof storage.getAsArrayBuffer).toBe("function");
      expect(typeof storage.getAsStream).toBe("function");
    });
  });
});
