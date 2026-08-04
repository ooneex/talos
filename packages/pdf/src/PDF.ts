import path from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { extractImages, getDocumentProxy } from "unpdf";
import {
  buildPageImageResult,
  convertPdfToImages,
  getPageText,
  normalizePageNumbers,
  normalizeRanges,
  splitPdfRange,
} from "./internal";
import { PDFException } from "./PDFException";
import type {
  IPDF,
  IPDFAddPageOptions,
  IPDFAddPageResult,
  IPDFCreateOptions,
  IPDFCreateResult,
  IPDFExtractedImage,
  IPDFGetImagesOptions,
  IPDFMetadataResult,
  IPDFOptions,
  IPDFPageImageResult,
  IPDFPageTextResult,
  IPDFRemovePagesResult,
  IPDFSplitOptions,
  IPDFSplitResult,
  IPDFToImagesOptions,
  IPDFUpdateMetadataOptions,
} from "./types";
export class PDF implements IPDF {
  private readonly source: string;
  private readonly options: IPDFOptions;
  constructor(source: string, options: IPDFOptions = {}) {
    this.source = source.replace(/[/\\]/g, path.sep);
    this.options = {
      scale: options.scale ?? 3,
      ...(options.password !== undefined && { password: options.password }),
    };
  }
  public async create(options: IPDFCreateOptions = {}): Promise<IPDFCreateResult> {
    try {
      const pdfDoc = await PDFDocument.create();
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
  public async addPage(options: IPDFAddPageOptions = {}): Promise<IPDFAddPageResult> {
    try {
      const sourceBytes = await Bun.file(this.source).arrayBuffer();
      const pdfDoc = await PDFDocument.load(sourceBytes, {
        ignoreEncryption: this.options.password !== undefined,
      });
      const page = pdfDoc.addPage();
      if (options.content) {
        await this.drawPageContent(pdfDoc, page, options);
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
  public async getMetadata(): Promise<IPDFMetadataResult> {
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
  public async updateMetadata(options: IPDFUpdateMetadataOptions): Promise<void> {
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
  public async getPageContent(pageNumber: number): Promise<string> {
    if (pageNumber < 1 || !Number.isInteger(pageNumber)) {
      throw new PDFException("Page number must be a positive integer", "PDF_INVALID_PAGE_NUMBER", {
        pageNumber,
      });
    }
    try {
      const { text, totalPages } = await getPageText(this.source, pageNumber);
      if (pageNumber > totalPages) {
        throw new PDFException("Page number exceeds total pages", "PDF_PAGE_OUT_OF_RANGE", {
          pageNumber,
          totalPages,
        });
      }
      return text;
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
  public async *pagesToText(): AsyncGenerator<IPDFPageTextResult, void, unknown> {
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
  public async pageToText(pageNumber: number): Promise<IPDFPageTextResult> {
    if (pageNumber < 1 || !Number.isInteger(pageNumber)) {
      throw new PDFException("Page number must be a positive integer", "PDF_INVALID_PAGE_NUMBER", {
        pageNumber,
      });
    }
    try {
      const { text, totalPages } = await getPageText(this.source, pageNumber);
      if (pageNumber > totalPages) {
        throw new PDFException("Page number exceeds total pages", "PDF_PAGE_OUT_OF_RANGE", {
          pageNumber,
          totalPages,
        });
      }
      return {
        page: pageNumber,
        text,
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
  public async *getImages(options: IPDFGetImagesOptions): AsyncGenerator<IPDFExtractedImage, void, unknown> {
    const { pageNumber } = options;
    if (pageNumber !== undefined && (pageNumber < 1 || !Number.isInteger(pageNumber))) {
      throw new PDFException("Page number must be a positive integer", "PDF_INVALID_PAGE_NUMBER", {
        pageNumber,
      });
    }
    const normalizedOutputDir = options.outputDir.replace(/[/\\]/g, path.sep);
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
        yield* this.extractPageImages(document, page, normalizedOutputDir, prefix);
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
  public async *pagesToImages(options: IPDFToImagesOptions): AsyncGenerator<IPDFPageImageResult, void, unknown> {
    const normalizedOutputDir = options.outputDir.replace(/[/\\]/g, path.sep);
    const prefix = options.prefix ?? "page";
    try {
      const document = await convertPdfToImages(this.source, this.options);
      let pageNumber = 1;
      for await (const image of document) {
        yield await buildPageImageResult(image, normalizedOutputDir, prefix, pageNumber);
        pageNumber++;
      }
    } catch (error) {
      throw new PDFException("Failed to convert PDF to images", "PDF_CONVERT_IMAGES_FAILED", {
        source: this.source,
        outputDir: normalizedOutputDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  public async pageToImage(pageNumber: number, options: IPDFToImagesOptions): Promise<IPDFPageImageResult> {
    if (pageNumber < 1 || !Number.isInteger(pageNumber)) {
      throw new PDFException("Page number must be a positive integer", "PDF_INVALID_PAGE_NUMBER", {
        pageNumber,
      });
    }
    const normalizedOutputDir = options.outputDir.replace(/[/\\]/g, path.sep);
    const prefix = options.prefix ?? "page";
    try {
      const document = await convertPdfToImages(this.source, this.options);
      if (pageNumber > document.length) {
        throw new PDFException("Page number exceeds total pages", "PDF_PAGE_OUT_OF_RANGE", {
          pageNumber,
          totalPages: document.length,
        });
      }
      const image = await document.getPage(pageNumber);
      return await buildPageImageResult(image, normalizedOutputDir, prefix, pageNumber);
    } catch (error) {
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
  public async *split(options: IPDFSplitOptions): AsyncGenerator<IPDFSplitResult, void, unknown> {
    const normalizedOutputDir = options.outputDir.replace(/[/\\]/g, path.sep);
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
      const ranges = normalizeRanges(options.ranges, totalPages);
      this.validateRanges(ranges, totalPages);
      for (const { start, end } of ranges) {
        yield await splitPdfRange(sourcePdf, normalizedOutputDir, prefix, start, end);
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
  public async removePages(pages: (number | [number, number])[]): Promise<IPDFRemovePagesResult> {
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
      const pagesToRemove = normalizePageNumbers(pages, totalPages);
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
  private async *extractPageImages(
    document: Awaited<ReturnType<typeof getDocumentProxy>>,
    page: number,
    outputDir: string,
    prefix: string,
  ): AsyncGenerator<IPDFExtractedImage, void, unknown> {
    const pageImages = await extractImages(document, page);
    let imageIndex = 0;
    for (const image of pageImages) {
      imageIndex++;
      const fileName = `${prefix}-p${page}-${imageIndex}.png`;
      const filePath = path.join(outputDir, fileName);
      const pngBuffer = await sharp(image.data, {
        raw: {
          width: image.width,
          height: image.height,
          channels: image.channels,
        },
      })
        .png()
        .toBuffer();
      await Bun.write(filePath, pngBuffer);
      yield {
        page,
        path: filePath,
        width: image.width,
        height: image.height,
      };
    }
  }
  private async drawPageContent(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument["addPage"]>,
    options: IPDFAddPageOptions,
  ): Promise<void> {
    if (!options.content) {
      return;
    }
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = options.fontSize ?? 12;
    const margin = 50;
    const lineHeight = fontSize * 1.2;
    const { height } = page.getSize();
    let y = height - margin;
    for (const line of options.content.split("\n")) {
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
  private validateRanges(ranges: Array<{ start: number; end: number }>, totalPages: number): void {
    for (const { start, end } of ranges) {
      if (start >= 1 && end <= totalPages && start <= end) {
        continue;
      }
      throw new PDFException("Invalid page range", "PDF_INVALID_PAGE_RANGE", {
        start,
        end,
        totalPages,
      });
    }
  }
}
