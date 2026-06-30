import { describe, expect, test } from "bun:test";
import { Hour } from "@/index";

describe("Hour.convert(...).to('hms')", () => {
  test("should decompose 1 hour into 1h 0m 0s", () => {
    expect(Hour.convert(1).to("hms")).toEqual({
      h: 1,
      m: 0,
      s: 0,
      text: "1h",
    });
  });

  test("should include minutes and seconds from fractional hours", () => {
    expect(Hour.convert(1.51).to("hms")).toEqual({
      h: 1,
      m: 30,
      s: 36,
      text: "1h 30m 36s",
    });
  });

  test("should return 0s text when input is zero", () => {
    expect(Hour.convert(0).to("hms")).toEqual({
      h: 0,
      m: 0,
      s: 0,
      text: "0s",
    });
  });

  test("should omit hours when less than one hour", () => {
    expect(Hour.convert(0.5).to("hms")).toEqual({
      h: 0,
      m: 30,
      s: 0,
      text: "30m",
    });
  });
});

describe("Hour.convert(...).to('hm')", () => {
  test("should decompose 1.5 hours into 1h 30m", () => {
    expect(Hour.convert(1.5).to("hm")).toEqual({
      h: 1,
      m: 30,
      text: "1h 30m",
    });
  });

  test("should truncate sub-minute remainder", () => {
    expect(Hour.convert(1.51).to("hm")).toEqual({
      h: 1,
      m: 30,
      text: "1h 30m",
    });
  });
});

describe("Hour.convert(...).to('h')", () => {
  test("should return whole hours", () => {
    expect(Hour.convert(2).to("h")).toEqual({ h: 2, text: "2h" });
  });

  test("should floor fractional hours", () => {
    expect(Hour.convert(2.9).to("h")).toEqual({ h: 2, text: "2h" });
  });

  test("should return 0h when less than an hour", () => {
    expect(Hour.convert(0.75).to("h")).toEqual({ h: 0, text: "0h" });
  });
});

describe("Hour.convert(...).to('ms')", () => {
  test("should flatten hours into minutes", () => {
    expect(Hour.convert(1).to("ms")).toEqual({
      m: 60,
      s: 0,
      text: "60m",
    });
  });

  test("should include seconds from fractional hours", () => {
    expect(Hour.convert(1.51).to("ms")).toEqual({
      m: 90,
      s: 36,
      text: "90m 36s",
    });
  });
});

describe("Hour.convert(...).to('m')", () => {
  test("should return total floored minutes", () => {
    expect(Hour.convert(1).to("m")).toEqual({ m: 60, text: "60m" });
  });

  test("should floor sub-minute remainder", () => {
    expect(Hour.convert(1.51).to("m")).toEqual({ m: 90, text: "90m" });
  });
});

describe("Hour.convert(...).to('s')", () => {
  test("should return total seconds", () => {
    expect(Hour.convert(1).to("s")).toEqual({ s: 3600, text: "3600s" });
  });

  test("should return 0s when input is zero", () => {
    expect(Hour.convert(0).to("s")).toEqual({ s: 0, text: "0s" });
  });
});

describe("Hour.convert(...).to('dhms')", () => {
  test("should decompose 25 hours into 1d 1h", () => {
    expect(Hour.convert(25).to("dhms")).toEqual({
      d: 1,
      h: 1,
      m: 0,
      s: 0,
      text: "1d 1h",
    });
  });

  test("should include minutes from fractional hours", () => {
    expect(Hour.convert(49.5).to("dhms")).toEqual({
      d: 2,
      h: 1,
      m: 30,
      s: 0,
      text: "2d 1h 30m",
    });
  });

  test("should return 0s text when input is zero", () => {
    expect(Hour.convert(0).to("dhms")).toEqual({
      d: 0,
      h: 0,
      m: 0,
      s: 0,
      text: "0s",
    });
  });

  test("should omit days when less than one day", () => {
    expect(Hour.convert(5).to("dhms")).toEqual({
      d: 0,
      h: 5,
      m: 0,
      s: 0,
      text: "5h",
    });
  });
});

describe("Hour.convert(...).to('dhm')", () => {
  test("should decompose 49.5 hours into 2d 1h 30m", () => {
    expect(Hour.convert(49.5).to("dhm")).toEqual({
      d: 2,
      h: 1,
      m: 30,
      text: "2d 1h 30m",
    });
  });

  test("should return 0m text when input is zero", () => {
    expect(Hour.convert(0).to("dhm")).toEqual({
      d: 0,
      h: 0,
      m: 0,
      text: "0m",
    });
  });
});

describe("Hour.convert(...).to('dh')", () => {
  test("should decompose 25 hours into 1d 1h", () => {
    expect(Hour.convert(25).to("dh")).toEqual({
      d: 1,
      h: 1,
      text: "1d 1h",
    });
  });

  test("should floor sub-hour remainder", () => {
    expect(Hour.convert(25.9).to("dh")).toEqual({
      d: 1,
      h: 1,
      text: "1d 1h",
    });
  });
});

describe("Hour.convert(...).to('d')", () => {
  test("should floor to whole days", () => {
    expect(Hour.convert(49).to("d")).toEqual({ d: 2, text: "2d" });
  });

  test("should return 0d when less than a day", () => {
    expect(Hour.convert(23).to("d")).toEqual({ d: 0, text: "0d" });
  });
});
