import { Assert, type AssertType, Validation, type ValidationResultType } from "@talosjs/validation";

const DESTINATION_MIN_LENGTH = 1;
const DESTINATION_REGEX = /^[a-zA-Z0-9._~/-]+$/;

export class AssertDestination extends Validation {
  public getConstraint(): AssertType {
    return Assert(`string >= ${DESTINATION_MIN_LENGTH}`);
  }

  public getErrorMessage(): string | null {
    return "Destination must be a valid path (letters, numbers, dots, hyphens, underscores, and slashes)";
  }

  public override validate(data: unknown, constraint?: AssertType): ValidationResultType {
    const basicValidation = super.validate(data, constraint);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    const destination = data as string;

    if (destination.trim() === "" || !DESTINATION_REGEX.test(destination)) {
      return {
        isValid: false,
        message: this.getErrorMessage() || "Invalid destination format",
      };
    }

    return {
      isValid: true,
    };
  }
}
