import { describe, expect, mock, spyOn, test } from "bun:test";

// The logger imports `@/utils`, whose module graph reaches enquirer; mock it
// before importing so the ESM interop mismatch never trips the suite.
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({})),
}));

const { bold, COLORS, colorize, formatDuration, MonorepoRunLogger, SYMBOLS, taskColor } = await import(
  "@/monorepoRunLogger"
);
const { SPINNER_FRAMES } = await import("@/utils");

const ESC = String.fromCharCode(27);
const CTRL_C = String.fromCharCode(3);
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

// Strip SGR escapes up to the terminating `m`. The class allows any non-`m` byte
// (not just `[0-9;]`) because Bun's low-depth "ansi" encoding can emit a malformed
// sequence with a stray byte, e.g. \x1b[38;5;\nm, in 16-color terminals like CI.
const visibleWidth = (text: string): number => text.replace(new RegExp(`${ESC}\\[[^m]*m`, "g"), "").length;

describe("colorize", () => {
  // Bun.color emits ANSI only when the runtime detects color support, so these
  // assert invariants that hold whether or not color is active in the test env.
  test("should preserve the visible text", () => {
    expect(visibleWidth(colorize("build", COLORS.success))).toBe("build".length);
    expect(colorize("build", COLORS.success)).toContain("build");
  });

  test("should never emit a half-open sequence: colored output is bracketed by an escape and a reset", () => {
    const result = colorize("hello", COLORS.info);
    expect(result === "hello" || (result.startsWith(ESC) && result.endsWith(RESET))).toBe(true);
  });

  test("should return the text unchanged when the color cannot be resolved", () => {
    expect(colorize("plain", "not-a-color")).toBe("plain");
  });
});

describe("bold", () => {
  test("should wrap the text in bold and reset codes", () => {
    expect(bold("x")).toBe(`${ESC}[1mx${RESET}`);
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

describe("taskColor", () => {
  test("should be deterministic for a given key", () => {
    expect(taskColor("packages/alpha#build")).toBe(taskColor("packages/alpha#build"));
  });

  test("should return a hex color from the palette", () => {
    expect(taskColor("packages/beta#lint")).toMatch(/^#[0-9A-F]{6}$/i);
  });

  test("should spread different keys across the palette", () => {
    const keys = Array.from({ length: 20 }, (_, i) => `pkg-${i}#build`);
    expect(new Set(keys.map(taskColor)).size).toBeGreaterThan(1);
  });
});

describe("SYMBOLS", () => {
  test("should expose one glyph per task outcome", () => {
    expect(SYMBOLS.success).toBe("✔");
    expect(SYMBOLS.error).toBe("✖");
    for (const glyph of Object.values(SYMBOLS)) {
      expect(typeof glyph).toBe("string");
      expect(glyph.length).toBeGreaterThan(0);
    }
  });
});

describe("MonorepoRunLogger", () => {
  test("should reflect stdout's TTY state", () => {
    const logger = new MonorepoRunLogger();
    expect(logger.isTTY).toBe(process.stdout.isTTY === true);
  });

  describe("spinner", () => {
    test("should start at the first frame and advance on tick", () => {
      const logger = new MonorepoRunLogger();
      expect(logger.spinner).toBe(SPINNER_FRAMES[0] as string);
      logger.tick();
      expect(logger.spinner).toBe(SPINNER_FRAMES[1] as string);
    });

    test("should wrap around after the last frame", () => {
      const logger = new MonorepoRunLogger();
      for (let i = 0; i < SPINNER_FRAMES.length; i++) logger.tick();
      expect(logger.spinner).toBe(SPINNER_FRAMES[0] as string);
    });
  });

  describe("persist", () => {
    test("should write the joined lines followed by a trailing newline", () => {
      const logger = new MonorepoRunLogger();
      const written = captureStdout(() => logger.persist("first", "second"));
      expect(written.join("")).toBe("first\nsecond\n");
    });

    test("should write nothing when given no lines and no footer is active", () => {
      const logger = new MonorepoRunLogger();
      const written = captureStdout(() => logger.persist());
      expect(written.join("")).toBe("");
    });
  });

  describe("renderFooter", () => {
    test("should be a no-op before start() (not in live mode)", () => {
      const logger = new MonorepoRunLogger();
      const written = captureStdout(() => logger.renderFooter(["footer"]));
      expect(written.join("")).toBe("");
    });
  });

  describe("live footer lifecycle", () => {
    test("should hide the cursor on start and show it on stop", () => {
      const logger = new MonorepoRunLogger();
      const onStart = captureStdout(() => logger.start(() => {}));
      const onStop = captureStdout(() => logger.stop());

      expect(onStart.join("")).toContain(`${ESC}[?25l`);
      expect(onStop.join("")).toContain(`${ESC}[?25h`);
    });

    test("should draw the footer without a trailing newline, then redraw it after persist", () => {
      const logger = new MonorepoRunLogger();
      captureStdout(() => logger.start(() => {}));

      const drawn = captureStdout(() => logger.renderFooter(["", "progress"])).join("");
      // Two footer rows joined by a newline, no trailing newline so the cursor
      // stays parked at the end of the footer.
      expect(drawn).toBe("\nprogress");

      const afterPersist = captureStdout(() => logger.persist("done")).join("");
      // Clears the 2-line footer (move up 1, erase down), prints the permanent
      // line, then repaints the cached footer.
      expect(afterPersist).toContain(`${ESC}[1F${ESC}[0J`);
      expect(afterPersist).toContain("done\n");
      expect(afterPersist.endsWith("\nprogress")).toBe(true);

      captureStdout(() => logger.stop());
    });

    test("should clear the footer on stop", () => {
      const logger = new MonorepoRunLogger();
      captureStdout(() => logger.start(() => {}));
      captureStdout(() => logger.renderFooter(["only-line"]));

      const onStop = captureStdout(() => logger.stop()).join("");
      // A single-line footer clears with a carriage return + erase-to-end.
      expect(onStop).toContain(`\r${ESC}[0J`);
    });

    test("should truncate footer lines that exceed the terminal width", () => {
      const originalColumns = process.stdout.columns;
      Object.defineProperty(process.stdout, "columns", { value: 10, configurable: true });

      try {
        const logger = new MonorepoRunLogger();
        captureStdout(() => logger.start(() => {}));
        const drawn = captureStdout(() => logger.renderFooter(["0123456789ABCDEFGHIJ"])).join("");
        captureStdout(() => logger.stop());

        expect(drawn).toContain("…");
        expect(drawn).not.toContain("ABCDEFGHIJ");
        expect(visibleWidth(drawn)).toBeLessThanOrEqual(10);
      } finally {
        Object.defineProperty(process.stdout, "columns", { value: originalColumns, configurable: true });
      }
    });

    test("should invoke the abort handler on ctrl+c and on q, ignoring other keys", () => {
      // The data handler is only wired up for a raw-mode TTY stdin, which the
      // test runner is not — so present stdin as an interactive TTY and stub the
      // raw-mode plumbing bun does not provide off a real terminal.
      const originalIsTTY = process.stdin.isTTY;
      const hadSetRawMode = "setRawMode" in process.stdin;
      Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
      Object.defineProperty(process.stdin, "setRawMode", { value: () => process.stdin, configurable: true });
      const resume = spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
      const pause = spyOn(process.stdin, "pause").mockReturnValue(process.stdin);

      try {
        const logger = new MonorepoRunLogger();
        let aborts = 0;
        captureStdout(() => logger.start(() => aborts++));

        process.stdin.emit("data", Buffer.from(CTRL_C));
        process.stdin.emit("data", Buffer.from("q"));
        process.stdin.emit("data", Buffer.from("x")); // unrelated key: ignored

        captureStdout(() => logger.stop());
        expect(aborts).toBe(2);
      } finally {
        resume.mockRestore();
        pause.mockRestore();
        Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
        if (!hadSetRawMode) {
          delete (process.stdin as unknown as { setRawMode?: unknown }).setRawMode;
        }
      }
    });
  });
});
