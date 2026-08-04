import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { pdf } from "pdf-to-img";
import { getDocumentProxy } from "unpdf";
import type { IPDFPageImageResult, IPDFSplitOptions } from "./types";

export const getPageText = async (
  source: string,
  pageNumber: number,
): Promise<{ text: string; totalPages: number }> => {
  const sourceBytes = await Bun.file(source).arrayBuffer();
  const document = await getDocumentProxy(new Uint8Array(sourceBytes));
  const totalPages = document.numPages;

  if (pageNumber > totalPages) {
    return { text: "", totalPages };
  }

  const page = await document.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const text = textContent.items
    .filter((item) => "str" in item)
    .map((item) => ("hasEOL" in item && item.hasEOL ? `${item.str}\n` : item.str))
    .join("");

  return { text: text.trim(), totalPages };
};

export const withPdfWorkerDisabled = async <T>(callback: () => Promise<T>): Promise<T> => {
  const savedWorker = (globalThis as Record<string, unknown>).pdfjsWorker;
  (globalThis as Record<string, unknown>).pdfjsWorker = undefined;

  try {
    return await callback();
  } finally {
    (globalThis as Record<string, unknown>).pdfjsWorker = savedWorker;
  }
};

export const convertPdfToImages = async (
  source: string,
  pdfOptions: { scale?: number; password?: string },
): Promise<Awaited<ReturnType<typeof pdf>>> => {
  return await withPdfWorkerDisabled(async () => pdf(source, pdfOptions));
};

export const buildPageImageResult = async (
  image: Uint8Array | Buffer | ArrayBuffer,
  outputDir: string,
  prefix: string,
  pageNumber: number,
): Promise<IPDFPageImageResult> => {
  const fileName = `${prefix}-${pageNumber}.png`;
  const filePath = path.join(outputDir, fileName);

  await Bun.write(filePath, image);

  return {
    page: pageNumber,
    path: filePath,
  };
};

export const normalizePageNumbers = (pages: (number | [number, number])[], totalPages: number): number[] => {
  const pageSet = new Set<number>();

  for (const page of pages) {
    if (typeof page === "number") {
      if (page >= 1 && page <= totalPages && Number.isInteger(page)) {
        pageSet.add(page);
      }
      continue;
    }

    const [start, end] = page;
    if (start > end) {
      continue;
    }

    for (let current = Math.max(1, start); current <= Math.min(totalPages, end); current++) {
      if (Number.isInteger(current)) {
        pageSet.add(current);
      }
    }
  }

  return Array.from(pageSet);
};

export const normalizeRanges = (
  ranges: IPDFSplitOptions["ranges"] | undefined,
  totalPages: number,
): Array<{ start: number; end: number }> => {
  if (!ranges || ranges.length === 0) {
    return Array.from({ length: totalPages }, (_, index) => ({
      start: index + 1,
      end: index + 1,
    }));
  }

  return ranges.map((range) =>
    typeof range === "number" ? { start: range, end: range } : { start: range[0], end: range[1] },
  );
};

export const splitPdfRange = async (
  sourcePdf: PDFDocument,
  outputDir: string,
  prefix: string,
  start: number,
  end: number,
): Promise<{ pages: { start: number; end: number }; path: string }> => {
  const newPdf = await PDFDocument.create();
  const pageIndices = Array.from({ length: end - start + 1 }, (_, index) => start - 1 + index);
  const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);

  for (const page of copiedPages) {
    newPdf.addPage(page);
  }

  const pdfBytes = await newPdf.save();
  const fileName = start === end ? `${prefix}-${start}.pdf` : `${prefix}-${start}-${end}.pdf`;
  const filePath = path.join(outputDir, fileName);

  await Bun.write(filePath, pdfBytes);

  return {
    pages: { start, end },
    path: filePath,
  };
};
