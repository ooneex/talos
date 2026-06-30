export type TransParamsType = Record<string, boolean | number | bigint | string>;

export type TransLeafType = Partial<Record<string, string>>;

export type TransDictType = {
  [key: string]: TransDictType | TransLeafType;
};

export type TransConfigType = {
  lang?: string | undefined;
  fallbackLang?: string | undefined;
  params?: TransParamsType | undefined;
  count?: number | undefined;
};

export type TransResultType = { found: true; value: string } | { found: false; reason: "key" | "locale" };

const DEFAULT_FALLBACK_LOCALE = "en";
const INTERPOLATION_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

const resolve = (dict: TransDictType, key: string): TransLeafType | undefined => {
  let current: unknown = dict;

  for (const segment of key.split(".")) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  if (current === null || typeof current !== "object") {
    return undefined;
  }

  return current as TransLeafType;
};

const select = (dict: TransDictType, key: string, count?: number): TransLeafType | undefined => {
  if (count === undefined || count === 1) {
    return resolve(dict, key);
  }

  if (count === 0) {
    return resolve(dict, `${key}_zero`) ?? resolve(dict, `${key}_plural`) ?? resolve(dict, key);
  }

  return resolve(dict, `${key}_plural`) ?? resolve(dict, key);
};

const interpolate = (template: string, params?: TransParamsType, count?: number): string => {
  const values: TransParamsType = { ...params };

  if (count !== undefined && values.count === undefined) {
    values.count = count;
  }

  return template.replace(INTERPOLATION_PATTERN, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
};

export const has = (dict: TransDictType, key: string): boolean => resolve(dict, key) !== undefined;

export const trans = (dict: TransDictType, key: string, config: TransConfigType = {}): TransResultType => {
  const fallbackLang = config.fallbackLang ?? DEFAULT_FALLBACK_LOCALE;
  const lang = config.lang ?? fallbackLang;
  const leaf = select(dict, key, config.count);

  if (!leaf) {
    return { found: false, reason: "key" };
  }

  const template = leaf[lang] ?? leaf[fallbackLang];

  if (template === undefined) {
    return { found: false, reason: "locale" };
  }

  return { found: true, value: interpolate(template, config.params, config.count) };
};
