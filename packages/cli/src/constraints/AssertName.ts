import { Assert, type AssertType, Validation, type ValidationResultType } from "@talosjs/validation";

const NAME_MIN_LENGTH = 1;
const NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9-]*$/;

export class AssertName extends Validation {
  public getConstraint(): AssertType {
    return Assert(`string >= ${NAME_MIN_LENGTH}`);
  }

  public getErrorMessage(): string | null {
    return "Name must start with a letter and contain only letters, numbers, and hyphens";
  }

  public override validate(data: unknown, constraint?: AssertType): ValidationResultType {
    const basicValidation = super.validate(data, constraint);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    const name = data as string;

    if (!NAME_REGEX.test(name)) {
      return {
        isValid: false,
        message: this.getErrorMessage() || "Invalid name format",
      };
    }

    return {
      isValid: true,
    };
  }
}
