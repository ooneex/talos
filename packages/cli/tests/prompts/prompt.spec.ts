import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Mock enquirer so we control how the underlying prompt resolves or rejects.
const promptMock = mock((_config: unknown) => Promise.resolve({ value: "ok" }));
mock.module("enquirer", () => ({ prompt: promptMock }));

const { prompt } = await import("@/prompts/prompt");

const QUESTION = { type: "input", name: "value", message: "x" };

describe("prompt", () => {
  let originalExit: typeof process.exit;
  let exitCalls: number[];

  beforeEach(() => {
    promptMock.mockClear();
    exitCalls = [];
    originalExit = process.exit;
    // process.exit never returns in production; make the mock throw so control
    // does not fall through, mirroring the real halt.
    process.exit = ((code?: number) => {
      exitCalls.push(code ?? 0);
      throw new Error("__exit__");
    }) as typeof process.exit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  test("should return the enquirer answer when the prompt resolves", async () => {
    promptMock.mockImplementationOnce(() => Promise.resolve({ value: "hello" }));

    const result = await prompt<{ value: string }>(QUESTION);

    expect(result).toEqual({ value: "hello" });
    expect(exitCalls).toEqual([]);
  });

  test("should exit with code 130 when cancelled with Ctrl+C (empty-string reject)", async () => {
    // enquirer rejects with an empty string when the user presses Ctrl+C / Esc.
    promptMock.mockImplementationOnce(() => Promise.reject(""));

    await expect(prompt(QUESTION)).rejects.toThrow("__exit__");
    expect(exitCalls).toEqual([130]);
  });

  test("should exit with code 130 when the prompt rejects with null or undefined", async () => {
    promptMock.mockImplementationOnce(() => Promise.reject(undefined));

    await expect(prompt(QUESTION)).rejects.toThrow("__exit__");
    expect(exitCalls).toEqual([130]);
  });

  test("should re-throw real errors without exiting", async () => {
    const boom = new Error("boom");
    promptMock.mockImplementationOnce(() => Promise.reject(boom));

    await expect(prompt(QUESTION)).rejects.toBe(boom);
    expect(exitCalls).toEqual([]);
  });
});
