import { describe, expect, test } from "bun:test";
import { Second } from "@/index";

describe("Second.convert(...).to('hms')", () => {
  test("should decompose 3900 seconds into 1h 5m 0s", () => {
    expect(Second.convert(3900).to("hms")).toEqual({
      h: 1,
      m: 5,
      s: 0,
      text: "1h 5m",
    });
  });

  test("should include seconds when they are non-zero", () => {
    expect(Second.convert(3930).to("hms")).toEqual({
      h: 1,
      m: 5,
      s: 30,
      text: "1h 5m 30s",
    });
  });

  test("should return 0s text when input is zero", () => {
    expect(Second.convert(0).to("hms")).toEqual({
      h: 0,
      m: 0,
      s: 0,
      text: "0s",
    });
  });

  test("should omit hours when less than one hour", () => {
    expect(Second.convert(90).to("hms")).toEqual({
      h: 0,
      m: 1,
      s: 30,
      text: "1m 30s",
    });
  });
});

describe("Second.convert(...).to('hm')", () => {
  test("should decompose 3900 seconds into 1h 5m", () => {
    expect(Second.convert(3900).to("hm")).toEqual({
      h: 1,
      m: 5,
      text: "1h 5m",
    });
  });

  test("should truncate sub-minute remainder", () => {
    expect(Second.convert(3930).to("hm")).toEqual({
      h: 1,
      m: 5,
      text: "1h 5m",
    });
  });
});

describe("Second.convert(...).to('h')", () => {
  test("should floor to whole hours", () => {
    expect(Second.convert(7500).to("h")).toEqual({ h: 2, text: "2h" });
  });

  test("should return 0h when less than an hour", () => {
    expect(Second.convert(2700).to("h")).toEqual({ h: 0, text: "0h" });
  });
});

describe("Second.convert(...).to('ms')", () => {
  test("should keep hours in the minutes bucket", () => {
    expect(Second.convert(3900).to("ms")).toEqual({
      m: 65,
      s: 0,
      text: "65m",
    });
  });

  test("should include seconds remainder", () => {
    expect(Second.convert(90).to("ms")).toEqual({
      m: 1,
      s: 30,
      text: "1m 30s",
    });
  });
});

describe("Second.convert(...).to('m')", () => {
  test("should return total floored minutes", () => {
    expect(Second.convert(3900).to("m")).toEqual({ m: 65, text: "65m" });
  });

  test("should floor sub-minute seconds", () => {
    expect(Second.convert(119).to("m")).toEqual({ m: 1, text: "1m" });
  });
});

describe("Second.convert(...).to('s')", () => {
  test("should return total seconds", () => {
    expect(Second.convert(3900).to("s")).toEqual({ s: 3900, text: "3900s" });
  });

  test("should floor fractional seconds", () => {
    expect(Second.convert(1.9).to("s")).toEqual({ s: 1, text: "1s" });
  });

  test("should return 0s when input is zero", () => {
    expect(Second.convert(0).to("s")).toEqual({ s: 0, text: "0s" });
  });
});

describe("Second.convert(...).to('dhms')", () => {
  test("should decompose 90300 seconds into 1d 1h 5m 0s", () => {
    expect(Second.convert(90_300).to("dhms")).toEqual({
      d: 1,
      h: 1,
      m: 5,
      s: 0,
      text: "1d 1h 5m",
    });
  });

  test("should include seconds remainder", () => {
    expect(Second.convert(90_330).to("dhms")).toEqual({
      d: 1,
      h: 1,
      m: 5,
      s: 30,
      text: "1d 1h 5m 30s",
    });
  });

  test("should return 0s text when input is zero", () => {
    expect(Second.convert(0).to("dhms")).toEqual({
      d: 0,
      h: 0,
      m: 0,
      s: 0,
      text: "0s",
    });
  });
});

describe("Second.convert(...).to('dhm')", () => {
  test("should decompose 90300 seconds into 1d 1h 5m", () => {
    expect(Second.convert(90_300).to("dhm")).toEqual({
      d: 1,
      h: 1,
      m: 5,
      text: "1d 1h 5m",
    });
  });
});

describe("Second.convert(...).to('dh')", () => {
  test("should decompose 90000 seconds into 1d 1h", () => {
    expect(Second.convert(90_000).to("dh")).toEqual({
      d: 1,
      h: 1,
      text: "1d 1h",
    });
  });
});

describe("Second.convert(...).to('d')", () => {
  test("should floor to whole days", () => {
    expect(Second.convert(172_800).to("d")).toEqual({ d: 2, text: "2d" });
  });

  test("should return 0d when less than a day", () => {
    expect(Second.convert(86_399).to("d")).toEqual({ d: 0, text: "0d" });
  });
});
