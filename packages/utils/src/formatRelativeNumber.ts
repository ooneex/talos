type FormatRelativeNumberConfigType = {
  precision?: number;
  lang?: string;
};

const defaultLang = "en-GB";

const isEnglishLocale = (lang: string): boolean => /^en(?:-|$)/i.test(lang);

const normalizeEnglishCompactSuffix = (value: string): string =>
  value.replace(/tn$/, "T").replace(/bn$/, "B").replace(/k$/, "K").replace(/m$/, "M");

export const formatRelativeNumber = (num: number, config?: FormatRelativeNumberConfigType): string => {
  const lang = config?.lang ?? defaultLang;
  const value = new Intl.NumberFormat(lang, {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: config?.precision ?? 1,
  }).format(num);

  return isEnglishLocale(lang) ? normalizeEnglishCompactSuffix(value) : value;
};
