import { HTTP_METHODS } from "@talosjs/types";
import { Assert, type AssertType, Validation, type ValidationResultType } from "@talosjs/validation";

export class AssertRouteMethod extends Validation {
  public getConstraint(): AssertType {
    return Assert("string >= 3");
  }

  public getErrorMessage(): string | null {
    return `Route method must be one of: ${HTTP_METHODS.join(", ")}`;
  }

  public override validate(data: unknown, constraint?: AssertType): ValidationResultType {
    const basicValidation = super.validate(data, constraint);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    const method = data as string;

    // Check for leading or trailing whitespace
    if (method.trim() !== method) {
      return {
        isValid: false,
        message: this.getErrorMessage() || "Invalid route method format",
      };
    }

    // Convert to uppercase for comparison
    const upperMethod = method.toUpperCase();

    // Check if the method is valid
    if (!HTTP_METHODS.includes(upperMethod as (typeof HTTP_METHODS)[number])) {
      return {
        isValid: false,
        message: this.getErrorMessage() || "Invalid route method",
      };
    }

    return {
      isValid: true,
    };
  }
}
