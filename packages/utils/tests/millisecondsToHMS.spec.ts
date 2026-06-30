import { describe, expect, test } from "bun:test";
import { millisecondsToHMS } from "@/millisecondsToHMS";

describe("millisecondsToHMS", () => {
  describe("basic functionality", () => {
    test("should convert seconds only (< 1 minute)", () => {
      expect(millisecondsToHMS(5000)).toBe("5");
      expect(millisecondsToHMS(30_000)).toBe("30");
      expect(millisecondsToHMS(59_000)).toBe("59");
    });

    test("should convert minutes and seconds (< 1 hour)", () => {
      expect(millisecondsToHMS(60_000)).toBe("1:00");
      expect(millisecondsToHMS(90_000)).toBe("1:30");
      expect(millisecondsToHMS(3_599_000)).toBe("59:59");
    });

    test("should convert hours, minutes and seconds (>= 1 hour)", () => {
      expect(millisecondsToHMS(3_600_000)).toBe("1:00:00");
      expect(millisecondsToHMS(3_661_000)).toBe("1:01:01");
      expect(millisecondsToHMS(7_200_000)).toBe("2:00:00");
    });

    test("should handle zero milliseconds", () => {
      expect(millisecondsToHMS(0)).toBe("0");
    });
  });

  describe("formatting", () => {
    test("should pad minutes with leading zero when hours present", () => {
      expect(millisecondsToHMS(3_660_000)).toBe("1:01:00");
      expect(millisecondsToHMS(3_605_000)).toBe("1:00:05");
      expect(millisecondsToHMS(32_400_000 + 60_000 + 5000)).toBe("9:01:05");
    });

    test("should pad seconds with leading zero when minutes present", () => {
      expect(millisecondsToHMS(65_000)).toBe("1:05");
      expect(millisecondsToHMS(600_000 + 1000)).toBe("10:01");
      expect(millisecondsToHMS(3_600_000 + 60_000 + 1000)).toBe("1:01:01");
    });

    test("should not pad single digits when no higher unit present", () => {
      expect(millisecondsToHMS(1000)).toBe("1");
      expect(millisecondsToHMS(5000)).toBe("5");
      expect(millisecondsToHMS(9000)).toBe("9");
    });

    test("should handle double-digit values correctly", () => {
      expect(millisecondsToHMS(10_000)).toBe("10");
      expect(millisecondsToHMS(600_000 + 15_000)).toBe("10:15");
      expect(millisecondsToHMS(3_600_000 + 600_000 + 15_000)).toBe("1:10:15");
    });
  });

  describe("edge cases", () => {
    test("should handle milliseconds that don't divide evenly", () => {
      expect(millisecondsToHMS(1500)).toBe("1"); // 1.5 seconds -> 1 second
      expect(millisecondsToHMS(1999)).toBe("1"); // 1.999 seconds -> 1 second
      expect(millisecondsToHMS(61_500)).toBe("1:01"); // 61.5 seconds -> 1:01
    });

    test("should handle very small millisecond values", () => {
      expect(millisecondsToHMS(1)).toBe("0");
      expect(millisecondsToHMS(500)).toBe("0");
      expect(millisecondsToHMS(999)).toBe("0");
    });

    test("should handle large hour values", () => {
      expect(millisecondsToHMS(24 * 3_600_000)).toBe("24:00:00"); // 24 hours
      expect(millisecondsToHMS(100 * 3_600_000)).toBe("100:00:00"); // 100 hours
      expect(millisecondsToHMS(999 * 3_600_000)).toBe("999:00:00"); // 999 hours
    });

    test("should handle maximum safe integer values", () => {
      const largeValue = 999_999_999_000; // 999,999,999 seconds
      const result = millisecondsToHMS(largeValue);
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d+:\d{2}:\d{2}$/);
    });
  });

  describe("mathematical precision", () => {
    test("should floor milliseconds to seconds", () => {
      expect(millisecondsToHMS(1001)).toBe("1");
      expect(millisecondsToHMS(1999)).toBe("1");
      expect(millisecondsToHMS(2001)).toBe("2");
    });

    test("should calculate minutes correctly", () => {
      expect(millisecondsToHMS(60_000)).toBe("1:00");
      expect(millisecondsToHMS(119_000)).toBe("1:59");
      expect(millisecondsToHMS(120_000)).toBe("2:00");
    });

    test("should calculate hours correctly", () => {
      expect(millisecondsToHMS(3_600_000)).toBe("1:00:00");
      expect(millisecondsToHMS(7_199_000)).toBe("1:59:59");
      expect(millisecondsToHMS(7_200_000)).toBe("2:00:00");
    });
  });

  describe("parametrized tests", () => {
    test.each([
      [0, "0"],
      [1000, "1"],
      [10_000, "10"],
      [60_000, "1:00"],
      [90_000, "1:30"],
      [3_600_000, "1:00:00"],
      [3_661_000, "1:01:01"],
      [7_200_000, "2:00:00"],
      [86_400_000, "24:00:00"], // 1 day
      [90_061_000, "25:01:01"], // 25 hours 1 minute 1 second
    ])("millisecondsToHMS(%i) should return %s", (input, expected) => {
      expect(millisecondsToHMS(input)).toBe(expected);
    });
  });

  describe("real world examples", () => {
    test("should handle common video durations", () => {
      expect(millisecondsToHMS(30_000)).toBe("30"); // 30 second video
      expect(millisecondsToHMS(300_000)).toBe("5:00"); // 5 minute video
      expect(millisecondsToHMS(1_800_000)).toBe("30:00"); // 30 minute video
      expect(millisecondsToHMS(5_400_000)).toBe("1:30:00"); // 1.5 hour movie
      expect(millisecondsToHMS(7_200_000)).toBe("2:00:00"); // 2 hour movie
    });

    test("should handle common music track durations", () => {
      expect(millisecondsToHMS(180_000)).toBe("3:00"); // 3 minute song
      expect(millisecondsToHMS(213_000)).toBe("3:33"); // 3:33 song
      expect(millisecondsToHMS(267_000)).toBe("4:27"); // 4:27 song
    });

    test("should handle timer/stopwatch use cases", () => {
      expect(millisecondsToHMS(5000)).toBe("5"); // 5 second countdown
      expect(millisecondsToHMS(300_000)).toBe("5:00"); // 5 minute timer
      expect(millisecondsToHMS(900_000)).toBe("15:00"); // 15 minute timer
      expect(millisecondsToHMS(3_600_000)).toBe("1:00:00"); // 1 hour timer
    });

    test("should handle workout/exercise durations", () => {
      expect(millisecondsToHMS(45_000)).toBe("45"); // 45 second exercise
      expect(millisecondsToHMS(90_000)).toBe("1:30"); // 90 second rest
      expect(millisecondsToHMS(1_800_000)).toBe("30:00"); // 30 minute workout
    });
  });

  describe("type safety and consistency", () => {
    test("should always return string type", () => {
      expect(typeof millisecondsToHMS(0)).toBe("string");
      expect(typeof millisecondsToHMS(1000)).toBe("string");
      expect(typeof millisecondsToHMS(3_600_000)).toBe("string");
    });

    test("should handle consecutive calls consistently", () => {
      const testValue = 3_661_000;
      const result1 = millisecondsToHMS(testValue);
      const result2 = millisecondsToHMS(testValue);
      expect(result1).toBe(result2);
      expect(result1).toBe("1:01:01");
    });

    test("should not mutate input or have side effects", () => {
      const originalValue = 3_661_000;
      const valueCopy = originalValue;
      const result = millisecondsToHMS(originalValue);
      expect(originalValue).toBe(valueCopy);
      expect(result).toBe("1:01:01");
    });
  });

  describe("format validation", () => {
    test("seconds only format should be numeric string", () => {
      const result = millisecondsToHMS(5000);
      expect(result).toMatch(/^\d+$/);
    });

    test("minutes format should be M:SS", () => {
      const result = millisecondsToHMS(90_000);
      expect(result).toMatch(/^\d+:\d{2}$/);
    });

    test("hours format should be H:MM:SS", () => {
      const result = millisecondsToHMS(3_661_000);
      expect(result).toMatch(/^\d+:\d{2}:\d{2}$/);
    });

    test("should never return negative values", () => {
      // Even though function doesn't handle negative input explicitly,
      // we test current behavior
      const results = [
        millisecondsToHMS(0),
        millisecondsToHMS(1000),
        millisecondsToHMS(60_000),
        millisecondsToHMS(3_600_000),
      ];

      results.forEach((result) => {
        expect(result).not.toMatch(/-/);
      });
    });

    test("should maintain consistent padding", () => {
      expect(millisecondsToHMS(3_605_000)).toBe("1:00:05"); // H:MM:SS
      expect(millisecondsToHMS(3_065_000)).toBe("51:05"); // M:SS when < 1 hour
      expect(millisecondsToHMS(65_000)).toBe("1:05"); // M:SS
    });
  });
});
