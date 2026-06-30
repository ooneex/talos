import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { Yaml, YamlException } from "@/index";

const TEST_DIR = ".temp/talos-yml-test";
const ARRAY_YML = `${TEST_DIR}/array.yml`;
const OBJECT_YML = `${TEST_DIR}/object.yml`;
const MULTI_DOC_YML = `${TEST_DIR}/multi.yml`;
const INVALID_YML = `${TEST_DIR}/invalid.yml`;

type Color = {
  id: string;
  name: string;
  hex: string;
};

type Config = {
  database: { host: string; port: number };
  redis: { host: string; port: number };
};

describe("Yaml", () => {
  beforeEach(async () => {
    await Bun.write(
      ARRAY_YML,
      `- id: a1
  name: Blue
  hex: "#3B82F6"

- id: a2
  name: Green
  hex: "#10B981"

- id: a3
  name: Red
  hex: "#EF4444"

- id: a4
  name: Black
  hex: "#000000"
`,
    );

    await Bun.write(
      OBJECT_YML,
      `database:
  host: localhost
  port: 5432

redis:
  host: localhost
  port: 6379
`,
    );

    await Bun.write(
      MULTI_DOC_YML,
      `name: Doc 1
value: 100
---
name: Doc 2
value: 200
---
name: Doc 3
value: 300
`,
    );

    await Bun.write(INVALID_YML, "invalid: yaml: content: [");
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("constructor", () => {
    test("should create a Yaml instance", () => {
      const yaml = new Yaml(ARRAY_YML);
      expect(yaml).toBeInstanceOf(Yaml);
    });
  });

  describe("getPath", () => {
    test("should return the file path", () => {
      const yaml = new Yaml(ARRAY_YML);
      expect(yaml.getPath()).toBe(ARRAY_YML);
    });
  });

  describe("load", () => {
    test("should load array YAML and yield each item", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const items: Color[] = [];

      for await (const item of yaml.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(4);
      expect(items[0]).toEqual({ id: "a1", name: "Blue", hex: "#3B82F6" });
      expect(items[3]).toEqual({ id: "a4", name: "Black", hex: "#000000" });
    });

    test("should load object YAML and yield it as a single item", async () => {
      const yaml = new Yaml<Config>(OBJECT_YML);
      const items: Config[] = [];

      for await (const item of yaml.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      expect(items[0]?.database).toEqual({ host: "localhost", port: 5432 });
      expect(items[0]?.redis).toEqual({ host: "localhost", port: 6379 });
    });

    test("should load multi-document YAML and yield each document", async () => {
      const yaml = new Yaml<{ name: string; value: number }>(MULTI_DOC_YML);
      const items: { name: string; value: number }[] = [];

      for await (const item of yaml.load()) {
        items.push(item);
      }

      expect(items).toHaveLength(3);
      expect(items[0]).toEqual({ name: "Doc 1", value: 100 });
      expect(items[1]).toEqual({ name: "Doc 2", value: 200 });
      expect(items[2]).toEqual({ name: "Doc 3", value: 300 });
    });

    test("should throw YamlException for non-existent file", async () => {
      const yaml = new Yaml("/tmp/nonexistent.yml");

      try {
        for await (const _ of yaml.load()) {
          // noop
        }
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(YamlException);
        expect((error as YamlException).message).toContain("YAML file not found");
      }
    });

    test("should throw YamlException for invalid YAML", async () => {
      const yaml = new Yaml(INVALID_YML);

      try {
        for await (const _ of yaml.load()) {
          // noop
        }
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(YamlException);
        expect((error as YamlException).message).toContain("Failed to parse YAML");
      }
    });

    test("should filter items with ignore option", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const items: Color[] = [];

      for await (const item of yaml.load({ ignore: { name: /^B/ } })) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ id: "a2", name: "Green", hex: "#10B981" });
      expect(items[1]).toEqual({ id: "a3", name: "Red", hex: "#EF4444" });
    });

    test("should filter items with multiple ignore patterns", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const items: Color[] = [];

      for await (const item of yaml.load({ ignore: { name: /^B/, hex: /^#EF/ } })) {
        items.push(item);
      }

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({ id: "a2", name: "Green", hex: "#10B981" });
    });

    test("should yield all items when ignore matches nothing", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const items: Color[] = [];

      for await (const item of yaml.load({ ignore: { name: /^Z/ } })) {
        items.push(item);
      }

      expect(items).toHaveLength(4);
    });
  });

  describe("toJson", () => {
    test("should write all items as JSON array to file", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const outPath = `${TEST_DIR}/out.json`;

      await yaml.toJson({ path: outPath });

      const result = JSON.parse(await Bun.file(outPath).text()) as Color[];
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ id: "a1", name: "Blue", hex: "#3B82F6" });
    });

    test("should write filtered items as JSON when ignore is set", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const outPath = `${TEST_DIR}/out-filtered.json`;

      await yaml.toJson({ path: outPath, ignore: { name: /^B/ } });

      const result = JSON.parse(await Bun.file(outPath).text()) as Color[];
      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe("Green");
      expect(result[1]?.name).toBe("Red");
    });

    test("should write object YAML as single-element JSON array", async () => {
      const yaml = new Yaml<Config>(OBJECT_YML);
      const outPath = `${TEST_DIR}/out-object.json`;

      await yaml.toJson({ path: outPath });

      const result = JSON.parse(await Bun.file(outPath).text()) as Config[];
      expect(result).toHaveLength(1);
      expect(result[0]?.database.host).toBe("localhost");
    });
  });

  describe("toCsv", () => {
    test("should write CSV with comma separator", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const outPath = `${TEST_DIR}/out.csv`;

      await yaml.toCsv({ path: outPath, headers: ["id", "name", "hex"], separator: "," });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines).toHaveLength(5);
      expect(lines[0]).toBe("id,name,hex");
      expect(lines[1]).toBe("a1,Blue,#3B82F6");
    });

    test("should write CSV with semicolon separator", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const outPath = `${TEST_DIR}/out-semi.csv`;

      await yaml.toCsv({ path: outPath, headers: ["name", "hex"], separator: ";" });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name;hex");
      expect(lines[1]).toBe("Blue;#3B82F6");
    });

    test("should write CSV with tab separator", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const outPath = `${TEST_DIR}/out.tsv`;

      await yaml.toCsv({ path: outPath, headers: ["name", "hex"], separator: "\t" });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name\thex");
      expect(lines[1]).toBe("Blue\t#3B82F6");
    });

    test("should write CSV with pipe separator", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const outPath = `${TEST_DIR}/out-pipe.csv`;

      await yaml.toCsv({ path: outPath, headers: ["name", "hex"], separator: "|" });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name|hex");
      expect(lines[1]).toBe("Blue|#3B82F6");
    });

    test("should write CSV with colon separator", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const outPath = `${TEST_DIR}/out-colon.csv`;

      await yaml.toCsv({ path: outPath, headers: ["name", "hex"], separator: ":" });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name:hex");
      expect(lines[1]).toBe("Blue:#3B82F6");
    });

    test("should filter items with ignore option", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const outPath = `${TEST_DIR}/out-csv-filtered.csv`;

      await yaml.toCsv({ path: outPath, headers: ["name", "hex"], separator: ",", ignore: { name: /^B/ } });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe("name,hex");
      expect(lines[1]).toBe("Green,#10B981");
    });

    test("should write only selected headers", async () => {
      const yaml = new Yaml<Color>(ARRAY_YML);
      const outPath = `${TEST_DIR}/out-partial.csv`;

      await yaml.toCsv({ path: outPath, headers: ["name"], separator: "," });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[0]).toBe("name");
      expect(lines[1]).toBe("Blue");
    });

    test("should quote values containing the separator", async () => {
      const ymlPath = `${TEST_DIR}/quotes.yml`;
      await Bun.write(
        ymlPath,
        `- name: "hello, world"
  value: test
`,
      );

      const yaml = new Yaml<{ name: string; value: string }>(ymlPath);
      const outPath = `${TEST_DIR}/out-quoted.csv`;

      await yaml.toCsv({ path: outPath, headers: ["name", "value"], separator: "," });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[1]).toBe('"hello, world",test');
    });

    test("should escape double quotes in values", async () => {
      const ymlPath = `${TEST_DIR}/dquotes.yml`;
      await Bun.write(
        ymlPath,
        `- name: 'say "hello"'
  value: ok
`,
      );

      const yaml = new Yaml<{ name: string; value: string }>(ymlPath);
      const outPath = `${TEST_DIR}/out-dquotes.csv`;

      await yaml.toCsv({ path: outPath, headers: ["name", "value"], separator: "," });

      const lines = (await Bun.file(outPath).text()).trim().split("\n");
      expect(lines[1]).toBe('"say ""hello""",ok');
    });
  });
});
