import { AppEnv } from "@talosjs/app-env";
import type { PDFExtractOptionsType, PDFExtractResultType } from "@talosjs/pdf";
import { PDF } from "@talosjs/pdf";
import OpenAI from "openai";
import type { Pdf as PdfImageDocument } from "pdf-to-img";
import { pdf as renderPdfPages } from "pdf-to-img";
import { RAGException } from "./RAGException";
import type { IRAG, RAGExtractResultType, RAGOcrPageType, RAGOptionsType } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OCR_MODEL = "qwen/qwen3-vl-235b-a22b-instruct";
const OCR_PROMPT =
  "Transcribe this PDF page image to clean Markdown. Preserve headings, lists, and tables. Return only the Markdown content, with no commentary.";

export class RAG implements IRAG {
  private readonly source: string;
  private readonly pdf: PDF;
  private readonly apiKey: string | undefined;
  private client: OpenAI | undefined;

  public constructor(source: string, options: RAGOptionsType = {}, env: AppEnv = new AppEnv()) {
    this.source = source;
    this.pdf = new PDF(source);
    this.apiKey = options.apiKey ?? env.OPENROUTER_API_KEY;
  }

  public async extract(options?: PDFExtractOptionsType): Promise<RAGExtractResultType> {
    const result = await this.extractPdf(options);
    if (result.pagesNeedingOcr.length === 0) {
      return { ...result, ocrPages: [] };
    }

    const ocrPages = await this.ocrPages(result.pagesNeedingOcr);
    return { ...result, markdown: this.mergeMarkdown(result.markdown, ocrPages), ocrPages };
  }

  protected extractPdf(options?: PDFExtractOptionsType): Promise<PDFExtractResultType> {
    return this.pdf.extract(options);
  }

  protected renderPages(): Promise<PdfImageDocument> {
    return renderPdfPages(this.source, { scale: 2 });
  }

  protected createClient(apiKey: string): OpenAI {
    return new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
  }

  private async ocrPages(pages: number[]): Promise<RAGOcrPageType[]> {
    const client = this.getClient();

    try {
      const doc = await this.renderPages();
      try {
        const ocrPages = await Promise.all(
          pages.map(async (page) => {
            const image = await doc.getPage(page);
            return { page, markdown: await this.transcribe(client, image) };
          }),
        );
        return ocrPages.sort((a, b) => a.page - b.page);
      } finally {
        await doc.destroy();
      }
    } catch (error) {
      if (error instanceof RAGException) {
        throw error;
      }
      throw new RAGException("Failed to OCR scanned PDF pages", "OCR_FAILED", {
        source: this.source,
        pages,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async transcribe(client: OpenAI, image: Buffer): Promise<string> {
    const response = await client.chat.completions.create({
      model: OCR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}` } },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new RAGException("OpenRouter returned no OCR content for page", "OCR_EMPTY_RESPONSE", {
        source: this.source,
      });
    }

    return content;
  }

  private mergeMarkdown(markdown: string | undefined, ocrPages: RAGOcrPageType[]): string {
    const sections = ocrPages.map((ocrPage) => `<!-- page ${ocrPage.page} -->\n${ocrPage.markdown}`);

    return [markdown, ...sections].filter((section): section is string => Boolean(section)).join("\n\n");
  }

  private getClient(): OpenAI {
    if (!this.apiKey) {
      throw new RAGException("OpenRouter API key is required to OCR scanned pages", "MISSING_API_KEY", {
        source: this.source,
      });
    }

    this.client ??= this.createClient(this.apiKey);
    return this.client;
  }
}
