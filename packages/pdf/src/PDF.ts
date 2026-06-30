import path from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { pdf } from "pdf-to-img";
import sharp from "sharp";
import { extractImages, getDocumentProxy } from "unpdf";
import { PDFException } from "./PDFException";
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
} from "./types";

export class PDF implements IPDF {
  private readonly source: string;
  private readonly options: PDFOptionsType;

  /**
   * Create a new PDF instance
   * @param source - Path to PDF file
   * @param options - Options for PDF processing
   */
  constructor(source: string, options: PDFOptionsType = {}) {
    this.source = path.join(...source.split(/[/\\]/));
    this.options = {
      scale: options.scale ?? 3,
      ...(options.password !== undefined && { password: options.password }),
    };
  }

  /**
   * Create a new PDF document and save to the source path
   * @param options - Optional content and metadata options for the PDF document
   * @returns Result containing the page count
   *
   * @example
   * ```typescript
   * // Create a simple empty PDF
   * const pdf = new PDF("/path/to/output.pdf");
   * const result = await pdf.create();
   *
   * // Create a PDF with metadata
   * const pdf = new PDF("/path/to/output.pdf");
   * const result = await pdf.create({
   *   title: "My Document",
   *   author: "John Doe",
   *   subject: "Example PDF",
   *   keywords: ["example", "pdf", "document"],
   *   creator: "My App",
   *   producer: "pdf-lib",
   * });
   * ```
   */
  public async create(options: PDFCreateOptionsType = {}): Promise<PDFCreateResultType> {
    try {
      const pdfDoc = await PDFDocument.create();

      // Set metadata if provided
      if (options.title) {
        pdfDoc.setTitle(options.title);
      }
      if (options.author) {
        pdfDoc.setAuthor(options.author);
      }
      if (options.subject) {
        pdfDoc.setSubject(options.subject);
      }
      if (options.keywords) {
        pdfDoc.setKeywords(options.keywords);
      }
      if (options.producer) {
        pdfDoc.setProducer(options.producer);
      }
      if (options.creator) {
        pdfDoc.setCreator(options.creator);
      }

      const pdfBytes = await pdfDoc.save();

      await Bun.write(this.source, pdfBytes);

      return {
        pageCount: pdfDoc.getPageCount(),
      };
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to create PDF document", "PDF_CREATE_FAILED", {
        source: this.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Add a page to an existing PDF document
   * @param options - Optional content options for the page
   * @returns Result containing the total page count
   *
   * @example
   * ```typescript
   * const pdf = new PDF("/path/to/document.pdf");
   *
   * // Add an empty page
   * await pdf.addPage();
   *
   * // Add a page with content
   * await pdf.addPage({
   *   content: "Hello, World!",
   *   fontSize: 24,
   * });
   * ```
   */
  public async addPage(options: PDFAddPageOptionsType = {}): Promise<PDFAddPageResultType> {
    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();

      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: this.options.password !== undefined,
      });

      const page = pdfDoc.addPage();

      // Add content if provided
      if (options.content) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = options.fontSize ?? 12;
        const margin = 50;
        const lineHeight = fontSize * 1.2;

        const { height } = page.getSize();
        let y = height - margin;

        const lines = options.content.split("\n");

        for (const line of lines) {
          if (y < margin) {
            break;
          }

          page.drawText(line, {
            x: margin,
            y,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });

          y -= lineHeight;
        }
      }

      const pdfBytes = await pdfDoc.save();

      await Bun.write(this.source, pdfBytes);

      return {
        pageCount: pdfDoc.getPageCount(),
      };
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to add page to PDF", "PDF_ADD_PAGE_FAILED", {
        source: this.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get metadata from the PDF document
   * @returns PDF metadata including title, author, dates, and page count
   *
   * @example
   * ```typescript
   * const pdf = new PDF("/path/to/document.pdf");
   * const metadata = await pdf.getMetadata();
   *
   * console.log(metadata.title);
   * console.log(metadata.author);
   * console.log(metadata.pageCount);
   * ```
   */
  public async getMetadata(): Promise<PDFMetadataResultType> {
    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();

      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: this.options.password !== undefined,
        updateMetadata: false,
      });

      return {
        title: pdfDoc.getTitle(),
        author: pdfDoc.getAuthor(),
        subject: pdfDoc.getSubject(),
        keywords: pdfDoc.getKeywords(),
        producer: pdfDoc.getProducer(),
        creator: pdfDoc.getCreator(),
        creationDate: pdfDoc.getCreationDate(),
        modificationDate: pdfDoc.getModificationDate(),
        pageCount: pdfDoc.getPageCount(),
      };
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to get PDF metadata", "PDF_METADATA_GET_FAILED", {
        source: this.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update metadata of an existing PDF document
   * @param options - Metadata options to update
   *
   * @example
   * ```typescript
   * const pdf = new PDF("/path/to/document.pdf");
   * await pdf.updateMetadata({
   *   title: "Updated Title",
   *   author: "New Author",
   *   subject: "Updated Subject",
   *   keywords: ["updated", "keywords"],
   *   producer: "My App",
   *   creator: "pdf-lib",
   *   creationDate: new Date("2020-01-01"),
   *   modificationDate: new Date(),
   * });
   * ```
   */
  public async updateMetadata(options: PDFUpdateMetadataOptionsType): Promise<void> {
    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();

      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: this.options.password !== undefined,
      });

      if (options.title !== undefined) {
        pdfDoc.setTitle(options.title);
      }
      if (options.author !== undefined) {
        pdfDoc.setAuthor(options.author);
      }
      if (options.subject !== undefined) {
        pdfDoc.setSubject(options.subject);
      }
      if (options.keywords !== undefined) {
        pdfDoc.setKeywords(options.keywords);
      }
      if (options.producer !== undefined) {
        pdfDoc.setProducer(options.producer);
      }
      if (options.creator !== undefined) {
        pdfDoc.setCreator(options.creator);
      }
      if (options.creationDate !== undefined) {
        pdfDoc.setCreationDate(options.creationDate);
      }
      if (options.modificationDate !== undefined) {
        pdfDoc.setModificationDate(options.modificationDate);
      }

      const pdfBytes = await pdfDoc.save();

      await Bun.write(this.source, pdfBytes);
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to update PDF metadata", "PDF_METADATA_UPDATE_FAILED", {
        source: this.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the total number of pages in the PDF
   */
  public async getPageCount(): Promise<number> {
    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();
      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: this.options.password !== undefined,
        updateMetadata: false,
      });
      return pdfDoc.getPageCount();
    } catch (error) {
      throw new PDFException("Failed to get page count", "PDF_PAGE_COUNT_FAILED", {
        source: this.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the text content of a specific page
   * @param pageNumber - Page number (1-indexed)
   * @returns Extracted text content from the page
   *
   * @example
   * ```typescript
   * const pdf = new PDF("/path/to/document.pdf");
   *
   * // Get content from page 1
   * const content = await pdf.getPageContent(1);
   * console.log(content); // "Lorem ipsum dolor sit amet..."
   *
   * // Get content from a specific page
   * const page3Content = await pdf.getPageContent(3);
   * console.log(page3Content); // Plain text content
   * ```
   */
  public async getPageContent(pageNumber: number): Promise<string> {
    if (pageNumber < 1 || !Number.isInteger(pageNumber)) {
      throw new PDFException("Page number must be a positive integer", "PDF_INVALID_PAGE_NUMBER", {
        pageNumber,
      });
    }

    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();
      const document = await getDocumentProxy(new Uint8Array(sourceBytes));
      const totalPages = document.numPages;

      if (pageNumber > totalPages) {
        throw new PDFException("Page number exceeds total pages", "PDF_PAGE_OUT_OF_RANGE", {
          pageNumber,
          totalPages,
        });
      }

      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .filter((item) => "str" in item)
        .map((item) => ("hasEOL" in item && item.hasEOL ? `${item.str}\n` : item.str))
        .join("");

      return text.trim();
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to get page content", "PDF_PAGE_CONTENT_FAILED", {
        source: this.source,
        pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Extract text content from all pages
   * @yields Page text result with page number and text content
   *
   * @example
   * ```typescript
   * const pdf = new PDF("/path/to/document.pdf");
   *
   * for await (const { page, text } of pdf.pagesToText()) {
   *   console.log(`Page ${page}: ${text}`);
   * }
   * ```
   */
  public async *pagesToText(): AsyncGenerator<PDFPageTextResultType, void, unknown> {
    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();
      const document = await getDocumentProxy(new Uint8Array(sourceBytes));
      const totalPages = document.numPages;

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .filter((item) => "str" in item)
          .map((item) => ("hasEOL" in item && item.hasEOL ? `${item.str}\n` : item.str))
          .join("");

        yield {
          page: pageNumber,
          text: text.trim(),
        };
      }
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to extract text from PDF", "PDF_PAGES_TO_TEXT_FAILED", {
        source: this.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Extract text content from a specific page
   * @param pageNumber - Page number (1-indexed)
   * @returns Page text result with page number and text content
   *
   * @example
   * ```typescript
   * const pdf = new PDF("/path/to/document.pdf");
   * const { page, text } = await pdf.pageToText(1);
   * console.log(`Page ${page}: ${text}`);
   * ```
   */
  public async pageToText(pageNumber: number): Promise<PDFPageTextResultType> {
    if (pageNumber < 1 || !Number.isInteger(pageNumber)) {
      throw new PDFException("Page number must be a positive integer", "PDF_INVALID_PAGE_NUMBER", {
        pageNumber,
      });
    }

    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();
      const document = await getDocumentProxy(new Uint8Array(sourceBytes));
      const totalPages = document.numPages;

      if (pageNumber > totalPages) {
        throw new PDFException("Page number exceeds total pages", "PDF_PAGE_OUT_OF_RANGE", {
          pageNumber,
          totalPages,
        });
      }

      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .filter((item) => "str" in item)
        .map((item) => ("hasEOL" in item && item.hasEOL ? `${item.str}\n` : item.str))
        .join("");

      return {
        page: pageNumber,
        text: text.trim(),
      };
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to get page text", "PDF_PAGE_TEXT_FAILED", {
        source: this.source,
        pageNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Extract images from PDF pages and save to disk
   * @param options - Options including output directory, optional prefix, and optional page number
   * @yields Extracted image with page number, file path, and dimensions
   *
   * @example
   * ```typescript
   * const pdf = new PDF("/path/to/document.pdf");
   *
   * // Extract images from all pages
   * for await (const image of pdf.getImages({ outputDir: "/output" })) {
   *   console.log(`Image: ${image.path}, ${image.width}x${image.height}`);
   * }
   *
   * // Extract images from a specific page
   * for await (const image of pdf.getImages({ outputDir: "/output", prefix: "doc", pageNumber: 1 })) {
   *   console.log(`Page ${image.page}: ${image.path}`);
   * }
   * ```
   */
  public async *getImages(options: PDFGetImagesOptionsType): AsyncGenerator<PDFExtractedImageType, void, unknown> {
    const { pageNumber } = options;

    if (pageNumber !== undefined && (pageNumber < 1 || !Number.isInteger(pageNumber))) {
      throw new PDFException("Page number must be a positive integer", "PDF_INVALID_PAGE_NUMBER", {
        pageNumber,
      });
    }

    const normalizedOutputDir = path.join(...options.outputDir.split(/[/\\]/));
    const prefix = options.prefix ?? "image";

    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();
      const document = await getDocumentProxy(new Uint8Array(sourceBytes));
      const totalPages = document.numPages;

      if (pageNumber !== undefined && pageNumber > totalPages) {
        throw new PDFException("Page number exceeds total pages", "PDF_PAGE_OUT_OF_RANGE", {
          pageNumber,
          totalPages,
        });
      }

      const startPage = pageNumber ?? 1;
      const endPage = pageNumber ?? totalPages;

      for (let page = startPage; page <= endPage; page++) {
        const pageImages = await extractImages(document, page);
        let imageIndex = 0;
        for (const img of pageImages) {
          imageIndex++;
          const fileName = `${prefix}-p${page}-${imageIndex}.png`;
          const filePath = path.join(normalizedOutputDir, fileName);

          const pngBuffer = await sharp(img.data, {
            raw: {
              width: img.width,
              height: img.height,
              channels: img.channels,
            },
          })
            .png()
            .toBuffer();

          await Bun.write(filePath, pngBuffer);

          yield {
            page,
            path: filePath,
            width: img.width,
            height: img.height,
          };
        }
      }
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to extract images from PDF", "PDF_EXTRACT_IMAGES_FAILED", {
        source: this.source,
        outputDir: normalizedOutputDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Convert all pages to images and save to disk
   * @param options - Options including output directory and optional prefix
   * @returns Array of page image results with page numbers and file paths
   */
  public async *pagesToImages(options: PDFToImagesOptionsType): AsyncGenerator<PDFPageImageResultType, void, unknown> {
    const normalizedOutputDir = path.join(...options.outputDir.split(/[/\\]/));
    const prefix = options.prefix ?? "page";
    const savedWorker = (globalThis as Record<string, unknown>).pdfjsWorker;
    (globalThis as Record<string, unknown>).pdfjsWorker = undefined;

    try {
      const document = await pdf(this.source, this.options);
      let pageNumber = 1;

      for await (const image of document) {
        const fileName = `${prefix}-${pageNumber}.png`;
        const filePath = path.join(normalizedOutputDir, fileName);

        await Bun.write(filePath, Buffer.from(image));

        yield {
          page: pageNumber,
          path: filePath,
        };
        pageNumber++;
      }

      (globalThis as Record<string, unknown>).pdfjsWorker = savedWorker;
    } catch (error) {
      (globalThis as Record<string, unknown>).pdfjsWorker = savedWorker;
      throw new PDFException("Failed to convert PDF to images", "PDF_CONVERT_IMAGES_FAILED", {
        source: this.source,
        outputDir: normalizedOutputDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Convert a specific page to an image and save to disk
   * @param pageNumber - Page number (1-indexed)
   * @param options - Options including output directory and optional prefix
   * @returns Page image result with page number and file path
   */
  public async pageToImage(pageNumber: number, options: PDFToImagesOptionsType): Promise<PDFPageImageResultType> {
    if (pageNumber < 1 || !Number.isInteger(pageNumber)) {
      throw new PDFException("Page number must be a positive integer", "PDF_INVALID_PAGE_NUMBER", {
        pageNumber,
      });
    }

    const normalizedOutputDir = path.join(...options.outputDir.split(/[/\\]/));
    const prefix = options.prefix ?? "page";
    const savedWorker = (globalThis as Record<string, unknown>).pdfjsWorker;
    (globalThis as Record<string, unknown>).pdfjsWorker = undefined;

    try {
      const document = await pdf(this.source, this.options);

      if (pageNumber > document.length) {
        throw new PDFException("Page number exceeds total pages", "PDF_PAGE_OUT_OF_RANGE", {
          pageNumber,
          totalPages: document.length,
        });
      }

      const image = await document.getPage(pageNumber);

      const fileName = `${prefix}-${pageNumber}.png`;
      const filePath = path.join(normalizedOutputDir, fileName);

      await Bun.write(filePath, Buffer.from(image));

      (globalThis as Record<string, unknown>).pdfjsWorker = savedWorker;

      return {
        page: pageNumber,
        path: filePath,
      };
    } catch (error) {
      (globalThis as Record<string, unknown>).pdfjsWorker = savedWorker;
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to get page image", "PDF_PAGE_IMAGE_FAILED", {
        source: this.source,
        pageNumber,
        outputDir: normalizedOutputDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Split the PDF into separate documents and save to disk
   * @param options - Split options with output directory, page ranges, and optional prefix
   * @returns Array of split PDF results with page ranges and file paths
   */
  public async *split(options: PDFSplitOptionsType): AsyncGenerator<PDFSplitResultType, void, unknown> {
    const normalizedOutputDir = path.join(...options.outputDir.split(/[/\\]/));
    const prefix = options.prefix ?? "page";

    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();

      const sourcePdf = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: this.options.password !== undefined,
      });

      const totalPages = sourcePdf.getPageCount();

      if (totalPages === 0) {
        throw new PDFException("PDF has no pages", "PDF_NO_PAGES", {
          source: this.source,
        });
      }

      const ranges = this.normalizeRanges(options.ranges, totalPages);

      // Validate all ranges first
      for (const { start, end } of ranges) {
        if (start < 1 || end > totalPages || start > end) {
          throw new PDFException("Invalid page range", "PDF_INVALID_PAGE_RANGE", {
            start,
            end,
            totalPages,
          });
        }
      }

      for (const { start, end } of ranges) {
        const newPdf = await PDFDocument.create();
        const pageIndices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
        const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);

        for (const page of copiedPages) {
          newPdf.addPage(page);
        }

        const pdfBytes = await newPdf.save();

        const fileName = start === end ? `${prefix}-${start}.pdf` : `${prefix}-${start}-${end}.pdf`;
        const filePath = path.join(normalizedOutputDir, fileName);

        await Bun.write(filePath, pdfBytes);

        yield {
          pages: { start, end },
          path: filePath,
        };
      }
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to split PDF", "PDF_SPLIT_FAILED", {
        source: this.source,
        outputDir: normalizedOutputDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Remove specified pages from the PDF
   * @param pages - Page numbers to remove (1-indexed). Can be individual numbers or ranges [start, end]
   * @returns Result with remaining page count and PDF buffer
   *
   * @example
   * ```typescript
   * const pdf = new PDF("/path/to/document.pdf");
   *
   * // Remove individual pages (pages 2 and 5)
   * const result1 = await pdf.removePages([2, 5]);
   *
   * // Remove a range of pages (pages 3 to 6)
   * const result2 = await pdf.removePages([[3, 6]]);
   *
   * // Remove mixed: individual pages and ranges (pages 1, 4-6, and 10)
   * const result3 = await pdf.removePages([1, [4, 6], 10]);
   *
   * console.log(result3.remainingPages); // Number of pages left
   * console.log(result3.buffer);         // Buffer containing the resulting PDF
   *
   * // Save to file
   * await Bun.write("/path/to/output.pdf", result3.buffer);
   * ```
   */
  public async removePages(pages: (number | [number, number])[]): Promise<PDFRemovePagesResultType> {
    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();

      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: this.options.password !== undefined,
      });

      const totalPages = pdfDoc.getPageCount();

      if (totalPages === 0) {
        throw new PDFException("PDF has no pages", "PDF_NO_PAGES", {
          source: this.source,
        });
      }

      // Normalize page numbers to remove into a flat sorted array
      const pagesToRemove = this.normalizePageNumbers(pages, totalPages);

      if (pagesToRemove.length === 0) {
        throw new PDFException("No valid pages specified for removal", "PDF_NO_VALID_PAGES", {
          pages,
        });
      }

      if (pagesToRemove.length >= totalPages) {
        throw new PDFException("Cannot remove all pages from PDF", "PDF_CANNOT_REMOVE_ALL_PAGES", {
          pagesToRemove,
          totalPages,
        });
      }

      // Remove pages in reverse order to maintain correct indices
      const sortedDescending = [...pagesToRemove].sort((a, b) => b - a);
      for (const pageNum of sortedDescending) {
        pdfDoc.removePage(pageNum - 1); // Convert to 0-indexed
      }

      const pdfBytes = await pdfDoc.save();

      await Bun.write(this.source, pdfBytes);

      return {
        remainingPages: pdfDoc.getPageCount(),
      };
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to remove pages from PDF", "PDF_REMOVE_PAGES_FAILED", {
        source: this.source,
        pages,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Normalize page numbers into a flat array of unique valid page numbers
   */
  private normalizePageNumbers(pages: (number | [number, number])[], totalPages: number): number[] {
    const pageSet = new Set<number>();

    for (const page of pages) {
      if (typeof page === "number") {
        if (page >= 1 && page <= totalPages && Number.isInteger(page)) {
          pageSet.add(page);
        }
      } else {
        const [start, end] = page;
        if (start <= end) {
          for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
            if (Number.isInteger(i)) {
              pageSet.add(i);
            }
          }
        }
      }
    }

    return Array.from(pageSet);
  }

  /**
   * Normalize page ranges for splitting
   * If no ranges provided, creates individual page ranges
   */
  private normalizeRanges(
    ranges: PDFSplitOptionsType["ranges"] | undefined,
    totalPages: number,
  ): { start: number; end: number }[] {
    if (!ranges || ranges.length === 0) {
      return Array.from({ length: totalPages }, (_, i) => ({
        start: i + 1,
        end: i + 1,
      }));
    }

    return ranges.map((range) => {
      if (typeof range === "number") {
        return { start: range, end: range };
      }
      return { start: range[0], end: range[1] };
    });
  }
}
