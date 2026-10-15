import { describe, expect, mock, test } from "bun:test";
import type { IException } from "@talosjs/exception";
import { readStackFrames } from "@/stackFrames";

describe("readStackFrames", () => {
  test("should use the frames an exception parses itself", () => {
    const frames = [{ source: "at main (app.ts:1:1)", functionName: "main" }];
    const exception = { stack: "Error\n    at other", stackToJson: mock(() => frames) } as unknown as IException;

    expect(readStackFrames(exception)).toBe(frames);
  });

  test("should keep the stack lines of a plain Error that has no stackToJson", () => {
    const error = new Error("EACCES: permission denied");
    error.stack = "Error: EACCES: permission denied\n    at write (native)\n\n    at boot (/app/App.ts:10:5)";

    expect(readStackFrames(error as unknown as IException)).toEqual([
      { source: "at write (native)" },
      { source: "at boot (/app/App.ts:10:5)" },
    ]);
  });

  test("should return null for a plain Error without a stack", () => {
    const error = new Error("no stack");
    error.stack = "";

    expect(readStackFrames(error as unknown as IException)).toBeNull();
  });
});
