import { type } from "arktype";
import type { AssertRecordType, AssertSchemaType, AssertType, IAssert, ValidationResultType } from "./types";

/**
 * An arktype constraint is callable, everything else is a plain object
 */
export const isAssertType = (value: unknown): value is AssertSchemaType => typeof value === "function";

export const isAssert = (value: unknown): value is IAssert =>
  value !== null &&
  typeof value === "object" &&
  "validate" in value &&
  typeof (value as IAssert).validate === "function";

/**
 * A record of constraints, as opposed to a constraint itself — anything exposing
 * `validate` (IAssert) or `toJsonSchema` (arktype) is the latter
 */
export const isAssertRecord = (value: unknown): value is AssertRecordType =>
  value !== null &&
  typeof value === "object" &&
  !isAssert(value) &&
  typeof (value as { toJsonSchema?: unknown }).toJsonSchema !== "function";

/**
 * Validate a value against any constraint shape: an arktype type, an IAssert
 * instance, or a record of either keyed by field name
 */
export const validateAssert = (constraint: AssertType | IAssert, data: unknown): ValidationResultType => {
  if (isAssert(constraint)) {
    return constraint.validate(data);
  }

  if (isAssertRecord(constraint)) {
    if (data === null || typeof data !== "object") {
      return { isValid: false, message: "Value must be an object" };
    }

    const values = data as Record<string, unknown>;

    for (const [key, entry] of Object.entries(constraint)) {
      const result = validateAssert(entry, values[key]);
      if (!result.isValid) {
        return { isValid: false, message: `"${key}": ${result.message || "Validation failed"}` };
      }
    }

    return { isValid: true };
  }

  if (isAssertType(constraint)) {
    const out = constraint(data);
    if (out instanceof type.errors) {
      return { isValid: false, message: out.summary };
    }
  }

  return { isValid: true };
};
