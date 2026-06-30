export type TimeFormat = "dhms" | "dhm" | "dh" | "d" | "hms" | "hm" | "h" | "ms" | "m" | "s";

export type TimeResult<F extends TimeFormat> = F extends "dhms"
  ? { d: number; h: number; m: number; s: number; text: string }
  : F extends "dhm"
    ? { d: number; h: number; m: number; text: string }
    : F extends "dh"
      ? { d: number; h: number; text: string }
      : F extends "d"
        ? { d: number; text: string }
        : F extends "hms"
          ? { h: number; m: number; s: number; text: string }
          : F extends "hm"
            ? { h: number; m: number; text: string }
            : F extends "h"
              ? { h: number; text: string }
              : F extends "ms"
                ? { m: number; s: number; text: string }
                : F extends "m"
                  ? { m: number; text: string }
                  : F extends "s"
                    ? { s: number; text: string }
                    : never;

const SECONDS_PER_DAY = 86_400;

const buildText = (parts: readonly [number, string][]): string => {
  const nonZero = parts.filter(([value]) => value !== 0);
  if (nonZero.length === 0) {
    const last = parts[parts.length - 1] as [number, string];
    return `0${last[1]}`;
  }
  return nonZero.map(([value, unit]) => `${value}${unit}`).join(" ");
};

export const decomposeSeconds = <F extends TimeFormat>(totalSeconds: number, format: F): TimeResult<F> => {
  const total = Math.floor(totalSeconds);

  switch (format) {
    case "dhms": {
      const d = Math.floor(total / SECONDS_PER_DAY);
      const afterDays = total % SECONDS_PER_DAY;
      const h = Math.floor(afterDays / 3600);
      const m = Math.floor((afterDays % 3600) / 60);
      const s = afterDays % 60;
      return {
        d,
        h,
        m,
        s,
        text: buildText([
          [d, "d"],
          [h, "h"],
          [m, "m"],
          [s, "s"],
        ]),
      } as TimeResult<F>;
    }
    case "dhm": {
      const d = Math.floor(total / SECONDS_PER_DAY);
      const afterDays = total % SECONDS_PER_DAY;
      const h = Math.floor(afterDays / 3600);
      const m = Math.floor((afterDays % 3600) / 60);
      return {
        d,
        h,
        m,
        text: buildText([
          [d, "d"],
          [h, "h"],
          [m, "m"],
        ]),
      } as TimeResult<F>;
    }
    case "dh": {
      const d = Math.floor(total / SECONDS_PER_DAY);
      const h = Math.floor((total % SECONDS_PER_DAY) / 3600);
      return {
        d,
        h,
        text: buildText([
          [d, "d"],
          [h, "h"],
        ]),
      } as TimeResult<F>;
    }
    case "d": {
      const d = Math.floor(total / SECONDS_PER_DAY);
      return {
        d,
        text: buildText([[d, "d"]]),
      } as TimeResult<F>;
    }
    case "hms": {
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return {
        h,
        m,
        s,
        text: buildText([
          [h, "h"],
          [m, "m"],
          [s, "s"],
        ]),
      } as TimeResult<F>;
    }
    case "hm": {
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      return {
        h,
        m,
        text: buildText([
          [h, "h"],
          [m, "m"],
        ]),
      } as TimeResult<F>;
    }
    case "h": {
      const h = Math.floor(total / 3600);
      return {
        h,
        text: buildText([[h, "h"]]),
      } as TimeResult<F>;
    }
    case "ms": {
      const m = Math.floor(total / 60);
      const s = total % 60;
      return {
        m,
        s,
        text: buildText([
          [m, "m"],
          [s, "s"],
        ]),
      } as TimeResult<F>;
    }
    case "m": {
      const m = Math.floor(total / 60);
      return {
        m,
        text: buildText([[m, "m"]]),
      } as TimeResult<F>;
    }
    case "s": {
      return {
        s: total,
        text: buildText([[total, "s"]]),
      } as TimeResult<F>;
    }
    default: {
      throw new Error(`Unsupported format: ${format}`);
    }
  }
};
