import { decomposeSeconds, type TimeFormat, type TimeResult } from "./decompose";

class SecondConverter {
  constructor(private readonly seconds: number) {}

  to<F extends TimeFormat>(format: F): TimeResult<F> {
    return decomposeSeconds(this.seconds, format);
  }
}

export const Second = {
  convert: (seconds: number): SecondConverter => new SecondConverter(seconds),
};
