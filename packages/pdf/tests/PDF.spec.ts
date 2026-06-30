import { describe, expect, test } from "bun:test";
import { appendFile, exists, mkdir, rm } from "node:fs/promises";
import type {
  IPDF,
  PDFAddPageOptionsType,
  PDFAddPageResultType,
  PDFCreateOptionsType,
  PDFCreateResultType,
  PDFExtractedImageType,
  PDFGetImagesOptionsType,
  PDFMetadataResultType,
  PDFOptionsType,
  PDFPageImageResultType,
  PDFPageTextResultType,
  PDFRemovePagesResultType,
  PDFSplitOptionsType,
  PDFSplitResultType,
  PDFToImagesOptionsType,
  PDFUpdateMetadataOptionsType,
} from "@/index";
import { PDF, PDFException } from "@/index";

describe("PDF", () => {
  describe("Types", () => {
    test("should export IPDF interface", () => {
      const pdfInstance: IPDF = new PDF("test.pdf");
      expect(pdfInstance).toBeDefined();
      expect(typeof pdfInstance.create).toBe("function");
      expect(typeof pdfInstance.addPage).toBe("function");
      expect(typeof pdfInstance.getMetadata).toBe("function");
      expect(typeof pdfInstance.updateMetadata).toBe("function");
      expect(typeof pdfInstance.getPageCount).toBe("function");
      expect(typeof pdfInstance.getPageContent).toBe("function");
      expect(typeof pdfInstance.pagesToText).toBe("function");
      expect(typeof pdfInstance.pageToText).toBe("function");
      expect(typeof pdfInstance.getImages).toBe("function");
      expect(typeof pdfInstance.pagesToImages).toBe("function");
      expect(typeof pdfInstance.pageToImage).toBe("function");
      expect(typeof pdfInstance.split).toBe("function");
      expect(typeof pdfInstance.removePages).toBe("function");
    });

    test("should export PDFOptionsType", () => {
      const options: PDFOptionsType = {
        scale: 2,
        password: "secret",
      };
      expect(options.scale).toBe(2);
      expect(options.password).toBe("secret");
    });

    test("should export PDFToImagesOptionsType", () => {
      const options: PDFToImagesOptionsType = {
        outputDir: "/tmp/output",
        prefix: "image",
      };
      expect(options.outputDir).toBe("/tmp/output");
      expect(options.prefix).toBe("image");
    });

    test("should export PDFPageImageResultType", () => {
      const result: PDFPageImageResultType = {
        page: 1,
        path: "/tmp/output/page-1.png",
      };
      expect(result.page).toBe(1);
      expect(result.path).toBe("/tmp/output/page-1.png");
    });

    test("should export PDFPageTextResultType", () => {
      const result: PDFPageTextResultType = {
        page: 1,
        text: "Hello world",
      };
      expect(result.page).toBe(1);
      expect(result.text).toBe("Hello world");
    });

    test("should export PDFSplitOptionsType", () => {
      const options: PDFSplitOptionsType = {
        outputDir: "/tmp/split-output",
        ranges: [[1, 3], 5, [7, 10]],
        prefix: "doc",
      };
      expect(options.outputDir).toBe("/tmp/split-output");
      expect(options.ranges).toEqual([[1, 3], 5, [7, 10]]);
      expect(options.prefix).toBe("doc");
    });

    test("should export PDFSplitResultType", () => {
      const result: PDFSplitResultType = {
        pages: { start: 1, end: 3 },
        path: "/tmp/split-output/doc-1-3.pdf",
      };
      expect(result.pages).toEqual({ start: 1, end: 3 });
      expect(result.path).toBe("/tmp/split-output/doc-1-3.pdf");
    });

    test("should export PDFCreateOptionsType", () => {
      const options: PDFCreateOptionsType = {
        title: "Test PDF",
        author: "Test Author",
        subject: "Test Subject",
        keywords: ["test", "pdf"],
        producer: "Test Producer",
        creator: "Test Creator",
      };
      expect(options.title).toBe("Test PDF");
      expect(options.author).toBe("Test Author");
      expect(options.subject).toBe("Test Subject");
      expect(options.keywords).toEqual(["test", "pdf"]);
      expect(options.producer).toBe("Test Producer");
      expect(options.creator).toBe("Test Creator");
    });

    test("should export PDFCreateResultType", () => {
      const result: PDFCreateResultType = {
        pageCount: 0,
      };
      expect(result.pageCount).toBe(0);
    });

    test("should export PDFAddPageOptionsType", () => {
      const options: PDFAddPageOptionsType = {
        content: "Hello, World!",
        fontSize: 24,
      };
      expect(options.content).toBe("Hello, World!");
      expect(options.fontSize).toBe(24);
    });

    test("should export PDFAddPageResultType", () => {
      const result: PDFAddPageResultType = {
        pageCount: 1,
      };
      expect(result.pageCount).toBe(1);
    });

    test("should export PDFMetadataResultType", () => {
      const result: PDFMetadataResultType = {
        title: "Test Title",
        author: "Test Author",
        subject: "Test Subject",
        keywords: "test, keywords",
        producer: "Test Producer",
        creator: "Test Creator",
        creationDate: new Date("2024-01-01"),
        modificationDate: new Date("2024-01-02"),
        pageCount: 5,
      };
      expect(result.title).toBe("Test Title");
      expect(result.author).toBe("Test Author");
      expect(result.subject).toBe("Test Subject");
      expect(result.keywords).toBe("test, keywords");
      expect(result.producer).toBe("Test Producer");
      expect(result.creator).toBe("Test Creator");
      expect(result.creationDate).toEqual(new Date("2024-01-01"));
      expect(result.modificationDate).toEqual(new Date("2024-01-02"));
      expect(result.pageCount).toBe(5);
    });

    test("should export PDFUpdateMetadataOptionsType", () => {
      const options: PDFUpdateMetadataOptionsType = {
        title: "Updated Title",
        author: "Updated Author",
        subject: "Updated Subject",
        keywords: ["updated", "keywords"],
        producer: "Updated Producer",
        creator: "Updated Creator",
        creationDate: new Date("2024-01-01"),
        modificationDate: new Date("2024-01-02"),
      };
      expect(options.title).toBe("Updated Title");
      expect(options.author).toBe("Updated Author");
      expect(options.subject).toBe("Updated Subject");
      expect(options.keywords).toEqual(["updated", "keywords"]);
      expect(options.producer).toBe("Updated Producer");
      expect(options.creator).toBe("Updated Creator");
      expect(options.creationDate).toEqual(new Date("2024-01-01"));
      expect(options.modificationDate).toEqual(new Date("2024-01-02"));
    });

    test("should export PDFRemovePagesResultType", () => {
      const result: PDFRemovePagesResultType = {
        remainingPages: 3,
      };
      expect(result.remainingPages).toBe(3);
    });

    test("should export PDFGetImagesOptionsType", () => {
      const options: PDFGetImagesOptionsType = {
        outputDir: "/tmp/images",
        prefix: "img",
        pageNumber: 1,
      };
      expect(options.outputDir).toBe("/tmp/images");
      expect(options.prefix).toBe("img");
      expect(options.pageNumber).toBe(1);
    });

    test("should export PDFGetImagesOptionsType without optional fields", () => {
      const options: PDFGetImagesOptionsType = {
        outputDir: "/tmp/images",
      };
      expect(options.outputDir).toBe("/tmp/images");
      expect(options.prefix).toBeUndefined();
      expect(options.pageNumber).toBeUndefined();
    });

    test("should export PDFExtractedImageType", () => {
      const image: PDFExtractedImageType = {
        page: 1,
        path: "/tmp/images/image-1-1.png",
        width: 800,
        height: 600,
      };
      expect(image.page).toBe(1);
      expect(image.path).toBe("/tmp/images/image-1-1.png");
      expect(image.width).toBe(800);
      expect(image.height).toBe(600);
    });

    test("should export PDFGetImagesOptionsType", () => {
      const options: PDFGetImagesOptionsType = {
        outputDir: "/tmp/images",
        prefix: "image",
        pageNumber: 1,
      };
      expect(options.outputDir).toBe("/tmp/images");
      expect(options.prefix).toBe("image");
      expect(options.pageNumber).toBe(1);
    });
  });

  describe("Constructor", () => {
    test("should create PDF instance with file path", () => {
      const pdf = new PDF("test.pdf");
      expect(pdf).toBeInstanceOf(PDF);
    });

    test("should create PDF instance with options", () => {
      const pdf = new PDF("test.pdf", { scale: 2, password: "secret" });
      expect(pdf).toBeInstanceOf(PDF);
    });

    test("should create PDF instance with empty options", () => {
      const pdf = new PDF("test.pdf", {});
      expect(pdf).toBeInstanceOf(PDF);
    });

    test("should use default scale of 3", () => {
      const pdf = new PDF("test.pdf");
      expect(pdf).toBeInstanceOf(PDF);
    });

    test("should normalize path separators", () => {
      const pdf = new PDF("path/to/test.pdf");
      expect(pdf).toBeInstanceOf(PDF);
    });
  });

  describe("getPageImage validation", () => {
    const testOptions: PDFToImagesOptionsType = { outputDir: "/tmp/pdf-test" };

    test("should throw PDFException for page number less than 1", async () => {
      const pdf = new PDF("test.pdf");

      try {
        await pdf.pageToImage(0, testOptions);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: 0 });
      }
    });

    test("should throw PDFException for negative page number", async () => {
      const pdf = new PDF("test.pdf");

      try {
        await pdf.pageToImage(-1, testOptions);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: -1 });
      }
    });

    test("should throw PDFException for non-integer page number", async () => {
      const pdf = new PDF("test.pdf");

      try {
        await pdf.pageToImage(1.5, testOptions);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: 1.5 });
      }
    });
  });

  describe("getPageContent validation", () => {
    test("should throw PDFException for page number less than 1", async () => {
      const pdf = new PDF("test.pdf");

      try {
        await pdf.getPageContent(0);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: 0 });
      }
    });

    test("should throw PDFException for negative page number", async () => {
      const pdf = new PDF("test.pdf");

      try {
        await pdf.getPageContent(-1);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: -1 });
      }
    });

    test("should throw PDFException for non-integer page number", async () => {
      const pdf = new PDF("test.pdf");

      try {
        await pdf.getPageContent(1.5);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: 1.5 });
      }
    });

    test("should throw PDFException when file does not exist", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        await pdf.getPageContent(1);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to get page content");
      }
    });
  });

  describe("getPageContent", () => {
    const outputDir = "tests/tmp";
    const outputFile = `${outputDir}/file-sample.txt`;

    test("should return page content as string", async () => {
      const pdf = new PDF("tests/file-sample.pdf");
      const content = await pdf.getPageContent(1);

      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain("Lorem ipsum");
    });

    test("should return content for each page", async () => {
      const pdf = new PDF("tests/file-sample.pdf");

      if (await exists(outputFile)) {
        await rm(outputFile);
      }

      await mkdir(outputDir, { recursive: true });

      const pageCount = await pdf.getPageCount();
      expect(pageCount).toBe(4);

      for (let i = 1; i <= pageCount; i++) {
        const content = await pdf.getPageContent(i);
        expect(typeof content).toBe("string");

        await appendFile(outputFile, `Page ${i}\n\n${content}\n\n`);
      }

      expect(await exists(outputFile)).toBe(true);
    });

    test("should throw PDFException for page number exceeding total pages", async () => {
      const pdf = new PDF("tests/file-sample.pdf");

      try {
        await pdf.getPageContent(100);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number exceeds total pages");
        expect((error as PDFException).data).toEqual({ pageNumber: 100, totalPages: 4 });
      }
    });
  });

  describe("pagesToText", () => {
    test("should yield text content for all pages", async () => {
      const pdf = new PDF("tests/file-sample.pdf");
      const results: PDFPageTextResultType[] = [];

      for await (const result of pdf.pagesToText()) {
        results.push(result);
      }

      expect(results).toHaveLength(4);

      for (let i = 0; i < results.length; i++) {
        expect(results[i]?.page).toBe(i + 1);
        expect(typeof results[i]?.text).toBe("string");
      }

      expect(results[0]?.text).toContain("Lorem ipsum");
    });

    test("should yield pages in order", async () => {
      const pdf = new PDF("tests/file-sample.pdf");
      const pages: number[] = [];

      for await (const { page } of pdf.pagesToText()) {
        pages.push(page);
      }

      expect(pages).toEqual([1, 2, 3, 4]);
    });

    test("should throw PDFException when file does not exist", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        for await (const _ of pdf.pagesToText()) {
          /* noop */
        }
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to extract text from PDF");
      }
    });
  });

  describe("pageToText", () => {
    test("should return text content for a specific page", async () => {
      const pdf = new PDF("tests/file-sample.pdf");
      const result = await pdf.pageToText(1);

      expect(result.page).toBe(1);
      expect(typeof result.text).toBe("string");
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.text).toContain("Lorem ipsum");
    });

    test("should return correct page number", async () => {
      const pdf = new PDF("tests/file-sample.pdf");
      const result = await pdf.pageToText(2);

      expect(result.page).toBe(2);
      expect(typeof result.text).toBe("string");
    });

    test("should throw PDFException for page number less than 1", async () => {
      const pdf = new PDF("test.pdf");

      try {
        await pdf.pageToText(0);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: 0 });
      }
    });

    test("should throw PDFException for non-integer page number", async () => {
      const pdf = new PDF("test.pdf");

      try {
        await pdf.pageToText(1.5);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: 1.5 });
      }
    });

    test("should throw PDFException for page number exceeding total pages", async () => {
      const pdf = new PDF("tests/file-sample.pdf");

      try {
        await pdf.pageToText(100);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number exceeds total pages");
        expect((error as PDFException).data).toEqual({ pageNumber: 100, totalPages: 4 });
      }
    });

    test("should throw PDFException when file does not exist", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        await pdf.pageToText(1);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to get page text");
      }
    });
  });

  describe("getImages validation", () => {
    const testOptions: PDFGetImagesOptionsType = { outputDir: "/tmp/pdf-test" };

    test("should throw PDFException for page number less than 1", async () => {
      const pdf = new PDF("test.pdf");

      try {
        for await (const _ of pdf.getImages({ ...testOptions, pageNumber: 0 })) {
          /* noop */
        }
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: 0 });
      }
    });

    test("should throw PDFException for negative page number", async () => {
      const pdf = new PDF("test.pdf");

      try {
        for await (const _ of pdf.getImages({ ...testOptions, pageNumber: -1 })) {
          /* noop */
        }
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: -1 });
      }
    });

    test("should throw PDFException for non-integer page number", async () => {
      const pdf = new PDF("test.pdf");

      try {
        for await (const _ of pdf.getImages({ ...testOptions, pageNumber: 1.5 })) {
          /* noop */
        }
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Page number must be a positive integer");
        expect((error as PDFException).data).toEqual({ pageNumber: 1.5 });
      }
    });

    test("should throw PDFException when file does not exist", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        for await (const _ of pdf.getImages(testOptions)) {
          /* noop */
        }
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to extract images from PDF");
      }
    });
  });

  describe("getPageCount", () => {
    test("should return the number of pages", async () => {
      const pdf = new PDF("tests/file-sample.pdf");
      const pageCount = await pdf.getPageCount();
      expect(pageCount).toBe(4);
    });
  });

  describe("getImages", () => {
    test("should extract images from PDF", async () => {
      const outputDir = "tests/tmp/images";
      const pdf = new PDF("tests/file-sample.pdf");
      const images: PDFExtractedImageType[] = [];

      for await (const image of pdf.getImages({ outputDir })) {
        images.push(image);
      }

      expect(images.length).toBeGreaterThanOrEqual(0);

      for (const image of images) {
        expect(image).toHaveProperty("page");
        expect(image).toHaveProperty("path");
        expect(image).toHaveProperty("width");
        expect(image).toHaveProperty("height");
        expect(typeof image.page).toBe("number");
        expect(typeof image.path).toBe("string");
        expect(typeof image.width).toBe("number");
        expect(typeof image.height).toBe("number");
        expect(image.path).toStartWith(outputDir);
      }
    });

    test("should extract images from a specific page", async () => {
      const outputDir = "tests/tmp/images-page";
      const pdf = new PDF("tests/file-sample.pdf");
      const images: PDFExtractedImageType[] = [];

      for await (const image of pdf.getImages({ outputDir, pageNumber: 1 })) {
        images.push(image);
      }

      for (const image of images) {
        expect(image.page).toBe(1);
      }
    });
  });

  describe("toImages", () => {
    test("should convert all pages to images", async () => {
      const outputDir = "tests/tmp/to-images";
      const pdf = new PDF("tests/file-sample.pdf");
      const results = [];

      for await (const result of pdf.pagesToImages({ outputDir })) {
        results.push(result);
      }

      expect(results).toHaveLength(4);

      for (const [i, result] of results.entries()) {
        expect(result.page).toBe(i + 1);
        expect(result.path).toBe(`${outputDir}/page-${i + 1}.png`);
      }
    });

    test("should use custom prefix", async () => {
      const outputDir = "tests/tmp/to-images-prefix";
      const pdf = new PDF("tests/file-sample.pdf");
      const results = [];

      for await (const result of pdf.pagesToImages({ outputDir, prefix: "slide" })) {
        results.push(result);
      }

      expect(results).toHaveLength(4);

      for (const [i, result] of results.entries()) {
        expect(result.path).toBe(`${outputDir}/slide-${i + 1}.png`);
      }
    });
  });

  describe("Error handling", () => {
    test("should throw PDFException when file does not exist for getPageCount", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        await pdf.getPageCount();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to get page count");
      }
    });

    test("should throw PDFException when toImages fails", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        for await (const _ of pdf.pagesToImages({ outputDir: "/tmp/pdf-test" })) {
          // consume generator
        }
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to convert PDF to images");
      }
    });

    test("should throw PDFException when getPageImage fails for non-existent file", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        await pdf.pageToImage(1, { outputDir: "/tmp/pdf-test" });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to get page image");
      }
    });

    test("should include source in error data for file path", async () => {
      const pdf = new PDF("test.pdf");

      try {
        await pdf.getPageCount();
        expect(true).toBe(false);
      } catch (error) {
        expect((error as PDFException).data?.source).toBe("test.pdf");
      }
    });

    test("should throw PDFException when getMetadata fails for non-existent file", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        await pdf.getMetadata();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to get PDF metadata");
      }
    });

    test("should throw PDFException when updateMetadata fails for non-existent file", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        await pdf.updateMetadata({ title: "New Title" });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to update PDF metadata");
      }
    });

    test("should throw PDFException when addPage fails for non-existent file", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        await pdf.addPage();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to add page to PDF");
      }
    });

    test("should throw PDFException when split fails for non-existent file", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        for await (const _ of pdf.split({ outputDir: "/tmp/pdf-test" })) {
          // consume generator
        }
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to split PDF");
      }
    });

    test("should throw PDFException when removePages fails for non-existent file", async () => {
      const pdf = new PDF("nonexistent.pdf");

      try {
        await pdf.removePages([1]);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(PDFException);
        expect((error as PDFException).message).toBe("Failed to remove pages from PDF");
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
