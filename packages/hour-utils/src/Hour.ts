import { decomposeSeconds, type TimeFormatType, type TimeResultType } from "./decompose";

class HourConverter {
  constructor(private readonly hours: number) {}

  to<F extends TimeFormatType>(format: F): TimeResultType<F> {
    return decomposeSeconds(this.hours * 3600, format);
  }
}

export const Hour = {
  convert: (hours: number): HourConverter => new HourConverter(hours),
};
