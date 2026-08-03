import { decomposeSeconds, type TimeFormat, type TimeResult } from "./decompose";

class HourConverter {
  constructor(private readonly hours: number) {}

  to<F extends TimeFormat>(format: F): TimeResult<F> {
    return decomposeSeconds(this.hours * 3600, format);
  }
}

export const Hour = {
  convert: (hours: number): HourConverter => new HourConverter(hours),
};
