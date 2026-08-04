import { describe, expect, test } from "bun:test";
import type { TimeFormatType } from "@/decompose";
import { Second } from "@/index";

describe("decomposeSeconds unsupported format", () => {
  test("should throw when given an unsupported format", () => {
    expect(() => Second.convert(1).to("bogus" as TimeFormatType)).toThrow("Unsupported format: bogus");
  });
});
