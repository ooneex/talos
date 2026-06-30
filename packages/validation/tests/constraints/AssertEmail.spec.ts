import { describe, expect, test } from "bun:test";
import { AssertEmail } from "@/constraints";

describe("AssertEmail", () => {
  const validator = new AssertEmail();

  test("should validate valid email addresses", () => {
    const validEmails = [
      "test@example.com",
      "user.name@domain.co.uk",
      "user+tag@example.org",
      "user_name@example-domain.com",
      "123@example.com",
      "test.email.with+symbol@example.com",
      "user@subdomain.example.com",
      "firstname.lastname@example.com",
      "1234567890@example.com",
      "email@example-one.com",
      "_______@example.com",
      "email@example.name",
      "email@example.museum",
      "email@example.co.jp",
      "firstname+lastname@example.com",
      "user..double.dot@example.com",
      ".user@example.com",
      "user.@example.com",
      "user@example..com",
    ];

    for (const email of validEmails) {
      const result = validator.validate(email);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject invalid email addresses", () => {
    const invalidEmails = [
      "plainaddress",
      "@missingdomain.com",
      "missing@.com",
      "missing@domain",
      "spaces @example.com",
      "user@domain .com",
      "user @domain.com",
      "user@domain com",
      "user@",
      "@domain.com",
      "user@@example.com",
      "user@example@com",
      "user name@example.com",
      "email@123.123.123.123",
    ];

    for (const email of invalidEmails) {
      const result = validator.validate(email);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid email address");
    }
  });

  test("should reject empty string", () => {
    const result = validator.validate("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Must be a valid email address");
  });

  test("should reject non-string values", () => {
    const invalidValues = [123, null, undefined, {}, [], true, false];

    for (const value of invalidValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should reject emails with invalid characters", () => {
    const invalidEmails = [
      "user@domain.c#m",
      "user@domain.c$m",
      "user@domain.c%m",
      "user@domain.c&m",
      "user@domain.c*m",
      "user@domain.c!m",
      "user@domain.c?m",
      "user@domain.c^m",
      "user@domain.c|m",
    ];

    for (const email of invalidEmails) {
      const result = validator.validate(email);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid email address");
    }
  });

  test("should validate basic email structure", () => {
    const validBasicEmails = [
      "a@b.co",
      "test@domain-with-dash.com",
      "test@sub-domain.example-domain.co.uk",
      "user+tag+more@example.com",
      "user_with_underscores@example.com",
      "123456789@example.com",
      "test@xn--example.com",
    ];

    for (const email of validBasicEmails) {
      const result = validator.validate(email);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject emails without proper domain structure", () => {
    const invalidEmails = ["user@domain", "user@domain.", "user@", "@domain.com"];

    for (const email of invalidEmails) {
      const result = validator.validate(email);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid email address");
    }
  });

  test("should reject emails with spaces", () => {
    const invalidEmails = [
      " user@example.com",
      "user @example.com",
      "user@ example.com",
      "user@example .com",
      "user@example.com ",
      "user name@example.com",
      "user@exam ple.com",
    ];

    for (const email of invalidEmails) {
      const result = validator.validate(email);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid email address");
    }
  });
});
