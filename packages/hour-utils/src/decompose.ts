export type TimeFormatType = "dhms" | "dhm" | "dh" | "d" | "hms" | "hm" | "h" | "ms" | "m" | "s";

export type TimeResultType<F extends TimeFormatType> = F extends "dhms"
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

const decomposeDays = (total: number) => {
  const d = Math.floor(total / SECONDS_PER_DAY);
  const afterDays = total % SECONDS_PER_DAY;
  const h = Math.floor(afterDays / 3600);
  const m = Math.floor((afterDays % 3600) / 60);
  const s = afterDays % 60;

  return { d, h, m, s };
};

const decomposeHours = (total: number) => {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return { h, m, s };
};

const decomposeMinutes = (total: number) => {
  const m = Math.floor(total / 60);
  const s = total % 60;

  return { m, s };
};

const formatters = {
  dhms: (total: number) => {
    const { d, h, m, s } = decomposeDays(total);
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
    };
  },
  dhm: (total: number) => {
    const { d, h, m } = decomposeDays(total);
    return {
      d,
      h,
      m,
      text: buildText([
        [d, "d"],
        [h, "h"],
        [m, "m"],
      ]),
    };
  },
  dh: (total: number) => {
    const { d, h } = decomposeDays(total);
    return {
      d,
      h,
      text: buildText([
        [d, "d"],
        [h, "h"],
      ]),
    };
  },
  d: (total: number) => {
    const { d } = decomposeDays(total);
    return { d, text: buildText([[d, "d"]]) };
  },
  hms: (total: number) => {
    const { h, m, s } = decomposeHours(total);
    return {
      h,
      m,
      s,
      text: buildText([
        [h, "h"],
        [m, "m"],
        [s, "s"],
      ]),
    };
  },
  hm: (total: number) => {
    const { h, m } = decomposeHours(total);
    return {
      h,
      m,
      text: buildText([
        [h, "h"],
        [m, "m"],
      ]),
    };
  },
  h: (total: number) => {
    const { h } = decomposeHours(total);
    return { h, text: buildText([[h, "h"]]) };
  },
  ms: (total: number) => {
    const { m, s } = decomposeMinutes(total);
    return {
      m,
      s,
      text: buildText([
        [m, "m"],
        [s, "s"],
      ]),
    };
  },
  m: (total: number) => {
    const { m } = decomposeMinutes(total);
    return { m, text: buildText([[m, "m"]]) };
  },
  s: (total: number) => {
    return { s: total, text: buildText([[total, "s"]]) };
  },
} satisfies { [K in TimeFormatType]: (total: number) => TimeResultType<K> };

export const decomposeSeconds = <F extends TimeFormatType>(totalSeconds: number, format: F): TimeResultType<F> => {
  const total = Math.floor(totalSeconds);
  const formatter = formatters[format];

  if (!formatter) {
    throw new Error(`Unsupported format: ${format}`);
  }

  return formatter(total) as TimeResultType<F>;
};
