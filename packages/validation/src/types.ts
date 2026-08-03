import type * as A from "arktype";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type ValidationClassType = new (...args: any[]) => IAssert;

/**
 * A constraint keyed by field name — each value validates the matching key of the data object.
 * Example: `{ avatar: new AssertFile(), email: new AssertEmail() }`
 */
export type AssertRecordType = { [key: string]: AssertType | IAssert };

/** A single arktype constraint, as opposed to a record of constraints */
export type AssertSchemaType = A.Type;

export type AssertType = AssertSchemaType | AssertRecordType;

export interface IAssert {
  getConstraint: () => AssertType;
  getErrorMessage: () => string | null;
  validate: (data: unknown, constraint?: AssertType) => ValidationResultType;
}

export type ValidationResultType = {
  isValid: boolean;
  message?: string;
};
