import { describe, expect, test } from "bun:test";
import { customAlphabet, nanoid, randomInt, urlAlphabet } from "@/nanoid";

describe("nanoid", () => {
  describe("urlAlphabet", () => {
    test("should expose 64 unique url-safe symbols", () => {
      expect(urlAlphabet).toHaveLength(64);
      expect(new Set(urlAlphabet).size).toBe(64);
      expect(/^[A-Za-z0-9_-]+$/.test(urlAlphabet)).toBe(true);
    });
  });

  describe("nanoid", () => {
    test("should generate a 21 character id by default", () => {
      expect(nanoid()).toHaveLength(21);
    });

    test("should generate an id of the requested size", () => {
      expect(nanoid(40)).toHaveLength(40);
    });

    test("should only use url-safe symbols", () => {
      expect(/^[A-Za-z0-9_-]{500}$/.test(nanoid(500))).toBe(true);
    });

    test("should not repeat itself", () => {
      const ids = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        ids.add(nanoid());
      }

      expect(ids.size).toBe(1000);
    });
  });

  describe("customAlphabet", () => {
    describe("basic functionality", () => {
      test("should use 21 as default size", () => {
        expect(customAlphabet("abc")()).toHaveLength(21);
      });

      test("should use the configured default size", () => {
        expect(customAlphabet("abc", 7)()).toHaveLength(7);
      });

      test("should let each call override the default size", () => {
        const generate = customAlphabet("abc", 7);

        expect(generate(3)).toHaveLength(3);
        expect(generate()).toHaveLength(7);
        expect(generate(undefined)).toHaveLength(7);
      });

      test("should only use symbols from the alphabet", () => {
        const generate = customAlphabet("xyz");

        expect(/^[xyz]{300}$/.test(generate(300))).toBe(true);
      });

      test("should keep generators independent", () => {
        const letters = customAlphabet("ab", 4);
        const digits = customAlphabet("12", 9);

        expect(letters()).toHaveLength(4);
        expect(digits()).toHaveLength(9);
        expect(/^[ab]+$/.test(letters())).toBe(true);
        expect(/^[12]+$/.test(digits())).toBe(true);
      });
    });

    describe("edge cases", () => {
      test("should return an empty string for a size of zero or less", () => {
        const generate = customAlphabet("abc", 10);

        expect(generate(0)).toBe("");
        expect(generate(-5)).toBe("");
      });

      test("should support a single symbol alphabet", () => {
        expect(customAlphabet("a")(6)).toBe("aaaaaa");
      });

      test("should support a 256 symbol alphabet", () => {
        const alphabet = Array.from({ length: 256 }, (_, index) => String.fromCharCode(index)).join("");
        const id = customAlphabet(alphabet)(100);

        expect(id).toHaveLength(100);
        expect([...id].every((symbol) => alphabet.includes(symbol))).toBe(true);
      });

      test("should generate ids larger than the internal byte chunk", () => {
        const id = customAlphabet("0123456789abcdef")(5000);

        expect(id).toHaveLength(5000);
        expect(/^[0-9a-f]+$/.test(id)).toBe(true);
      });

      test("should reject an empty alphabet", () => {
        expect(() => customAlphabet("")).toThrow(RangeError);
      });

      test("should reject an alphabet larger than 256 symbols", () => {
        const alphabet = Array.from({ length: 257 }, (_, index) => String.fromCharCode(index)).join("");

        expect(() => customAlphabet(alphabet)).toThrow(RangeError);
      });
    });

    describe("randomness quality", () => {
      test("should spread symbols evenly when bytes need to be discarded", () => {
        const counts = new Map<string, number>();

        for (const symbol of customAlphabet("abc")(30000)) {
          counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
        }

        expect(counts.size).toBe(3);

        for (const count of counts.values()) {
          expect(count).toBeGreaterThan(9000);
          expect(count).toBeLessThan(11000);
        }
      });

      test("should produce unique ids across many calls", () => {
        const generate = customAlphabet(urlAlphabet, 16);
        const ids = new Set<string>();

        for (let i = 0; i < 2000; i++) {
          ids.add(generate());
        }

        expect(ids.size).toBe(2000);
      });
    });
  });

  describe("randomInt", () => {
    test("should stay within the requested range", () => {
      for (let i = 0; i < 1000; i++) {
        const value = randomInt(5);

        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(5);
      }
    });

    test("should always return zero for a single outcome", () => {
      expect(randomInt(1)).toBe(0);
    });

    test("should eventually return every possible value", () => {
      const values = new Set<number>();

      for (let i = 0; i < 1000; i++) {
        values.add(randomInt(6));
      }

      expect(values.size).toBe(6);
    });

    test("should support the full byte range", () => {
      for (let i = 0; i < 500; i++) {
        expect(randomInt(256)).toBeLessThan(256);
      }
    });

    test("should reject bounds outside of 1 to 256", () => {
      expect(() => randomInt(0)).toThrow(RangeError);
      expect(() => randomInt(257)).toThrow(RangeError);
    });
  });
});
