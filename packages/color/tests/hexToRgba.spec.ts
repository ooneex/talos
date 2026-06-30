import { describe, expect, test } from "bun:test";
import { hexToRgba } from "@/index";

describe("hexToRgba", () => {
  test("should convert 6-digit hex to rgba with default alpha", () => {
    expect(hexToRgba("#3B82F6")).toBe("rgba(59, 130, 246, 1)");
  });

  test("should convert 6-digit hex without leading hash", () => {
    expect(hexToRgba("3B82F6")).toBe("rgba(59, 130, 246, 1)");
  });

  test("should convert 3-digit shorthand hex", () => {
    expect(hexToRgba("#FFF")).toBe("rgba(255, 255, 255, 1)");
  });

  test("should convert 3-digit shorthand without hash", () => {
    expect(hexToRgba("000")).toBe("rgba(0, 0, 0, 1)");
  });

  test("should apply provided alpha value", () => {
    expect(hexToRgba("#3B82F6", 0.5)).toBe("rgba(59, 130, 246, 0.5)");
  });

  test("should accept alpha of 0", () => {
    expect(hexToRgba("#000000", 0)).toBe("rgba(0, 0, 0, 0)");
  });

  test("should accept alpha of 1", () => {
    expect(hexToRgba("#FFFFFF", 1)).toBe("rgba(255, 255, 255, 1)");
  });

  test("should parse 8-digit hex with embedded alpha", () => {
    expect(hexToRgba("#3B82F680")).toBe("rgba(59, 130, 246, 0.502)");
  });

  test("should parse 4-digit shorthand hex with embedded alpha", () => {
    expect(hexToRgba("#FFF8")).toBe("rgba(255, 255, 255, 0.533)");
  });

  test("should let explicit alpha override embedded alpha", () => {
    expect(hexToRgba("#3B82F680", 0.25)).toBe("rgba(59, 130, 246, 0.25)");
  });

  test("should be case-insensitive", () => {
    expect(hexToRgba("#3b82f6")).toBe("rgba(59, 130, 246, 1)");
  });

  test("should trim surrounding whitespace", () => {
    expect(hexToRgba("  #3B82F6  ")).toBe("rgba(59, 130, 246, 1)");
  });

  test("should return null for invalid hex string", () => {
    expect(hexToRgba("not-a-color")).toBeNull();
  });

  test("should return null for hex with invalid characters", () => {
    expect(hexToRgba("#GGGGGG")).toBeNull();
  });

  test("should return null for hex with wrong length", () => {
    expect(hexToRgba("#12345")).toBeNull();
  });

  test("should return null when alpha is below 0", () => {
    expect(hexToRgba("#3B82F6", -0.1)).toBeNull();
  });

  test("should return null when alpha is above 1", () => {
    expect(hexToRgba("#3B82F6", 1.5)).toBeNull();
  });

  test("should return null when alpha is NaN", () => {
    expect(hexToRgba("#3B82F6", Number.NaN)).toBeNull();
  });
});
