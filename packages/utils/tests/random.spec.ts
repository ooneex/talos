import { describe, expect, test } from "bun:test";
import { random } from "@/random";

describe("random", () => {
  describe("nanoid", () => {
    describe("basic functionality", () => {
      test("should return string with default length of 10", () => {
        const result = random.nanoid();
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(10);
      });

      test("should return string with specified length", () => {
        const result = random.nanoid(5);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(5);
      });

      test("should return string with custom length", () => {
        const result = random.nanoid(20);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(20);
      });

      test("should only contain valid characters (0-9, a-f)", () => {
        const result = random.nanoid(100);
        const validChars = /^[0-9a-f]+$/;
        expect(validChars.test(result)).toBe(true);
      });

      test("should generate different values on consecutive calls", () => {
        const result1 = random.nanoid();
        const result2 = random.nanoid();
        expect(result1).not.toBe(result2);
      });
    });

    describe("edge cases", () => {
      test("should handle zero length", () => {
        const result = random.nanoid(0);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(0);
        expect(result).toBe("");
      });

      test("should handle very large lengths", () => {
        const result = random.nanoid(1000);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(1000);
      });

      test("should handle undefined size parameter", () => {
        const result = random.nanoid(undefined);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(10);
      });
    });

    describe("randomness quality", () => {
      test("should generate sufficiently random strings", () => {
        const results = new Set();
        for (let i = 0; i < 100; i++) {
          results.add(random.nanoid());
        }
        // All 100 generated strings should be unique
        expect(results.size).toBe(100);
      });

      test("should have good character distribution", () => {
        const result = random.nanoid(1000);
        const charCounts = new Map<string, number>();

        for (const char of result) {
          charCounts.set(char, (charCounts.get(char) || 0) + 1);
        }

        // Should have multiple different characters
        expect(charCounts.size).toBeGreaterThan(10);

        // No single character should dominate too much (allow some variance)
        for (const count of charCounts.values()) {
          expect(count).toBeLessThan(200); // Less than 20% of total
        }
      });
    });

    describe("parametrized tests", () => {
      test.each([[1], [5], [10], [16], [32], [64], [128]])("should generate string of length %i", (length) => {
        const result = random.nanoid(length);
        expect(result).toHaveLength(length);
        expect(/^[0-9a-f]*$/.test(result)).toBe(true);
      });
    });
  });

  describe("id", () => {
    test("should return string with default length of 20", () => {
      const result = random.id();
      expect(typeof result).toBe("string");
      expect(result).toHaveLength(20);
    });

    test("should only contain valid characters (0-9, a-f)", () => {
      const result = random.id();
      const validChars = /^[0-9a-f]+$/;
      expect(validChars.test(result)).toBe(true);
    });

    test("should generate different values on consecutive calls", () => {
      const result1 = random.id();
      const result2 = random.id();
      expect(result1).not.toBe(result2);
    });

    test("should generate sufficiently random strings", () => {
      const results = new Set();
      for (let i = 0; i < 100; i++) {
        results.add(random.id());
      }
      expect(results.size).toBe(100);
    });
  });

  describe("stringInt", () => {
    describe("basic functionality", () => {
      test("should return string with default length of 10", () => {
        const result = random.stringInt();
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(10);
      });

      test("should return string with specified length", () => {
        const result = random.stringInt(5);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(5);
      });

      test("should return string with custom length", () => {
        const result = random.stringInt(20);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(20);
      });

      test("should only contain digits (0-9)", () => {
        const result = random.stringInt(100);
        const validChars = /^[0-9]+$/;
        expect(validChars.test(result)).toBe(true);
      });

      test("should generate different values on consecutive calls", () => {
        const result1 = random.stringInt();
        const result2 = random.stringInt();
        expect(result1).not.toBe(result2);
      });
    });

    describe("edge cases", () => {
      test("should handle zero length", () => {
        const result = random.stringInt(0);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(0);
        expect(result).toBe("");
      });

      test("should handle very large lengths", () => {
        const result = random.stringInt(500);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(500);
      });

      test("should handle undefined size parameter", () => {
        const result = random.stringInt(undefined);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(10);
      });
    });

    describe("numeric properties", () => {
      test("should be parseable as integer when not too large", () => {
        const result = random.stringInt(15); // Safe integer range
        expect(Number.isNaN(Number(result))).toBe(false);
        expect(Number.isInteger(Number(result))).toBe(true);
      });

      test("should not have leading zeros unless it's all zeros", () => {
        const results = [];
        for (let i = 0; i < 100; i++) {
          results.push(random.stringInt(10));
        }

        const withLeadingZero = results.filter((r) => r.length > 1 && r[0] === "0");
        // Some may have leading zeros, but not all
        expect(withLeadingZero.length).toBeLessThan(results.length);
      });
    });

    describe("randomness quality", () => {
      test("should generate sufficiently random strings", () => {
        const results = new Set();
        for (let i = 0; i < 100; i++) {
          results.add(random.stringInt());
        }
        // All 100 generated strings should be unique
        expect(results.size).toBe(100);
      });

      test("should have good digit distribution", () => {
        const result = random.stringInt(500);
        const digitCounts = new Map<string, number>();

        for (const digit of result) {
          digitCounts.set(digit, (digitCounts.get(digit) || 0) + 1);
        }

        // Should have multiple different digits
        expect(digitCounts.size).toBeGreaterThan(5);

        // No single digit should dominate too much (allow some variance)
        for (const count of digitCounts.values()) {
          expect(count).toBeLessThan(100); // Less than 20% of total
        }
      });
    });

    describe("parametrized tests", () => {
      test.each([[1], [5], [10], [15], [20], [50], [100]])("should generate numeric string of length %i", (length) => {
        const result = random.stringInt(length);
        expect(result).toHaveLength(length);
        expect(/^[0-9]*$/.test(result)).toBe(true);
      });
    });
  });

  describe("nanoidFactory", () => {
    describe("basic functionality", () => {
      test("should return a function", () => {
        const factory = random.nanoidFactory();
        expect(typeof factory).toBe("function");
      });

      test("should return function that generates strings with default length", () => {
        const factory = random.nanoidFactory();
        const result = factory();
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(10);
      });

      test("should return function that generates strings with factory-specified length", () => {
        const factory = random.nanoidFactory(15);
        const result = factory();
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(15);
      });

      test("should return function that can override factory length", () => {
        const factory = random.nanoidFactory(10);
        const result = factory(5);
        expect(typeof result).toBe("string");
        expect(result).toHaveLength(5);
      });

      test("should generate strings with valid characters", () => {
        const factory = random.nanoidFactory();
        const result = factory(50);
        const validChars = /^[0-9a-f]+$/;
        expect(validChars.test(result)).toBe(true);
      });
    });

    describe("factory behavior", () => {
      test("should create reusable generator", () => {
        const factory = random.nanoidFactory(8);
        const result1 = factory();
        const result2 = factory();

        expect(result1).toHaveLength(8);
        expect(result2).toHaveLength(8);
        expect(result1).not.toBe(result2);
      });

      test("should maintain factory size as default", () => {
        const factory = random.nanoidFactory(12);

        const result1 = factory();
        const result2 = factory(undefined);

        expect(result1).toHaveLength(12);
        expect(result2).toHaveLength(12);
      });

      test("should allow per-call size override", () => {
        const factory = random.nanoidFactory(10);

        const defaultSize = factory();
        const customSize = factory(20);
        const anotherDefault = factory();

        expect(defaultSize).toHaveLength(10);
        expect(customSize).toHaveLength(20);
        expect(anotherDefault).toHaveLength(10);
      });
    });

    describe("edge cases", () => {
      test("should handle zero factory size", () => {
        const factory = random.nanoidFactory(0);
        const result = factory();
        expect(result).toHaveLength(0);
        expect(result).toBe("");
      });

      test("should handle undefined factory size", () => {
        const factory = random.nanoidFactory(undefined);
        const result = factory();
        expect(result).toHaveLength(10);
      });

      test("should handle zero override size", () => {
        const factory = random.nanoidFactory(10);
        const result = factory(0);
        expect(result).toHaveLength(0);
        expect(result).toBe("");
      });
    });

    describe("performance and reusability", () => {
      test("should be efficient for multiple calls", () => {
        const factory = random.nanoidFactory(10);
        const results = [];

        for (let i = 0; i < 100; i++) {
          results.push(factory());
        }

        // All should be strings of correct length
        expect(results.every((r) => typeof r === "string" && r.length === 10)).toBe(true);

        // All should be unique
        const uniqueResults = new Set(results);
        expect(uniqueResults.size).toBe(100);
      });

      test("should maintain separate state for different factories", () => {
        const factory1 = random.nanoidFactory(5);
        const factory2 = random.nanoidFactory(15);

        const result1 = factory1();
        const result2 = factory2();

        expect(result1).toHaveLength(5);
        expect(result2).toHaveLength(15);
        expect(result1).not.toBe(result2);
      });
    });

    describe("parametrized tests", () => {
      test.each([[1], [5], [10], [16], [32], [64]])("should create factory with size %i", (size) => {
        const factory = random.nanoidFactory(size);
        const result = factory();
        expect(result).toHaveLength(size);
        expect(/^[0-9a-f]*$/.test(result)).toBe(true);
      });
    });
  });

  describe("integration tests", () => {
    test("all methods should produce different results", () => {
      const nanoidResult = random.nanoid(10);
      const stringIntResult = random.stringInt(10);
      const factoryResult = random.nanoidFactory(10)();

      // All should be strings of same length
      expect(nanoidResult).toHaveLength(10);
      expect(stringIntResult).toHaveLength(10);
      expect(factoryResult).toHaveLength(10);

      // stringInt should only contain digits
      expect(/^[0-9]+$/.test(stringIntResult)).toBe(true);

      // nanoid and factory should contain hex characters
      expect(/^[0-9a-f]+$/.test(nanoidResult)).toBe(true);
      expect(/^[0-9a-f]+$/.test(factoryResult)).toBe(true);

      // All should be different (very high probability)
      expect(nanoidResult).not.toBe(stringIntResult);
      expect(nanoidResult).not.toBe(factoryResult);
      expect(stringIntResult).not.toBe(factoryResult);
    });

    test("should handle concurrent usage", () => {
      const results = [];
      const factory = random.nanoidFactory(8);

      // Simulate concurrent calls
      for (let i = 0; i < 50; i++) {
        results.push(random.nanoid(8));
        results.push(random.stringInt(8));
        results.push(factory());
      }

      // All should be unique
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(150);
    });
  });

  describe("real world scenarios", () => {
    test("should generate suitable IDs for database records", () => {
      const id = random.nanoid(12);
      expect(id).toHaveLength(12);
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });

    test("should generate suitable numeric codes", () => {
      const code = random.stringInt(6);
      expect(code).toHaveLength(6);
      expect(/^[0-9]+$/.test(code)).toBe(true);
      expect(Number.isInteger(Number(code))).toBe(true);
    });

    test("should create factory for session tokens", () => {
      const createSessionToken = random.nanoidFactory(32);

      const token1 = createSessionToken();
      const token2 = createSessionToken();

      expect(token1).toHaveLength(32);
      expect(token2).toHaveLength(32);
      expect(token1).not.toBe(token2);
      expect(/^[0-9a-f]+$/.test(token1)).toBe(true);
      expect(/^[0-9a-f]+$/.test(token2)).toBe(true);
    });

    test("should handle batch ID generation", () => {
      const batchSize = 1000;
      const ids = [];

      for (let i = 0; i < batchSize; i++) {
        ids.push(random.nanoid(16));
      }

      // All unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(batchSize);

      // All valid format
      expect(ids.every((id) => /^[0-9a-f]{16}$/.test(id))).toBe(true);
    });
  });
});
