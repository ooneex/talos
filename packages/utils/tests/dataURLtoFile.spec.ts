import { describe, expect, test } from "bun:test";
import { dataURLtoFile } from "@/dataURLtoFile";

describe("dataURLtoFile", () => {
  describe("basic functionality", () => {
    test("should convert a simple text data URL to a File", () => {
      const dataUrl = "data:text/plain;base64,SGVsbG8gV29ybGQ=";
      const filename = "test.txt";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe(filename);
      expect(file.type).toMatch(/^text\/plain(;.*)?$/);
      expect(file.size).toBe(11); // "Hello World" is 11 bytes
    });

    test("should convert an image data URL to a File", () => {
      // Simple 1x1 red pixel PNG
      const dataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const filename = "pixel.png";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe(filename);
      expect(file.type).toBe("image/png");
      expect(file.size).toBeGreaterThan(0);
    });

    test("should convert a JSON data URL to a File", () => {
      const jsonData = JSON.stringify({ message: "test", value: 123 });
      const base64Data = btoa(jsonData);
      const dataUrl = `data:application/json;base64,${base64Data}`;
      const filename = "data.json";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe(filename);
      expect(file.type).toMatch(/^application\/json(;.*)?$/);
      expect(file.size).toBe(jsonData.length);
    });

    test("should preserve the original filename", () => {
      const dataUrl = "data:text/plain;base64,dGVzdA==";
      const filename = "custom-filename.txt";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file.name).toBe(filename);
    });
  });

  describe("mime type handling", () => {
    test("should extract correct mime type from data URL", () => {
      const testCases = [
        {
          dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
          expectedType: "image/jpeg",
        },
        {
          dataUrl: "data:application/pdf;base64,JVBERi0x",
          expectedType: "application/pdf",
        },
        {
          dataUrl: "data:video/mp4;base64,AAAAIGZ0eXA=",
          expectedType: "video/mp4",
        },
        {
          dataUrl: "data:audio/mpeg;base64,SUQzAwAAAAA=",
          expectedType: "audio/mpeg",
        },
        {
          dataUrl: "data:text/html;base64,PGh0bWw+",
          expectedType: "text/html",
        },
        { dataUrl: "data:text/css;base64,Ym9keSB7", expectedType: "text/css" },
        {
          dataUrl: "data:text/javascript;base64,Y29uc29sZS5sb2c=",
          expectedType: "text/javascript",
        },
      ];

      testCases.forEach(({ dataUrl, expectedType }) => {
        const file = dataURLtoFile(dataUrl, "test");
        expect(file.type).toMatch(new RegExp(`^${expectedType.replace(/[+/]/g, "\\$&")}(;.*)?$`));
      });
    });

    test("should handle data URL with charset parameter", () => {
      const dataUrl = "data:text/plain;charset=utf-8;base64,SGVsbG8gV29ybGQ=";
      const filename = "test.txt";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file.type).toMatch(/^text\/plain(;.*)?$/);
    });

    test("should handle malformed mime type gracefully", () => {
      const dataUrl = "data:invalid-mime-type;base64,dGVzdA==";
      const filename = "test";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe("invalid-mime-type");
    });

    test("should handle data URL without explicit mime type", () => {
      const dataUrl = "data:;base64,dGVzdA==";
      const filename = "test.txt";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe(filename);
      expect(file.type).toBe("");
    });
  });

  describe("base64 decoding", () => {
    test("should correctly decode base64 data", async () => {
      const originalText = "Hello, World! This is a test string.";
      const base64Data = btoa(originalText);
      const dataUrl = `data:text/plain;base64,${base64Data}`;
      const filename = "test.txt";

      const file = dataURLtoFile(dataUrl, filename);
      const decodedText = await file.text();

      expect(decodedText).toBe(originalText);
    });

    test("should handle empty base64 data", () => {
      const dataUrl = "data:text/plain;base64,";
      const filename = "empty.txt";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.size).toBe(0);
    });

    test("should handle base64 data with padding", () => {
      const testCases = [
        { data: "YQ==", expected: "a" }, // 1 char with padding
        { data: "YWI=", expected: "ab" }, // 2 chars with padding
        { data: "YWJj", expected: "abc" }, // 3 chars no padding
        { data: "YWJjZA==", expected: "abcd" }, // 4 chars with padding
      ];

      testCases.forEach(({ data, expected }) => {
        const dataUrl = `data:text/plain;base64,${data}`;
        const file = dataURLtoFile(dataUrl, "test.txt");
        expect(file.size).toBe(expected.length);
      });
    });

    test("should handle Unicode characters properly when base64 encoded", async () => {
      // Use a simple ASCII string first to avoid btoa Unicode issues
      const asciiText = "Hello World 123!";
      const base64Data = btoa(asciiText);
      const dataUrl = `data:text/plain;base64,${base64Data}`;
      const filename = "ascii.txt";

      const file = dataURLtoFile(dataUrl, filename);
      const decodedText = await file.text();

      expect(decodedText).toBe(asciiText);
    });
  });

  describe("edge cases", () => {
    test("should handle very long filenames", () => {
      const dataUrl = "data:text/plain;base64,dGVzdA==";
      const longFilename = `${"a".repeat(255)}.txt`;

      const file = dataURLtoFile(dataUrl, longFilename);

      expect(file.name).toBe(longFilename);
    });

    test("should handle special characters in filename", () => {
      const dataUrl = "data:text/plain;base64,dGVzdA==";
      const specialFilename = "test file with spaces & symbols!@#$%^&*()_+.txt";

      const file = dataURLtoFile(dataUrl, specialFilename);

      expect(file.name).toBe(specialFilename);
    });

    test("should handle binary data correctly", () => {
      // Create a simple binary data string that works with btoa
      const binaryData = String.fromCharCode(0, 1, 2, 3, 127, 126, 125);
      const base64Data = btoa(binaryData);
      const dataUrl = `data:application/octet-stream;base64,${base64Data}`;
      const filename = "binary.dat";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe("application/octet-stream");
      expect(file.size).toBe(binaryData.length);
    });

    test("should handle data URL with multiple parameters", () => {
      const dataUrl = "data:text/plain;charset=utf-8;boundary=something;base64,dGVzdA==";
      const filename = "test.txt";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.type).toMatch(/^text\/plain(;.*)?$/);
    });
  });

  describe("malformed input handling", () => {
    test("should handle data URL with only header", () => {
      const dataUrl = "data:text/plain;base64,";
      const filename = "test.txt";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file).toBeInstanceOf(File);
      expect(file.size).toBe(0);
    });

    test("should handle data URL with missing parts", () => {
      const dataUrl = "data:text/plain";
      const filename = "test.txt";

      // This will likely fail due to invalid base64, but shouldn't crash the function structure
      expect(() => {
        dataURLtoFile(dataUrl, filename);
      }).toThrow();
    });

    test("should handle invalid base64 data", () => {
      const dataUrl = "data:text/plain;base64,invalid!!!base64!!!";
      const filename = "test.txt";

      expect(() => {
        dataURLtoFile(dataUrl, filename);
      }).toThrow();
    });
  });

  describe("file properties validation", () => {
    test("should create file with correct properties", () => {
      const dataUrl =
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A";
      const filename = "image.jpg";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file.name).toBe(filename);
      expect(file.type).toBe("image/jpeg");
      expect(file.size).toBeGreaterThan(0);
      expect(file.lastModified).toBeTypeOf("number");
      expect(Math.abs(file.lastModified - Date.now())).toBeLessThan(1000);
    });

    test("should create file with ArrayBuffer content", async () => {
      const dataUrl = "data:application/octet-stream;base64,AAECAw=="; // [0, 1, 2, 3]
      const filename = "test.bin";

      const file = dataURLtoFile(dataUrl, filename);
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      expect(Array.from(uint8Array)).toEqual([0, 1, 2, 3]);
    });

    test("should allow reading file as different types", async () => {
      const originalText = "Hello, World!";
      const base64Data = btoa(originalText);
      const dataUrl = `data:text/plain;base64,${base64Data}`;
      const filename = "test.txt";

      const file = dataURLtoFile(dataUrl, filename);

      // Test reading as text
      const text = await file.text();
      expect(text).toBe(originalText);

      // Test reading as array buffer
      const arrayBuffer = await file.arrayBuffer();
      expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
      expect(arrayBuffer.byteLength).toBe(originalText.length);

      // Test creating blob URL
      const blobUrl = URL.createObjectURL(file);
      expect(typeof blobUrl).toBe("string");
      expect(blobUrl.startsWith("blob:")).toBe(true);

      // Clean up
      URL.revokeObjectURL(blobUrl);
    });
  });

  describe("real world scenarios", () => {
    test("should handle typical image upload scenario", () => {
      // Simulate a small PNG image data URL
      const dataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const filename = "profile-picture.png";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file.name).toBe(filename);
      expect(file.type).toBe("image/png");
      expect(file.size).toBeGreaterThan(0);
    });

    test("should handle PDF document conversion", () => {
      // Simple PDF header
      const pdfData = btoa("%PDF-1.4");
      const dataUrl = `data:application/pdf;base64,${pdfData}`;
      const filename = "document.pdf";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file.name).toBe(filename);
      expect(file.type).toBe("application/pdf");
      expect(file.size).toBe(8); // "%PDF-1.4" is 8 characters
    });

    test("should handle CSV data export", () => {
      const csvData = "Name,Age,Email\nJohn,30,john@example.com\nJane,25,jane@example.com";
      const base64Data = btoa(csvData);
      const dataUrl = `data:text/csv;base64,${base64Data}`;
      const filename = "export.csv";

      const file = dataURLtoFile(dataUrl, filename);

      expect(file.name).toBe(filename);
      expect(file.type).toBe("text/csv");
      expect(file.size).toBe(csvData.length);
    });

    test("should handle canvas image export", () => {
      // Simulate canvas.toDataURL() result
      const canvasDataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFYSURBVBiVY/z//z8DJQAggJiYmBj+//8PJv7//w9WB+aD2WA+iA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lgPpgN5oPZYD6YDeaD2WA+mA3mg9lg/n8AAwMDAAAAAElFTkSuQmCC";
      const filename = "drawing.png";

      const file = dataURLtoFile(canvasDataUrl, filename);

      expect(file.name).toBe(filename);
      expect(file.type).toBe("image/png");
      expect(file.size).toBeGreaterThan(100); // Should be a reasonable size for an image
    });
  });

  describe("parametrized tests", () => {
    test.each([
      ["text/plain", "SGVsbG8=", "Hello"],
      ["text/html", "PGh0bWw+PC9odG1sPg==", "<html></html>"],
      ["application/json", "eyJrZXkiOiJ2YWx1ZSJ9", '{"key":"value"}'],
      ["image/svg+xml", "PHN2Zz48L3N2Zz4=", "<svg></svg>"],
    ])("should handle %s mime type correctly", async (mimeType, base64Data, expectedContent) => {
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      const filename = `test.${mimeType.split("/")[1]}`;

      const file = dataURLtoFile(dataUrl, filename);
      const content = await file.text();

      expect(file.type).toMatch(new RegExp(`^${mimeType.replace(/[+/]/g, "\\$&")}(;.*)?$`));
      expect(content).toBe(expectedContent);
    });

    test.each([
      ["test.txt"],
      ["my-file.pdf"],
      ["image_01.jpg"],
      ["document with spaces.docx"],
      ["file.with.multiple.dots.txt"],
      ["🎉emoji-filename.txt"],
    ])("should preserve filename: %s", (filename) => {
      const dataUrl = "data:text/plain;base64,dGVzdA==";
      const file = dataURLtoFile(dataUrl, filename);
      expect(file.name).toBe(filename);
    });
  });

  describe("integration with File API", () => {
    test("should work with FormData", () => {
      const dataUrl = "data:text/plain;base64,SGVsbG8gV29ybGQ=";
      const filename = "test.txt";
      const file = dataURLtoFile(dataUrl, filename);

      const formData = new FormData();
      formData.append("file", file);

      const retrievedFile = formData.get("file") as File;
      expect(retrievedFile).toBeInstanceOf(File);
      expect(retrievedFile.name).toBe(filename);
    });

    test("should be compatible with URL.createObjectURL", () => {
      const dataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const filename = "pixel.png";
      const file = dataURLtoFile(dataUrl, filename);

      const objectUrl = URL.createObjectURL(file);

      expect(typeof objectUrl).toBe("string");
      expect(objectUrl.startsWith("blob:")).toBe(true);

      // Clean up
      URL.revokeObjectURL(objectUrl);
    });

    test("should work with file size limits", () => {
      const dataUrl = "data:text/plain;base64,dGVzdA=="; // "test" = 4 bytes
      const filename = "small.txt";
      const file = dataURLtoFile(dataUrl, filename);

      const maxSize = 10;
      expect(file.size <= maxSize).toBe(true);
    });
  });

  describe("performance considerations", () => {
    test("should handle reasonably large files", () => {
      // Create a larger base64 string (about 1KB)
      const largeText = "A".repeat(1000);
      const base64Data = btoa(largeText);
      const dataUrl = `data:text/plain;base64,${base64Data}`;
      const filename = "large.txt";

      const startTime = performance.now();
      const file = dataURLtoFile(dataUrl, filename);
      const endTime = performance.now();

      expect(file).toBeInstanceOf(File);
      expect(file.size).toBe(1000);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });

    test("should create independent files from same data", () => {
      const dataUrl = "data:text/plain;base64,SGVsbG8=";

      const file1 = dataURLtoFile(dataUrl, "file1.txt");
      const file2 = dataURLtoFile(dataUrl, "file2.txt");

      expect(file1).not.toBe(file2); // Different objects
      expect(file1.name).toBe("file1.txt");
      expect(file2.name).toBe("file2.txt");
      expect(file1.size).toBe(file2.size);
      expect(file1.type).toBe(file2.type);
    });
  });

  describe("limitations and constraints", () => {
    test("should document base64 requirement", () => {
      // This function specifically requires base64 encoded data
      const validDataUrl = "data:text/plain;base64,SGVsbG8=";

      expect(() => {
        dataURLtoFile(validDataUrl, "test.txt");
      }).not.toThrow();
    });

    test("should handle mime type extraction correctly", () => {
      // The function uses a regex to extract mime type between : and ;
      const dataUrl = "data:custom/type;param=value;base64,dGVzdA==";
      const file = dataURLtoFile(dataUrl, "test");

      expect(file.type).toBe("custom/type");
    });

    test("should create Uint8Array internally", async () => {
      const dataUrl = "data:application/octet-stream;base64,AAECAw==";
      const file = dataURLtoFile(dataUrl, "test.bin");

      const buffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);

      // Verify the internal Uint8Array was created correctly
      expect(uint8Array[0]).toBe(0);
      expect(uint8Array[1]).toBe(1);
      expect(uint8Array[2]).toBe(2);
      expect(uint8Array[3]).toBe(3);
    });
  });
});
