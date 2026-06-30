import type { AssertType, ValidationResultType } from "../types";
import { Assert } from "../utils";
import { Validation } from "../Validation";

const HEXA_COLOR_3_DIGIT_REGEX: RegExp = /^#[0-9A-Fa-f]{3}$/;
const HEXA_COLOR_6_DIGIT_REGEX: RegExp = /^#[0-9A-Fa-f]{6}$/;

export class AssertHexaColor extends Validation {
  public getConstraint(): AssertType {
    return Assert("string");
  }

  public getErrorMessage(): string | null {
    return "Value must be a valid hexadecimal color (e.g., #fff, #ffffff, #A1B2C3)";
  }

  public override validate(data: unknown, constraint?: AssertType): ValidationResultType {
    const basicValidation = super.validate(data, constraint);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    const color = data as string;
    if (!HEXA_COLOR_3_DIGIT_REGEX.test(color) && !HEXA_COLOR_6_DIGIT_REGEX.test(color)) {
      return this.invalidResult("Invalid hexadecimal color");
    }

    return this.validResult();
  }
}
