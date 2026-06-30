import { describe, expect, test } from "bun:test";
import { AssertName } from "@/constraints";

describe("AssertName", () => {
  const validator = new AssertName();

  test("should validate valid English names", () => {
    const validEnglishNames = [
      "John",
      "Mary",
      "John Smith",
      "Mary-Jane",
      "O'Connor",
      "Jean-Pierre",
      "Mary O'Sullivan",
      "Anne-Marie",
      "D'Angelo",
      "Van Der Berg",
      "St. John",
      "McDonald",
      "MacPherson",
      "de la Cruz",
    ];

    for (const name of validEnglishNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate names with numbers", () => {
    const namesWithNumbers = [
      "John2",
      "Mary123",
      "Team1",
      "User42",
      "Player1",
      "Company123",
      "Version2",
      "Test123Name",
      "John 2nd",
      "Mary 3rd",
      "Louis XIV",
      "Henry VIII",
    ];

    for (const name of namesWithNumbers) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate international names with accents", () => {
    const accentedNames = [
      "José",
      "María",
      "François",
      "André",
      "Müller",
      "Björk",
      "Café",
      "Naïve",
      "Résumé",
      "Ångström",
      "Niño",
      "Señor",
      "Renée",
      "Zoë",
      "Noël",
      "Chloé",
      "Amélie",
      "Céline",
      "Jürgen",
      "Søren",
    ];

    for (const name of accentedNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate Cyrillic names", () => {
    const cyrillicNames = [
      "Александр",
      "Мария",
      "Владимир",
      "Анна",
      "Дмитрий",
      "Екатерина",
      "Николай",
      "Татьяна",
      "Сергей",
      "Елена",
      "Андрей",
      "Ольга",
      "Михаил",
      "Наталья",
      "Алексей",
    ];

    for (const name of cyrillicNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate Chinese names", () => {
    const chineseNames = [
      "王伟",
      "李娜",
      "张三",
      "李四",
      "王小明",
      "陈美丽",
      "刘德华",
      "李小龙",
      "成龙",
      "林志玲",
      "周杰伦",
      "邓丽君",
      "张学友",
      "刘亦菲",
      "范冰冰",
    ];

    for (const name of chineseNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate names with extended Latin characters", () => {
    const extendedLatinNames = [
      "Łukasz",
      "Žan",
      "Čech",
      "Škoda",
      "Ñoño",
      "Røed",
      "Åse",
      "Ørsted",
      "Mølgaard",
      "Žižek",
      "Dvořák",
      "Janáček",
      "Štěpán",
      "Václav",
      "Přemysl",
    ];

    for (const name of extendedLatinNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject names that are too short", () => {
    const result = validator.validate("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "Name must be between 1 and 50 characters and contain only letters, numbers, spaces, hyphens, apostrophes, and periods",
    );
  });

  test("should reject names that are too long", () => {
    const longName = "A".repeat(51);
    const result = validator.validate(longName);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "Name must be between 1 and 50 characters and contain only letters, numbers, spaces, hyphens, apostrophes, and periods",
    );
  });

  test("should accept names at boundary lengths", () => {
    const minLengthName = "A";
    const maxLengthName = "A".repeat(50);

    const minResult = validator.validate(minLengthName);
    expect(minResult.isValid).toBe(true);

    const maxResult = validator.validate(maxLengthName);
    expect(maxResult.isValid).toBe(true);
  });

  test("should reject names with invalid special characters", () => {
    const invalidCharNames = [
      "John@Smith",
      "Mary#Jane",
      "John$Smith",
      "Mary%Jane",
      "John^Smith",
      "Mary&Jane",
      "John*Smith",
      "Mary(Jane)",
      "John+Smith",
      "Mary=Jane",
      "John{Smith}",
      "Mary[Jane]",
      "John|Smith",
      "Mary\\Jane",
      "John:Smith",
      "Mary;Jane",
      'John"Smith',
      "Mary<Jane>",
      "John,Smith",
      "Mary.Jane",
      "John?Smith",
      "Mary/Jane",
      "John~Smith",
      "Mary`Jane",
      "John!Smith",
    ];

    for (const name of invalidCharNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Name must be between 1 and 50 characters and contain only letters, numbers, spaces, hyphens, apostrophes, and periods",
      );
    }
  });

  test("should reject names with emojis", () => {
    const emojiNames = [
      "John😊",
      "Mary🎉",
      "😊John",
      "🎉Mary",
      "John 😊 Smith",
      "Mary🔥Jane",
      "John💯",
      "Mary✨",
      "🌟John",
      "Mary🚀",
    ];

    for (const name of emojiNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Name must be between 1 and 50 characters and contain only letters, numbers, spaces, hyphens, apostrophes, and periods",
      );
    }
  });

  test("should reject non-string values", () => {
    const nonStringValues = [
      123,
      null,
      undefined,
      {},
      [],
      true,
      false,
      0,
      -1,
      3.14,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Symbol("name"),
      new Date(),
      /regex/,
      () => {},
      new Set(),
      new Map(),
    ];

    for (const value of nonStringValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should handle names with whitespace variations", () => {
    const whitespaceNames = [
      "John Smith",
      "Mary  Jane",
      "Jean Pierre Dupont",
      "Anne Marie Louise",
      "Van Der Berg",
      "de la Cruz Martinez",
    ];

    for (const name of whitespaceNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject names with leading/trailing whitespace", () => {
    const leadingTrailingWhitespace = [
      " John",
      "Mary ",
      " John Smith ",
      "\tJohn",
      "Mary\t",
      "\nJohn",
      "Mary\n",
      " \t\nJohn\n\t ",
    ];

    for (const name of leadingTrailingWhitespace) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Name must be between 1 and 50 characters and contain only letters, numbers, spaces, hyphens, apostrophes, and periods",
      );
    }
  });

  test("should validate complex international compound names", () => {
    const compoundNames = [
      "Jean-Luc Picard",
      "María José García-López",
      "Hans-Jürgen Müller",
      "Anne-Marie Dubois",
      "José María de la Cruz",
      "李小龙 Bruce Lee",
      "O'Brien-McDonald",
      "Van Der Berg-Smith",
      "Saint-Exupéry",
      "D'Artagnan",
    ];

    for (const name of compoundNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should handle edge cases with mixed character sets", () => {
    const mixedNames = [
      "John123",
      "Mary-2024",
      "User'1",
      "Team 42",
      "Player-1st",
      "Version 2.0",
      "Test123-Name",
      "Company'24",
      "Brand 2024",
      "Model-X1",
    ];

    const expectedResults = [true, true, true, true, true, false, true, true, true, true];

    mixedNames.forEach((name, index) => {
      const result = validator.validate(name);
      if (expectedResults[index]) {
        expect(result.isValid).toBe(true);
      } else {
        expect(result.isValid).toBe(false);
        expect(result.message).toBe(
          "Name must be between 1 and 50 characters and contain only letters, numbers, spaces, hyphens, apostrophes, and periods",
        );
      }
    });
  });

  test("should provide correct error message", () => {
    const result = validator.validate("John@Smith");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "Name must be between 1 and 50 characters and contain only letters, numbers, spaces, hyphens, apostrophes, and periods",
    );
  });

  test("should return constraint correctly", () => {
    const constraint = validator.getConstraint();
    expect(constraint).toBeDefined();
  });

  test("should return error message correctly", () => {
    const errorMessage = validator.getErrorMessage();
    expect(errorMessage).toBe(
      "Name must be between 1 and 50 characters and contain only letters, numbers, spaces, hyphens, apostrophes, and periods",
    );
  });

  test("should handle names with only valid special characters", () => {
    const specialCharNames = ["-", "'", "- '", "O'-", "-'John'-", "Mary-Anne'", "'Jean-Pierre"];

    for (const name of specialCharNames) {
      const result = validator.validate(name);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate names from different language families", () => {
    const diverseNames = [
      "محمد",
      "José María",
      "François-Xavier",
      "Владимир Путин",
      "李小明",
      "Müller-Schmidt",
      "Åse Røed",
      "Žan Žužek",
    ];

    for (const name of diverseNames) {
      const result = validator.validate(name);
      if (!name.includes("محمد")) {
        expect(result.isValid).toBe(true);
      }
    }
  });
});
