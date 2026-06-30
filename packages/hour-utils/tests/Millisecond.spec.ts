import { describe, expect, test } from "bun:test";
import { Millisecond } from "@/index";

describe("Millisecond.convert(...).to('hms')", () => {
  test("should decompose 3_900_000 ms into 1h 5m 0s", () => {
    expect(Millisecond.convert(3_900_000).to("hms")).toEqual({
      h: 1,
      m: 5,
      s: 0,
      text: "1h 5m",
    });
  });

  test("should include seconds when they are non-zero", () => {
    expect(Millisecond.convert(3_930_000).to("hms")).toEqual({
      h: 1,
      m: 5,
      s: 30,
      text: "1h 5m 30s",
    });
  });

  test("should drop sub-second remainder", () => {
    expect(Millisecond.convert(3_930_500).to("hms")).toEqual({
      h: 1,
      m: 5,
      s: 30,
      text: "1h 5m 30s",
    });
  });

  test("should return 0s text when input is zero", () => {
    expect(Millisecond.convert(0).to("hms")).toEqual({
      h: 0,
      m: 0,
      s: 0,
      text: "0s",
    });
  });
});

describe("Millisecond.convert(...).to('hm')", () => {
  test("should decompose 3_900_000 ms into 1h 5m", () => {
    expect(Millisecond.convert(3_900_000).to("hm")).toEqual({
      h: 1,
      m: 5,
      text: "1h 5m",
    });
  });
});

describe("Millisecond.convert(...).to('h')", () => {
  test("should floor to whole hours", () => {
    expect(Millisecond.convert(7_500_000).to("h")).toEqual({
      h: 2,
      text: "2h",
    });
  });

  test("should return 0h when less than an hour", () => {
    expect(Millisecond.convert(2_700_000).to("h")).toEqual({
      h: 0,
      text: "0h",
    });
  });
});

describe("Millisecond.convert(...).to('ms')", () => {
  test("should keep hours in the minutes bucket", () => {
    expect(Millisecond.convert(3_900_000).to("ms")).toEqual({
      m: 65,
      s: 0,
      text: "65m",
    });
  });

  test("should include seconds remainder", () => {
    expect(Millisecond.convert(90_000).to("ms")).toEqual({
      m: 1,
      s: 30,
      text: "1m 30s",
    });
  });
});

describe("Millisecond.convert(...).to('m')", () => {
  test("should return total floored minutes", () => {
    expect(Millisecond.convert(3_900_000).to("m")).toEqual({
      m: 65,
      text: "65m",
    });
  });

  test("should floor sub-minute remainder", () => {
    expect(Millisecond.convert(119_000).to("m")).toEqual({
      m: 1,
      text: "1m",
    });
  });
});

describe("Millisecond.convert(...).to('s')", () => {
  test("should return total seconds", () => {
    expect(Millisecond.convert(3_900_000).to("s")).toEqual({
      s: 3900,
      text: "3900s",
    });
  });

  test("should floor sub-second remainder", () => {
    expect(Millisecond.convert(1_500).to("s")).toEqual({
      s: 1,
      text: "1s",
    });
  });

  test("should return 0s when input is below one second", () => {
    expect(Millisecond.convert(500).to("s")).toEqual({
      s: 0,
      text: "0s",
    });
  });

  test("should return 0s when input is zero", () => {
    expect(Millisecond.convert(0).to("s")).toEqual({
      s: 0,
      text: "0s",
    });
  });
});

describe("Millisecond.convert(...).to('dhms')", () => {
  test("should decompose 90_300_000 ms into 1d 1h 5m 0s", () => {
    expect(Millisecond.convert(90_300_000).to("dhms")).toEqual({
      d: 1,
      h: 1,
      m: 5,
      s: 0,
      text: "1d 1h 5m",
    });
  });

  test("should drop sub-second remainder", () => {
    expect(Millisecond.convert(90_330_500).to("dhms")).toEqual({
      d: 1,
      h: 1,
      m: 5,
      s: 30,
      text: "1d 1h 5m 30s",
    });
  });

  test("should return 0s text when input is zero", () => {
    expect(Millisecond.convert(0).to("dhms")).toEqual({
      d: 0,
      h: 0,
      m: 0,
      s: 0,
      text: "0s",
    });
  });
});

describe("Millisecond.convert(...).to('dhm')", () => {
  test("should decompose 90_300_000 ms into 1d 1h 5m", () => {
    expect(Millisecond.convert(90_300_000).to("dhm")).toEqual({
      d: 1,
      h: 1,
      m: 5,
      text: "1d 1h 5m",
    });
  });
});

describe("Millisecond.convert(...).to('dh')", () => {
  test("should decompose 90_000_000 ms into 1d 1h", () => {
    expect(Millisecond.convert(90_000_000).to("dh")).toEqual({
      d: 1,
      h: 1,
      text: "1d 1h",
    });
  });
});

describe("Millisecond.convert(...).to('d')", () => {
  test("should floor to whole days", () => {
    expect(Millisecond.convert(172_800_000).to("d")).toEqual({
      d: 2,
      text: "2d",
    });
  });

  test("should return 0d when less than a day", () => {
    expect(Millisecond.convert(86_399_000).to("d")).toEqual({
      d: 0,
      text: "0d",
    });
  });
});
