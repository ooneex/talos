/**
 * Options for PDF to image conversion
 */
export interface PDFOptionsType {
  /**
   * Password for encrypted PDFs
   */
  password?: string;
  /**
   * Scale factor for image quality (default: 3)
   * Use higher values for PDFs with high resolution images
   */
  scale?: number;
}

/**
 * Options for converting PDF pages to images and saving to disk
 */
export interface PDFToImagesOptionsType {
  /**
   * Output directory to save the images
   */
  outputDir: string;
  /**
   * Prefix for the output file names (default: "page")
   */
  prefix?: string;
}

/**
 * Result of converting a PDF page to an image saved to disk
 */
export interface PDFPageImageResultType {
  /**
   * Page number (1-indexed)
   */
  page: number;
  /**
   * Full path to the saved image file
   */
  path: string;
}

/**
 * Result of extracting text content from a PDF page
 */
export interface PDFPageTextResultType {
  /**
   * Page number (1-indexed)
   */
  page: number;
  /**
   * Extracted text content from the page
   */
  text: string;
}

/**
 * Options for splitting a PDF and saving to disk
 */
export interface PDFSplitOptionsType {
  /**
   * Output directory to save the split PDF files
   */
  outputDir: string;
  /**
   * Page ranges to extract (1-indexed)
   * Each range is an array of [start, end] or a single page number
   * Example: [[1, 3], [5], [7, 10]] splits into pages 1-3, page 5, and pages 7-10
   * If not provided, splits into individual pages
   */
  ranges?: (number | [number, number])[];
  /**
   * Prefix for the output file names (default: "page")
   */
  prefix?: string;
}

/**
 * Result of splitting a PDF and saving to disk
 */
export interface PDFSplitResultType {
  /**
   * Page range that was extracted (1-indexed)
   */
  pages: { start: number; end: number };
  /**
   * Full path to the saved PDF file
   */
  path: string;
}

/**
 * Result of removing pages from a PDF
 */
export interface PDFRemovePagesResultType {
  remainingPages: number;
}

/**
 * Options for creating a new PDF document
 */
export interface PDFCreateOptionsType {
  /**
   * Title of the PDF document
   */
  title?: string;
  /**
   * Author of the PDF document
   */
  author?: string;
  /**
   * Subject of the PDF document
   */
  subject?: string;
  /**
   * Keywords for the PDF document
   */
  keywords?: string[];
  /**
   * Producer of the PDF document
   */
  producer?: string;
  /**
   * Creator of the PDF document
   */
  creator?: string;
}

/**
 * Result of creating a new PDF document
 */
export interface PDFCreateResultType {
  /**
   * Number of pages in the document
   */
  pageCount: number;
}

/**
 * Options for adding a page to a PDF document
 */
export interface PDFAddPageOptionsType {
  /**
   * Text content to add to the page
   */
  content?: string;
  /**
   * Font size for the content (default: 12)
   */
  fontSize?: number;
}

/**
 * Result of adding a page to a PDF document
 */
export interface PDFAddPageResultType {
  /**
   * Total number of pages after adding
   */
  pageCount: number;
}

/**
 * Result of getting PDF metadata
 */
export interface PDFMetadataResultType {
  /**
   * Title of the PDF document
   */
  title?: string | undefined;
  /**
   * Author of the PDF document
   */
  author?: string | undefined;
  /**
   * Subject of the PDF document
   */
  subject?: string | undefined;
  /**
   * Keywords for the PDF document
   */
  keywords?: string | undefined;
  /**
   * Producer of the PDF document
   */
  producer?: string | undefined;
  /**
   * Creator of the PDF document
   */
  creator?: string | undefined;
  /**
   * Creation date of the PDF document
   */
  creationDate?: Date | undefined;
  /**
   * Modification date of the PDF document
   */
  modificationDate?: Date | undefined;
  /**
   * Total number of pages in the document
   */
  pageCount: number;
}

/**
 * Options for updating PDF metadata
 */
export interface PDFUpdateMetadataOptionsType {
  /**
   * Title of the PDF document
   */
  title?: string;
  /**
   * Author of the PDF document
   */
  author?: string;
  /**
   * Subject of the PDF document
   */
  subject?: string;
  /**
   * Keywords for the PDF document
   */
  keywords?: string[];
  /**
   * Producer of the PDF document
   */
  producer?: string;
  /**
   * Creator of the PDF document
   */
  creator?: string;
  /**
   * Creation date of the PDF document
   */
  creationDate?: Date;
  /**
   * Modification date of the PDF document
   */
  modificationDate?: Date;
}

/**
 * Options for extracting images from PDF pages
 */
export interface PDFGetImagesOptionsType {
  /**
   * Output directory to save the images
   */
  outputDir: string;
  /**
   * Prefix for the output file names (default: "image")
   */
  prefix?: string;
  /**
   * Page number to extract images from (1-indexed). If not provided, extracts from all pages
   */
  pageNumber?: number;
}

/**
 * Extracted image saved to disk
 */
export interface PDFExtractedImageType {
  /**
   * Page number the image was extracted from (1-indexed)
   */
  page: number;
  /**
   * Full path to the saved image file
   */
  path: string;
  /**
   * Width of the image in pixels
   */
  width: number;
  /**
   * Height of the image in pixels
   */
  height: number;
}

/**
 * Interface for PDF class
 */
export interface IPDF {
  /**
   * Create a new PDF document and save to the source path
   * @param options - Optional content and metadata options for the PDF document
   * @returns Result containing the page count
   */
  create(options?: PDFCreateOptionsType): Promise<PDFCreateResultType>;

  /**
   * Add a page to an existing PDF document
   * @param options - Optional content options for the page
   * @returns Result containing the total page count
   */
  addPage(options?: PDFAddPageOptionsType): Promise<PDFAddPageResultType>;

  /**
   * Get metadata from the PDF document
   * @returns PDF metadata including title, author, dates, and page count
   */
  getMetadata(): Promise<PDFMetadataResultType>;

  /**
   * Update metadata of an existing PDF document
   * @param options - Metadata options to update
   */
  updateMetadata(options: PDFUpdateMetadataOptionsType): Promise<void>;

  /**
   * Get the total number of pages in the PDF
   */
  getPageCount(): Promise<number>;

  /**
   * Convert all pages to images and save to disk
   * @param options - Options including output directory and optional prefix
   * @returns Array of page image results with page numbers and file paths
   */
  pagesToImages(options: PDFToImagesOptionsType): AsyncGenerator<PDFPageImageResultType, void, unknown>;

  /**
   * Convert a specific page to an image and save to disk
   * @param pageNumber - Page number (1-indexed)
   * @param options - Options including output directory and optional prefix
   */
  pageToImage(pageNumber: number, options: PDFToImagesOptionsType): Promise<PDFPageImageResultType>;

  /**
   * Split the PDF into separate documents and save to disk
   * @param options - Split options with output directory, page ranges, and optional prefix
   * @returns Array of split PDF results with page ranges and file paths
   */
  split(options: PDFSplitOptionsType): AsyncGenerator<PDFSplitResultType, void, unknown>;

  /**
   * Remove specified pages from the PDF
   * @param pages - Page numbers to remove (1-indexed). Can be individual numbers or ranges [start, end]
   * @returns Result with remaining page count and PDF buffer
   */
  removePages(pages: (number | [number, number])[]): Promise<PDFRemovePagesResultType>;

  /**
   * Get the text content of a specific page
   * @param pageNumber - Page number (1-indexed)
   * @returns Extracted text content from the page
   */
  getPageContent(pageNumber: number): Promise<string>;

  /**
   * Extract text content from all pages
   * @yields Page text result with page number and text content
   */
  pagesToText(): AsyncGenerator<PDFPageTextResultType, void, unknown>;

  /**
   * Extract text content from a specific page
   * @param pageNumber - Page number (1-indexed)
   * @returns Page text result with page number and text content
   */
  pageToText(pageNumber: number): Promise<PDFPageTextResultType>;

  /**
   * Extract images from PDF pages and save to disk
   * @param options - Options including output directory, optional prefix, and optional page number
   * @returns Result containing total pages and array of extracted images with file paths
   */
  getImages(options: PDFGetImagesOptionsType): AsyncGenerator<PDFExtractedImageType, void, unknown>;
}
