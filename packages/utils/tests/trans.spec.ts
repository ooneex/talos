import { describe, expect, test } from "bun:test";
import { has, type TransDictType, trans } from "@/trans";

const dict: TransDictType = {
  user: {
    profile: {
      name: { en: "Full name", fr: "Nom complet" },
      email: { en: "Email address" },
    },
  },
  greeting: { en: "Welcome back, {{ name }}!", fr: "Bon retour, {{ name }} !" },
  unread: {
    en: "You have {{ count }} unread notifications",
    fr: "Vous avez {{ count }} notifications non lues",
  },
  unread_zero: { en: "No unread notifications" },
  unread_plural: { en: "You have {{ count }} unread notifications" },
};

describe("trans", () => {
  describe("resolution", () => {
    test("should resolve a nested key for the requested locale", () => {
      expect(trans(dict, "user.profile.name", { lang: "fr" })).toEqual({
        found: true,
        value: "Nom complet",
      });
    });

    test("should fall back to the fallback locale when the requested one is missing", () => {
      expect(trans(dict, "user.profile.email", { lang: "fr" })).toEqual({
        found: true,
        value: "Email address",
      });
    });

    test("should report a missing key", () => {
      expect(trans(dict, "user.profile.unknown")).toEqual({ found: false, reason: "key" });
    });

    test("should report a missing locale when no fallback exists", () => {
      expect(trans(dict, "user.profile.name", { lang: "de", fallbackLang: "es" })).toEqual({
        found: false,
        reason: "locale",
      });
    });
  });

  describe("interpolation", () => {
    test("should interpolate params", () => {
      expect(trans(dict, "greeting", { params: { name: "Marie" } })).toEqual({
        found: true,
        value: "Welcome back, Marie!",
      });
    });

    test("should leave unmatched placeholders untouched", () => {
      expect(trans(dict, "greeting")).toEqual({
        found: true,
        value: "Welcome back, {{ name }}!",
      });
    });

    test("should expose count as an interpolation value", () => {
      expect(trans(dict, "unread", { count: 3 })).toEqual({
        found: true,
        value: "You have 3 unread notifications",
      });
    });
  });

  describe("pluralization", () => {
    test("should pick the _zero variant for count 0", () => {
      expect(trans(dict, "unread", { count: 0 })).toEqual({
        found: true,
        value: "No unread notifications",
      });
    });

    test("should pick the _plural variant for count > 1", () => {
      expect(trans(dict, "unread", { count: 5 })).toEqual({
        found: true,
        value: "You have 5 unread notifications",
      });
    });

    test("should pick the singular key for count 1", () => {
      expect(trans(dict, "unread", { count: 1 })).toEqual({
        found: true,
        value: "You have 1 unread notifications",
      });
    });
  });
});

describe("has", () => {
  test("should return true for an existing key", () => {
    expect(has(dict, "user.profile.name")).toBe(true);
  });

  test("should return false for a missing key", () => {
    expect(has(dict, "user.profile.unknown")).toBe(false);
  });

  test("should return false when traversing through a non-object", () => {
    expect(has(dict, "user.profile.name.deeper")).toBe(false);
  });
});
