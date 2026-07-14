import { describe, expect, test } from "bun:test";
import { TOML, YAML } from "bun";
import {
  canWriteFiles,
  mergeDescription,
  parseTemplate,
  tomlBasicString,
  toTitleCase,
  yamlBlockScalar,
  yamlDoubleQuoted,
  yamlScalar,
} from "@/templates/llm/frontmatter";

describe("parseTemplate", () => {
  test("should split front matter from the trimmed body", () => {
    const { data, body } = parseTemplate("---\nname: demo\neffort: high\n---\n\n# Title\n\nBody\n");

    expect(data).toEqual({ name: "demo", effort: "high" });
    expect(body).toBe("# Title\n\nBody");
  });

  test("should keep colons that appear in the value", () => {
    const { data } = parseTemplate('---\ndescription: Implements a `type: "api"` issue.\n---\nBody');

    expect(data.description).toBe('Implements a `type: "api"` issue.');
  });

  test("should treat a template without front matter as all body", () => {
    const { data, body } = parseTemplate("# Just a body\n\nNo front matter here.\n");

    expect(data).toEqual({});
    expect(body).toBe("# Just a body\n\nNo front matter here.");
  });
});

describe("mergeDescription", () => {
  test("should fold when_to_use into the description", () => {
    expect(mergeDescription({ description: "Does a thing.", when_to_use: "Use when needed." })).toBe(
      "Does a thing. Use when needed.",
    );
  });

  test("should tolerate a missing when_to_use", () => {
    expect(mergeDescription({ description: "Does a thing." })).toBe("Does a thing.");
  });
});

describe("canWriteFiles", () => {
  test("should be true when the tool set includes Write or Edit", () => {
    expect(canWriteFiles({ tools: "Read, Edit, Write, Bash" })).toBe(true);
    expect(canWriteFiles({ tools: "Read, Edit, Grep" })).toBe(true);
  });

  test("should be false for read-only tool sets or no tools", () => {
    expect(canWriteFiles({ tools: "Read, Grep, Glob" })).toBe(false);
    expect(canWriteFiles({})).toBe(false);
  });
});

describe("toTitleCase", () => {
  test("should title-case hyphen- and dot-separated names", () => {
    expect(toTitleCase("api-issue-fixer")).toBe("Api Issue Fixer");
    expect(toTitleCase("talos.packages")).toBe("Talos Packages");
  });
});

describe("tomlBasicString", () => {
  test("should quote and escape backslashes and double quotes", () => {
    const encoded = tomlBasicString('a "quote" and a \\ slash');

    expect(encoded).toBe('"a \\"quote\\" and a \\\\ slash"');
    expect((TOML.parse(`value = ${encoded}`) as { value: string }).value).toBe('a "quote" and a \\ slash');
  });
});

describe("yamlDoubleQuoted", () => {
  test("should round-trip a value containing colons and quotes through YAML", () => {
    const encoded = yamlDoubleQuoted('type: "api" module');

    expect((YAML.parse(`value: ${encoded}`) as { value: string }).value).toBe('type: "api" module');
  });
});

describe("yamlScalar", () => {
  test("should leave a plain, safe value unquoted", () => {
    expect(yamlScalar("Create commit messages grouped by module.")).toBe("Create commit messages grouped by module.");
  });

  test("should quote values containing a colon-space sequence", () => {
    const encoded = yamlScalar('Implements a `type: "api"` issue.');

    expect(encoded.startsWith('"')).toBe(true);
    expect((YAML.parse(`description: ${encoded}`) as { description: string }).description).toBe(
      'Implements a `type: "api"` issue.',
    );
  });

  test("should quote values with a leading indicator character or trailing space", () => {
    expect(yamlScalar("- leading dash").startsWith('"')).toBe(true);
    expect(yamlScalar("trailing space ").startsWith('"')).toBe(true);
  });
});

describe("yamlBlockScalar", () => {
  test("should indent each line and keep blank lines empty", () => {
    const block = yamlBlockScalar("# Title\n\nBody line", 6);

    expect(block).toBe("|-\n      # Title\n\n      Body line");
  });

  test("should round-trip through YAML preserving the content", () => {
    const block = yamlBlockScalar("# Heading\n\nA `type: x` line\nSecond line", 6);
    const parsed = YAML.parse(`customInstructions: ${block}`) as { customInstructions: string };

    expect(parsed.customInstructions).toBe("# Heading\n\nA `type: x` line\nSecond line");
  });
});
