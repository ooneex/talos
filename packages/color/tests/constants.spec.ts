import { describe, expect, test } from "bun:test";
import { SIMPLE_COLOR_NAMES, SIMPLE_COLORS } from "@/index";

describe("SIMPLE_COLORS", () => {
  test("should contain 26 colors", () => {
    expect(SIMPLE_COLORS).toHaveLength(26);
  });

  test("should contain only valid 6-digit hex color strings", () => {
    for (const color of SIMPLE_COLORS) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  test("should contain only unique values", () => {
    expect(new Set(SIMPLE_COLORS).size).toBe(SIMPLE_COLORS.length);
  });

  test("should include black and white", () => {
    expect(SIMPLE_COLORS).toContain("#000000");
    expect(SIMPLE_COLORS).toContain("#FFFFFF");
  });
});

describe("SIMPLE_COLOR_NAMES", () => {
  test("should have a name for every color", () => {
    for (const color of SIMPLE_COLORS) {
      expect(SIMPLE_COLOR_NAMES[color]).toBeDefined();
      expect(SIMPLE_COLOR_NAMES[color]).toBeString();
    }
  });

  test("should not have names for colors not in SIMPLE_COLORS", () => {
    expect(Object.keys(SIMPLE_COLOR_NAMES)).toHaveLength(SIMPLE_COLORS.length);
  });

  test("should map well-known hex values to expected names", () => {
    expect(SIMPLE_COLOR_NAMES["#3B82F6"]).toBe("Blue");
    expect(SIMPLE_COLOR_NAMES["#10B981"]).toBe("Green");
    expect(SIMPLE_COLOR_NAMES["#000000"]).toBe("Black");
    expect(SIMPLE_COLOR_NAMES["#FFFFFF"]).toBe("White");
  });

  test("should have unique names", () => {
    const names = Object.values(SIMPLE_COLOR_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });
});
