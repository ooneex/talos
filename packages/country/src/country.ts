import { countries } from "./countries";
import type { CountryEntryType, CountryLangType, CountryType } from "./types";

let index: Map<string, CountryEntryType> | null = null;

const getIndex = (): Map<string, CountryEntryType> => {
  if (!index) {
    index = new Map(
      countries.map((country): [string, CountryEntryType] => [`${country.lang}:${country.code}`, country]),
    );
  }

  return index;
};

export const getCountry = (code: CountryType, lang: CountryLangType): CountryEntryType | undefined =>
  getIndex().get(`${lang}:${code}`);
