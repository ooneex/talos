import path from "node:path";
import { random } from "@talosjs/utils/random";
import { convert } from "@opendataloader/pdf";
import { ConvertorException } from "./ConvertorException";
import type { ChunkType, ConvertorFileType, ConvertorOptionsType, IConvertor } from "./types";

export class Convertor implements IConvertor {
  private readonly source: string;

  constructor(source: string) {
    this.source = path.join(...source.split(/[/\\]/));
  }

  public async *convert(
    options: ConvertorOptionsType = {},
  ): AsyncGenerator<ChunkType, { json: ConvertorFileType; markdown: ConvertorFileType }> {
    try {
      const subDir = random.id();
      const outputDir = path.join(options.outputDir ?? "", subDir);
      const { password, imageFormat, quiet, pages } = options;

      await convert([this.source], {
        outputDir,
        format: "json,markdown",
        imageDir: path.join(outputDir, "images"),
        imageOutput: "external",
        ...(password !== undefined && { password }),
        ...(imageFormat !== undefined && { imageFormat }),
        ...(quiet !== undefined && { quiet }),
        ...(pages !== undefined && { pages }),
      });

      const glob = new Bun.Glob("*");
      let jsonFile: string | undefined;
      let mdFile: string | undefined;
      for await (const file of glob.scan(outputDir)) {
        if (!jsonFile && file.endsWith(".json")) jsonFile = file;
        if (!mdFile && file.endsWith(".md")) mdFile = file;
        if (jsonFile && mdFile) break;
      }

      if (!jsonFile) {
        throw new ConvertorException("No JSON output file found after conversion", "NO_JSON_OUTPUT", {
          source: this.source,
        });
      }

      if (!mdFile) {
        throw new ConvertorException("No Markdown output file found after conversion", "NO_MARKDOWN_OUTPUT", {
          source: this.source,
        });
      }

      const jsonPath = path.join(outputDir, jsonFile);
      const doc = await Bun.file(jsonPath).json();
      const fileName = doc["file name"] ?? path.basename(this.source);

      yield* this.generateChunks(doc.kids ?? [], fileName);

      const renamedJson = `${random.id()}.json`;
      const renamedMd = `${random.id()}.md`;

      const mdPath = path.join(outputDir, mdFile);
      const renamedJsonPath = path.join(outputDir, renamedJson);
      const renamedMdPath = path.join(outputDir, renamedMd);

      await Promise.all([Bun.write(renamedJsonPath, Bun.file(jsonPath)), Bun.write(renamedMdPath, Bun.file(mdPath))]);

      await Promise.all([Bun.file(jsonPath).delete(), Bun.file(mdPath).delete()]);

      return {
        json: { name: renamedJson, path: renamedJsonPath },
        markdown: { name: renamedMd, path: renamedMdPath },
      };
    } catch (error) {
      if (error instanceof ConvertorException) throw error;
      throw new ConvertorException(
        error instanceof Error ? error.message : "PDF conversion with chunking failed",
        "CHUNKING_FAILED",
        {
          source: this.source,
        },
      );
    }
  }

  private *generateChunks(kids: Record<string, unknown>[], source: string): Generator<ChunkType> {
    let currentHeading: string | null = null;
    let currentContent: string[] = [];
    let startPage: number | null = null;
    let pageSet = new Set<number>();

    for (const element of kids) {
      const type = element.type as string | undefined;
      if (!type) continue;

      if (type === "heading") {
        if (currentContent.length > 0) {
          yield {
            text: currentContent.join("\n"),
            metadata: { heading: currentHeading, page: startPage, pages: Array.from(pageSet), source },
          };
        }
        const content = this.extractContent(element);
        currentHeading = content;
        currentContent = content ? [content] : [];
        startPage = (element["page number"] as number) ?? null;
        pageSet = new Set(startPage !== null ? [startPage] : []);
        continue;
      }

      if (type === "paragraph" || type === "list") {
        const content = this.extractContent(element);
        if (content) {
          currentContent.push(content);
          const page = element["page number"] as number | undefined;
          if (page !== undefined) {
            pageSet.add(page);
          }
        }
      }
    }

    if (currentContent.length > 0) {
      yield {
        text: currentContent.join("\n"),
        metadata: { heading: currentHeading, page: startPage, pages: Array.from(pageSet), source },
      };
    }
  }

  private extractContent(element: Record<string, unknown>): string | null {
    const parts = Array.from(this.extractTexts(element));
    return parts.length > 0 ? parts.join(" ") : null;
  }

  private *extractTexts(element: Record<string, unknown>): Generator<string> {
    const content = element.content as string | undefined;
    if (content) {
      yield content;
      return;
    }

    const kids = element.kids as Record<string, unknown>[] | undefined;
    if (kids) {
      for (const kid of kids) {
        yield* this.extractTexts(kid);
      }
    }
  }
}
