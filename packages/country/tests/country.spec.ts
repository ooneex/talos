import { describe, expect, test } from "bun:test";
import { COUNTRIES_EN as EN_COUNTRIES } from "../src/en";
import { COUNTRIES_FR as FR_COUNTRIES } from "../src/fr";
import { COUNTRIES_RO as RO_COUNTRIES } from "../src/ro";
import type { CountryNameType, CountryType, ICountry } from "../src/types";

describe("@talosjs/country - COUNTRIES datasets", () => {
  test("should expose non‑empty country lists for each locale", () => {
    expect(EN_COUNTRIES.length).toBeGreaterThan(0);
    expect(FR_COUNTRIES.length).toBeGreaterThan(0);
    expect(RO_COUNTRIES.length).toBeGreaterThan(0);
  });

  test("should contain consistent ISO country codes across locales", () => {
    const enCodes = new Set(EN_COUNTRIES.map((c) => c.code));
    const frCodes = new Set(FR_COUNTRIES.map((c) => c.code));
    const roCodes = new Set(RO_COUNTRIES.map((c) => c.code));

    expect(enCodes.size).toBeGreaterThan(0);
    expect(frCodes.size).toBe(enCodes.size);
    expect(roCodes.size).toBe(enCodes.size);

    for (const code of enCodes) {
      expect(frCodes.has(code)).toBe(true);
      expect(roCodes.has(code)).toBe(true);
    }
  });

  test("should not contain duplicate codes in English dataset", () => {
    const seen = new Set<string>();

    for (const country of EN_COUNTRIES) {
      expect(typeof country.code).toBe("string");
      expect(country.code.length).toBe(2);
      expect(seen.has(country.code)).toBeFalsy();
      seen.add(country.code);
    }
  });

  test("should include common countries like United States and France", () => {
    const hasUS = EN_COUNTRIES.some((c) => c.code === "US");
    const hasFR = EN_COUNTRIES.some((c) => c.code === "FR");

    expect(hasUS).toBe(true);
    expect(hasFR).toBe(true);
  });
});

describe("@talosjs/country - types", () => {
  test("should build a valid ICountry object", () => {
    const country: ICountry = {
      id: "country-us",
      name: "United States",
      code: "US",
    };

    expect(country.id).toBe("country-us");
    expect(country.name).toBe("United States");
    expect(country.code).toBe("US");
  });

  test("CountryType should be compatible with dataset codes", () => {
    const codeFromData = EN_COUNTRIES[0]?.code;
    const typedCode: CountryType | undefined = codeFromData;

    expect(typeof typedCode === "string" || typedCode === undefined).toBe(true);
  });

  test("CountryNameType should be compatible with dataset names", () => {
    const nameFromData = EN_COUNTRIES[0]?.name;
    const typedName: CountryNameType | undefined = nameFromData;

    expect(typeof typedName === "string" || typedName === undefined).toBe(true);
  });
});
