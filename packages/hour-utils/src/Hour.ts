import { decomposeSeconds, type TimeFormat, type TimeResult } from "./decompose";

class HourConverter {
  constructor(private readonly hours: number) {}

  to<F extends TimeFormat>(format: F): TimeResult<F> {
    return decomposeSeconds(this.hours * 3600, format);
  }
}

// biome-ignore lint/complexity/noStaticOnlyClass: namespace-style API `Hour.convert(...)` is the intended shape
export class Hour {
  static convert(hours: number): HourConverter {
    return new HourConverter(hours);
  }
}
