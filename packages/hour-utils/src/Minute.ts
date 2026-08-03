import { decomposeSeconds, type TimeFormat, type TimeResult } from "./decompose";

class MinuteConverter {
  constructor(private readonly minutes: number) {}

  to<F extends TimeFormat>(format: F): TimeResult<F> {
    return decomposeSeconds(this.minutes * 60, format);
  }
}

export const Minute = {
  convert: (minutes: number): MinuteConverter => new MinuteConverter(minutes),
};
