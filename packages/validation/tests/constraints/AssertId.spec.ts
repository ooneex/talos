import { describe, expect, test } from "bun:test";
import { AssertId } from "@/constraints";

describe("AssertId", () => {
  const validator = new AssertId();

  test("should validate valid 25-character lowercase hex IDs", () => {
    const validIds = [
      "0123456789abcdef012345678",
      "abcdef0123456789abcdef012",
      "1234567890123456789012345",
      "abcdefabcdefabcdefabcdef1",
      "0000000000000000000000000",
      "ffffffffffffffffffffffffa",
      "1a2b3c4d5e6f7890123456789",
      "fedcba9876543210fedcba987",
      "123abc456def789012345abcd",
      "abcd1234ef5678901234abcde",
    ];

    for (const id of validIds) {
      const result = validator.validate(id);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject IDs with incorrect length", () => {
    const incorrectLengthIds = [
      "",
      "a",
      "ab",
      "abc",
      "1234",
      "123456789012345678901234",
      "12345678901234567890123456",
      "123456789012345678901234567890",
      "123456789012345678901234567890123456789012345",
      "a".repeat(24),
      "a".repeat(26),
      "a".repeat(50),
    ];

    for (const id of incorrectLengthIds) {
      const result = validator.validate(id);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "ID must be exactly 25 characters long and contain only lowercase hexadecimal characters (0-9, a-f)",
      );
    }
  });

  test("should reject IDs with uppercase letters", () => {
    const uppercaseIds = [
      "0123456789ABCDEF012345678",
      "0123456789abcdeF012345678",
      "0123456789Abcdef012345678",
      "A123456789abcdef012345678",
      "0123456789abcdef01234567A",
      "0123456789AbCdEf012345678",
      "AAAAAAAAAAAAAAAAAAAAAAAAA",
      "FFFFFFFFFFFFFFFFFFFFFFFFf",
      "123456789012345678901234B",
      "Z123456789abcdef012345678",
    ];

    for (const id of uppercaseIds) {
      const result = validator.validate(id);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "ID must be exactly 25 characters long and contain only lowercase hexadecimal characters (0-9, a-f)",
      );
    }
  });

  test("should reject IDs with invalid characters", () => {
    const invalidCharIds = [
      "0123456789abcdefg12345678",
      "0123456789abcdef01234567g",
      "g123456789abcdef012345678",
      "0123456789abcdef0123456zx",
      "012345678-abcdef012345678",
      "0123456789 abcdef0123456",
      "0123456789abcdef012345.78",
      "0123456789abcdef012345@78",
      "0123456789abcdef012345#78",
      "0123456789abcdef012345!78",
      "0123456789abcdef012345_78",
      "0123456789abcdef012345+78",
      "0123456789abcdef012345=78",
      "0123456789abcdef012345%78",
      "0123456789abcdef012345&78",
      "0123456789abcdef012345*78",
      "0123456789abcdef012345(78",
      "0123456789abcdef012345)78",
      "0123456789abcdef012345[78",
      "0123456789abcdef012345]78",
      "0123456789abcdef012345{78",
      "0123456789abcdef012345}78",
      "0123456789abcdef012345|78",
      "0123456789abcdef012345\\78",
      "0123456789abcdef012345/78",
      "0123456789abcdef012345:78",
      "0123456789abcdef012345;78",
      "0123456789abcdef012345<78",
      "0123456789abcdef012345>78",
      "0123456789abcdef012345,78",
      "0123456789abcdef012345?78",
    ];

    for (const id of invalidCharIds) {
      const result = validator.validate(id);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "ID must be exactly 25 characters long and contain only lowercase hexadecimal characters (0-9, a-f)",
      );
    }
  });

  test("should reject IDs with whitespace", () => {
    const whitespaceIds = [
      " 123456789abcdef012345678",
      "123456789abcdef012345678 ",
      " 123456789abcdef012345678 ",
      "123456789 abcdef012345678",
      "123456789\tabcdef012345678",
      "123456789\nabcdef012345678",
      "123456789\rabcdef012345678",
      "123456789abcdef\n012345678",
      "123456789abcdef\t012345678",
      "123456789abcdef\r012345678",
      "\n123456789abcdef012345678",
      "\t123456789abcdef012345678",
      "\r123456789abcdef012345678",
      "123456789abcdef012345678\n",
      "123456789abcdef012345678\t",
      "123456789abcdef012345678\r",
    ];

    for (const id of whitespaceIds) {
      const result = validator.validate(id);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "ID must be exactly 25 characters long and contain only lowercase hexadecimal characters (0-9, a-f)",
      );
    }
  });

  test("should reject non-string values", () => {
    const nonStringValues = [
      123,
      "0x123456789abcdef",
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
      Symbol("id"),
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

  test("should handle boundary hex values", () => {
    const boundaryIds = [
      "0000000000000000000000000",
      "ffffffffffffffffffffffffa",
      "123456789012345678901234a",
      "abcdefabcdefabcdefabcdef1",
    ];

    for (const id of boundaryIds) {
      const result = validator.validate(id);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject IDs that look valid but have subtle issues", () => {
    const subtleInvalidIds = [
      "0123456789abcdef012345678;",
      ";123456789abcdef012345678",
      "0123456789abcdef01234567",
      "0123456789abcdef0123456789",
      "０123456789abcdef012345678",
      "0123456789abcdef01234567８",
      "0123456789abcdef012345678\u200B",
      "\u200B0123456789abcdef012345678",
      "0123456789abcdef012345678\u00A0",
      "\u00A00123456789abcdef012345678",
    ];

    for (const id of subtleInvalidIds) {
      const result = validator.validate(id);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "ID must be exactly 25 characters long and contain only lowercase hexadecimal characters (0-9, a-f)",
      );
    }
  });

  test("should provide correct error message", () => {
    const result = validator.validate("invalid");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "ID must be exactly 25 characters long and contain only lowercase hexadecimal characters (0-9, a-f)",
    );
  });

  test("should return constraint correctly", () => {
    const constraint = validator.getConstraint();
    expect(constraint).toBeDefined();
  });

  test("should return error message correctly", () => {
    const errorMessage = validator.getErrorMessage();
    expect(errorMessage).toBe(
      "ID must be exactly 25 characters long and contain only lowercase hexadecimal characters (0-9, a-f)",
    );
  });

  test("should handle edge cases with exact character counts", () => {
    const exactLengthValidIds = [
      "0".repeat(25),
      "a".repeat(25),
      "f".repeat(25),
      "9".repeat(25),
      "1".repeat(25),
      "0123456789abcdef012345678",
    ];

    for (const id of exactLengthValidIds) {
      const result = validator.validate(id);
      expect(result.isValid).toBe(true);
    }

    const exactLengthInvalidIds = ["g".repeat(25), "z".repeat(25), "G".repeat(25), " ".repeat(25), "!".repeat(25)];

    for (const id of exactLengthInvalidIds) {
      const result = validator.validate(id);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "ID must be exactly 25 characters long and contain only lowercase hexadecimal characters (0-9, a-f)",
      );
    }
  });
});
