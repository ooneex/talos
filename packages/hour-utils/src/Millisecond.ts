import { decomposeSeconds, type TimeFormatType, type TimeResultType } from "./decompose";

class MillisecondConverter {
  constructor(private readonly milliseconds: number) {}

  to<F extends TimeFormatType>(format: F): TimeResultType<F> {
    return decomposeSeconds(this.milliseconds / 1000, format);
  }
}

export const Millisecond = {
  convert: (milliseconds: number): MillisecondConverter => new MillisecondConverter(milliseconds),
};
