import cities from "./cities.json";
import { countries } from "./countries";
import type { CountryEntryType, CountryLangType, CountryType } from "./types";

let index: Map<string, CountryEntryType> | null = null;
let cityIndex: Map<string, string[]> | null = null;

const getIndex = (): Map<string, CountryEntryType> => {
  if (!index) {
    index = new Map(
      countries.map((country): [string, CountryEntryType] => [`${country.lang}:${country.code}`, country]),
    );
  }

  return index;
};

// Codes whose English country name does not match the name used in cities.json.
const cityNames: Partial<Record<CountryType, string>> = {
  BN: "Brunei",
  BS: "The Bahamas",
  CD: "Democratic Republic of the Congo",
  FJ: "Fiji Islands",
  GM: "The Gambia",
  HK: "Hong Kong S.A.R.",
  IM: "Man (Isle of)",
  KP: "North Korea",
  KR: "South Korea",
  LY: "Libya",
  MK: "North Macedonia",
  MO: "Macau S.A.R.",
  PN: "Pitcairn Island",
  PS: "Palestinian Territory Occupied",
  RU: "Russia",
  SJ: "Svalbard and Jan Mayen Islands",
  SY: "Syria",
  SZ: "Eswatini",
  TW: "Taiwan",
  VN: "Vietnam",
  WF: "Wallis and Futuna Islands",
};

const getCityIndex = (): Map<string, string[]> => {
  if (!cityIndex) {
    cityIndex = new Map(cities.map((entry): [string, string[]] => [entry.name, entry.cities]));
  }

  return cityIndex;
};

export const getCountry = (code: CountryType, lang: CountryLangType): CountryEntryType | undefined =>
  getIndex().get(`${lang}:${code}`);

export const getCities = (code: CountryType): string[] => {
  const name = cityNames[code] ?? getCountry(code, "en")?.name;

  return (name && getCityIndex().get(name)) || [];
};
