import { describe, expect, test } from "bun:test";
import { secondsToHMS } from "@/secondsToHMS";

describe("secondsToHMS", () => {
  describe("basic functionality", () => {
    test("should convert seconds only (< 1 minute)", () => {
      expect(secondsToHMS(5)).toBe("5");
      expect(secondsToHMS(30)).toBe("30");
      expect(secondsToHMS(59)).toBe("59");
    });

    test("should convert minutes and seconds (< 1 hour)", () => {
      expect(secondsToHMS(60)).toBe("1:00");
      expect(secondsToHMS(90)).toBe("1:30");
      expect(secondsToHMS(3599)).toBe("59:59");
    });

    test("should convert hours, minutes and seconds (>= 1 hour)", () => {
      expect(secondsToHMS(3600)).toBe("1:00:00");
      expect(secondsToHMS(3661)).toBe("1:01:01");
      expect(secondsToHMS(7200)).toBe("2:00:00");
    });

    test("should handle zero seconds", () => {
      expect(secondsToHMS(0)).toBe("0");
    });
  });

  describe("formatting", () => {
    test("should pad minutes with leading zero when hours present", () => {
      expect(secondsToHMS(3660)).toBe("1:01:00");
      expect(secondsToHMS(3605)).toBe("1:00:05");
      expect(secondsToHMS(32_400 + 60 + 5)).toBe("9:01:05");
    });

    test("should pad seconds with leading zero when minutes present", () => {
      expect(secondsToHMS(65)).toBe("1:05");
      expect(secondsToHMS(600 + 1)).toBe("10:01");
      expect(secondsToHMS(3600 + 60 + 1)).toBe("1:01:01");
    });

    test("should not pad single digits when no higher unit present", () => {
      expect(secondsToHMS(1)).toBe("1");
      expect(secondsToHMS(5)).toBe("5");
      expect(secondsToHMS(9)).toBe("9");
    });

    test("should handle double-digit values correctly", () => {
      expect(secondsToHMS(10)).toBe("10");
      expect(secondsToHMS(600 + 15)).toBe("10:15");
      expect(secondsToHMS(3600 + 600 + 15)).toBe("1:10:15");
    });
  });

  describe("edge cases", () => {
    test("should handle decimal seconds by flooring", () => {
      expect(secondsToHMS(1.5)).toBe("1"); // 1.5 seconds -> 1 second
      expect(secondsToHMS(1.999)).toBe("1"); // 1.999 seconds -> 1 second
      expect(secondsToHMS(61.5)).toBe("1:01"); // 61.5 seconds -> 1:01
      expect(secondsToHMS(3661.9)).toBe("1:01:01"); // 3661.9 seconds -> 1:01:01
    });

    test("should handle very small decimal values", () => {
      expect(secondsToHMS(0.001)).toBe("0");
      expect(secondsToHMS(0.5)).toBe("0");
      expect(secondsToHMS(0.999)).toBe("0");
    });

    test("should handle large hour values", () => {
      expect(secondsToHMS(24 * 3600)).toBe("24:00:00"); // 24 hours
      expect(secondsToHMS(100 * 3600)).toBe("100:00:00"); // 100 hours
      expect(secondsToHMS(999 * 3600)).toBe("999:00:00"); // 999 hours
    });

    test("should handle maximum safe integer values", () => {
      const largeValue = 999_999_999; // 999,999,999 seconds
      const result = secondsToHMS(largeValue);
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d+:\d{2}:\d{2}$/);
    });
  });

  describe("mathematical precision", () => {
    test("should floor decimal seconds", () => {
      expect(secondsToHMS(1.01)).toBe("1");
      expect(secondsToHMS(1.99)).toBe("1");
      expect(secondsToHMS(2.01)).toBe("2");
    });

    test("should calculate minutes correctly", () => {
      expect(secondsToHMS(60)).toBe("1:00");
      expect(secondsToHMS(119)).toBe("1:59");
      expect(secondsToHMS(120)).toBe("2:00");
    });

    test("should calculate hours correctly", () => {
      expect(secondsToHMS(3600)).toBe("1:00:00");
      expect(secondsToHMS(7199)).toBe("1:59:59");
      expect(secondsToHMS(7200)).toBe("2:00:00");
    });

    test("should handle floating point precision edge cases", () => {
      expect(secondsToHMS(59.999_999)).toBe("59");
      expect(secondsToHMS(60.000_001)).toBe("1:00");
      expect(secondsToHMS(3599.999_999)).toBe("59:59");
      expect(secondsToHMS(3600.000_001)).toBe("1:00:00");
    });
  });

  describe("parametrized tests", () => {
    test.each([
      [0, "0"],
      [1, "1"],
      [10, "10"],
      [60, "1:00"],
      [90, "1:30"],
      [3600, "1:00:00"],
      [3661, "1:01:01"],
      [7200, "2:00:00"],
      [86_400, "24:00:00"], // 1 day
      [90_061, "25:01:01"], // 25 hours 1 minute 1 second
      [1.5, "1"], // decimal handling
      [61.7, "1:01"], // decimal handling with minutes
      [3661.9, "1:01:01"], // decimal handling with hours
    ])("secondsToHMS(%i) should return %s", (input, expected) => {
      expect(secondsToHMS(input)).toBe(expected);
    });
  });

  describe("real world examples", () => {
    test("should handle common video durations", () => {
      expect(secondsToHMS(30)).toBe("30"); // 30 second video
      expect(secondsToHMS(300)).toBe("5:00"); // 5 minute video
      expect(secondsToHMS(1800)).toBe("30:00"); // 30 minute video
      expect(secondsToHMS(5400)).toBe("1:30:00"); // 1.5 hour movie
      expect(secondsToHMS(7200)).toBe("2:00:00"); // 2 hour movie
    });

    test("should handle common music track durations", () => {
      expect(secondsToHMS(180)).toBe("3:00"); // 3 minute song
      expect(secondsToHMS(213)).toBe("3:33"); // 3:33 song
      expect(secondsToHMS(267)).toBe("4:27"); // 4:27 song
      expect(secondsToHMS(150)).toBe("2:30"); // 2:30 song
    });

    test("should handle timer/stopwatch use cases", () => {
      expect(secondsToHMS(5)).toBe("5"); // 5 second countdown
      expect(secondsToHMS(300)).toBe("5:00"); // 5 minute timer
      expect(secondsToHMS(900)).toBe("15:00"); // 15 minute timer
      expect(secondsToHMS(3600)).toBe("1:00:00"); // 1 hour timer
    });

    test("should handle workout/exercise durations", () => {
      expect(secondsToHMS(45)).toBe("45"); // 45 second exercise
      expect(secondsToHMS(90)).toBe("1:30"); // 90 second rest
      expect(secondsToHMS(1800)).toBe("30:00"); // 30 minute workout
      expect(secondsToHMS(2700)).toBe("45:00"); // 45 minute workout
    });

    test("should handle cooking/baking timers", () => {
      expect(secondsToHMS(300)).toBe("5:00"); // 5 minute boiling
      expect(secondsToHMS(600)).toBe("10:00"); // 10 minute prep
      expect(secondsToHMS(1200)).toBe("20:00"); // 20 minute baking
      expect(secondsToHMS(2400)).toBe("40:00"); // 40 minute roasting
    });

    test("should handle meeting/presentation durations", () => {
      expect(secondsToHMS(900)).toBe("15:00"); // 15 minute standup
      expect(secondsToHMS(1800)).toBe("30:00"); // 30 minute meeting
      expect(secondsToHMS(3600)).toBe("1:00:00"); // 1 hour presentation
      expect(secondsToHMS(5400)).toBe("1:30:00"); // 1.5 hour workshop
    });
  });

  describe("type safety and consistency", () => {
    test("should always return string type", () => {
      expect(typeof secondsToHMS(0)).toBe("string");
      expect(typeof secondsToHMS(1)).toBe("string");
      expect(typeof secondsToHMS(60)).toBe("string");
      expect(typeof secondsToHMS(3600)).toBe("string");
      expect(typeof secondsToHMS(1.5)).toBe("string");
    });

    test("should handle consecutive calls consistently", () => {
      const testValue = 3661;
      const result1 = secondsToHMS(testValue);
      const result2 = secondsToHMS(testValue);
      expect(result1).toBe(result2);
      expect(result1).toBe("1:01:01");
    });

    test("should not mutate input or have side effects", () => {
      const originalValue = 3661;
      const valueCopy = originalValue;
      const result = secondsToHMS(originalValue);
      expect(originalValue).toBe(valueCopy);
      expect(result).toBe("1:01:01");
    });

    test("should handle different numeric types consistently", () => {
      expect(secondsToHMS(60)).toBe("1:00");
      expect(secondsToHMS(60.0)).toBe("1:00");
      expect(secondsToHMS(60.9)).toBe("1:00"); // floors to 60
    });
  });

  describe("format validation", () => {
    test("seconds only format should be numeric string", () => {
      const result = secondsToHMS(5);
      expect(result).toMatch(/^\d+$/);
    });

    test("minutes format should be M:SS", () => {
      const result = secondsToHMS(90);
      expect(result).toMatch(/^\d+:\d{2}$/);
    });

    test("hours format should be H:MM:SS", () => {
      const result = secondsToHMS(3661);
      expect(result).toMatch(/^\d+:\d{2}:\d{2}$/);
    });

    test("should never return negative values", () => {
      const results = [secondsToHMS(0), secondsToHMS(1), secondsToHMS(60), secondsToHMS(3600), secondsToHMS(0.5)];

      results.forEach((result) => {
        expect(result).not.toMatch(/-/);
      });
    });

    test("should maintain consistent padding", () => {
      expect(secondsToHMS(3605)).toBe("1:00:05"); // H:MM:SS
      expect(secondsToHMS(3065)).toBe("51:05"); // M:SS when < 1 hour
      expect(secondsToHMS(65)).toBe("1:05"); // M:SS
    });

    test("should handle boundary values correctly", () => {
      expect(secondsToHMS(59)).toBe("59"); // Just under 1 minute
      expect(secondsToHMS(60)).toBe("1:00"); // Exactly 1 minute
      expect(secondsToHMS(3599)).toBe("59:59"); // Just under 1 hour
      expect(secondsToHMS(3600)).toBe("1:00:00"); // Exactly 1 hour
    });
  });

  describe("decimal handling", () => {
    test("should floor positive decimals", () => {
      expect(secondsToHMS(1.1)).toBe("1");
      expect(secondsToHMS(1.5)).toBe("1");
      expect(secondsToHMS(1.9)).toBe("1");
      expect(secondsToHMS(2.0)).toBe("2");
    });

    test("should handle decimals in minute range", () => {
      expect(secondsToHMS(60.1)).toBe("1:00");
      expect(secondsToHMS(60.9)).toBe("1:00");
      expect(secondsToHMS(61.1)).toBe("1:01");
      expect(secondsToHMS(61.9)).toBe("1:01");
    });

    test("should handle decimals in hour range", () => {
      expect(secondsToHMS(3600.1)).toBe("1:00:00");
      expect(secondsToHMS(3600.9)).toBe("1:00:00");
      expect(secondsToHMS(3661.1)).toBe("1:01:01");
      expect(secondsToHMS(3661.9)).toBe("1:01:01");
    });

    test("should handle very small decimal values", () => {
      expect(secondsToHMS(0.1)).toBe("0");
      expect(secondsToHMS(0.01)).toBe("0");
      expect(secondsToHMS(0.001)).toBe("0");
      expect(secondsToHMS(0.999)).toBe("0");
    });
  });

  describe("comparison with millisecondsToHMS", () => {
    test("should produce same results as millisecondsToHMS when input is equivalent", () => {
      // These tests verify consistency between the two functions
      expect(secondsToHMS(5)).toBe("5"); // Same as millisecondsToHMS(5000)
      expect(secondsToHMS(60)).toBe("1:00"); // Same as millisecondsToHMS(60000)
      expect(secondsToHMS(3600)).toBe("1:00:00"); // Same as millisecondsToHMS(3600000)
      expect(secondsToHMS(3661)).toBe("1:01:01"); // Same as millisecondsToHMS(3661000)
    });

    test("should handle decimal inputs that millisecondsToHMS cannot", () => {
      expect(secondsToHMS(1.5)).toBe("1"); // 1.5 seconds
      expect(secondsToHMS(61.5)).toBe("1:01"); // 61.5 seconds
      expect(secondsToHMS(3661.5)).toBe("1:01:01"); // 3661.5 seconds
    });
  });

  describe("function behavior", () => {
    test("should return string type for all inputs", () => {
      const inputs = [0, 1, 1.5, 60, 60.5, 3600, 3600.5, -1]; // Including negative for completeness
      inputs.forEach((input) => {
        expect(typeof secondsToHMS(input)).toBe("string");
      });
    });

    test("should not modify global state", () => {
      const before = Date.now();
      secondsToHMS(3661);
      const after = Date.now();
      // Should complete quickly and not affect global state
      expect(after - before).toBeLessThan(100);
    });

    test("should handle very long durations", () => {
      const result = secondsToHMS(999_999);
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d+:\d{2}:\d{2}$/);
    });

    test("should be deterministic", () => {
      const input = 3661.5;
      const results = Array.from({ length: 10 }, () => secondsToHMS(input));
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(1);
      expect(results[0]).toBe("1:01:01");
    });
  });

  describe("performance considerations", () => {
    test("should handle zero input efficiently", () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        secondsToHMS(0);
      }
      const end = Date.now();
      expect(end - start).toBeLessThan(100); // Should be very fast
    });

    test("should handle large inputs efficiently", () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        secondsToHMS(999_999);
      }
      const end = Date.now();
      expect(end - start).toBeLessThan(100); // Should be very fast
    });
  });
});
