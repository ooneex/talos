import { type } from "arktype";
import type { AssertType, IAssert, ValidationResultType } from "./types";

export abstract class Validation implements IAssert {
  public abstract getConstraint(): AssertType;
  public abstract getErrorMessage(): string | null;

  public validate(data: unknown, constraint?: AssertType): ValidationResultType {
    constraint = constraint || this.getConstraint();

    const out = constraint(data);

    if (out instanceof type.errors) {
      return this.invalidResult(out.summary);
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
