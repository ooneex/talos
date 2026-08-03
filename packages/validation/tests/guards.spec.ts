import { describe, expect, test } from "bun:test";
import { AssertEmail } from "@/constraints/AssertEmail";
import { AssertFile } from "@/constraints/AssertFile";
import { isAssert, isAssertRecord, isAssertType, validateAssert } from "@/guards";
import type { AssertType, IAssert } from "@/types";
import { Assert } from "@/utils";

describe("isAssertType", () => {
  test("recognizes arktype constraints only", () => {
    expect(isAssertType(Assert("string"))).toBe(true);
    expect(isAssertType(new AssertEmail())).toBe(false);
    expect(isAssertType({ email: new AssertEmail() })).toBe(false);
  });
});

describe("isAssert", () => {
  test("recognizes IAssert instances only", () => {
    expect(isAssert(new AssertEmail())).toBe(true);
    expect(isAssert(Assert("string"))).toBe(false);
    expect(isAssert({ validate: "not-a-function" })).toBe(false);
    expect(isAssert(null)).toBe(false);
  });
});

describe("isAssertRecord", () => {
  test("recognizes records of constraints", () => {
    expect(isAssertRecord({ email: new AssertEmail(), id: Assert("string") })).toBe(true);
    expect(isAssertRecord({})).toBe(true);
  });

  test("rejects constraints and non-objects", () => {
    expect(isAssertRecord(new AssertEmail())).toBe(false);
    expect(isAssertRecord(Assert("string"))).toBe(false);
    expect(isAssertRecord({ toJsonSchema: () => ({}) })).toBe(false);
    expect(isAssertRecord(null)).toBe(false);
    expect(isAssertRecord("string")).toBe(false);
  });
});

describe("validateAssert", () => {
  test("validates against an arktype constraint", () => {
    expect(validateAssert(Assert("string"), "value").isValid).toBe(true);

    const result = validateAssert(Assert("string"), 42);

    expect(result.isValid).toBe(false);
    expect(result.message).toBeString();
  });

  test("validates against an IAssert instance", () => {
    expect(validateAssert(new AssertEmail(), "user@example.com").isValid).toBe(true);
    expect(validateAssert(new AssertEmail(), "not-an-email").isValid).toBe(false);
  });

  test("validates each key of a record against the matching field", () => {
    const constraint: AssertType = {
      id: Assert("string"),
      email: new AssertEmail(),
      files: new AssertFile({ avatar: { types: ["image/*"] } }),
    };

    const valid = validateAssert(constraint, {
      id: "123",
      email: "user@example.com",
      files: { avatar: new File(["x"], "photo.png", { type: "image/png" }) },
    });

    expect(valid.isValid).toBe(true);
  });

  test("reports the failing key of a record", () => {
    const result = validateAssert({ email: new AssertEmail() }, { email: "not-an-email" });

    expect(result.isValid).toBe(false);
    expect(result.message).toStartWith('"email": ');
  });

  test("reports the failing key of a nested record", () => {
    const result = validateAssert({ user: { email: new AssertEmail() } }, { user: { email: "nope" } });

    expect(result.message).toStartWith('"user": "email": ');
  });

  test("falls back to a default message when a constraint fails silently", () => {
    const silent: IAssert = {
      getConstraint: () => Assert("string"),
      getErrorMessage: () => null,
      validate: () => ({ isValid: false }),
    };

    expect(validateAssert({ name: silent }, { name: "x" }).message).toBe('"name": Validation failed');
  });

  test("rejects a non-object value for a record constraint", () => {
    const result = validateAssert({ email: new AssertEmail() }, "not-an-object");

    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Value must be an object");
  });

  test("accepts anything for an unusable constraint", () => {
    expect(validateAssert({ toJsonSchema: () => ({}) } as unknown as AssertType, "value").isValid).toBe(true);
  });
});
