import type { AssertType, ValidationResultType } from "../types";
import { Assert } from "../utils";
import { Validation } from "../Validation";

const CHAT_QUERY_MIN_LENGTH: number = 1;
const CHAT_QUERY_MAX_LENGTH: number = 2000;
const CHAT_QUERY_FORBIDDEN_PATTERNS: RegExp[] = [
  /<script[^>]*>.*?<\/script>/i,
  /<\/?[a-zA-Z][^>]*>/,
  /javascript:/i,
  /data:/i,
  /vbscript:/i,
];

export class AssertChatQuery extends Validation {
  public getConstraint(): AssertType {
    return Assert(`${CHAT_QUERY_MIN_LENGTH} <= string <= ${CHAT_QUERY_MAX_LENGTH}`);
  }

  public getErrorMessage(): string | null {
    return "Chat query must be between 1 and 2000 characters and cannot contain HTML tags, scripts, or unsafe protocols";
  }

  public override validate(data: unknown, constraint?: AssertType): ValidationResultType {
    const basicValidation = super.validate(data, constraint);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    for (const pattern of CHAT_QUERY_FORBIDDEN_PATTERNS) {
      if (pattern.test(data as string)) {
        return this.invalidResult("Invalid chat query");
      }
    }

    return this.validResult();
  }
}
