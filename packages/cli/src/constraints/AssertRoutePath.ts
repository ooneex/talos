import { Assert, type AssertType, Validation, type ValidationResultType } from "@talosjs/validation";

const ROUTE_PATH_MIN_LENGTH = 1;
const ROUTE_PATH_REGEX = /^\/[\w\-/:]*$/;
const VALID_SEGMENT_REGEX = /^[a-zA-Z0-9\-_]+$/;
const PARAM_SEGMENT_REGEX = /^:[a-zA-Z][a-zA-Z0-9]*$/;

export class AssertRoutePath extends Validation {
  public getConstraint(): AssertType {
    return Assert(`string >= ${ROUTE_PATH_MIN_LENGTH}`);
  }

  public getErrorMessage(): string | null {
    return "Route path must start with '/' and contain only valid segments (e.g., '/users', '/api/users/:id')";
  }

  public override validate(data: unknown, constraint?: AssertType): ValidationResultType {
    const basicValidation = super.validate(data, constraint);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    const path = data as string;

    // Check for leading or trailing whitespace
    if (path.trim() !== path) {
      return {
        isValid: false,
        message: this.getErrorMessage() || "Invalid route path format",
      };
    }

    // Must start with /
    if (!path.startsWith("/")) {
      return {
        isValid: false,
        message: "Route path must start with '/'",
      };
    }

    // Check for trailing slash (not allowed except for root "/")
    if (path.length > 1 && path.endsWith("/")) {
      return {
        isValid: false,
        message: "Route path cannot end with '/' (except for root path)",
      };
    }

    // Basic format check
    if (!ROUTE_PATH_REGEX.test(path)) {
      return {
        isValid: false,
        message: this.getErrorMessage() || "Invalid route path format",
      };
    }

    // If path is just "/", it's valid
    if (path === "/") {
      return {
        isValid: true,
      };
    }

    // Split into segments and validate each
    const segments = path.slice(1).split("/");

    for (const segment of segments) {
      // Empty segments (double slashes) are not allowed
      if (!segment) {
        return {
          isValid: false,
          message: "Route path cannot contain empty segments (double slashes)",
        };
      }

      // Check if it's a parameter segment (starts with :)
      if (segment.startsWith(":")) {
        if (!PARAM_SEGMENT_REGEX.test(segment)) {
          return {
            isValid: false,
            message: `Invalid parameter segment '${segment}'. Parameters must follow format ':paramName' with alphanumeric characters only`,
          };
        }
      } else {
        // Regular segment validation
        if (!VALID_SEGMENT_REGEX.test(segment)) {
          return {
            isValid: false,
            message: `Invalid path segment '${segment}'. Segments must contain only letters, numbers, hyphens, and underscores`,
          };
        }
      }
    }

    return {
      isValid: true,
    };
  }
}
