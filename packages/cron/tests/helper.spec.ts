import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { convertToCrontab } from "@/helper";
import type { CronTimeType } from "@/types";

describe("convertToCrontab", () => {
  describe("every prefix - recurring executions", () => {
    describe("minutes", () => {
      test("should handle 'every 1 minutes'", () => {
        expect(convertToCrontab("every 1 minutes")).toBe("* * * * *");
      });

      test("should handle 'every 5 minutes'", () => {
        expect(convertToCrontab("every 5 minutes")).toBe("*/5 * * * *");
      });

      test("should handle 'every 15 minutes'", () => {
        expect(convertToCrontab("every 15 minutes")).toBe("*/15 * * * *");
      });

      test("should handle 'every 30 minutes'", () => {
        expect(convertToCrontab("every 30 minutes")).toBe("*/30 * * * *");
      });

      test("should handle non-divisible minutes", () => {
        expect(convertToCrontab("every 7 minutes")).toBe("*/7 * * * *");
      });
    });

    describe("hours", () => {
      test("should handle 'every 1 hours'", () => {
        expect(convertToCrontab("every 1 hours")).toBe("0 * * * *");
      });

      test("should handle 'every 2 hours'", () => {
        expect(convertToCrontab("every 2 hours")).toBe("0 */2 * * *");
      });

      test("should handle 'every 6 hours'", () => {
        expect(convertToCrontab("every 6 hours")).toBe("0 */6 * * *");
      });

      test("should handle 'every 12 hours'", () => {
        expect(convertToCrontab("every 12 hours")).toBe("0 */12 * * *");
      });

      test("should handle non-divisible hours", () => {
        expect(convertToCrontab("every 5 hours")).toBe("0 */5 * * *");
      });
    });

    describe("days", () => {
      test("should handle 'every 1 days'", () => {
        expect(convertToCrontab("every 1 days")).toBe("0 0 * * *");
      });

      test("should handle 'every 3 days'", () => {
        expect(convertToCrontab("every 3 days")).toBe("0 0 */3 * *");
      });

      test("should handle 'every 7 days'", () => {
        expect(convertToCrontab("every 7 days")).toBe("0 0 */7 * *");
      });
    });

    describe("months", () => {
      test("should handle 'every 1 months'", () => {
        expect(convertToCrontab("every 1 months")).toBe("0 0 1 * *");
      });

      test("should handle 'every 3 months'", () => {
        expect(convertToCrontab("every 3 months")).toBe("0 0 1 */3 *");
      });

      test("should handle 'every 6 months'", () => {
        expect(convertToCrontab("every 6 months")).toBe("0 0 1 */6 *");
      });
    });

    describe("years", () => {
      test("should handle 'every 1 years'", () => {
        expect(convertToCrontab("every 1 years")).toBe("0 0 1 1 *");
      });

      test("should handle 'every 2 years'", () => {
        // Note: Crontab can't handle multi-year intervals directly
        expect(convertToCrontab("every 2 years")).toBe("0 0 1 1 *");
      });
    });

    describe("seconds", () => {
      test("should handle 'every 1 seconds'", () => {
        expect(convertToCrontab("every 1 seconds")).toBe("* * * * * *");
      });

      test("should handle 'every 30 seconds'", () => {
        expect(convertToCrontab("every 30 seconds")).toBe("*/30 * * * * *");
      });

      test("should handle 'every 5 seconds'", () => {
        expect(convertToCrontab("every 5 seconds")).toBe("*/5 * * * * *");
      });
    });
  });

  describe("in prefix - one-time executions", () => {
    // Mock a specific date for consistent testing
    const mockDate = new Date("2024-01-15T10:30:45.000Z");
    let originalDateNow: typeof Date.now;

    beforeEach(() => {
      // Mock Date constructor and Date.now()
      originalDateNow = Date.now;
      Date.now = () => mockDate.getTime();

      // Mock the Date constructor
      const OriginalDate = global.Date;
      global.Date = class MockDate extends OriginalDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super(mockDate.getTime());
          } else {
            super(args[0] as string | number | Date);
          }
        }
      } as DateConstructor;

      // Copy static methods
      Object.setPrototypeOf(global.Date, OriginalDate);
      global.Date.now = () => mockDate.getTime();
    });

    afterEach(() => {
      Date.now = originalDateNow;
    });

    describe("seconds", () => {
      test("should handle 'in 30 seconds'", () => {
        const result = convertToCrontab("in 30 seconds");
        // Should be 30 seconds from the mocked time (10:31:15)
        expect(result).toBe("31 10 15 1 *");
      });

      test("should handle 'in 45 seconds'", () => {
        const result = convertToCrontab("in 45 seconds");
        // Should be 45 seconds from the mocked time (10:31:30)
        expect(result).toBe("31 10 15 1 *");
      });
    });

    describe("minutes", () => {
      test("should handle 'in 15 minutes'", () => {
        const result = convertToCrontab("in 15 minutes");
        // Should be 15 minutes from the mocked time (10:45:45)
        expect(result).toBe("45 10 15 1 *");
      });

      test("should handle 'in 30 minutes'", () => {
        const result = convertToCrontab("in 30 minutes");
        // Should be 30 minutes from the mocked time (11:00:45)
        expect(result).toBe("0 11 15 1 *");
      });
    });

    describe("hours", () => {
      test("should handle 'in 2 hours'", () => {
        const result = convertToCrontab("in 2 hours");
        // Should be 2 hours from the mocked time (12:30:45)
        expect(result).toBe("30 12 15 1 *");
      });

      test("should handle 'in 5 hours'", () => {
        const result = convertToCrontab("in 5 hours");
        // Should be 5 hours from the mocked time (15:30:45)
        expect(result).toBe("30 15 15 1 *");
      });
    });

    describe("days", () => {
      test("should handle 'in 1 days'", () => {
        const result = convertToCrontab("in 1 days");
        // Should be 1 day from the mocked time (Jan 16th, 10:30:45)
        expect(result).toBe("30 10 16 1 *");
      });

      test("should handle 'in 7 days'", () => {
        const result = convertToCrontab("in 7 days");
        // Should be 7 days from the mocked time (Jan 22nd, 10:30:45)
        expect(result).toBe("30 10 22 1 *");
      });
    });

    describe("months", () => {
      test("should handle 'in 1 months'", () => {
        const result = convertToCrontab("in 1 months");
        // Should be 1 month from the mocked time (February 15th)
        expect(result).toBe("30 10 15 2 *");
      });

      test("should handle 'in 3 months'", () => {
        const result = convertToCrontab("in 3 months");
        // Should be 3 months from the mocked time (April 15th)
        expect(result).toBe("30 10 15 4 *");
      });
    });

    describe("years", () => {
      test("should handle 'in 1 years'", () => {
        const result = convertToCrontab("in 1 years");
        // Should be 1 year from the mocked time (2025-01-15)
        expect(result).toBe("30 10 15 1 *");
      });

      test("should handle 'in 2 years'", () => {
        const result = convertToCrontab("in 2 years");
        // Should be 2 years from the mocked time (2026-01-15)
        expect(result).toBe("30 10 15 1 *");
      });
    });
  });

  describe("edge cases and error handling", () => {
    test("should throw error for invalid format", () => {
      expect(() => convertToCrontab("invalid format" as CronTimeType)).toThrow(
        "Invalid CronTimeType format: invalid format",
      );
    });

    test("should handle large numbers", () => {
      expect(convertToCrontab("every 100 minutes")).toBe("*/100 * * * *");
    });

    test("should handle single digit numbers", () => {
      expect(convertToCrontab("every 1 minutes")).toBe("* * * * *");
      expect(convertToCrontab("every 2 minutes")).toBe("*/2 * * * *");
    });

    test("should handle edge case with 60 minutes", () => {
      expect(convertToCrontab("every 60 minutes")).toBe("*/60 * * * *");
    });

    test("should handle 24 hours", () => {
      expect(convertToCrontab("every 24 hours")).toBe("0 */24 * * *");
    });
  });

  describe("real-world scenarios", () => {
    test("should handle common cron patterns", () => {
      // Every minute
      expect(convertToCrontab("every 1 minutes")).toBe("* * * * *");

      // Every 5 minutes
      expect(convertToCrontab("every 5 minutes")).toBe("*/5 * * * *");

      // Every hour
      expect(convertToCrontab("every 1 hours")).toBe("0 * * * *");

      // Every day at midnight
      expect(convertToCrontab("every 1 days")).toBe("0 0 * * *");

      // Every month on the 1st
      expect(convertToCrontab("every 1 months")).toBe("0 0 1 * *");

      // Every year on January 1st
      expect(convertToCrontab("every 1 years")).toBe("0 0 1 1 *");
    });

    test("should handle typical backup scenarios", () => {
      // Daily backup at midnight
      expect(convertToCrontab("every 1 days")).toBe("0 0 * * *");

      // Weekly backup
      expect(convertToCrontab("every 7 days")).toBe("0 0 */7 * *");

      // Hourly cleanup
      expect(convertToCrontab("every 1 hours")).toBe("0 * * * *");
    });
  });

  describe("crontab format validation", () => {
    test("should produce valid 5-field crontab format for 'every' patterns", () => {
      const patterns: CronTimeType[] = [
        "every 5 minutes",
        "every 2 hours",
        "every 1 days",
        "every 1 months",
        "every 1 years",
      ];

      patterns.forEach((pattern) => {
        const result = convertToCrontab(pattern);
        const fields = result.split(" ");
        expect(fields).toHaveLength(5);
        expect(fields[4]).toBe("*"); // Day of week should be *
      });
    });

    test("should produce valid 5-field crontab format for 'in' patterns", () => {
      const mockDate = new Date("2024-01-15T10:30:45.000Z");
      const originalDateNow = Date.now;
      Date.now = () => mockDate.getTime();

      const patterns: CronTimeType[] = ["in 30 seconds", "in 15 minutes", "in 2 hours", "in 1 days"];

      patterns.forEach((pattern) => {
        const result = convertToCrontab(pattern);
        const fields = result.split(" ");
        expect(fields).toHaveLength(5);
        expect(fields[4]).toBe("*"); // Day of week should be *
      });

      Date.now = originalDateNow;
    });
  });
});
