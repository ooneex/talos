import { decomposeSeconds, type TimeFormat, type TimeResult } from "./decompose";

class MillisecondConverter {
  constructor(private readonly milliseconds: number) {}

  to<F extends TimeFormat>(format: F): TimeResult<F> {
    return decomposeSeconds(this.milliseconds / 1000, format);
  }
}

export const Millisecond = {
  convert: (milliseconds: number): MillisecondConverter => new MillisecondConverter(milliseconds),
};
