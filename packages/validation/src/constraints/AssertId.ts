import type { AssertType, ValidationResultType } from "../types";
import { Assert } from "../utils";
import { Validation } from "../Validation";

const ID_REGEX: RegExp = /^[0-9a-f]+$/;
const DEFAULT_ID_LENGTH: number = 25;

export class AssertId extends Validation {
  public getConstraint(): AssertType {
    return Assert(`${DEFAULT_ID_LENGTH} <= string <= ${DEFAULT_ID_LENGTH}`);
  }

  public getErrorMessage(): string | null {
    return "ID must be exactly 25 characters long and contain only lowercase hexadecimal characters (0-9, a-f)";
  }

  public override validate(data: unknown, constraint?: AssertType): ValidationResultType {
    const basicValidation = super.validate(data, constraint);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    if (!ID_REGEX.test(data as string)) {
      return this.invalidResult("Invalid ID format");
    }

    return this.validResult();
  }
}
