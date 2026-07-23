import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { File, FileException } from "@/index";

const TEST_DIR = ".temp/talos-fs-test-file";
const TEST_FILE = `${TEST_DIR}/test.txt`;
const TEST_JSON_FILE = `${TEST_DIR}/test.json`;

describe("File", () => {
  beforeEach(async () => {
    await Bun.write(`${TEST_DIR}/.keep`, "");
    await Bun.write(TEST_FILE, "Hello, World!");
    await Bun.write(TEST_JSON_FILE, JSON.stringify({ name: "test", value: 42 }));
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("constructor", () => {
    test("should create a File instance with string path", () => {
      const file = new File(TEST_FILE);
      expect(file).toBeInstanceOf(File);
    });

    test("should create a File instance with URL", () => {
      const file = new File(new URL(`file://${TEST_FILE}`));
      expect(file).toBeInstanceOf(File);
    });
  });

  describe("getPath", () => {
    test("should return the file path", () => {
      const file = new File(TEST_FILE);
      expect(file.getPath()).toBe(TEST_FILE);
    });
  });

  describe("getName", () => {
    test("should return the file name", () => {
      const file = new File(TEST_FILE);
      expect(file.getName()).toBe("test.txt");
    });
  });

  describe("getExtension", () => {
    test("should return the file extension without dot", () => {
      const file = new File(TEST_FILE);
      expect(file.getExtension()).toBe("txt");
    });

    test("should return empty string for files without extension", () => {
      const file = new File(`${TEST_DIR}/noext`);
      expect(file.getExtension()).toBe("");
    });
  });

  describe("getDirectory", () => {
    test("should return an IDirectory instance", () => {
      const file = new File(TEST_FILE);
      const dir = file.getDirectory();
      expect(dir.getPath()).toBe(TEST_DIR);
      expect(dir.getName()).toBe("talos-fs-test-file");
    });
  });

  describe("getSize", () => {
    test("should return the file size", () => {
      const file = new File(TEST_FILE);
      expect(file.getSize()).toBe(13);
    });

    test("should return 0 for non-existent file", () => {
      const file = new File(`${TEST_DIR}/nonexistent.txt`);
      expect(file.getSize()).toBe(0);
    });
  });

  describe("getType", () => {
    test("should return the MIME type for text file", () => {
      const file = new File(TEST_FILE);
      expect(file.getType()).toContain("text/plain");
    });

    test("should return the MIME type for JSON file", () => {
      const file = new File(TEST_JSON_FILE);
      expect(file.getType()).toContain("application/json");
    });
  });

  describe("exists", () => {
    test("should return true for existing file", async () => {
      const file = new File(TEST_FILE);
      expect(await file.exists()).toBe(true);
    });

    test("should return false for non-existent file", async () => {
      const file = new File(`${TEST_DIR}/nonexistent.txt`);
      expect(await file.exists()).toBe(false);
    });
  });

  describe("text", () => {
    test("should read file content as text", async () => {
      const file = new File(TEST_FILE);
      const content = await file.text();
      expect(content).toBe("Hello, World!");
    });

    test("should throw FileException for non-existent file", async () => {
      const file = new File(`${TEST_DIR}/nonexistent.txt`);
      expect(file.text()).rejects.toThrow(FileException);
    });
  });

  describe("json", () => {
    test("should read and parse JSON file", async () => {
      const file = new File(TEST_JSON_FILE);
      const data = await file.json<{ name: string; value: number }>();
      expect(data.name).toBe("test");
      expect(data.value).toBe(42);
    });

    test("should throw FileException for invalid JSON", async () => {
      const invalidJsonFile = `${TEST_DIR}/invalid.json`;
      await Bun.write(invalidJsonFile, "not valid json");
      const file = new File(invalidJsonFile);
      expect(file.json()).rejects.toThrow(FileException);
    });
  });

  describe("arrayBuffer", () => {
    test("should read file as ArrayBuffer", async () => {
      const file = new File(TEST_FILE);
      const buffer = await file.arrayBuffer();
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(13);
    });
  });

  describe("bytes", () => {
    test("should read file as Uint8Array", async () => {
      const file = new File(TEST_FILE);
      const bytes = await file.bytes();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(13);
    });
  });

  describe("stream", () => {
    test("should yield Uint8Array chunks", async () => {
      const file = new File(TEST_FILE);
      const chunks: Uint8Array[] = [];

      for await (const chunk of file.stream()) {
        expect(chunk).toBeInstanceOf(Uint8Array);
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("streamAsText", () => {
    test("should yield string chunks", async () => {
      const file = new File(TEST_FILE);

      for await (const chunk of file.streamAsText()) {
        expect(typeof chunk).toBe("string");
      }
    });

    test("should stream file content as text", async () => {
      const file = new File(TEST_FILE);
      const chunks: string[] = [];

      for await (const chunk of file.streamAsText()) {
        chunks.push(chunk);
      }

      const content = chunks.join("");
      expect(content).toBe("Hello, World!");
    });

    test("should stream large file content correctly", async () => {
      const largeContent = "Line of text\n".repeat(1000);
      const largeFile = `${TEST_DIR}/large.txt`;
      await Bun.write(largeFile, largeContent);

      const file = new File(largeFile);
      const chunks: string[] = [];

      for await (const chunk of file.streamAsText()) {
        chunks.push(chunk);
      }

      const content = chunks.join("");
      expect(content).toBe(largeContent);
    });
  });

  describe("streamAsJson", () => {
    test("should stream JSON array elements", async () => {
      const jsonArrayFile = `${TEST_DIR}/array.json`;
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      await Bun.write(jsonArrayFile, JSON.stringify(data));

      const file = new File(jsonArrayFile);
      const items: { id: number }[] = [];

      for await (const item of file.streamAsJson<{ id: number }>()) {
        items.push(item);
      }

      expect(items).toHaveLength(3);
      expect(items[0]?.id).toBe(1);
      expect(items[1]?.id).toBe(2);
      expect(items[2]?.id).toBe(3);
    });

    test("should handle nested objects", async () => {
      const jsonArrayFile = `${TEST_DIR}/nested.json`;
      const data = [
        { name: "Alice", details: { age: 30, city: "NYC" } },
        { name: "Bob", details: { age: 25, city: "LA" } },
      ];
      await Bun.write(jsonArrayFile, JSON.stringify(data));

      const file = new File(jsonArrayFile);
      const items: { name: string; details: { age: number; city: string } }[] = [];

      for await (const item of file.streamAsJson<{ name: string; details: { age: number; city: string } }>()) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
      expect(items[0]?.name).toBe("Alice");
      expect(items[0]?.details.age).toBe(30);
      expect(items[1]?.name).toBe("Bob");
      expect(items[1]?.details.city).toBe("LA");
    });

    test("should handle strings with special characters", async () => {
      const jsonArrayFile = `${TEST_DIR}/special.json`;
      const data = [{ text: 'Hello "World"' }, { text: "Line1\\nLine2" }, { text: "Braces { and }" }];
      await Bun.write(jsonArrayFile, JSON.stringify(data));

      const file = new File(jsonArrayFile);
      const items: { text: string }[] = [];

      for await (const item of file.streamAsJson<{ text: string }>()) {
        items.push(item);
      }

      expect(items).toHaveLength(3);
      expect(items[0]?.text).toBe('Hello "World"');
      expect(items[2]?.text).toBe("Braces { and }");
    });

    test("should handle empty array", async () => {
      const jsonArrayFile = `${TEST_DIR}/empty.json`;
      await Bun.write(jsonArrayFile, "[]");

      const file = new File(jsonArrayFile);
      const items: unknown[] = [];

      for await (const item of file.streamAsJson()) {
        items.push(item);
      }

      expect(items).toHaveLength(0);
    });
  });

  describe("write", () => {
    test("should write string to file", async () => {
      const newFile = `${TEST_DIR}/new.txt`;
      const file = new File(newFile);
      const bytesWritten = await file.write("New content");
      expect(bytesWritten).toBe(11);

      const content = await file.text();
      expect(content).toBe("New content");
    });

    test("should write Uint8Array to file", async () => {
      const newFile = `${TEST_DIR}/binary.bin`;
      const file = new File(newFile);
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const bytesWritten = await file.write(data);
      expect(bytesWritten).toBe(5);
    });

    test("should overwrite existing file", async () => {
      const file = new File(TEST_FILE);
      await file.write("Overwritten");
      const content = await file.text();
      expect(content).toBe("Overwritten");
    });
  });

  describe("append", () => {
    test("should append string to existing file", async () => {
      const file = new File(TEST_FILE);
      await file.append(" Appended!");
      const content = await file.text();
      expect(content).toBe("Hello, World! Appended!");
    });

    test("should append Uint8Array to existing file", async () => {
      const file = new File(TEST_FILE);
      const data = new TextEncoder().encode(" Binary");
      await file.append(data);
      const content = await file.text();
      expect(content).toBe("Hello, World! Binary");
    });

    test("should create file if it does not exist", async () => {
      const newFile = `${TEST_DIR}/appended.txt`;
      const file = new File(newFile);
      await file.append("First content");
      const content = await file.text();
      expect(content).toBe("First content");
    });
  });

  describe("copy", () => {
    test("should copy file to destination and return IFile", async () => {
      const file = new File(TEST_FILE);
      const destination = `${TEST_DIR}/copied.txt`;
      const copiedFile = await file.copy(destination);

      expect(copiedFile).toBeInstanceOf(File);
      expect(copiedFile.getPath()).toBe(destination);
      expect(await copiedFile.exists()).toBe(true);
      const content = await copiedFile.text();
      expect(content).toBe("Hello, World!");
    });

    test("should preserve original file after copy", async () => {
      const file = new File(TEST_FILE);
      const destination = `${TEST_DIR}/copied.txt`;
      await file.copy(destination);

      expect(await file.exists()).toBe(true);
      expect(await file.text()).toBe("Hello, World!");
    });
  });

  describe("delete", () => {
    test("should delete the file", async () => {
      const fileToDelete = `${TEST_DIR}/to-delete.txt`;
      await Bun.write(fileToDelete, "Delete me");

      const file = new File(fileToDelete);
      expect(await file.exists()).toBe(true);

      await file.delete();
      expect(await file.exists()).toBe(false);
    });
  });

  describe("download", () => {
    let server: ReturnType<typeof Bun.serve>;
    let baseUrl: string;

    beforeEach(() => {
      server = Bun.serve({
        port: 0,
        fetch(req) {
          const url = new URL(req.url);

          if (url.pathname === "/text") {
            return new Response("User-agent: *\nDisallow: /private/", {
              headers: { "Content-Type": "text/plain" },
            });
          }

          if (url.pathname === "/json") {
            return new Response(JSON.stringify({ slideshow: { title: "Test Slideshow" } }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (url.pathname === "/image") {
            // PNG magic bytes followed by minimal valid PNG data
            const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            return new Response(pngBytes, {
              headers: { "Content-Type": "image/png" },
            });
          }

          if (url.pathname === "/status/404") {
            return new Response("Not Found", { status: 404 });
          }

          if (url.pathname === "/status/500") {
            return new Response("Internal Server Error", { status: 500 });
          }

          return new Response("Not Found", { status: 404 });
        },
      });
      baseUrl = `http://localhost:${server.port}`;
    });

    afterEach(() => {
      server.stop();
    });

    test("should download file from URL string", async () => {
      const downloadFile = `${TEST_DIR}/downloaded.txt`;

      const file = await File.download(`${baseUrl}/text`, downloadFile);

      expect(await file.exists()).toBe(true);
      const content = await file.text();
      expect(content).toContain("User-agent");
    });

    test("should download file from URL object", async () => {
      const downloadFile = `${TEST_DIR}/downloaded-url.txt`;

      const file = await File.download(new URL(`${baseUrl}/text`), downloadFile);

      expect(await file.exists()).toBe(true);
    });

    test("should download JSON file", async () => {
      const downloadFile = `${TEST_DIR}/downloaded.json`;

      const file = await File.download(`${baseUrl}/json`, downloadFile);

      expect(await file.exists()).toBe(true);
      const data = await file.json<{ slideshow: { title: string } }>();
      expect(data.slideshow).toBeDefined();
      expect(data.slideshow.title).toBe("Test Slideshow");
    });

    test("should download binary file", async () => {
      const downloadFile = `${TEST_DIR}/downloaded.png`;

      const file = await File.download(`${baseUrl}/image`, downloadFile);

      expect(await file.exists()).toBe(true);
      const bytes = await file.bytes();
      // PNG magic number
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
      expect(bytes[2]).toBe(0x4e);
      expect(bytes[3]).toBe(0x47);
    });

    test("should throw FileException for non-existent URL", async () => {
      const downloadFile = `${TEST_DIR}/failed.txt`;

      expect(File.download(`${baseUrl}/status/404`, downloadFile)).rejects.toThrow(FileException);
    });

    test("should throw FileException for server error", async () => {
      const downloadFile = `${TEST_DIR}/failed.txt`;

      expect(File.download(`${baseUrl}/status/500`, downloadFile)).rejects.toThrow(FileException);
    });

    test("should throw FileException for invalid URL", async () => {
      const downloadFile = `${TEST_DIR}/failed.txt`;

      expect(
        File.download("https://invalid-domain-that-does-not-exist-12345.com/file.txt", downloadFile),
      ).rejects.toThrow(FileException);
    });

    test("should overwrite existing file", async () => {
      const downloadFile = `${TEST_DIR}/overwrite.txt`;
      await Bun.write(downloadFile, "Original content");

      const file = await File.download(`${baseUrl}/text`, downloadFile);

      const content = await file.text();
      expect(content).not.toBe("Original content");
      expect(content).toContain("User-agent");
    });
  });

  describe("writer", () => {
    test("should return a FileSink for incremental writing", () => {
      const file = new File(`${TEST_DIR}/sink.txt`);
      const writer = file.writer();
      expect(writer).toBeDefined();
      expect(typeof writer.write).toBe("function");
      expect(typeof writer.flush).toBe("function");
      expect(typeof writer.end).toBe("function");
    });

    test("should accept highWaterMark option", () => {
      const file = new File(`${TEST_DIR}/sink.txt`);
      const writer = file.writer({ highWaterMark: 1024 * 1024 });
      expect(writer).toBeDefined();
    });

    test("should write incrementally using FileSink", async () => {
      const sinkFile = `${TEST_DIR}/incremental.txt`;
      const file = new File(sinkFile);
      const writer = file.writer();

      writer.write("Line 1\n");
      writer.write("Line 2\n");
      writer.flush();
      writer.end();

      const content = await file.text();
      expect(content).toBe("Line 1\nLine 2\n");
    });
  });
});

describe("FileException", () => {
  test("should have correct name", () => {
    const exception = new FileException("Test error", "test_error");
    expect(exception.name).toBe("FileException");
  });

  test("should have correct message", () => {
    const exception = new FileException("Test error message", "test_error_message");
    expect(exception.message).toBe("Test error message");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new FileException("Test", "test_key", data);
    expect(Object.isFrozen(exception.data)).toBe(true);
  });

  test("should have default status 500", () => {
    const exception = new FileException("Test", "test_key");
    expect(exception.status).toBe(500);
  });
});
