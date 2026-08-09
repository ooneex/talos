/**
 * PDF document type classification
 */
export const PDFType = {
  TextBased: "TextBased",
  Scanned: "Scanned",
  ImageBased: "ImageBased",
  Mixed: "Mixed",
} as const;

export type PDFType = (typeof PDFType)[keyof typeof PDFType];

/**
 * OCR reasons for a single 1-indexed page
 */
export interface IPDFPageOcrReasons {
  /**
   * 1-indexed page number
   */
  page: number;
  /**
   * Machine-readable OCR reasons for this page
   */
  reasons: string[];
}

/**
 * Options for extracting content from a PDF
 */
export interface IPDFExtractOptions {
  /**
   * 0-indexed page numbers to extract, in caller-supplied order.
   * If not provided, extracts every page in document order
   */
  pages?: number[];
}

/**
 * Result of extracting content from a PDF
 */
export interface IPDFExtractResult {
  /**
   * Detected PDF document type
   */
  pdfType: PDFType;
  /**
   * Extracted markdown content, if any
   */
  markdown?: string;
  /**
   * Total number of pages in the document
   */
  pageCount: number;
  /**
   * Time taken to process the document, in milliseconds
   */
  processingTimeMs: number;
  /**
   * 1-indexed page numbers that need OCR
   */
  pagesNeedingOcr: number[];
  /**
   * Machine-readable OCR reasons by 1-indexed page
   */
  ocrReasonsByPage: IPDFPageOcrReasons[];
  /**
   * Title of the PDF document, if available
   */
  title?: string;
  /**
   * Confidence score of the classification (0.0-1.0)
   */
  confidence: number;
  /**
   * Whether the document has a complex layout (tables or columns)
   */
  isComplexLayout: boolean;
  /**
   * 1-indexed pages where tables were detected
   */
  pagesWithTables: number[];
  /**
   * 1-indexed pages where multi-column layout was detected
   */
  pagesWithColumns: number[];
  /**
   * Whether the document has font encoding issues
   */
  hasEncodingIssues: boolean;
}

/**
 * Interface for PDF class
 */
export interface IPDF {
  /**
   * Detect the PDF document type, extract its text, and convert it to Markdown
   * @param options - Optional extraction options
   * @returns Extraction result including markdown, classification, and OCR routing metadata
   */
  extract(options?: IPDFExtractOptions): Promise<IPDFExtractResult>;
}
