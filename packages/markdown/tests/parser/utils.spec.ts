import { describe, expect, test } from "bun:test";
import { normalizeUrl, resolveOptions, slugify } from "@/parser/utils";

describe("parser utils", () => {
  test("resolveOptions should apply defaults and keep overrides", () => {
    expect(resolveOptions()).toEqual({
      tables: true,
      strikethrough: true,
      tasklists: true,
      autolinks: true,
      headingIds: true,
      hardBreaks: false,
      sanitize: false,
    });
    expect(resolveOptions({ sanitize: true, tables: false })).toMatchObject({ sanitize: true, tables: false });
  });

  test("normalizeUrl should percent-encode unsafe characters and keep existing escapes", () => {
    expect(normalizeUrl("/a b/[c]/%20/%zz/é\\")).toBe("/a%20b/%5Bc%5D/%20/%25zz/%C3%A9%5C");
    expect(normalizeUrl("https://x.io/?q=1&r=(2)#h")).toBe("https://x.io/?q=1&r=(2)#h");
    expect(normalizeUrl("😀")).toBe("%F0%9F%98%80");
  });

  test("slugify should build GitHub-style ids", () => {
    expect(slugify(" Hello, World! ")).toBe("hello-world");
    expect(slugify("Ünïcode & emoji 🎉 2")).toBe("ünïcode--emoji--2");
    expect(slugify("snake_case-kebab")).toBe("snake_case-kebab");
  });
});
