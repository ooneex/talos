import { decomposeSeconds, type TimeFormat, type TimeResult } from "./decompose";

class SecondConverter {
  constructor(private readonly seconds: number) {}

  to<F extends TimeFormat>(format: F): TimeResult<F> {
    return decomposeSeconds(this.seconds, format);
  }
}

// biome-ignore lint/complexity/noStaticOnlyClass: namespace-style API `Second.convert(...)` is the intended shape
export class Second {
  static convert(seconds: number): SecondConverter {
    return new SecondConverter(seconds);
  }
}
