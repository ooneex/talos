import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Json, JsonException } from "@/index";

const TEST_DIR = ".temp/talos-json-test";
const ARRAY_JSON = `${TEST_DIR}/array.json`;
const INVALID_JSON = `${TEST_DIR}/invalid.json`;

type Color = {
  id: string;
  name: string;
  hex: string;
};

describe("Json", () => {
  beforeEach(async () => {
    await Bun.write(
      ARRAY_JSON,
      JSON.stringify([
        { id: "a1", name: "Blue", hex: "#3B82F6" },
        { id: "a2", name: "Green", hex: "#10B981" },
        { id: "a3", name: "Red", hex: "#EF4444" },
        { id: "a4", name: "Black", hex: "#000000" },
      ]),
    );

    await Bun.write(INVALID_JSON, "{invalid json[");
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("constructor", () => {
    test("should create a Json instance", () => {
      const json = new Json(ARRAY_JSON);
      expect(json).toBeInstanceOf(Json);
    });
  });

  describe("getPath", () => {
    test("should return the file path", () => {
      const json = new Json(ARRAY_JSON);
      expect(json.getPath()).toBe(ARRAY_JSON);
    });
  });

  describe("load", () => {
    test("should load JSON array and yield each item", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const items: Color[] = [];

      for await (const item of json.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(4);
      expect(items[0]).toEqual({ id: "a1", name: "Blue", hex: "#3B82F6" });
      expect(items[3]).toEqual({ id: "a4", name: "Black", hex: "#000000" });
    });

    test("should throw JsonException for non-existent file", async () => {
      const json = new Json("/tmp/nonexistent.json");

      try {
        for await (const _ of json.load()) {
          // noop
        }
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(JsonException);
        expect((error as JsonException).message).toContain("JSON file not found");
      }
    });

    test("should filter items with ignore option", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const items: Color[] = [];

      for await (const item of json.load({ ignore: { name: /^B/ } })) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ id: "a2", name: "Green", hex: "#10B981" });
      expect(items[1]).toEqual({ id: "a3", name: "Red", hex: "#EF4444" });
    });

    test("should filter items with multiple ignore patterns", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const items: Color[] = [];

      for await (const item of json.load({ ignore: { name: /^B/, hex: /^#EF/ } })) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({ id: "a2", name: "Green", hex: "#10B981" });
    });

    test("should yield all items when ignore matches nothing", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const items: Color[] = [];

      for await (const item of json.load({ ignore: { name: /^Z/ } })) {
        items.push(item);
      }

      expect(items).toHaveLength(4);
    });
  });

  describe("toYaml", () => {
    test("should write all items as YAML array to file", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out.yml`;

      await json.toYaml({ path: outPath });

      const content = await Bun.file(outPath).text();
      const lines = content.split("\n");

      expect(lines[0]).toBe("- id: a1");
      expect(lines[1]).toBe("  name: Blue");
      expect(lines[2]).toBe('  hex: "#3B82F6"');
    });

    test("should separate items with blank lines", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out-sep.yml`;

      await json.toYaml({ path: outPath });

      const content = await Bun.file(outPath).text();
      expect(content).toContain("\n\n- id: a2");
    });

    test("should write filtered items when ignore is set", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out-filtered.yml`;

      await json.toYaml({ path: outPath, ignore: { name: /^B/ } });

      const content = await Bun.file(outPath).text();
      expect(content).not.toContain("Blue");
      expect(content).not.toContain("Black");
      expect(content).toContain("Green");
      expect(content).toContain("Red");
    });

    test("should quote values containing special characters", async () => {
      const specialPath = `${TEST_DIR}/special.json`;
      await Bun.write(specialPath, JSON.stringify([{ name: 'say "hello"', value: "a: b" }]));

      const json = new Json<{ name: string; value: string }>(specialPath);
      const outPath = `${TEST_DIR}/out-special.yml`;

      await json.toYaml({ path: outPath });

      const content = await Bun.file(outPath).text();
      expect(content).toContain('"say \\"hello\\""');
      expect(content).toContain('"a: b"');
    });

    test("should handle boolean and number values", async () => {
      const typesPath = `${TEST_DIR}/types.json`;
      await Bun.write(typesPath, JSON.stringify([{ flag: true, count: 42, label: "test" }]));

      const json = new Json<{ flag: boolean; count: number; label: string }>(typesPath);
      const outPath = `${TEST_DIR}/out-types.yml`;

      await json.toYaml({ path: outPath });

      const content = await Bun.file(outPath).text();
      expect(content).toContain("flag: true");
      expect(content).toContain("count: 42");
      expect(content).toContain("label: test");
    });
  });

  describe("toCsv", () => {
    test("should write CSV with comma separator", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out.csv`;

      await json.toCsv({ path: outPath, headers: ["id", "name", "hex"], separator: "," });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines).toHaveLength(5);
      expect(lines[0]).toBe("id,name,hex");
      expect(lines[1]).toBe("a1,Blue,#3B82F6");
    });

    test("should write CSV with semicolon separator", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out-semi.csv`;

      await json.toCsv({ path: outPath, headers: ["name", "hex"], separator: ";" });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name;hex");
      expect(lines[1]).toBe("Blue;#3B82F6");
    });

    test("should write CSV with tab separator", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out.tsv`;

      await json.toCsv({ path: outPath, headers: ["name", "hex"], separator: "\t" });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name\thex");
      expect(lines[1]).toBe("Blue\t#3B82F6");
    });

    test("should write CSV with pipe separator", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out-pipe.csv`;

      await json.toCsv({ path: outPath, headers: ["name", "hex"], separator: "|" });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name|hex");
      expect(lines[1]).toBe("Blue|#3B82F6");
    });

    test("should write CSV with colon separator", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out-colon.csv`;

      await json.toCsv({ path: outPath, headers: ["name", "hex"], separator: ":" });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name:hex");
    });

    test("should filter items with ignore option", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out-csv-filtered.csv`;

      await json.toCsv({ path: outPath, headers: ["name", "hex"], separator: ",", ignore: { name: /^B/ } });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe("name,hex");
      expect(lines[1]).toBe("Green,#10B981");
    });

    test("should write only selected headers", async () => {
      const json = new Json<Color>(ARRAY_JSON);
      const outPath = `${TEST_DIR}/out-partial.csv`;

      await json.toCsv({ path: outPath, headers: ["name"], separator: "," });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name");
      expect(lines[1]).toBe("Blue");
    });

    test("should quote values containing the separator", async () => {
      const quotePath = `${TEST_DIR}/quotes.json`;
      await Bun.write(quotePath, JSON.stringify([{ name: "hello, world", value: "test" }]));

      const json = new Json<{ name: string; value: string }>(quotePath);
      const outPath = `${TEST_DIR}/out-quoted.csv`;

      await json.toCsv({ path: outPath, headers: ["name", "value"], separator: "," });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[1]).toBe('"hello, world",test');
    });

    test("should escape double quotes in values", async () => {
      const dquotePath = `${TEST_DIR}/dquotes.json`;
      await Bun.write(dquotePath, JSON.stringify([{ name: 'say "hello"', value: "ok" }]));

      const json = new Json<{ name: string; value: string }>(dquotePath);
      const outPath = `${TEST_DIR}/out-dquotes.csv`;

      await json.toCsv({ path: outPath, headers: ["name", "value"], separator: "," });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[1]).toBe('"say ""hello""",ok');
    });
  });
});
