import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { container } from "@talosjs/container";
import { YAML } from "bun";
import { Translation, TranslationException } from "@/index";
import type { TranslationDictType } from "@/types";

const FIXTURE = join(import.meta.dir, "..", "src", "translations.yml");

class TestTranslation extends Translation {
  public getName(): string {
    return "test";
  }

  public getDict(): TranslationDictType {
    return container.getConstant<TranslationDictType>("translations.dict");
  }
}

describe("Translation", () => {
  const translation = new TestTranslation();

  beforeAll(async () => {
    const dict = YAML.parse(await Bun.file(FIXTURE).text()) as TranslationDictType;
    container.addConstant("translations.dict", dict);
  });

  describe("Nested keys", () => {
    test("should resolve a nested key", () => {
      expect(translation.trans("user.profile.name", { lang: "fr" })).toBe("Nom complet");
    });

    test("should default to the en fallback when no lang is given", () => {
      expect(translation.trans("user.profile.email")).toBe("Email address");
    });

    test("should fall back to en for an unsupported locale", () => {
      expect(translation.trans("user.profile.name", { lang: "de" })).toBe("Full name");
    });
  });

  describe("Interpolation", () => {
    test("should fill a single param", () => {
      expect(translation.trans("coach.session.welcome", { lang: "fr", params: { name: "Marie" } })).toBe(
        "Bon retour, Marie !",
      );
    });

    test("should fill multiple params", () => {
      expect(
        translation.trans("coach.session.scheduled", {
          params: { coach: "Alex", date: "Monday" },
        }),
      ).toBe("Your session with Alex is set for Monday");
    });

    test("should leave unknown placeholders untouched", () => {
      expect(translation.trans("coach.session.welcome", {})).toBe("Welcome back, {{ name }}!");
    });
  });

  describe("Pluralization", () => {
    test("should use the singular key when count is 1", () => {
      expect(translation.trans("coach.notifications.unread", { count: 1 })).toBe("You have 1 unread notification");
    });

    test("should use the _plural key when count is greater than 1", () => {
      expect(translation.trans("coach.notifications.unread", { count: 3 })).toBe("You have 3 unread notifications");
    });

    test("should use the _plural key when count is negative", () => {
      expect(translation.trans("coach.notifications.unread", { count: -2 })).toBe("You have -2 unread notifications");
    });

    test("should use the _zero key when count is 0", () => {
      expect(translation.trans("coach.notifications.unread", { count: 0 })).toBe("No unread notifications");
    });

    test("should auto-inject count into interpolation", () => {
      expect(translation.trans("coach.notifications.unread", { lang: "fr", count: 5 })).toBe(
        "Vous avez 5 notifications non lues",
      );
    });
  });

  describe("Validation messages", () => {
    test("should interpolate multiple named params", () => {
      expect(
        translation.trans("validation.min_length", {
          params: { field: "password", min: 8 },
        }),
      ).toBe("The password must be at least 8 characters");
    });
  });

  describe("Lookup", () => {
    test("has() should be true for an existing key", () => {
      expect(translation.has("validation.required")).toBe(true);
    });

    test("has() should be false for a missing key", () => {
      expect(translation.has("validation.does_not_exist")).toBe(false);
    });

    test("trans() should throw for a missing key", () => {
      expect(() => translation.trans("validation.does_not_exist")).toThrow(TranslationException);
    });
  });
});
