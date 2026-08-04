import { decomposeSeconds, type TimeFormatType, type TimeResultType } from "./decompose";

class SecondConverter {
  constructor(private readonly seconds: number) {}

  to<F extends TimeFormatType>(format: F): TimeResultType<F> {
    return decomposeSeconds(this.seconds, format);
  }
}

export const Second = {
  convert: (seconds: number): SecondConverter => new SecondConverter(seconds),
};
