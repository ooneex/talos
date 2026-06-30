import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// Mock the decorators module before importing BunnyStorage
mock.module("@/decorators", () => ({
  decorator: {
    storage: () => () => {
      // noop
    },
  },
}));

// Import after mocking
const { BunnyStorage } = await import("@/BunnyStorage");
const { StorageException } = await import("@/StorageException");
const { AppEnv } = await import("@talosjs/app-env");

function mockFile(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    Guid: "00000000-0000-0000-0000-000000000000",
    UserId: "user-id",
    LastChanged: "2024-01-01T00:00:00Z",
    DateCreated: "2024-01-01T00:00:00Z",
    StorageZoneName: "test-storage-zone",
    Path: "/",
    ObjectName: "file.txt",
    Length: 100,
    StorageZoneId: 1,
    IsDirectory: false,
    ServerId: 1,
    Checksum: null,
    ReplicatedZones: null,
    ContentType: "application/octet-stream",
    ...overrides,
  };
}

describe("BunnyStorage", () => {
  const originalEnv = { ...Bun.env };
  let fetchMock: ReturnType<typeof spyOn>;

  beforeEach(() => {
    Bun.env.STORAGE_BUNNY_ACCESS_KEY = "test-access-key";
    Bun.env.STORAGE_BUNNY_STORAGE_ZONE = "test-storage-zone";
    Bun.env.STORAGE_BUNNY_REGION = "de";
    fetchMock = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    Bun.env.STORAGE_BUNNY_ACCESS_KEY = originalEnv.STORAGE_BUNNY_ACCESS_KEY;
    Bun.env.STORAGE_BUNNY_STORAGE_ZONE = originalEnv.STORAGE_BUNNY_STORAGE_ZONE;
    Bun.env.STORAGE_BUNNY_REGION = originalEnv.STORAGE_BUNNY_REGION;
    fetchMock.mockRestore();
  });

  describe("constructor", () => {
    test("should create instance with environment variables", () => {
      const storage = new BunnyStorage(new AppEnv());
      expect(storage).toBeInstanceOf(BunnyStorage);
    });

    test("should throw StorageException when access key is missing", () => {
      delete Bun.env.STORAGE_BUNNY_ACCESS_KEY;

      expect(() => new BunnyStorage(new AppEnv())).toThrow(StorageException);
      expect(() => new BunnyStorage(new AppEnv())).toThrow("Bunny access key is required");
    });

    test("should throw StorageException when storage zone is missing", () => {
      delete Bun.env.STORAGE_BUNNY_STORAGE_ZONE;

      expect(() => new BunnyStorage(new AppEnv())).toThrow(StorageException);
      expect(() => new BunnyStorage(new AppEnv())).toThrow("Bunny storage zone is required");
    });

    test("should use default region when not provided", () => {
      delete Bun.env.STORAGE_BUNNY_REGION;

      const storage = new BunnyStorage(new AppEnv());
      expect(storage).toBeInstanceOf(BunnyStorage);
    });
  });

  describe("getBucket", () => {
    test("should return empty string by default", () => {
      const storage = new BunnyStorage(new AppEnv());

      expect(storage.getBucket()).toBe("");
    });

    test("should return bucket after setBucket", () => {
      const storage = new BunnyStorage(new AppEnv());
      storage.setBucket("my-bucket");

      expect(storage.getBucket()).toBe("my-bucket");
    });
  });

  describe("setBucket", () => {
    test("should set bucket and return this for chaining", () => {
      const storage = new BunnyStorage(new AppEnv());
      const result = storage.setBucket("my-bucket");

      expect(result).toBe(storage);
    });
  });

  describe("list", () => {
    test("should return list of file names", async () => {
      const mockFiles = [
        mockFile({ ObjectName: "file1.txt", IsDirectory: false }),
        mockFile({ ObjectName: "file2.jpg", IsDirectory: false }),
        mockFile({ ObjectName: "subfolder", IsDirectory: true }),
      ];

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockFiles), { status: 200 }));

      const storage = new BunnyStorage(new AppEnv());
      const files = await storage.list();

      expect(files).toEqual(["file1.txt", "file2.jpg"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("should list files in a bucket", async () => {
      const mockFiles = [mockFile({ ObjectName: "bucket-file.txt", IsDirectory: false })];

      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockFiles), { status: 200 }));

      const storage = new BunnyStorage(new AppEnv());
      storage.setBucket("my-bucket");
      const files = await storage.list();

      expect(files).toEqual(["bucket-file.txt"]);
    });

    test("should throw StorageException on failed list request", async () => {
      fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404, statusText: "Not Found" }));

      const storage = new BunnyStorage(new AppEnv());

      expect(storage.list()).rejects.toThrow(StorageException);
    });
  });

  describe("exists", () => {
    test("should return true when file exists", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(mockFile({ ObjectName: "test-file.txt" })), { status: 200 }),
      );

      const storage = new BunnyStorage(new AppEnv());
      const exists = await storage.exists("test-file.txt");

      expect(exists).toBe(true);
    });

    test("should return false when file does not exist", async () => {
      fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

      const storage = new BunnyStorage(new AppEnv());
      const exists = await storage.exists("missing-file.txt");

      expect(exists).toBe(false);
    });

    test("should use bucket in path", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(mockFile({ ObjectName: "file.txt" })), { status: 200 }),
      );

      const storage = new BunnyStorage(new AppEnv());
      storage.setBucket("my-bucket");
      await storage.exists("file.txt");

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("delete", () => {
    test("should delete file successfully", async () => {
      fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

      const storage = new BunnyStorage(new AppEnv());
      expect(await storage.delete("file-to-delete.txt")).toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("should not throw when file does not exist (404)", async () => {
      fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));

      const storage = new BunnyStorage(new AppEnv());
      expect(await storage.delete("non-existent.txt")).toBeUndefined();
    });

    test("should not throw on server errors", async () => {
      fetchMock.mockResolvedValueOnce(new Response("Server Error", { status: 500, statusText: "Server Error" }));

      const storage = new BunnyStorage(new AppEnv());
      expect(await storage.delete("file.txt")).toBeUndefined();
    });
  });

  describe("clearBucket", () => {
    test("should delete all files in bucket", async () => {
      const mockFiles = [
        mockFile({ ObjectName: "file1.txt", IsDirectory: false }),
        mockFile({ ObjectName: "file2.txt", IsDirectory: false }),
      ];

      fetchMock
        .mockResolvedValueOnce(new Response(JSON.stringify(mockFiles), { status: 200 }))
        .mockResolvedValueOnce(new Response("", { status: 200 }))
        .mockResolvedValueOnce(new Response("", { status: 200 }));

      const storage = new BunnyStorage(new AppEnv());
      storage.setBucket("test-bucket");
      const result = await storage.clearBucket();

      expect(result).toBe(storage);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("put", () => {
    test("should upload string content", async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const size = await storage.put("test.txt", "Hello World");

      expect(size).toBe(11);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("should upload ArrayBuffer content", async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const buffer = new ArrayBuffer(8);
      const size = await storage.put("test.bin", buffer);

      expect(size).toBe(8);
    });

    test("should upload ArrayBufferView content", async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const view = new Uint8Array([1, 2, 3, 4, 5]);
      const size = await storage.put("test.bin", view);

      expect(size).toBe(5);
    });

    test("should upload SharedArrayBuffer content", async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const sharedBuffer = new SharedArrayBuffer(16);
      const size = await storage.put("test.bin", sharedBuffer);

      expect(size).toBe(16);
    });

    test("should upload Blob content", async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const blob = new Blob(["Hello Blob"], { type: "text/plain" });
      const size = await storage.put("test.txt", blob);

      expect(size).toBe(10);
    });

    test("should upload Request content", async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const request = new Request("https://example.com", { body: "Request body", method: "POST" });
      const size = await storage.put("test.txt", request);

      expect(size).toBe(12);
    });

    test("should upload Response content", async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const response = new Response("Response body");
      const size = await storage.put("test.txt", response);

      expect(size).toBe(13);
    });

    test("should throw StorageException on upload failure", async () => {
      fetchMock.mockResolvedValueOnce(new Response("Error", { status: 500, statusText: "Server Error" }));

      const storage = new BunnyStorage(new AppEnv());

      expect(storage.put("test.txt", "content")).rejects.toThrow(StorageException);
    });
  });

  describe("putFile", () => {
    test("should upload file from local path", async () => {
      fetchMock.mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const tempFile = Bun.file("/tmp/test-upload.txt");
      await Bun.write(tempFile, "Test file content");

      const storage = new BunnyStorage(new AppEnv());
      const size = await storage.putFile("remote.txt", "/tmp/test-upload.txt");

      expect(size).toBe(17);
    });
  });

  describe("putDir", () => {
    test("should upload all files from local directory", async () => {
      const localDir = "/tmp/bunny-putdir-test";
      await Bun.write(`${localDir}/file1.txt`, "content1");
      await Bun.write(`${localDir}/file2.txt`, "content2");

      fetchMock
        .mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }))
        .mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const size = await storage.putDir("remote", { path: localDir });

      expect(size).toBe(16);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await Bun.$`rm -rf ${localDir}`.quiet();
    });

    test("should upload nested directories recursively", async () => {
      const localDir = "/tmp/bunny-putdir-nested";
      await Bun.write(`${localDir}/root.txt`, "root");
      await Bun.write(`${localDir}/sub/nested.txt`, "nested");

      fetchMock
        .mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }))
        .mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const size = await storage.putDir("dest", { path: localDir });

      expect(size).toBe(10);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await Bun.$`rm -rf ${localDir}`.quiet();
    });

    test("should filter files with regexp", async () => {
      const localDir = "/tmp/bunny-putdir-filter";
      await Bun.write(`${localDir}/include.txt`, "yes");
      await Bun.write(`${localDir}/exclude.log`, "no");

      fetchMock.mockResolvedValueOnce(new Response('{"HttpCode":201}', { status: 201 }));

      const storage = new BunnyStorage(new AppEnv());
      const size = await storage.putDir("filtered", { path: localDir, filter: /\.txt$/ });

      expect(size).toBe(3);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await Bun.$`rm -rf ${localDir}`.quiet();
    });
  });

  describe("getAsJson", () => {
    test("should get file content as JSON", async () => {
      const mockData = { name: "Test", value: 42 };
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(mockData), { status: 200 }));

      const storage = new BunnyStorage(new AppEnv());
      const data = await storage.getAsJson<{ name: string; value: number }>("data.json");

      expect(data).toEqual(mockData);
    });

    test("should throw StorageException on failure", async () => {
      fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404, statusText: "Not Found" }));

      const storage = new BunnyStorage(new AppEnv());

      expect(storage.getAsJson("missing.json")).rejects.toThrow(StorageException);
    });
  });

  describe("getAsArrayBuffer", () => {
    test("should get file content as ArrayBuffer", async () => {
      const content = new Uint8Array([1, 2, 3, 4, 5]);
      fetchMock.mockResolvedValueOnce(new Response(content, { status: 200 }));

      const storage = new BunnyStorage(new AppEnv());
      const buffer = await storage.getAsArrayBuffer("binary.bin");

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(buffer)).toEqual(content);
    });

    test("should throw StorageException on failure", async () => {
      fetchMock.mockResolvedValueOnce(new Response("Error", { status: 500, statusText: "Server Error" }));

      const storage = new BunnyStorage(new AppEnv());

      expect(storage.getAsArrayBuffer("file.bin")).rejects.toThrow(StorageException);
    });
  });

  describe("getAsStream", () => {
    test("should return a ReadableStream", () => {
      fetchMock.mockResolvedValueOnce(new Response("stream content", { status: 200 }));

      const storage = new BunnyStorage(new AppEnv());
      const stream = storage.getAsStream("file.txt");

      expect(stream).toBeInstanceOf(ReadableStream);
    });

    test("should stream file content", async () => {
      fetchMock.mockResolvedValueOnce(new Response("streamed content", { status: 200 }));

      const storage = new BunnyStorage(new AppEnv());
      const stream = storage.getAsStream("file.txt");
      const reader = stream.getReader();

      const chunks: Uint8Array[] = [];
      let result = await reader.read();
      while (!result.done) {
        chunks.push(result.value);
        result = await reader.read();
      }

      const decoder = new TextDecoder();
      const content = chunks.map((chunk) => decoder.decode(chunk)).join("");
      expect(content).toBe("streamed content");
    });
  });
});
