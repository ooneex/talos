import type { locales } from "./locales";

export type LocaleType = (typeof locales)[number];

export type LocaleInfoType = {
  code: LocaleType;
  region: string | null;
};

export type TranslationLeafType = Partial<Record<LocaleType, string>>;

export type TranslationDictType = {
  [key: string]: TranslationDictType | TranslationLeafType;
};

export type TransParamsType = Record<string, boolean | number | bigint | string>;

export type TransOptionsType = {
  lang?: LocaleType;
  params?: TransParamsType;
  count?: number;
};

export interface ITranslation {
  getName: () => string;
  getDict: () => TranslationDictType;
  has: (key: string) => boolean;
  trans: (key: string, options?: TransOptionsType) => string;
}

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type TranslationClassType = new (...args: any[]) => ITranslation;
