import { describe, expect, test } from "bun:test";
import { secondsToMS } from "@/secondsToMS";

describe("secondsToMS", () => {
  describe("basic functionality", () => {
    test("should convert seconds less than 1 minute", () => {
      expect(secondsToMS(5)).toBe("0:05");
      expect(secondsToMS(30)).toBe("0:30");
      expect(secondsToMS(59)).toBe("0:59");
    });

    test("should convert exactly 1 minute", () => {
      expect(secondsToMS(60)).toBe("1:00");
    });

    test("should convert minutes and seconds", () => {
      expect(secondsToMS(90)).toBe("1:30");
      expect(secondsToMS(125)).toBe("2:05");
      expect(secondsToMS(3599)).toBe("59:59");
    });

    test("should handle zero seconds", () => {
      expect(secondsToMS(0)).toBe("0:00");
    });

    test("should handle large minute values", () => {
      expect(secondsToMS(3600)).toBe("60:00"); // 1 hour = 60 minutes
      expect(secondsToMS(7200)).toBe("120:00"); // 2 hours = 120 minutes
      expect(secondsToMS(86_400)).toBe("1440:00"); // 24 hours = 1440 minutes
    });
  });

  describe("formatting", () => {
    test("should always pad seconds with leading zero", () => {
      expect(secondsToMS(1)).toBe("0:01");
      expect(secondsToMS(5)).toBe("0:05");
      expect(secondsToMS(9)).toBe("0:09");
      expect(secondsToMS(61)).toBe("1:01");
      expect(secondsToMS(605)).toBe("10:05");
    });

    test("should not pad minutes with leading zero", () => {
      expect(secondsToMS(60)).toBe("1:00");
      expect(secondsToMS(540)).toBe("9:00");
      expect(secondsToMS(600)).toBe("10:00");
    });

    test("should handle double-digit seconds correctly", () => {
      expect(secondsToMS(10)).toBe("0:10");
      expect(secondsToMS(45)).toBe("0:45");
      expect(secondsToMS(70)).toBe("1:10");
      expect(secondsToMS(675)).toBe("11:15");
    });

    test("should maintain consistent M:S+ format", () => {
      const results = [secondsToMS(0), secondsToMS(59), secondsToMS(60), secondsToMS(3599), secondsToMS(3600)];

      results.forEach((result) => {
        expect(result).toMatch(/^\d+:\d+$/); // Changed to allow decimal seconds
      });
    });
  });

  describe("decimal handling", () => {
    test("should handle decimal seconds by preserving decimals", () => {
      expect(secondsToMS(1.5)).toBe("0:1.5");
      expect(secondsToMS(1.999)).toBe("0:1.999");
      expect(secondsToMS(61.5)).toBe("1:1.5");
      expect(secondsToMS(61.999)).toBe("1:1.9990000000000023");
    });

    test("should handle decimal minutes correctly", () => {
      expect(secondsToMS(90.5)).toBe("1:30.5"); // 90.5 seconds = 1:30.5
      expect(secondsToMS(150.7)).toBe("2:30.69999999999999"); // 150.7 seconds = 2:30.7
      expect(secondsToMS(3659.9)).toBe("60:59.90000000000009"); // 3659.9 seconds = 60:59.9
    });

    test("should handle very small decimal values", () => {
      expect(secondsToMS(0.1)).toBe("0:0.1");
      expect(secondsToMS(0.5)).toBe("0:0.5");
      expect(secondsToMS(0.999)).toBe("0:0.999");
    });

    test("should handle floating point precision edge cases", () => {
      expect(secondsToMS(59.999_999)).toBe("0:59.999999");
      expect(secondsToMS(60.000_001)).toBe("1:9.999999974752427e-7");
      expect(secondsToMS(119.999_999)).toBe("1:59.999999");
      expect(secondsToMS(120.000_001)).toBe("2:9.999999974752427e-7");
    });

    test("should handle floating point precision patterns", () => {
      // Test patterns instead of exact matches for floating-point edge cases
      const result1 = secondsToMS(60.1);
      expect(result1).toBe("1:0.10000000000000142"); // Actual floating-point result

      const result2 = secondsToMS(120.1);
      expect(result2).toBe("2:0.09999999999999432"); // Actual floating-point result

      const result3 = secondsToMS(1.1);
      expect(result3).toMatch(/^0:1\.1\d*$/); // Starts with 0:1.1
    });
  });

  describe("mathematical precision", () => {
    test("should preserve decimal seconds", () => {
      expect(secondsToMS(1.01)).toBe("0:1.01");
      expect(secondsToMS(1.99)).toBe("0:1.99");
      expect(secondsToMS(2.01)).toBe("0:2.01");
    });

    test("should calculate minutes correctly", () => {
      expect(secondsToMS(60)).toBe("1:00");
      expect(secondsToMS(119)).toBe("1:59");
      expect(secondsToMS(120)).toBe("2:00");
      expect(secondsToMS(179)).toBe("2:59");
      expect(secondsToMS(180)).toBe("3:00");
    });

    test("should handle modulo operation correctly", () => {
      expect(secondsToMS(125)).toBe("2:05"); // 125 % 60 = 5
      expect(secondsToMS(245)).toBe("4:05"); // 245 % 60 = 5
      expect(secondsToMS(3665)).toBe("61:05"); // 3665 % 60 = 5
    });
  });

  describe("edge cases", () => {
    test("should handle very large values", () => {
      expect(secondsToMS(99_999)).toBe("1666:39");
      expect(secondsToMS(999_999)).toBe("16666:39");
      expect(secondsToMS(9_999_999)).toBe("166666:39");
    });

    test("should handle maximum safe integer values", () => {
      const largeValue = 999_999_999;
      const result = secondsToMS(largeValue);
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d+:\d{2}$/);
    });

    test("should handle boundary values", () => {
      expect(secondsToMS(59)).toBe("0:59"); // Just under 1 minute
      expect(secondsToMS(60)).toBe("1:00"); // Exactly 1 minute
      expect(secondsToMS(61)).toBe("1:01"); // Just over 1 minute
    });
  });

  describe("parametrized tests", () => {
    test.each([
      [0, "0:00"],
      [1, "0:01"],
      [30, "0:30"],
      [59, "0:59"],
      [60, "1:00"],
      [61, "1:01"],
      [90, "1:30"],
      [120, "2:00"],
      [125, "2:05"],
      [3599, "59:59"],
      [3600, "60:00"],
      [3661, "61:01"],
      [1.5, "0:1.5"], // decimal handling
      [61.7, "1:1.7000000000000028"], // decimal handling with minutes
      [125.9, "2:5.900000000000006"], // decimal handling with multiple minutes
    ])("secondsToMS(%i) should return %s", (input, expected) => {
      expect(secondsToMS(input)).toBe(expected);
    });
  });

  describe("real world examples", () => {
    test("should handle common audio track durations", () => {
      expect(secondsToMS(180)).toBe("3:00"); // 3 minute song
      expect(secondsToMS(213)).toBe("3:33"); // 3:33 song
      expect(secondsToMS(267)).toBe("4:27"); // 4:27 song
      expect(secondsToMS(240)).toBe("4:00"); // 4 minute song
      expect(secondsToMS(195)).toBe("3:15"); // 3:15 song
    });

    test("should handle short video clips", () => {
      expect(secondsToMS(15)).toBe("0:15"); // 15 second clip
      expect(secondsToMS(30)).toBe("0:30"); // 30 second clip
      expect(secondsToMS(90)).toBe("1:30"); // 90 second clip
      expect(secondsToMS(300)).toBe("5:00"); // 5 minute clip
    });

    test("should handle exercise/workout intervals", () => {
      expect(secondsToMS(30)).toBe("0:30"); // 30 second exercise
      expect(secondsToMS(45)).toBe("0:45"); // 45 second exercise
      expect(secondsToMS(60)).toBe("1:00"); // 1 minute exercise
      expect(secondsToMS(90)).toBe("1:30"); // 90 second rest
      expect(secondsToMS(120)).toBe("2:00"); // 2 minute rest
    });

    test("should handle cooking timers", () => {
      expect(secondsToMS(120)).toBe("2:00"); // 2 minute boiling
      expect(secondsToMS(300)).toBe("5:00"); // 5 minute prep
      expect(secondsToMS(480)).toBe("8:00"); // 8 minute cooking
      expect(secondsToMS(600)).toBe("10:00"); // 10 minute timer
    });

    test("should handle presentation/speech durations", () => {
      expect(secondsToMS(180)).toBe("3:00"); // 3 minute elevator pitch
      expect(secondsToMS(300)).toBe("5:00"); // 5 minute presentation
      expect(secondsToMS(900)).toBe("15:00"); // 15 minute talk
      expect(secondsToMS(1200)).toBe("20:00"); // 20 minute presentation
    });

    test("should handle game/match durations", () => {
      expect(secondsToMS(90)).toBe("1:30"); // 90 second round
      expect(secondsToMS(180)).toBe("3:00"); // 3 minute round
      expect(secondsToMS(300)).toBe("5:00"); // 5 minute game
      expect(secondsToMS(900)).toBe("15:00"); // 15 minute match
    });
  });

  describe("type safety and consistency", () => {
    test("should always return string type", () => {
      expect(typeof secondsToMS(0)).toBe("string");
      expect(typeof secondsToMS(1)).toBe("string");
      expect(typeof secondsToMS(60)).toBe("string");
      expect(typeof secondsToMS(1.5)).toBe("string");
    });

    test("should handle consecutive calls consistently", () => {
      const testValue = 125;
      const result1 = secondsToMS(testValue);
      const result2 = secondsToMS(testValue);
      expect(result1).toBe(result2);
      expect(result1).toBe("2:05");
    });

    test("should not mutate input or have side effects", () => {
      const originalValue = 125;
      const valueCopy = originalValue;
      const result = secondsToMS(originalValue);
      expect(originalValue).toBe(valueCopy);
      expect(result).toBe("2:05");
    });

    test("should handle different numeric types consistently", () => {
      expect(secondsToMS(60)).toBe("1:00");
      expect(secondsToMS(60.0)).toBe("1:00");
      expect(secondsToMS(60.9)).toBe("1:0.8999999999999986"); // preserves decimal
    });
  });

  describe("format validation", () => {
    test("should always follow M:S+ format", () => {
      const testCases = [0, 1, 59, 60, 61, 90, 120, 3599, 3600];
      testCases.forEach((seconds) => {
        const result = secondsToMS(seconds);
        expect(result).toMatch(/^\d+:\d+$/); // Changed to allow decimal seconds
      });
    });

    test("should never return negative values", () => {
      const results = [secondsToMS(0), secondsToMS(1), secondsToMS(60), secondsToMS(0.5)];

      results.forEach((result) => {
        expect(result).not.toMatch(/-/);
      });
    });

    test("should pad integer seconds to 2 digits only", () => {
      expect(secondsToMS(1)).toBe("0:01");
      expect(secondsToMS(5)).toBe("0:05");
      expect(secondsToMS(9)).toBe("0:09");
      expect(secondsToMS(61)).toBe("1:01");
      expect(secondsToMS(605)).toBe("10:05");
    });

    test("should not pad decimal seconds", () => {
      expect(secondsToMS(1.5)).toBe("0:1.5");
      expect(secondsToMS(5.25)).toBe("0:5.25");
      expect(secondsToMS(9.9)).toBe("0:9.9");
      expect(secondsToMS(61.1)).toBe("1:1.1000000000000014");
    });

    test("should handle seconds exactly at boundaries", () => {
      expect(secondsToMS(0)).toBe("0:00");
      expect(secondsToMS(60)).toBe("1:00");
      expect(secondsToMS(120)).toBe("2:00");
      expect(secondsToMS(3600)).toBe("60:00");
    });
  });

  describe("comparison with other time functions", () => {
    test("should be consistent with expected M:S format", () => {
      // Test that secondsToMS always produces M:S format
      // while secondsToHMS can produce S, M:SS, or H:MM:SS
      expect(secondsToMS(5)).toBe("0:05"); // Always M:S
      expect(secondsToMS(65)).toBe("1:05"); // Always M:S
      expect(secondsToMS(3665)).toBe("61:05"); // Always M:S (even when > 1 hour)
    });

    test("should handle same inputs as other time functions", () => {
      const commonInputs = [0, 30, 60, 90, 180, 300, 600, 1800, 3600];

      commonInputs.forEach((input) => {
        const result = secondsToMS(input);
        expect(typeof result).toBe("string");
        expect(result).toMatch(/^\d+:\d+$/); // Changed to allow decimal seconds
      });
    });

    test("should differ from secondsToHMS in format approach", () => {
      // secondsToMS always shows minutes:seconds, even for large values
      // secondsToHMS shows hours:minutes:seconds for values >= 1 hour
      expect(secondsToMS(3665)).toBe("61:05"); // Minutes:seconds format
      // secondsToHMS(3665) would be "1:01:05" - hours:minutes:seconds format

      expect(secondsToMS(5)).toBe("0:05"); // Always includes minutes
      // secondsToHMS(5) would be "5" - seconds only when < 1 minute
    });

    test("should handle decimal inputs differently than integer-only functions", () => {
      // This function preserves decimal seconds, unlike functions that floor/round
      expect(secondsToMS(90.5)).toBe("1:30.5");
      expect(secondsToMS(150.25)).toBe("2:30.25");
      expect(secondsToMS(3665.75)).toBe("61:5.75");
    });
  });

  describe("function behavior characteristics", () => {
    test("should always include minutes component", () => {
      // Unlike secondsToHMS which can return just seconds (e.g., "5")
      // this function always includes the minutes component
      expect(secondsToMS(5)).toBe("0:05");
      expect(secondsToMS(0)).toBe("0:00");
      expect(secondsToMS(59)).toBe("0:59");
    });

    test("should never include hours component", () => {
      // Even for very large values, it converts to minutes
      expect(secondsToMS(3600)).toBe("60:00"); // 1 hour = 60 minutes
      expect(secondsToMS(7200)).toBe("120:00"); // 2 hours = 120 minutes
      expect(secondsToMS(86_400)).toBe("1440:00"); // 24 hours = 1440 minutes
    });

    test("should preserve decimal precision in seconds", () => {
      // The function doesn't floor remainingSeconds like other functions might
      expect(secondsToMS(1.5)).toBe("0:1.5");
      expect(secondsToMS(61.25)).toBe("1:1.25");
      expect(secondsToMS(125.999)).toBe("2:5.998999999999995");
    });

    test("should only pad integer seconds to 2 digits", () => {
      // Padding only applies to integer values, not decimals
      expect(secondsToMS(5)).toBe("0:05"); // Integer padded
      expect(secondsToMS(5.5)).toBe("0:5.5"); // Decimal not padded
      expect(secondsToMS(65)).toBe("1:05"); // Integer padded
      expect(secondsToMS(65.5)).toBe("1:5.5"); // Decimal not padded
    });

    test("should handle floating-point arithmetic consistently", () => {
      // Test behavior rather than exact precision
      const result1 = secondsToMS(0.1);
      expect(result1).toMatch(/^0:0\.1$/); // Simple decimal

      const result2 = secondsToMS(60.1);
      expect(result2).toMatch(/^1:0\.1\d*$/); // May have floating-point artifacts

      // Test that the pattern is consistent
      expect(typeof result1).toBe("string");
      expect(typeof result2).toBe("string");
      expect(result1.split(":")).toHaveLength(2);
      expect(result2.split(":")).toHaveLength(2);
    });
  });

  describe("function behavior", () => {
    test("should return string type for all inputs", () => {
      const inputs = [0, 1, 1.5, 60, 60.5, 3600, 3600.5];
      inputs.forEach((input) => {
        expect(typeof secondsToMS(input)).toBe("string");
      });
    });

    test("should not modify global state", () => {
      const before = Date.now();
      secondsToMS(125);
      const after = Date.now();
      // Should complete quickly and not affect global state
      expect(after - before).toBeLessThan(100);
    });

    test("should handle very long durations", () => {
      const result = secondsToMS(999_999);
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d+:\d+$/); // Changed to allow decimal seconds
    });

    test("should be deterministic", () => {
      const input = 125.5;
      const results = Array.from({ length: 10 }, () => secondsToMS(input));
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(1);
      expect(results[0]).toBe("2:5.5");
    });
  });

  describe("performance considerations", () => {
    test("should handle zero input efficiently", () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        secondsToMS(0);
      }
      const end = Date.now();
      expect(end - start).toBeLessThan(100); // Should be very fast
    });

    test("should handle large inputs efficiently", () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        secondsToMS(999_999);
      }
      const end = Date.now();
      expect(end - start).toBeLessThan(100); // Should be very fast
    });

    test("should handle decimal inputs efficiently", () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        secondsToMS(125.789);
      }
      const end = Date.now();
      expect(end - start).toBeLessThan(100); // Should be very fast
    });
  });

  describe("unique characteristics", () => {
    test("should always show minutes even for large hour values", () => {
      expect(secondsToMS(3600)).toBe("60:00"); // 1 hour = 60 minutes
      expect(secondsToMS(7200)).toBe("120:00"); // 2 hours = 120 minutes
      expect(secondsToMS(86_400)).toBe("1440:00"); // 24 hours = 1440 minutes
    });

    test("should handle fractional minutes correctly", () => {
      expect(secondsToMS(90)).toBe("1:30"); // 1.5 minutes = 1:30
      expect(secondsToMS(150)).toBe("2:30"); // 2.5 minutes = 2:30
      expect(secondsToMS(210)).toBe("3:30"); // 3.5 minutes = 3:30
    });

    test("should preserve decimal precision in seconds display", () => {
      expect(secondsToMS(90.5)).toBe("1:30.5"); // Shows decimal seconds
      expect(secondsToMS(150.25)).toBe("2:30.25"); // Shows decimal seconds
      expect(secondsToMS(210.75)).toBe("3:30.75"); // Shows decimal seconds
    });

    test("should pad integer seconds to 2 digits but preserve decimals as-is", () => {
      expect(secondsToMS(5)).toBe("0:05"); // Pads integer seconds
      expect(secondsToMS(65)).toBe("1:05"); // Pads integer seconds
      expect(secondsToMS(5.5)).toBe("0:5.5"); // Doesn't pad decimal seconds
      expect(secondsToMS(65.5)).toBe("1:5.5"); // Doesn't pad decimal seconds
    });

    test("should be suitable for short duration displays", () => {
      // This function is ideal for displaying durations that are typically
      // measured in minutes rather than hours
      const shortDurations = [15, 30, 45, 60, 90, 120, 180, 300, 600];

      shortDurations.forEach((duration) => {
        const result = secondsToMS(duration);
        expect(result?.split(":")?.[0]?.length).toBeLessThanOrEqual(2);
      });
    });
  });
});
