import type { AssertType, ValidationResultType } from "../types";
import { Assert } from "../utils";
import { Validation } from "../Validation";

const URL_MAX_LENGTH: number = 2083;
const URL_REGEX: RegExp =
  /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .~-]*)*\/?(\?[&a-z\d%_.~+=-]*)?(#[-a-z\d_]*)?$/i;

const STRICT_URL_REGEX: RegExp =
  /^https?:\/\/(?:[-\w.])+(?::[0-9]+)?(?:\/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:#(?:[\w.])*)?)?$/;

export class AssertUrl extends Validation {
  public getConstraint(): AssertType {
    return Assert(`1 <= string <= ${URL_MAX_LENGTH}`);
  }

  public getErrorMessage(): string | null {
    return `URL must be between 1 and ${URL_MAX_LENGTH} characters and follow a valid URL format (e.g., https://example.com, http://sub.domain.co.uk/path)`;
  }

  public override validate(data: unknown, constraint?: AssertType): ValidationResultType {
    const basicValidation = super.validate(data, constraint);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    const url = data as string;

    if (url.match(/^(ftp|file|mailto|telnet|ssh|gopher):/i)) {
      return this.invalidResult("Invalid URL format");
    }

    if (url.includes("://") && !url.match(/^https?:\/\//i)) {
      return this.invalidResult("Invalid URL format");
    }

    if (url.trim() !== url) {
      return this.invalidResult("Invalid URL format");
    }

    if (url.includes("..") || url.startsWith(".") || url.includes("/.") || url.endsWith(".")) {
      return this.invalidResult("Invalid URL format");
    }

    if (!URL_REGEX.test(url)) {
      return this.invalidResult("Invalid URL format");
    }

    return this.validResult();
  }

  public validateStrict(data: unknown): ValidationResultType {
    const basicValidation = super.validate(data);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    if (!STRICT_URL_REGEX.test(data as string)) {
      return {
        isValid: false,
        message: "URL must include protocol (http:// or https://) and follow strict URL format",
      };
    }

    return this.validResult();
  }
}
