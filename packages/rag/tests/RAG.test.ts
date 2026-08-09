import { describe, expect, test } from "bun:test";
import { PDFException, PDFType } from "@talosjs/pdf";
import OpenAI from "openai";
import { RAG, RAGException } from "@/index";

describe("RAG", () => {
  describe("Constructor", () => {
    test("should create RAG instance with file path", () => {
      const rag = new RAG("tests/file-sample.pdf");
      expect(rag).toBeInstanceOf(RAG);
    });
  });

  describe("extract", () => {
    test("should extract a text-based PDF and return markdown", async () => {
      const rag = new RAG("tests/file-sample.pdf");
      const result = await rag.extract();

      expect(result.pdfType).toBe(PDFType.TextBased);
      expect(result.pageCount).toBeGreaterThan(0);
      expect(typeof result.markdown).toBe("string");
      expect(result.markdown?.length).toBeGreaterThan(0);
    });

    test("should throw RAGException when restricting pages leaves others needing OCR and no api key is set", async () => {
      const rag = new RAG("tests/file-sample.pdf");

      await expect(rag.extract({ pages: [0] })).rejects.toThrow(RAGException);
    });

    test("should throw PDFException when file does not exist", async () => {
      const rag = new RAG("tests/non-existent.pdf");

      await expect(rag.extract()).rejects.toThrow(PDFException);
    });
  });

  describe("renderPages", () => {
    test("should render the PDF's pages as images", async () => {
      const rag = new RAG("tests/file-sample.pdf");

      // biome-ignore lint/suspicious/noExplicitAny: exercises the protected renderPages directly
      const doc = await (rag as any).renderPages();
      try {
        expect(doc.length).toBeGreaterThan(0);
      } finally {
        await doc.destroy();
      }
    });
  });

  describe("createClient", () => {
    test("should build an OpenAI client scoped to the OpenRouter API", () => {
      const rag = new RAG("tests/file-sample.pdf", { apiKey: "sk-test" });

      // biome-ignore lint/suspicious/noExplicitAny: exercises the protected createClient directly
      const client = (rag as any).createClient("sk-test");
      expect(client).toBeInstanceOf(OpenAI);
    });
  });
});
