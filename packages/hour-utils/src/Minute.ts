import { decomposeSeconds, type TimeFormat, type TimeResult } from "./decompose";

class MinuteConverter {
  constructor(private readonly minutes: number) {}

  to<F extends TimeFormat>(format: F): TimeResult<F> {
    return decomposeSeconds(this.minutes * 60, format);
  }
}

// biome-ignore lint/complexity/noStaticOnlyClass: namespace-style API `Minute.convert(...)` is the intended shape
export class Minute {
  static convert(minutes: number): MinuteConverter {
    return new MinuteConverter(minutes);
  }
}
