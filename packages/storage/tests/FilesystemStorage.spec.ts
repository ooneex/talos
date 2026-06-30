import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";

// Mock the decorators module before importing FilesystemStorage
mock.module("@/decorators", () => ({
  decorator: {
    storage: () => () => {
      // noop
    },
  },
}));

// Import after mocking
const { FilesystemStorage } = await import("@/FilesystemStorage");
const { StorageException } = await import("@/StorageException");
const { AppEnv } = await import("@talosjs/app-env");

async function exists(path: string): Promise<boolean> {
  const result = await $`test -e ${path}`.quiet().nothrow();
  return result.exitCode === 0;
}

async function rmrf(path: string): Promise<void> {
  await $`rm -rf ${path}`.quiet();
}

describe("FilesystemStorage", () => {
  const testBasePath = "/tmp/filesystem-storage-test";
  const originalEnv = { ...Bun.env };

  beforeAll(async () => {
    await rmrf(testBasePath);
  });

  beforeEach(() => {
    Bun.env.FILESYSTEM_STORAGE_PATH = testBasePath;
  });

  afterEach(async () => {
    Bun.env.FILESYSTEM_STORAGE_PATH = originalEnv.FILESYSTEM_STORAGE_PATH;
    await rmrf(testBasePath);
  });

  afterAll(async () => {
    await rmrf(testBasePath);
  });

  describe("constructor", () => {
    test("should create instance with environment variable", () => {
      const storage = new FilesystemStorage(new AppEnv());
      expect(storage).toBeInstanceOf(FilesystemStorage);
    });

    test("should create instance with custom path via environment variable", async () => {
      const customPath = "/tmp/custom-storage-path";
      Bun.env.FILESYSTEM_STORAGE_PATH = customPath;
      const storage = new FilesystemStorage(new AppEnv());
      expect(storage).toBeInstanceOf(FilesystemStorage);

      // Cleanup
      await rmrf(customPath);
    });

    test("should throw StorageException when base path is missing", () => {
      delete Bun.env.FILESYSTEM_STORAGE_PATH;

      expect(() => new FilesystemStorage(new AppEnv())).toThrow(StorageException);
      expect(() => new FilesystemStorage(new AppEnv())).toThrow("Base path is required");
    });

    test("should create base directory if it does not exist", async () => {
      const newPath = "/tmp/new-storage-path-test";
      await rmrf(newPath);

      Bun.env.FILESYSTEM_STORAGE_PATH = newPath;
      new FilesystemStorage(new AppEnv());

      expect(await exists(newPath)).toBe(true);

      // Cleanup
      await rmrf(newPath);
    });

    test("should use environment variable for storage path", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      const options = storage.getOptions();

      expect(options.endpoint).toBe(testBasePath);
    });
  });

  describe("getOptions", () => {
    test("should return S3Options with filesystem-specific values", () => {
      const storage = new FilesystemStorage(new AppEnv());
      const options = storage.getOptions();

      expect(options.accessKeyId).toBe("filesystem");
      expect(options.secretAccessKey).toBe("filesystem");
      expect(options.endpoint).toBe(testBasePath);
      expect(options.region).toBe("local");
    });

    test("should return correct bucket after setBucket is called", () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("test-bucket");
      const options = storage.getOptions();

      expect(options.bucket).toBe("test-bucket");
    });
  });

  describe("getBucket", () => {
    test("should return the current bucket name", () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("my-bucket");

      expect(storage.getBucket()).toBe("my-bucket");
    });

    test("should return updated bucket after setBucket", () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("first");
      storage.setBucket("second");

      expect(storage.getBucket()).toBe("second");
    });
  });

  describe("setBucket", () => {
    test("should set bucket and return this for chaining", () => {
      const storage = new FilesystemStorage(new AppEnv());
      const result = storage.setBucket("my-bucket");

      expect(result).toBe(storage);
    });

    test("should create bucket directory if it does not exist", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("new-bucket");

      const bucketPath = join(testBasePath, "new-bucket");
      expect(await exists(bucketPath)).toBe(true);
    });

    test("should allow changing bucket", () => {
      const storage = new FilesystemStorage(new AppEnv());

      storage.setBucket("first-bucket");
      expect(storage.getOptions().bucket).toBe("first-bucket");

      storage.setBucket("second-bucket");
      expect(storage.getOptions().bucket).toBe("second-bucket");
    });
  });

  describe("list", () => {
    test("should return empty array for empty bucket", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("empty-bucket");

      const files = await storage.list();

      expect(files).toEqual([]);
    });

    test("should return list of file names", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("list-bucket");

      await storage.put("file1.txt", "content1");
      await storage.put("file2.txt", "content2");

      const files = await storage.list();

      expect(files).toContain("file1.txt");
      expect(files).toContain("file2.txt");
      expect(files).toHaveLength(2);
    });

    test("should list files in subdirectories with relative paths", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("nested-bucket");

      await storage.put("root.txt", "root content");
      await storage.put("subdir/nested.txt", "nested content");
      await storage.put("subdir/deep/deeper.txt", "deeper content");

      const files = await storage.list();

      expect(files).toContain("root.txt");
      expect(files).toContain("subdir/nested.txt");
      expect(files).toContain("subdir/deep/deeper.txt");
      expect(files).toHaveLength(3);
    });

    test("should throw StorageException when bucket is not set", async () => {
      const storage = new FilesystemStorage(new AppEnv());

      expect(storage.list()).rejects.toThrow(StorageException);
      expect(storage.list()).rejects.toThrow("Bucket name is required");
    });
  });

  describe("exists", () => {
    test("should return true when file exists", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("exists-bucket");
      await storage.put("existing.txt", "content");

      const exists = await storage.exists("existing.txt");

      expect(exists).toBe(true);
    });

    test("should return false when file does not exist", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("exists-bucket");

      const exists = await storage.exists("non-existent.txt");

      expect(exists).toBe(false);
    });

    test("should work with files in subdirectories", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("exists-nested-bucket");
      await storage.put("subdir/file.txt", "content");

      expect(await storage.exists("subdir/file.txt")).toBe(true);
      expect(await storage.exists("subdir/missing.txt")).toBe(false);
    });
  });

  describe("put", () => {
    test("should write string content and return bytes written", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("put-bucket");

      const content = "Hello, World!";
      const bytesWritten = await storage.put("string.txt", content);

      expect(bytesWritten).toBe(content.length);
      expect(await storage.exists("string.txt")).toBe(true);
    });

    test("should write ArrayBuffer content", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("put-bucket");

      const buffer = new ArrayBuffer(8);
      const bytesWritten = await storage.put("arraybuffer.bin", buffer);

      expect(bytesWritten).toBe(8);
    });

    test("should write SharedArrayBuffer content", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("put-bucket");

      const sharedBuffer = new SharedArrayBuffer(16);
      const bytesWritten = await storage.put("sharedarraybuffer.bin", sharedBuffer);

      expect(bytesWritten).toBe(16);
    });

    test("should write Blob content", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("put-bucket");

      const blob = new Blob(["Hello Blob"], { type: "text/plain" });
      const bytesWritten = await storage.put("blob.txt", blob);

      expect(bytesWritten).toBe(10);
    });

    test("should write Request content", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("put-bucket");

      const request = new Request("https://example.com", {
        body: "Request body",
        method: "POST",
      });
      const bytesWritten = await storage.put("request.txt", request);

      expect(bytesWritten).toBe(12);
    });

    test("should write Response content", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("put-bucket");

      const response = new Response("Response body");
      const bytesWritten = await storage.put("response.txt", response);

      expect(bytesWritten).toBe(13);
    });

    test("should create nested directories automatically", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("put-bucket");

      await storage.put("deep/nested/path/file.txt", "content");

      expect(await storage.exists("deep/nested/path/file.txt")).toBe(true);
    });

    test("should overwrite existing file", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("put-bucket");

      await storage.put("overwrite.txt", "original");
      await storage.put("overwrite.txt", "updated");

      const buffer = await storage.getAsArrayBuffer("overwrite.txt");
      const text = new TextDecoder().decode(buffer);

      expect(text).toBe("updated");
    });
  });

  describe("putFile", () => {
    test("should upload file from local path", async () => {
      const localPath = "/tmp/local-test-file.txt";
      await Bun.write(localPath, "Local file content");

      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("putfile-bucket");

      const bytesWritten = await storage.putFile("remote.txt", localPath);

      expect(bytesWritten).toBe(18);
      expect(await storage.exists("remote.txt")).toBe(true);

      // Cleanup
      await Bun.file(localPath).delete();
    });
  });

  describe("putDir", () => {
    test("should upload all files from local directory", async () => {
      const localDir = "/tmp/putdir-test-source";
      await Bun.write(join(localDir, "file1.txt"), "content1");
      await Bun.write(join(localDir, "file2.txt"), "content2");

      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("putdir-bucket");

      const bytesWritten = await storage.putDir("remote", { path: localDir });

      expect(bytesWritten).toBe(16);
      expect(await storage.exists("remote/file1.txt")).toBe(true);
      expect(await storage.exists("remote/file2.txt")).toBe(true);

      await rmrf(localDir);
    });

    test("should upload nested directories recursively", async () => {
      const localDir = "/tmp/putdir-nested-test";
      await Bun.write(join(localDir, "root.txt"), "root");
      await Bun.write(join(localDir, "sub/nested.txt"), "nested");
      await Bun.write(join(localDir, "sub/deep/file.txt"), "deep");

      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("putdir-nested-bucket");

      const bytesWritten = await storage.putDir("dest", { path: localDir });

      expect(bytesWritten).toBe(14);
      expect(await storage.exists("dest/root.txt")).toBe(true);
      expect(await storage.exists("dest/sub/nested.txt")).toBe(true);
      expect(await storage.exists("dest/sub/deep/file.txt")).toBe(true);

      await rmrf(localDir);
    });

    test("should filter files with regexp", async () => {
      const localDir = "/tmp/putdir-filter-test";
      await Bun.write(join(localDir, "include.txt"), "yes");
      await Bun.write(join(localDir, "exclude.log"), "no");
      await Bun.write(join(localDir, "also.txt"), "yes");

      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("putdir-filter-bucket");

      const bytesWritten = await storage.putDir("filtered", { path: localDir, filter: /\.txt$/ });

      expect(bytesWritten).toBe(6);
      expect(await storage.exists("filtered/include.txt")).toBe(true);
      expect(await storage.exists("filtered/also.txt")).toBe(true);
      expect(await storage.exists("filtered/exclude.log")).toBe(false);

      await rmrf(localDir);
    });

    test("should filter directories with regexp", async () => {
      const localDir = "/tmp/putdir-filter-dir-test";
      await Bun.write(join(localDir, "keep/file.txt"), "kept");
      await Bun.write(join(localDir, "skip/file.txt"), "skipped");

      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("putdir-filter-dir-bucket");

      const bytesWritten = await storage.putDir("out", { path: localDir, filter: /keep/ });

      expect(bytesWritten).toBe(4);
      expect(await storage.exists("out/keep/file.txt")).toBe(true);
      expect(await storage.exists("out/skip/file.txt")).toBe(false);

      await rmrf(localDir);
    });

    test("should return 0 for empty directory", async () => {
      const localDir = "/tmp/putdir-empty-test";
      const { mkdir } = await import("node:fs/promises");
      await mkdir(localDir, { recursive: true });

      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("putdir-empty-bucket");

      const bytesWritten = await storage.putDir("empty", { path: localDir });

      expect(bytesWritten).toBe(0);

      await rmrf(localDir);
    });
  });

  describe("delete", () => {
    test("should delete existing file", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("delete-bucket");
      await storage.put("to-delete.txt", "content");

      expect(await storage.exists("to-delete.txt")).toBe(true);

      await storage.delete("to-delete.txt");

      expect(await storage.exists("to-delete.txt")).toBe(false);
    });

    test("should not throw when deleting non-existent file", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("delete-bucket");

      expect(storage.delete("non-existent.txt")).resolves.toBeUndefined();
    });

    test("should clean up empty parent directories", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("delete-cleanup-bucket");

      await storage.put("a/b/c/file.txt", "content");
      await storage.delete("a/b/c/file.txt");

      const bucketPath = join(testBasePath, "delete-cleanup-bucket");
      expect(await exists(join(bucketPath, "a/b/c"))).toBe(false);
      expect(await exists(join(bucketPath, "a/b"))).toBe(false);
      expect(await exists(join(bucketPath, "a"))).toBe(false);
    });

    test("should not delete parent directories if they contain other files", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("delete-partial-bucket");

      await storage.put("dir/file1.txt", "content1");
      await storage.put("dir/file2.txt", "content2");

      await storage.delete("dir/file1.txt");

      expect(await storage.exists("dir/file2.txt")).toBe(true);
      const bucketPath = join(testBasePath, "delete-partial-bucket");
      expect(await exists(join(bucketPath, "dir"))).toBe(true);
    });
  });

  describe("clearBucket", () => {
    test("should delete all files in bucket", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("clear-bucket");

      await storage.put("file1.txt", "content1");
      await storage.put("file2.txt", "content2");
      await storage.put("subdir/file3.txt", "content3");

      const result = await storage.clearBucket();

      expect(result).toBe(storage);

      const files = await storage.list();
      expect(files).toHaveLength(0);
    });

    test("should return this for empty bucket", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("empty-clear-bucket");

      const result = await storage.clearBucket();

      expect(result).toBe(storage);
    });

    test("should recreate bucket directory after clearing", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("recreate-bucket");

      await storage.put("file.txt", "content");
      await storage.clearBucket();

      const bucketPath = join(testBasePath, "recreate-bucket");
      expect(await exists(bucketPath)).toBe(true);
    });
  });

  describe("getAsJson", () => {
    test("should return parsed JSON content", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("json-bucket");

      const data = { name: "Test", value: 42, nested: { key: "value" } };
      await storage.put("data.json", JSON.stringify(data));

      const result = await storage.getAsJson<typeof data>("data.json");

      expect(result).toEqual(data);
    });

    test("should throw StorageException when file does not exist", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("json-bucket");

      expect(storage.getAsJson("missing.json")).rejects.toThrow(StorageException);
      expect(storage.getAsJson("missing.json")).rejects.toThrow("does not exist");
    });

    test("should throw StorageException for invalid JSON", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("json-bucket");

      await storage.put("invalid.json", "not valid json");

      expect(storage.getAsJson("invalid.json")).rejects.toThrow(StorageException);
    });
  });

  describe("getAsArrayBuffer", () => {
    test("should return file content as ArrayBuffer", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("arraybuffer-bucket");

      const content = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.put("binary.bin", content.buffer as ArrayBuffer);

      const buffer = await storage.getAsArrayBuffer("binary.bin");

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(buffer)).toEqual(content);
    });

    test("should throw StorageException when file does not exist", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("arraybuffer-bucket");

      expect(storage.getAsArrayBuffer("missing.bin")).rejects.toThrow(StorageException);
      expect(storage.getAsArrayBuffer("missing.bin")).rejects.toThrow("does not exist");
    });
  });

  describe("getAsStream", () => {
    test("should return a ReadableStream", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("stream-bucket");

      await storage.put("stream.txt", "stream content");

      const stream = storage.getAsStream("stream.txt");

      expect(stream).toBeInstanceOf(ReadableStream);
    });

    test("should stream file content correctly", async () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("stream-bucket");

      const content = "This is streamed content";
      await storage.put("readable.txt", content);

      const stream = storage.getAsStream("readable.txt");
      const reader = stream.getReader();

      const chunks: Uint8Array[] = [];
      let result = await reader.read();
      while (!result.done) {
        chunks.push(result.value);
        result = await reader.read();
      }

      const decoder = new TextDecoder();
      const readContent = chunks.map((chunk) => decoder.decode(chunk)).join("");
      expect(readContent).toBe(content);
    });

    test("should throw StorageException when file does not exist", () => {
      const storage = new FilesystemStorage(new AppEnv());
      storage.setBucket("stream-bucket");

      expect(() => storage.getAsStream("missing.txt")).toThrow(StorageException);
      expect(() => storage.getAsStream("missing.txt")).toThrow("does not exist");
    });
  });

  describe("IStorage interface compliance", () => {
    test("should implement all IStorage methods", () => {
      const storage = new FilesystemStorage(new AppEnv());

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
