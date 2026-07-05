import { describe, expect, spyOn, test } from "bun:test";
import { COLORS, colorize, formatDuration, persist, runLogger, SYMBOLS } from "@/runLogger";

const ESC = String.fromCharCode(27);
const RESET = `${ESC}[0m`;

/** Capture everything written to stdout while `fn` runs, then restore stdout. */
const captureStdout = (fn: () => void): string[] => {
  const chunks: string[] = [];
  const spy = spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return chunks;
};

const visibleWidth = (text: string): number => text.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), "").length;

describe("colorize", () => {
  // Bun.color emits ANSI only when the runtime detects color support, so these
  // assert invariants that hold whether or not color is active in the test env.
  test("should preserve the visible text", () => {
    expect(visibleWidth(colorize("UsersSeed", COLORS.success))).toBe("UsersSeed".length);
    expect(colorize("UsersSeed", COLORS.success)).toContain("UsersSeed");
  });

  test("should never emit a half-open sequence: colored output is bracketed by an escape and a reset", () => {
    const result = colorize("hello", COLORS.info);
    expect(result === "hello" || (result.startsWith(ESC) && result.endsWith(RESET))).toBe(true);
  });

  test("should return the text unchanged when the color cannot be resolved", () => {
    expect(colorize("plain", "not-a-color")).toBe("plain");
  });
});

describe("formatDuration", () => {
  test("should render sub-second durations in milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  test("should render durations of a second or more in seconds", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(12_340)).toBe("12.3s");
  });
});

describe("SYMBOLS", () => {
  test("should expose one glyph per seed outcome", () => {
    expect(SYMBOLS.success).toBe("✔");
    expect(SYMBOLS.error).toBe("✖");
    for (const glyph of Object.values(SYMBOLS)) {
      expect(typeof glyph).toBe("string");
      expect(glyph.length).toBeGreaterThan(0);
    }
  });
});

describe("persist", () => {
  test("should write the joined lines followed by a trailing newline", () => {
    const written = captureStdout(() => persist("first", "second"));
    expect(written.join("")).toBe("first\nsecond\n");
  });

  test("should write nothing when given no lines", () => {
    const written = captureStdout(() => persist());
    expect(written.join("")).toBe("");
  });

  test("should be exposed on the runLogger object", () => {
    const written = captureStdout(() => runLogger.persist("only"));
    expect(written.join("")).toBe("only\n");
  });
});
