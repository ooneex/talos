import { describe, expect, test } from "bun:test";
import type { Filter } from "@/index";
import { buildFilter } from "@/utils.ts";

type TestData = { metadata: { category: string; score: number } };

describe("buildFilter", () => {
  describe("comparison operators", () => {
    test("= with string value", () => {
      const filter: Filter<TestData> = { field: "category", op: "=", value: "books" };
      expect(buildFilter(filter)).toBe("metadata.category = 'books'");
    });

    test("= with number value", () => {
      const filter: Filter<TestData> = { field: "score", op: "=", value: 42 };
      expect(buildFilter(filter)).toBe("metadata.score = 42");
    });

    test("> operator", () => {
      const filter: Filter<TestData> = { field: "score", op: ">", value: 10 };
      expect(buildFilter(filter)).toBe("metadata.score > 10");
    });

    test(">= operator", () => {
      const filter: Filter<TestData> = { field: "score", op: ">=", value: 10 };
      expect(buildFilter(filter)).toBe("metadata.score >= 10");
    });

    test("< operator", () => {
      const filter: Filter<TestData> = { field: "score", op: "<", value: 100 };
      expect(buildFilter(filter)).toBe("metadata.score < 100");
    });

    test("<= operator", () => {
      const filter: Filter<TestData> = { field: "score", op: "<=", value: 100 };
      expect(buildFilter(filter)).toBe("metadata.score <= 100");
    });
  });

  describe("null checks", () => {
    test("IS NULL", () => {
      const filter: Filter<TestData> = { field: "category", op: "IS NULL" };
      expect(buildFilter(filter)).toBe("metadata.category IS NULL");
    });

    test("IS NOT NULL", () => {
      const filter: Filter<TestData> = { field: "category", op: "IS NOT NULL" };
      expect(buildFilter(filter)).toBe("metadata.category IS NOT NULL");
    });
  });

  describe("boolean checks", () => {
    test("IS TRUE", () => {
      const filter: Filter<TestData> = { field: "category", op: "IS TRUE" };
      expect(buildFilter(filter)).toBe("metadata.category IS TRUE");
    });

    test("IS NOT TRUE", () => {
      const filter: Filter<TestData> = { field: "category", op: "IS NOT TRUE" };
      expect(buildFilter(filter)).toBe("metadata.category IS NOT TRUE");
    });

    test("IS FALSE", () => {
      const filter: Filter<TestData> = { field: "category", op: "IS FALSE" };
      expect(buildFilter(filter)).toBe("metadata.category IS FALSE");
    });

    test("IS NOT FALSE", () => {
      const filter: Filter<TestData> = { field: "category", op: "IS NOT FALSE" };
      expect(buildFilter(filter)).toBe("metadata.category IS NOT FALSE");
    });
  });

  describe("IN operator", () => {
    test("IN with string values", () => {
      const filter: Filter<TestData> = { field: "category", op: "IN", value: ["books", "movies"] };
      expect(buildFilter(filter)).toBe("metadata.category IN ('books', 'movies')");
    });

    test("IN with number values", () => {
      const filter: Filter<TestData> = { field: "score", op: "IN", value: [1, 2, 3] };
      expect(buildFilter(filter)).toBe("metadata.score IN (1, 2, 3)");
    });

    test("IN with mixed values", () => {
      const filter: Filter<TestData> = { field: "category", op: "IN", value: ["books", 42] };
      expect(buildFilter(filter)).toBe("metadata.category IN ('books', 42)");
    });
  });

  describe("LIKE operators", () => {
    test("LIKE", () => {
      const filter: Filter<TestData> = { field: "category", op: "LIKE", value: "%book%" };
      expect(buildFilter(filter)).toBe("metadata.category LIKE '%book%'");
    });

    test("NOT LIKE", () => {
      const filter: Filter<TestData> = { field: "category", op: "NOT LIKE", value: "%draft%" };
      expect(buildFilter(filter)).toBe("metadata.category NOT LIKE '%draft%'");
    });
  });

  describe("built-in fields", () => {
    test("id field", () => {
      const filter: Filter<TestData> = { field: "id", op: "=", value: "abc123" };
      expect(buildFilter(filter)).toBe("id = 'abc123'");
    });

    test("text field", () => {
      const filter: Filter<TestData> = { field: "text", op: "LIKE", value: "%hello%" };
      expect(buildFilter(filter)).toBe("text LIKE '%hello%'");
    });
  });

  describe("logical combinators", () => {
    test("AND", () => {
      const filter: Filter<TestData> = {
        AND: [
          { field: "category", op: "=", value: "books" },
          { field: "score", op: ">", value: 5 },
        ],
      };
      expect(buildFilter(filter)).toBe("(metadata.category = 'books' AND metadata.score > 5)");
    });

    test("OR", () => {
      const filter: Filter<TestData> = {
        OR: [
          { field: "category", op: "=", value: "books" },
          { field: "category", op: "=", value: "movies" },
        ],
      };
      expect(buildFilter(filter)).toBe("(metadata.category = 'books' OR metadata.category = 'movies')");
    });

    test("NOT", () => {
      const filter: Filter<TestData> = {
        NOT: { field: "category", op: "=", value: "draft" },
      };
      expect(buildFilter(filter)).toBe("NOT (metadata.category = 'draft')");
    });

    test("nested AND inside OR", () => {
      const filter: Filter<TestData> = {
        OR: [
          {
            AND: [
              { field: "category", op: "=", value: "books" },
              { field: "score", op: ">=", value: 8 },
            ],
          },
          { field: "category", op: "=", value: "movies" },
        ],
      };
      expect(buildFilter(filter)).toBe(
        "((metadata.category = 'books' AND metadata.score >= 8) OR metadata.category = 'movies')",
      );
    });

    test("NOT inside AND", () => {
      const filter: Filter<TestData> = {
        AND: [{ NOT: { field: "category", op: "=", value: "draft" } }, { field: "score", op: ">", value: 0 }],
      };
      expect(buildFilter(filter)).toBe("(NOT (metadata.category = 'draft') AND metadata.score > 0)");
    });

    test("deeply nested combinators", () => {
      const filter: Filter<TestData> = {
        AND: [
          {
            OR: [
              { field: "category", op: "=", value: "books" },
              { field: "category", op: "=", value: "movies" },
            ],
          },
          {
            NOT: {
              AND: [
                { field: "score", op: "<", value: 3 },
                { field: "category", op: "LIKE", value: "%draft%" },
              ],
            },
          },
        ],
      };
      expect(buildFilter(filter)).toBe(
        "((metadata.category = 'books' OR metadata.category = 'movies') AND NOT ((metadata.score < 3 AND metadata.category LIKE '%draft%')))",
      );
    });
  });
});
