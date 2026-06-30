import { has, trans } from "@talosjs/utils/trans";
import { TranslationException } from "./TranslationException";
import type { ITranslation, LocaleType, TranslationDictType, TransOptionsType } from "./types";

const FALLBACK_LOCALE: LocaleType = "en";

export abstract class Translation implements ITranslation {
  public has(key: string): boolean {
    return has(this.getDict(), key);
  }

  public trans(key: string, options: TransOptionsType = {}): string {
    const lang = options.lang ?? FALLBACK_LOCALE;
    const result = trans(this.getDict(), key, {
      lang,
      fallbackLang: FALLBACK_LOCALE,
      params: options.params,
      count: options.count,
    });

    if (result.found) {
      return result.value;
    }

    if (result.reason === "key") {
      throw new TranslationException(`Translation key "${key}" not found`, "KEY_NOT_FOUND", {
        key,
        lang,
      });
    }

    throw new TranslationException(
      `Translation "${key}" is missing for locale "${lang}" and fallback "${FALLBACK_LOCALE}"`,
      "LOCALE_NOT_FOUND",
      { key, lang },
    );
  }

  public abstract getName(): string;

  public abstract getDict(): TranslationDictType;
}
