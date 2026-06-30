import { Assert, type AssertType, Validation, type ValidationResultType } from "@talosjs/validation";

const ROUTE_NAME_REGEX = /^[a-zA-Z0-9]+\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/;

export class AssertRouteName extends Validation {
  public getConstraint(): AssertType {
    return Assert("string >= 7");
  }

  public getErrorMessage(): string | null {
    return "Route name must follow format: namespace.resource.action (e.g., 'api.users.list')";
  }

  public override validate(data: unknown, constraint?: AssertType): ValidationResultType {
    const basicValidation = super.validate(data, constraint);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    const routeName = data as string;

    // Check for leading or trailing whitespace
    if (routeName.trim() !== routeName) {
      return {
        isValid: false,
        message: this.getErrorMessage() || "Invalid route name format",
      };
    }

    // Check basic format (three non-empty segments separated by dots)
    if (!ROUTE_NAME_REGEX.test(routeName)) {
      return {
        isValid: false,
        message: this.getErrorMessage() || "Invalid route name format",
      };
    }

    return {
      isValid: true,
    };
  }
}
