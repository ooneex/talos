import type * as A from "arktype";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type ValidationClassType = new (...args: any[]) => IAssert;

export type AssertType = A.Type;

export interface IAssert {
  getConstraint: () => AssertType;
  getErrorMessage: () => string | null;
  validate: (data: unknown, constraint?: AssertType) => ValidationResultType;
}

export type ValidationResultType = {
  isValid: boolean;
  message?: string;
};
