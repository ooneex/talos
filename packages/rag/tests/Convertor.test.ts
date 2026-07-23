import { afterAll, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Convertor, ConvertorException } from "@/index";

const outputDir = "tests/tmp";

describe("Convertor", () => {
  afterAll(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  test("should convert file-sample.pdf and produce section chunks", async () => {
    const convertor = new Convertor("tests/file-sample.pdf");
    const generator = convertor.convert({ outputDir, quiet: true });

    const chunks = [];
    let result = await generator.next();
    while (!result.done) {
      chunks.push(result.value);
      result = await generator.next();
    }
    const files = result.value;

    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.metadata.pages).toBeArray();
    }

    expect(files.json.name).toMatch(/^[0-9a-f]{20}\.json$/);
    const jsonFile = Bun.file(files.json.path);
    expect(await jsonFile.exists()).toBe(true);

    expect(files.markdown.name).toMatch(/^[0-9a-f]{20}\.md$/);
    const mdFile = Bun.file(files.markdown.path);
    expect(await mdFile.exists()).toBe(true);
    // The underlying @opendataloader/pdf convert spins up a JVM; its cold start on a
    // slow CI runner exceeds Bun's default 5s timeout, so allow generous headroom.
  }, 30000);

  test("should throw ConvertorException for non-existent source file", async () => {
    const convertor = new Convertor("tests/non-existent.pdf");
    const generator = convertor.convert({ outputDir, quiet: true });

    expect(async () => {
      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }
    }).toThrow(ConvertorException);
  }, 30000);
});
