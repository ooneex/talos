import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PDFExtractOptionsType, PDFExtractResultType } from "@talosjs/pdf";
import type OpenAI from "openai";
import type { Pdf as PdfImageDocument } from "pdf-to-img";
import { RAG, RAGException } from "@/index";

const baseExtractResult: PDFExtractResultType = {
  pdfType: "Mixed" as PDFExtractResultType["pdfType"],
  pageCount: 3,
  processingTimeMs: 10,
  pagesNeedingOcr: [],
  ocrReasonsByPage: [],
  confidence: 0.5,
  isComplexLayout: false,
  pagesWithTables: [],
  pagesWithColumns: [],
  hasEncodingIssues: false,
  markdown: "# Page 1\n\nSome text",
};

const getPage = mock((page: number) => Promise.resolve(Buffer.from(`page-${page}`)));
const destroy = mock(() => Promise.resolve());
const chatCreate = mock(() =>
  Promise.resolve({ choices: [{ message: { content: "# OCR'd content" as string | null } }] }),
);
const createClient = mock((apiKey: string) => ({ apiKey, chat: { completions: { create: chatCreate } } }));

class TestRAG extends RAG {
  public extractPdfResult: PDFExtractResultType = { ...baseExtractResult };

  protected override extractPdf(_options?: PDFExtractOptionsType): Promise<PDFExtractResultType> {
    return Promise.resolve(this.extractPdfResult);
  }

  protected override renderPages(): Promise<PdfImageDocument> {
    return Promise.resolve({ getPage, destroy } as unknown as PdfImageDocument);
  }

  protected override createClient(apiKey: string): OpenAI {
    return createClient(apiKey) as unknown as OpenAI;
  }
}

describe("RAG OCR", () => {
  beforeEach(() => {
    getPage.mockClear();
    destroy.mockClear();
    createClient.mockClear();
    chatCreate.mockClear();
    chatCreate.mockImplementation(() => Promise.resolve({ choices: [{ message: { content: "# OCR'd content" } }] }));
    delete process.env.OPENROUTER_API_KEY;
  });

  test("should skip OCR when no pages need it", async () => {
    const rag = new TestRAG("tests/file-sample.pdf", { apiKey: "test-key" });
    const result = await rag.extract();

    expect(result.ocrPages).toEqual([]);
    expect(result.markdown).toBe(baseExtractResult.markdown);
    expect(createClient).not.toHaveBeenCalled();
  });

  test("should throw RAGException when no API key is available and OCR is needed", async () => {
    const rag = new TestRAG("tests/file-sample.pdf");
    rag.extractPdfResult = { ...baseExtractResult, pagesNeedingOcr: [2] };

    await expect(rag.extract()).rejects.toThrow(RAGException);
    await expect(rag.extract()).rejects.toThrow("OpenRouter API key is required to OCR scanned pages");
  });

  test("should read the api key from OPENROUTER_API_KEY when not passed explicitly", async () => {
    process.env.OPENROUTER_API_KEY = "env-key";

    const rag = new TestRAG("tests/file-sample.pdf");
    rag.extractPdfResult = { ...baseExtractResult, pagesNeedingOcr: [2] };
    await rag.extract();

    expect(createClient).toHaveBeenCalledWith("env-key");
  });

  test("should OCR pages needing it and merge the result into the markdown", async () => {
    const rag = new TestRAG("tests/file-sample.pdf", { apiKey: "test-key" });
    rag.extractPdfResult = { ...baseExtractResult, pagesNeedingOcr: [2] };
    const result = await rag.extract();

    expect(result.ocrPages).toEqual([{ page: 2, markdown: "# OCR'd content" }]);
    expect(result.markdown).toBe("# Page 1\n\nSome text\n\n<!-- page 2 -->\n# OCR'd content");
    expect(getPage).toHaveBeenCalledWith(2);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test("should send the page image as a base64 PNG data URI to the vision model", async () => {
    const rag = new TestRAG("tests/file-sample.pdf", { apiKey: "test-key" });
    rag.extractPdfResult = { ...baseExtractResult, pagesNeedingOcr: [2] };
    await rag.extract();

    const expectedImage = `data:image/png;base64,${Buffer.from("page-2").toString("base64")}`;
    expect(chatCreate).toHaveBeenCalledWith({
      model: "qwen/qwen3-vl-235b-a22b-instruct",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe this PDF page image to clean Markdown. Preserve headings, lists, and tables. Return only the Markdown content, with no commentary.",
            },
            { type: "image_url", image_url: { url: expectedImage } },
          ],
        },
      ],
    });
  });

  test("should OCR multiple pages in ascending order regardless of extraction order", async () => {
    const rag = new TestRAG("tests/file-sample.pdf", { apiKey: "test-key" });
    rag.extractPdfResult = { ...baseExtractResult, pagesNeedingOcr: [3, 1] };
    chatCreate
      .mockImplementationOnce(() => Promise.resolve({ choices: [{ message: { content: "# Page three" } }] }))
      .mockImplementationOnce(() => Promise.resolve({ choices: [{ message: { content: "# Page one" } }] }));

    const result = await rag.extract();

    expect(result.ocrPages).toEqual([
      { page: 1, markdown: "# Page one" },
      { page: 3, markdown: "# Page three" },
    ]);
    expect(result.markdown).toBe(
      "# Page 1\n\nSome text\n\n<!-- page 1 -->\n# Page one\n\n<!-- page 3 -->\n# Page three",
    );
  });

  test("should throw RAGException when OpenRouter returns no OCR content", async () => {
    chatCreate.mockImplementation(() => Promise.resolve({ choices: [{ message: { content: null } }] }));

    const rag = new TestRAG("tests/file-sample.pdf", { apiKey: "test-key" });
    rag.extractPdfResult = { ...baseExtractResult, pagesNeedingOcr: [2] };

    await expect(rag.extract()).rejects.toThrow(RAGException);
    await expect(rag.extract()).rejects.toThrow("OpenRouter returned no OCR content for page");
  });

  test("should wrap unexpected rendering errors in RAGException and report the source", async () => {
    class FailingRenderRAG extends TestRAG {
      protected override renderPages(): Promise<PdfImageDocument> {
        throw new Error("render failure");
      }
    }

    const rag = new FailingRenderRAG("tests/file-sample.pdf", { apiKey: "test-key" });
    rag.extractPdfResult = { ...baseExtractResult, pagesNeedingOcr: [2] };

    try {
      await rag.extract();
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(RAGException);
      expect((error as InstanceType<typeof RAGException>).data?.source).toBe("tests/file-sample.pdf");
    }
  });

  test("should destroy the rendered document even when OCR fails midway", async () => {
    chatCreate.mockImplementationOnce(() => Promise.reject(new Error("network error")));

    const rag = new TestRAG("tests/file-sample.pdf", { apiKey: "test-key" });
    rag.extractPdfResult = { ...baseExtractResult, pagesNeedingOcr: [2] };

    await expect(rag.extract()).rejects.toThrow(RAGException);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
