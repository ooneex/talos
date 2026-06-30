import { describe, expect, test } from "bun:test";
import { Minute } from "@/index";

describe("Minute.convert(...).to('hms')", () => {
  test("should decompose 65 minutes into 1h 5m 0s", () => {
    expect(Minute.convert(65).to("hms")).toEqual({
      h: 1,
      m: 5,
      s: 0,
      text: "1h 5m",
    });
  });

  test("should include seconds when fractional minutes produce them", () => {
    expect(Minute.convert(65.5).to("hms")).toEqual({
      h: 1,
      m: 5,
      s: 30,
      text: "1h 5m 30s",
    });
  });

  test("should return 0s text when input is zero", () => {
    expect(Minute.convert(0).to("hms")).toEqual({
      h: 0,
      m: 0,
      s: 0,
      text: "0s",
    });
  });

  test("should omit hours when less than one hour", () => {
    expect(Minute.convert(5).to("hms")).toEqual({
      h: 0,
      m: 5,
      s: 0,
      text: "5m",
    });
  });
});

describe("Minute.convert(...).to('hm')", () => {
  test("should decompose 65 minutes into 1h 5m", () => {
    expect(Minute.convert(65).to("hm")).toEqual({
      h: 1,
      m: 5,
      text: "1h 5m",
    });
  });

  test("should truncate sub-minute remainder", () => {
    expect(Minute.convert(65.5).to("hm")).toEqual({
      h: 1,
      m: 5,
      text: "1h 5m",
    });
  });

  test("should return 0m when input is zero", () => {
    expect(Minute.convert(0).to("hm")).toEqual({
      h: 0,
      m: 0,
      text: "0m",
    });
  });
});

describe("Minute.convert(...).to('h')", () => {
  test("should floor to whole hours", () => {
    expect(Minute.convert(125).to("h")).toEqual({ h: 2, text: "2h" });
  });

  test("should return 0h when less than an hour", () => {
    expect(Minute.convert(45).to("h")).toEqual({ h: 0, text: "0h" });
  });
});

describe("Minute.convert(...).to('ms')", () => {
  test("should keep hours in the minutes bucket", () => {
    expect(Minute.convert(65).to("ms")).toEqual({
      m: 65,
      s: 0,
      text: "65m",
    });
  });

  test("should include seconds from fractional minutes", () => {
    expect(Minute.convert(1.5).to("ms")).toEqual({
      m: 1,
      s: 30,
      text: "1m 30s",
    });
  });

  test("should return 0s when input is zero", () => {
    expect(Minute.convert(0).to("ms")).toEqual({
      m: 0,
      s: 0,
      text: "0s",
    });
  });
});

describe("Minute.convert(...).to('m')", () => {
  test("should return total floored minutes", () => {
    expect(Minute.convert(65).to("m")).toEqual({ m: 65, text: "65m" });
  });

  test("should floor fractional minutes", () => {
    expect(Minute.convert(1.9).to("m")).toEqual({ m: 1, text: "1m" });
  });
});

describe("Minute.convert(...).to('s')", () => {
  test("should return total seconds", () => {
    expect(Minute.convert(65).to("s")).toEqual({ s: 3900, text: "3900s" });
  });

  test("should include sub-minute seconds", () => {
    expect(Minute.convert(1.5).to("s")).toEqual({ s: 90, text: "90s" });
  });

  test("should return 0s when input is zero", () => {
    expect(Minute.convert(0).to("s")).toEqual({ s: 0, text: "0s" });
  });
});

describe("Minute.convert(...).to('dhms')", () => {
  test("should decompose 1505 minutes into 1d 1h 5m", () => {
    expect(Minute.convert(1505).to("dhms")).toEqual({
      d: 1,
      h: 1,
      m: 5,
      s: 0,
      text: "1d 1h 5m",
    });
  });

  test("should include seconds from fractional minutes", () => {
    expect(Minute.convert(1505.5).to("dhms")).toEqual({
      d: 1,
      h: 1,
      m: 5,
      s: 30,
      text: "1d 1h 5m 30s",
    });
  });

  test("should return 0s text when input is zero", () => {
    expect(Minute.convert(0).to("dhms")).toEqual({
      d: 0,
      h: 0,
      m: 0,
      s: 0,
      text: "0s",
    });
  });
});

describe("Minute.convert(...).to('dhm')", () => {
  test("should decompose 1505 minutes into 1d 1h 5m", () => {
    expect(Minute.convert(1505).to("dhm")).toEqual({
      d: 1,
      h: 1,
      m: 5,
      text: "1d 1h 5m",
    });
  });
});

describe("Minute.convert(...).to('dh')", () => {
  test("should decompose 1500 minutes into 1d 1h", () => {
    expect(Minute.convert(1500).to("dh")).toEqual({
      d: 1,
      h: 1,
      text: "1d 1h",
    });
  });
});

describe("Minute.convert(...).to('d')", () => {
  test("should floor to whole days", () => {
    expect(Minute.convert(1440 * 2).to("d")).toEqual({ d: 2, text: "2d" });
  });

  test("should return 0d when less than a day", () => {
    expect(Minute.convert(1439).to("d")).toEqual({ d: 0, text: "0d" });
  });
});
