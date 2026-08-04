import { decomposeSeconds, type TimeFormatType, type TimeResultType } from "./decompose";

class MinuteConverter {
  constructor(private readonly minutes: number) {}

  to<F extends TimeFormatType>(format: F): TimeResultType<F> {
    return decomposeSeconds(this.minutes * 60, format);
  }
}

export const Minute = {
  convert: (minutes: number): MinuteConverter => new MinuteConverter(minutes),
};
