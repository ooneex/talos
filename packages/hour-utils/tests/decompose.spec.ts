import { describe, expect, test } from "bun:test";
import { Second } from "@/index";
import type { TimeFormat } from "@/decompose";

describe("decomposeSeconds unsupported format", () => {
  test("should throw when given an unsupported format", () => {
    expect(() => Second.convert(1).to("bogus" as TimeFormat)).toThrow("Unsupported format: bogus");
  });
});
