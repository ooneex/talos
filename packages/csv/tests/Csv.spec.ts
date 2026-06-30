import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Csv, CsvException } from "@/index";

const TEST_DIR = ".temp/talos-csv-test";
const COMMA_CSV = `${TEST_DIR}/comma.csv`;

type Color = {
  id: string;
  name: string;
  hex: string;
};

describe("Csv", () => {
  beforeEach(async () => {
    await Bun.write(
      COMMA_CSV,
      `id,name,hex
a1,Blue,#3B82F6
a2,Green,#10B981
a3,Red,#EF4444
a4,Black,#000000
`,
    );
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("constructor", () => {
    test("should create a Csv instance with default comma separator", () => {
      const csv = new Csv(COMMA_CSV);
      expect(csv).toBeInstanceOf(Csv);
    });

    test("should create a Csv instance with custom separator", () => {
      const csv = new Csv(COMMA_CSV, ";");
      expect(csv).toBeInstanceOf(Csv);
    });
  });

  describe("getPath", () => {
    test("should return the file path", () => {
      const csv = new Csv(COMMA_CSV);
      expect(csv.getPath()).toBe(COMMA_CSV);
    });
  });

  describe("load", () => {
    test("should load CSV and yield each row as object", async () => {
      const csv = new Csv<Color>(COMMA_CSV);
      const items: Color[] = [];

      for await (const item of csv.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(4);
      expect(items[0]).toEqual({ id: "a1", name: "Blue", hex: "#3B82F6" });
      expect(items[3]).toEqual({ id: "a4", name: "Black", hex: "#000000" });
    });

    test("should throw CsvException for non-existent file", async () => {
      const csv = new Csv("/tmp/nonexistent.csv");

      try {
        for await (const _ of csv.load()) {
          // noop
        }
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CsvException);
        expect((error as CsvException).message).toContain("CSV file not found");
      }
    });

    test("should filter items with ignore option", async () => {
      const csv = new Csv<Color>(COMMA_CSV);
      const items: Color[] = [];

      for await (const item of csv.load({ ignore: { name: /^B/ } })) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ id: "a2", name: "Green", hex: "#10B981" });
      expect(items[1]).toEqual({ id: "a3", name: "Red", hex: "#EF4444" });
    });

    test("should filter items with multiple ignore patterns", async () => {
      const csv = new Csv<Color>(COMMA_CSV);
      const items: Color[] = [];

      for await (const item of csv.load({ ignore: { name: /^B/, hex: /^#EF/ } })) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({ id: "a2", name: "Green", hex: "#10B981" });
    });

    test("should yield all items when ignore matches nothing", async () => {
      const csv = new Csv<Color>(COMMA_CSV);
      const items: Color[] = [];

      for await (const item of csv.load({ ignore: { name: /^Z/ } })) {
        items.push(item);
      }

      expect(items).toHaveLength(4);
    });

    test("should load CSV with semicolon separator", async () => {
      const semiPath = `${TEST_DIR}/semi.csv`;
      await Bun.write(semiPath, "name;hex\nBlue;#3B82F6\nGreen;#10B981\n");

      const csv = new Csv<{ name: string; hex: string }>(semiPath, ";");
      const items: { name: string; hex: string }[] = [];

      for await (const item of csv.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ name: "Blue", hex: "#3B82F6" });
    });

    test("should load CSV with tab separator", async () => {
      const tabPath = `${TEST_DIR}/tab.tsv`;
      await Bun.write(tabPath, "name\thex\nBlue\t#3B82F6\n");

      const csv = new Csv<{ name: string; hex: string }>(tabPath, "\t");
      const items: { name: string; hex: string }[] = [];

      for await (const item of csv.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({ name: "Blue", hex: "#3B82F6" });
    });

    test("should load CSV with pipe separator", async () => {
      const pipePath = `${TEST_DIR}/pipe.csv`;
      await Bun.write(pipePath, "name|hex\nBlue|#3B82F6\n");

      const csv = new Csv<{ name: string; hex: string }>(pipePath, "|");
      const items: { name: string; hex: string }[] = [];

      for await (const item of csv.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({ name: "Blue", hex: "#3B82F6" });
    });

    test("should load CSV with colon separator", async () => {
      const colonPath = `${TEST_DIR}/colon.csv`;
      await Bun.write(colonPath, "name:value\nhello:world\n");

      const csv = new Csv<{ name: string; value: string }>(colonPath, ":");
      const items: { name: string; value: string }[] = [];

      for await (const item of csv.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({ name: "hello", value: "world" });
    });

    test("should handle quoted fields containing separator", async () => {
      const quotedPath = `${TEST_DIR}/quoted.csv`;
      await Bun.write(quotedPath, 'name,value\n"hello, world",test\n');

      const csv = new Csv<{ name: string; value: string }>(quotedPath);
      const items: { name: string; value: string }[] = [];

      for await (const item of csv.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({ name: "hello, world", value: "test" });
    });

    test("should handle escaped double quotes in fields", async () => {
      const dquotePath = `${TEST_DIR}/dquote.csv`;
      await Bun.write(dquotePath, 'name,value\n"say ""hello""",ok\n');

      const csv = new Csv<{ name: string; value: string }>(dquotePath);
      const items: { name: string; value: string }[] = [];

      for await (const item of csv.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({ name: 'say "hello"', value: "ok" });
    });
  });

  describe("toJson", () => {
    test("should write all rows as JSON array to file", async () => {
      const csv = new Csv<Color>(COMMA_CSV);
      const outPath = `${TEST_DIR}/out.json`;

      await csv.toJson({ path: outPath });

      const result = JSON.parse(await Bun.file(outPath).text()) as Color[];
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ id: "a1", name: "Blue", hex: "#3B82F6" });
    });

    test("should write filtered rows as JSON when ignore is set", async () => {
      const csv = new Csv<Color>(COMMA_CSV);
      const outPath = `${TEST_DIR}/out-filtered.json`;

      await csv.toJson({ path: outPath, ignore: { name: /^B/ } });

      const result = JSON.parse(await Bun.file(outPath).text()) as Color[];
      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe("Green");
      expect(result[1]?.name).toBe("Red");
    });
  });

  describe("toYaml", () => {
    test("should write all rows as YAML array to file", async () => {
      const csv = new Csv<Color>(COMMA_CSV);
      const outPath = `${TEST_DIR}/out.yml`;

      await csv.toYaml({ path: outPath });

      const content = await Bun.file(outPath).text();
      const lines = content.split("\n");

      expect(lines[0]).toBe("- id: a1");
      expect(lines[1]).toBe("  name: Blue");
      expect(lines[2]).toBe('  hex: "#3B82F6"');
    });

    test("should separate items with blank lines", async () => {
      const csv = new Csv<Color>(COMMA_CSV);
      const outPath = `${TEST_DIR}/out-sep.yml`;

      await csv.toYaml({ path: outPath });

      const content = await Bun.file(outPath).text();
      expect(content).toContain("\n\n- id: a2");
    });

    test("should write filtered rows when ignore is set", async () => {
      const csv = new Csv<Color>(COMMA_CSV);
      const outPath = `${TEST_DIR}/out-filtered.yml`;

      await csv.toYaml({ path: outPath, ignore: { name: /^B/ } });

      const content = await Bun.file(outPath).text();
      expect(content).not.toContain("Blue");
      expect(content).not.toContain("Black");
      expect(content).toContain("Green");
      expect(content).toContain("Red");
    });
  });
});
