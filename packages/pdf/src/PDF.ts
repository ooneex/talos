import { processPdf } from "@firecrawl/pdf-inspector";
import { PDFException } from "./PDFException";
import type { IPDF, PDFExtractOptionsType, PDFExtractResultType, PDFType } from "./types";

export class PDF implements IPDF {
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  public async extract(options: PDFExtractOptionsType = {}): Promise<PDFExtractResultType> {
    try {
      const buffer = Buffer.from(await Bun.file(this.source).arrayBuffer());
      const result = processPdf(buffer, options.pages);
      return {
        pdfType: result.pdfType as PDFType,
        pageCount: result.pageCount,
        processingTimeMs: result.processingTimeMs,
        pagesNeedingOcr: result.pagesNeedingOcr,
        ocrReasonsByPage: result.ocrReasonsByPage,
        confidence: result.confidence,
        isComplexLayout: result.isComplexLayout,
        pagesWithTables: result.pagesWithTables,
        pagesWithColumns: result.pagesWithColumns,
        hasEncodingIssues: result.hasEncodingIssues,
        ...(result.markdown !== undefined && { markdown: result.markdown }),
        ...(result.title !== undefined && { title: result.title }),
      };
    } catch (error) {
      if (error instanceof PDFException) {
        throw error;
      }
      throw new PDFException("Failed to extract PDF content", "PDF_EXTRACT_FAILED", {
        source: this.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
