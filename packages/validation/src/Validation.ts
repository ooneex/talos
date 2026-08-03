import { validateAssert } from "./guards";
import type { AssertType, IAssert, ValidationResultType } from "./types";

export abstract class Validation implements IAssert {
  protected constructor() {}

  public abstract getConstraint(): AssertType;
  public abstract getErrorMessage(): string | null;

  public validate(data: unknown, constraint?: AssertType): ValidationResultType {
    constraint = constraint || this.getConstraint();

    const result = validateAssert(constraint, data);

    if (!result.isValid) {
      return this.invalidResult(result.message);
    }

    return this.validResult();
  }

  protected invalidResult(fallbackMessage?: string): ValidationResultType {
    return {
      isValid: false,
      message: this.getErrorMessage() || fallbackMessage || "Validation failed",
    };
  }

  protected validResult(): ValidationResultType {
    return { isValid: true };
  }
}
