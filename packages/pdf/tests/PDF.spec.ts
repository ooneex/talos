import { describe, expect, spyOn, test } from "bun:test";
import type { IPDF, IPDFExtractOptions, IPDFExtractResult, IPDFPageOcrReasons } from "@/index";
import { PDF, PDFException, PDFType } from "@/index";

describe("PDF", () => {
  describe("Types", () => {
    test("should export IPDF interface", () => {
      const pdfInstance: IPDF = new PDF("test.pdf");
      expect(pdfInstance).toBeDefined();
      expect(typeof pdfInstance.extract).toBe("function");
    });

    test("should export IPDFExtractOptions", () => {
      const options: IPDFExtractOptions = {
        pages: [0, 1],
      };
      expect(options.pages).toEqual([0, 1]);
    });

    test("should export IPDFPageOcrReasons", () => {
      const reasons: IPDFPageOcrReasons = {
        page: 1,
        reasons: ["empty_text"],
      };
      expect(reasons.page).toBe(1);
      expect(reasons.reasons).toEqual(["empty_text"]);
    });

    test("should export IPDFExtractResult", () => {
      const result: IPDFExtractResult = {
        pdfType: PDFType.TextBased,
        markdown: "# Title",
        pageCount: 4,
        processingTimeMs: 12,
        pagesNeedingOcr: [],
        ocrReasonsByPage: [],
        title: "Test PDF",
        confidence: 0.95,
        isComplexLayout: false,
        pagesWithTables: [],
        pagesWithColumns: [],
        hasEncodingIssues: false,
      };
      expect(result.pdfType).toBe(PDFType.TextBased);
      expect(result.pageCount).toBe(4);
    });

    test("should export PDFType", () => {
      expect(PDFType.TextBased).toBe("TextBased");
      expect(PDFType.Scanned).toBe("Scanned");
      expect(PDFType.ImageBased).toBe("ImageBased");
      expect(PDFType.Mixed).toBe("Mixed");
    });
  });

  describe("Constructor", () => {
    test("should create PDF instance with file path", () => {
      const pdf = new PDF("test.pdf");
      expect(pdf).toBeInstanceOf(PDF);
    });

    test("should create PDF instance with a nested file path", () => {
      const pdf = new PDF("path/to/test.pdf");
      expect(pdf).toBeInstanceOf(PDF);
    });
  });

  describe("extract", () => {
    test("should classify a text-based PDF and return markdown", async () => {
      const pdf = new PDF("tests/file-sample.pdf");
      const result = await pdf.extract();

      expect(result.pdfType).toBe(PDFType.TextBased);
      expect(result.pageCount).toBe(4);
      expect(typeof result.markdown).toBe("string");
      expect(result.markdown).toContain("Lorem ipsum");
      expect(result.confidence).toBeGreaterThan(0);
    });

    test("should restrict extraction to the requested 0-indexed pages", async () => {
      const pdf = new PDF("tests/file-sample.pdf");
      const result = await pdf.extract({ pages: [0] });

      expect(result.pageCount).toBe(4);
      expect(typeof result.markdown).toBe("string");
    });

    test("should throw PDFException when file does not exist", async () => {
      const pdf = new PDF("nonexistent.pdf");

      await expect(pdf.extract()).rejects.toThrow(PDFException);
      await expect(pdf.extract()).rejects.toThrow("Failed to extract PDF content");
    });

    test("should include source in error data when extraction fails", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        await pdf.extract();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).data?.source).toBe("nonexistent.pdf");
      }
    });

    test("should wrap unexpected read errors", async () => {
      const readSpy = spyOn(Bun, "file").mockImplementation(() => {
        throw new Error("read failure");
      });

      try {
        const pdf = new PDF("tests/file-sample.pdf");

        await expect(pdf.extract()).rejects.toThrow(PDFException);
      } finally {
        readSpy.mockRestore();
      }
    });
  });
});

describe("PDFException", () => {
  describe("Constructor", () => {
    test("should create PDFException with message", () => {
      const exception = new PDFException("Test error", "TEST_ERROR");

      expect(exception).toBeInstanceOf(PDFException);
      expect(exception.message).toBe("Test error");
      expect(exception.name).toBe("PDFException");
      expect(exception.status).toBe(500);
      expect(exception.data).toEqual({});
    });

    test("should create PDFException with message and data", () => {
      const data = { pageNumber: 1, totalPages: 10 };
      const exception = new PDFException("Page not found", "PAGE_NOT_FOUND", data);

      expect(exception.message).toBe("Page not found");
      expect(exception.data).toEqual(data);
    });

    test("should have immutable data property", () => {
      const data = { key: "value" };
      const exception = new PDFException("Test", "TEST_KEY", data);

      expect(Object.isFrozen(exception.data)).toBe(true);
      expect(() => {
        exception.data.key = "modified";
      }).toThrow();
    });

    test("should have correct HTTP status code", () => {
      const exception = new PDFException("Internal error", "INTERNAL_ERROR");

      expect(exception.status).toBe(500);
    });

    test("should have date property", () => {
      const beforeDate = Date.now();
      const exception = new PDFException("Test", "TEST_KEY");
      const afterDate = Date.now();

      expect(exception.date).toBeInstanceOf(Date);
      expect(exception.date.getTime()).toBeGreaterThanOrEqual(beforeDate);
      expect(exception.date.getTime()).toBeLessThanOrEqual(afterDate);
    });

    test("should have stack trace", () => {
      const exception = new PDFException("Test", "TEST_KEY");

      expect(exception.stack).toBeDefined();
      expect(typeof exception.stack).toBe("string");
    });

    test("should support stackToJson method", () => {
      const exception = new PDFException("JSON stack test", "JSON_STACK_TEST");
      const stackJson = exception.stackToJson();

      expect(stackJson).toBeDefined();
      if (stackJson) {
        expect(Array.isArray(stackJson)).toBe(true);
        expect(stackJson.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Inheritance", () => {
    test("should inherit from Error", () => {
      const exception = new PDFException("Test", "TEST_KEY");

      expect(exception).toBeInstanceOf(Error);
    });

    test("should be catchable as Error", () => {
      try {
        throw new PDFException("Test error", "TEST_ERROR");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(PDFException);
      }
    });
  });

  describe("Serialization", () => {
    test("should be JSON serializable", () => {
      const exception = new PDFException("Serialization test", "SERIALIZATION_TEST", {
        source: "test.pdf",
        pageNumber: 5,
      });

      const serialized = JSON.stringify({
        message: exception.message,
        name: exception.name,
        status: exception.status,
        data: exception.data,
        date: exception.date,
      });
      const parsed = JSON.parse(serialized);

      expect(parsed.message).toBe("Serialization test");
      expect(parsed.name).toBe("PDFException");
      expect(parsed.status).toBe(500);
      expect(parsed.data.source).toBe("test.pdf");
      expect(parsed.data.pageNumber).toBe(5);
    });

    test("should have correct toString representation", () => {
      const exception = new PDFException("ToString test", "TO_STRING_TEST");
      const stringRep = exception.toString();

      expect(stringRep).toContain("PDFException");
      expect(stringRep).toContain("ToString test");
    });
  });
});
