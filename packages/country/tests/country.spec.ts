import { describe, expect, test } from "bun:test";
import { getCountry } from "@/country";
import type { CountryLangType, CountryType } from "../src/types";

describe("@talosjs/country - getCountry", () => {
  test("should return the country localized in the requested language", () => {
    expect(getCountry("FR", "en")).toEqual({
      name: "France",
      code: "FR",
      lang: "en",
    });
    expect(getCountry("DE", "en")?.name).toBe("Germany");
    expect(getCountry("DE", "fr")?.name).toBe("Allemagne");
  });

  test("should return the same code with a different name per language", () => {
    const en = getCountry("US", "en");
    const ro = getCountry("US", "ro");

    expect(en?.code).toBe("US");
    expect(ro?.code).toBe("US");
    expect(en?.name).not.toBe(ro?.name);
  });

  test("should return undefined for an unknown code or language", () => {
    expect(getCountry("XX" as CountryType, "en")).toBeUndefined();
    expect(getCountry("FR", "xx" as CountryLangType)).toBeUndefined();
  });

  test("should return the same reference on repeated lookups", () => {
    expect(getCountry("IT", "it")).toBe(getCountry("IT", "it"));
  });
});
