import { decomposeSeconds, type TimeFormat, type TimeResult } from "./decompose";

class MillisecondConverter {
  constructor(private readonly milliseconds: number) {}

  to<F extends TimeFormat>(format: F): TimeResult<F> {
    return decomposeSeconds(this.milliseconds / 1000, format);
  }
}

// biome-ignore lint/complexity/noStaticOnlyClass: namespace-style API `Millisecond.convert(...)` is the intended shape
export class Millisecond {
  static convert(milliseconds: number): MillisecondConverter {
    return new MillisecondConverter(milliseconds);
  }
}
