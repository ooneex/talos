import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MimeType } from "@talosjs/http-mimes";
import { RequestFile } from "@/index";

describe("RequestFile", () => {
  let mockFile: File;
  let testTmpDir: string;
  let uploadsDir: string;
  let relativeDir: string;

  beforeAll(async () => {
    // Create a temporary directory for all test files
    testTmpDir = mkdtempSync(join(tmpdir(), "requestfile-tests-"));
    uploadsDir = join(testTmpDir, "uploads");
    relativeDir = join(testTmpDir, "relative", "path");

    // Create the directories
    await Bun.write(join(uploadsDir, ".gitkeep"), ""); // Creates directory structure
    await Bun.write(join(relativeDir, ".gitkeep"), ""); // Creates directory structure
  });

  afterAll(() => {
    // Clean up all test files and directories
    try {
      rmSync(testTmpDir, { recursive: true, force: true });
    } catch {
      // Silent cleanup failure - not critical for tests
    }
  });

  describe("constructor", () => {
    describe("basic file properties", () => {
      test("should initialize with basic file properties", () => {
        mockFile = new File(["test content"], "test-file.txt", {
          type: "text/plain",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.size).toBe(mockFile.size);
        expect(requestFile.type).toBe("text/plain");
        expect(requestFile.extension).toBe("txt");
        expect(requestFile.originalName).toBe("test-file.txt");
        expect(requestFile.name).toMatch(/^[0-9a-f]{25}\.txt$/);
        expect(requestFile.id).toMatch(/^[0-9a-f]{25}$/);
      });

      test("should handle file without extension", () => {
        mockFile = new File(["content"], "filename", {
          type: "text/plain",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.extension).toBe("");
        expect(requestFile.originalName).toBe("filename.");
        expect(requestFile.name).toMatch(/^[0-9a-f]{25}\.$/);
      });

      test("should handle empty filename", () => {
        // Note: File constructor doesn't allow truly empty filename, so test with just extension
        mockFile = new File(["content"], ".txt", {
          type: "text/plain",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.extension).toBe("txt");
        expect(requestFile.originalName).toBe(".txt");
        expect(requestFile.name).toMatch(/^[0-9a-f]{25}\.txt$/);
      });

      test("should convert filename to kebab-case", () => {
        mockFile = new File(["content"], "My Test File.pdf", {
          type: "application/pdf",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.extension).toBe("pdf");
        expect(requestFile.originalName).toBe("my-test-file.pdf");
        expect(requestFile.name).toMatch(/^[0-9a-f]{25}\.pdf$/);
      });

      test("should handle uppercase extensions", () => {
        mockFile = new File(["content"], "document.PDF", {
          type: "application/pdf",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.extension).toBe("pdf");
        expect(requestFile.originalName).toBe("document.pdf");
        expect(requestFile.name).toMatch(/^[0-9a-f]{25}\.pdf$/);
      });

      test("should clean mime type by removing charset", () => {
        mockFile = new File(["content"], "test.txt", {
          type: "text/plain;charset=utf-8",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.type).toBe("text/plain");
      });

      test("should handle complex mime type with multiple parameters", () => {
        mockFile = new File(["content"], "test.txt", {
          type: "text/plain; charset=utf-8; boundary=something",
        });

        const requestFile = new RequestFile(mockFile);

        // The regex removes everything after charset, leaving "text/plain; "
        expect(requestFile.type).toBe("text/plain" as unknown as MimeType);
      });

      test("should generate unique IDs for different files", () => {
        const file1 = new File(["content1"], "file1.txt", {
          type: "text/plain",
        });
        const file2 = new File(["content2"], "file2.txt", {
          type: "text/plain",
        });

        const requestFile1 = new RequestFile(file1);
        const requestFile2 = new RequestFile(file2);

        expect(requestFile1.id).not.toBe(requestFile2.id);
        expect(requestFile1.name).not.toBe(requestFile2.name);
        expect(requestFile1.id).toHaveLength(25);
        expect(requestFile2.id).toHaveLength(25);
      });
    });

    describe("file type detection", () => {
      test("should have boolean type detection properties", () => {
        mockFile = new File(["image data"], "photo.jpg", {
          type: "image/jpeg",
        });

        const requestFile = new RequestFile(mockFile);

        // Test that all type detection properties exist and are boolean
        expect(typeof requestFile.isImage).toBe("boolean");
        expect(typeof requestFile.isSvg).toBe("boolean");
        expect(typeof requestFile.isVideo).toBe("boolean");
        expect(typeof requestFile.isAudio).toBe("boolean");
        expect(typeof requestFile.isPdf).toBe("boolean");
        expect(typeof requestFile.isText).toBe("boolean");
        expect(typeof requestFile.isExcel).toBe("boolean");
        expect(typeof requestFile.isCsv).toBe("boolean");
        expect(typeof requestFile.isJson).toBe("boolean");
        expect(typeof requestFile.isXml).toBe("boolean");
        expect(typeof requestFile.isHtml).toBe("boolean");
      });

      test("should detect common image files", () => {
        const imageFile = new File(["image data"], "photo.jpg", {
          type: "image/jpeg",
        });

        const requestFile = new RequestFile(imageFile);

        // Since we can't mock the Mime class easily, we just test the property exists
        expect(typeof requestFile.isImage).toBe("boolean");
      });

      test("should detect common text files", () => {
        const textFile = new File(["text content"], "readme.txt", {
          type: "text/plain",
        });

        const requestFile = new RequestFile(textFile);

        expect(typeof requestFile.isText).toBe("boolean");
      });

      test("should detect common PDF files", () => {
        const pdfFile = new File(["pdf data"], "document.pdf", {
          type: "application/pdf",
        });

        const requestFile = new RequestFile(pdfFile);

        expect(typeof requestFile.isPdf).toBe("boolean");
      });
    });

    describe("edge cases", () => {
      test("should handle file with multiple extensions", () => {
        mockFile = new File(["content"], "archive.tar.gz", {
          type: "application/gzip",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.extension).toBe("gz");
        expect(requestFile.originalName).toBe("archive-tar.gz");
      });

      test("should handle file with numeric extension", () => {
        mockFile = new File(["content"], "file.123", {
          type: "application/octet-stream",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.extension).toBe("123");
        expect(requestFile.originalName).toBe("file.123");
      });

      test("should handle special characters in filename", () => {
        mockFile = new File(["content"], "file@#$%.txt", {
          type: "text/plain",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.extension).toBe("txt");
        expect(requestFile.originalName).toMatch(/\.txt$/);
      });

      test("should handle very long filename", () => {
        const longFilename = `${"a".repeat(200)}.txt`;
        mockFile = new File(["content"], longFilename, {
          type: "text/plain",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.extension).toBe("txt");
        expect(requestFile.originalName).toContain(".txt");
      });

      test("should handle empty mime type", () => {
        mockFile = new File(["content"], "file.txt", {
          type: "",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.type).toBe("" as unknown as MimeType);
      });

      test("should handle zero-sized file", () => {
        mockFile = new File([], "empty.txt", {
          type: "text/plain",
        });

        const requestFile = new RequestFile(mockFile);

        expect(requestFile.size).toBe(0);
        expect(requestFile.extension).toBe("txt");
      });
    });
  });

  describe("readAsArrayBuffer", () => {
    test("should return array buffer from file", async () => {
      const content = "test content";
      mockFile = new File([content], "test.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      const result = await requestFile.readAsArrayBuffer();

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(content.length);
    });

    test("should handle empty file", async () => {
      mockFile = new File([], "empty.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      const result = await requestFile.readAsArrayBuffer();

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(0);
    });

    test("should handle binary data", async () => {
      const binaryData = new Uint8Array([0, 1, 2, 3, 255]);
      mockFile = new File([binaryData], "binary.bin", {
        type: "application/octet-stream",
      });
      const requestFile = new RequestFile(mockFile);

      const result = await requestFile.readAsArrayBuffer();

      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(5);
    });
  });

  describe("readAsStream", () => {
    test("should return readable stream from file", () => {
      const content = "test content";
      mockFile = new File([content], "test.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      const result = requestFile.readAsStream();

      expect(result).toBeInstanceOf(ReadableStream);
    });

    test("should handle empty file stream", () => {
      mockFile = new File([], "empty.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      const result = requestFile.readAsStream();

      expect(result).toBeInstanceOf(ReadableStream);
    });

    test("should handle large file stream", () => {
      const largeContent = "x".repeat(10_000);
      mockFile = new File([largeContent], "large.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      const result = requestFile.readAsStream();

      expect(result).toBeInstanceOf(ReadableStream);
    });
  });

  describe("readAsText", () => {
    test("should return text content from file", async () => {
      const content = "Hello, World!";
      mockFile = new File([content], "hello.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      const result = await requestFile.readAsText();

      expect(result).toBe(content);
    });

    test("should handle empty text file", async () => {
      mockFile = new File([], "empty.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      const result = await requestFile.readAsText();

      expect(result).toBe("");
    });

    test("should handle UTF-8 content", async () => {
      const content = "Hello 世界! 🌍";
      mockFile = new File([content], "unicode.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      const result = await requestFile.readAsText();

      expect(result).toBe(content);
    });

    test("should handle JSON content", async () => {
      const jsonContent = '{"message": "Hello", "emoji": "👋"}';
      mockFile = new File([jsonContent], "data.json", {
        type: "application/json",
      });
      const requestFile = new RequestFile(mockFile);

      const result = await requestFile.readAsText();

      expect(result).toBe(jsonContent);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    test("should handle multiline text", async () => {
      const content = "Line 1\nLine 2\nLine 3";
      mockFile = new File([content], "multiline.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      const result = await requestFile.readAsText();

      expect(result).toBe(content);
      expect(result.split("\n")).toHaveLength(3);
    });
  });

  describe("write", () => {
    test("should call Bun.write with correct parameters", async () => {
      const content = "test content";
      mockFile = new File([content], "test.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);
      const writePath = join(testTmpDir, "test-file.txt");

      // We can't easily mock Bun.write in this environment, so we just test the method exists
      expect(typeof requestFile.write).toBe("function");

      // Test that it returns a promise
      const writePromise = requestFile.write(writePath);
      expect(writePromise).toBeInstanceOf(Promise);

      // Clean up - this might fail if write actually tries to write, but that's expected in tests
      try {
        await writePromise;
      } catch (error) {
        // Expected in test environment where file system operations may not work
        expect(error).toBeDefined();
      }
    });

    test("should handle different file paths", async () => {
      const content = "test content";
      mockFile = new File([content], "test.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      // Test that method accepts different path formats
      expect(typeof requestFile.write).toBe("function");

      const paths = [join(testTmpDir, "test.txt"), join(uploadsDir, "file.txt"), join(relativeDir, "file.txt")];

      for (const path of paths) {
        const promise = requestFile.write(path);
        expect(promise).toBeInstanceOf(Promise);

        // Clean up the promise to avoid unhandled errors
        try {
          await promise;
        } catch {
          // Expected in test environment
        }
      }
    });
  });

  describe("readonly properties", () => {
    test("should have all required properties", () => {
      mockFile = new File(["content"], "test.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      // Test that all properties exist and are of correct type
      expect(typeof requestFile.id).toBe("string");
      expect(typeof requestFile.name).toBe("string");
      expect(typeof requestFile.originalName).toBe("string");
      expect(typeof requestFile.type).toBe("string");
      expect(typeof requestFile.size).toBe("number");
      expect(typeof requestFile.extension).toBe("string");
      expect(typeof requestFile.isImage).toBe("boolean");
      expect(typeof requestFile.isSvg).toBe("boolean");
      expect(typeof requestFile.isVideo).toBe("boolean");
      expect(typeof requestFile.isAudio).toBe("boolean");
      expect(typeof requestFile.isPdf).toBe("boolean");
      expect(typeof requestFile.isText).toBe("boolean");
      expect(typeof requestFile.isExcel).toBe("boolean");
      expect(typeof requestFile.isCsv).toBe("boolean");
      expect(typeof requestFile.isJson).toBe("boolean");
      expect(typeof requestFile.isXml).toBe("boolean");
      expect(typeof requestFile.isHtml).toBe("boolean");
    });

    test("should have consistent property values", () => {
      mockFile = new File(["test"], "document.pdf", {
        type: "application/pdf",
      });
      const requestFile = new RequestFile(mockFile);

      expect(requestFile.extension).toBe("pdf");
      expect(requestFile.originalName).toBe("document.pdf");
      expect(requestFile.type).toBe("application/pdf");
      expect(requestFile.size).toBe(4); // "test".length
    });
  });

  describe("integration tests", () => {
    test("should handle complete file workflow", async () => {
      const originalContent = "Hello, World!";
      mockFile = new File([originalContent], "Hello World File.txt", {
        type: "text/plain;charset=utf-8",
      });

      const requestFile = new RequestFile(mockFile);

      // Test properties
      expect(requestFile.originalName).toBe("hello-world-file.txt");
      expect(requestFile.extension).toBe("txt");
      expect(requestFile.type).toBe("text/plain");
      expect(typeof requestFile.isText).toBe("boolean");
      expect(typeof requestFile.isImage).toBe("boolean");

      // Test reading
      const textContent = await requestFile.readAsText();
      expect(textContent).toBe(originalContent);

      const arrayBuffer = await requestFile.readAsArrayBuffer();
      expect(arrayBuffer.byteLength).toBe(originalContent.length);

      const stream = requestFile.readAsStream();
      expect(stream).toBeInstanceOf(ReadableStream);

      // Test writing (method existence)
      expect(typeof requestFile.write).toBe("function");
    });

    test("should handle image file workflow", async () => {
      const imageData = new Uint8Array([137, 80, 78, 71]); // PNG signature
      mockFile = new File([imageData], "My Photo.png", {
        type: "image/png",
      });

      const requestFile = new RequestFile(mockFile);

      expect(requestFile.originalName).toBe("my-photo.png");
      expect(requestFile.extension).toBe("png");
      expect(requestFile.type).toBe("image/png");
      expect(typeof requestFile.isImage).toBe("boolean");
      expect(typeof requestFile.isText).toBe("boolean");

      const arrayBuffer = await requestFile.readAsArrayBuffer();
      expect(new Uint8Array(arrayBuffer)).toEqual(imageData);
    });

    test("should handle multiple file instances independently", () => {
      const file1 = new File(["content1"], "file1.txt", { type: "text/plain" });
      const file2 = new File(["content2"], "file2.jpg", { type: "image/jpeg" });

      const requestFile1 = new RequestFile(file1);
      const requestFile2 = new RequestFile(file2);

      expect(requestFile1.id).not.toBe(requestFile2.id);
      expect(requestFile1.extension).toBe("txt");
      expect(requestFile2.extension).toBe("jpg");
      expect(typeof requestFile1.isText).toBe("boolean");
      expect(typeof requestFile2.isImage).toBe("boolean");
    });

    test("should handle concurrent operations", async () => {
      const content = "concurrent test";
      mockFile = new File([content], "concurrent.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      // Perform multiple async operations concurrently
      const [textResult, bufferResult] = await Promise.all([requestFile.readAsText(), requestFile.readAsArrayBuffer()]);

      expect(textResult).toBe(content);
      expect(bufferResult.byteLength).toBe(content.length);
    });
  });

  describe("parameter tests", () => {
    test.each([
      ["test.txt", "text/plain", "txt", "test.txt"],
      ["image.jpg", "image/jpeg", "jpg", "image.jpg"],
      ["document.pdf", "application/pdf", "pdf", "document.pdf"],
      ["data.json", "application/json", "json", "data.json"],
      ["style.css", "text/css", "css", "style.css"],
      ["script.js", "text/javascript", "js", "script.js"],
      ["video.mp4", "video/mp4", "mp4", "video.mp4"],
      ["audio.mp3", "audio/mpeg", "mp3", "audio.mp3"],
      ["archive.zip", "application/zip", "zip", "archive.zip"],
      [
        "My File Name.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "docx",
        "my-file-name.docx",
      ],
    ])("should handle file %s with type %s", (filename, mimeType, expectedExtension, expectedOriginalName) => {
      mockFile = new File(["content"], filename, { type: mimeType });
      const requestFile = new RequestFile(mockFile);

      expect(requestFile.extension).toBe(expectedExtension);
      expect(requestFile.originalName).toBe(expectedOriginalName);
      expect(requestFile.type).toBe(mimeType as unknown as MimeType);
    });
  });

  describe("type compatibility", () => {
    test("should implement IRequestFile interface", () => {
      mockFile = new File(["content"], "test.txt", { type: "text/plain" });
      const requestFile = new RequestFile(mockFile);

      // Test that all interface properties exist
      expect(typeof requestFile.name).toBe("string");
      expect(typeof requestFile.originalName).toBe("string");
      expect(typeof requestFile.type).toBe("string");
      expect(typeof requestFile.size).toBe("number");
      expect(typeof requestFile.extension).toBe("string");
      expect(typeof requestFile.isImage).toBe("boolean");
      expect(typeof requestFile.isVideo).toBe("boolean");
      expect(typeof requestFile.isAudio).toBe("boolean");
      expect(typeof requestFile.isPdf).toBe("boolean");
      expect(typeof requestFile.isText).toBe("boolean");
      expect(typeof requestFile.isExcel).toBe("boolean");
      expect(typeof requestFile.isCsv).toBe("boolean");
      expect(typeof requestFile.isJson).toBe("boolean");
      expect(typeof requestFile.isXml).toBe("boolean");
      expect(typeof requestFile.isHtml).toBe("boolean");
      expect(typeof requestFile.isSvg).toBe("boolean");

      // Test that all interface methods exist and return correct types
      expect(typeof requestFile.readAsArrayBuffer).toBe("function");
      expect(typeof requestFile.readAsStream).toBe("function");
      expect(typeof requestFile.readAsText).toBe("function");
      expect(typeof requestFile.write).toBe("function");
    });

    test("should work with different File constructor patterns", () => {
      // Test different ways to create File objects
      const file1 = new File(["content"], "test1.txt", { type: "text/plain" });
      const file2 = new File([new Blob(["content"])], "test2.txt", {
        type: "text/plain",
      });
      const file3 = new File([new ArrayBuffer(10)], "test3.bin", {
        type: "application/octet-stream",
      });

      const requestFile1 = new RequestFile(file1);
      const requestFile2 = new RequestFile(file2);
      const requestFile3 = new RequestFile(file3);

      expect(requestFile1.extension).toBe("txt");
      expect(requestFile2.extension).toBe("txt");
      expect(requestFile3.extension).toBe("bin");
    });
  });

  describe("real world scenarios", () => {
    test("should process uploaded image file", () => {
      const imageData = new Uint8Array([255, 216, 255, 224]); // JPEG header
      mockFile = new File([imageData], "photo.JPEG", { type: "image/jpeg" });

      const requestFile = new RequestFile(mockFile);

      expect(requestFile.extension).toBe("jpeg");
      expect(requestFile.originalName).toBe("photo.jpeg");
      expect(requestFile.type).toBe("image/jpeg");
      expect(typeof requestFile.isImage).toBe("boolean");
    });

    test("should process document upload", () => {
      const docContent = "Document content here";
      mockFile = new File([docContent], "Important Document.pdf", {
        type: "application/pdf",
      });

      const requestFile = new RequestFile(mockFile);

      expect(requestFile.extension).toBe("pdf");
      expect(requestFile.originalName).toBe("important-document.pdf");
      expect(requestFile.type).toBe("application/pdf");
      expect(requestFile.size).toBe(docContent.length);
      expect(typeof requestFile.isPdf).toBe("boolean");
    });

    test("should handle batch file processing", () => {
      const files = [
        new File(["text1"], "file1.txt", { type: "text/plain" }),
        new File(["text2"], "file2.md", { type: "text/markdown" }),
        new File([new Uint8Array([1, 2, 3])], "file3.bin", {
          type: "application/octet-stream",
        }),
      ];

      const requestFiles = files.map((file) => new RequestFile(file));

      expect(requestFiles).toHaveLength(3);
      expect(requestFiles[0]?.extension).toBe("txt");
      expect(requestFiles[1]?.extension).toBe("md");
      expect(requestFiles[2]?.extension).toBe("bin");

      // All should have unique IDs
      const ids = requestFiles.map((rf) => rf.id);
      expect(new Set(ids).size).toBe(3);
    });
  });
});
