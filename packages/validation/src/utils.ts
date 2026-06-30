import * as A from "arktype";
import type { TypeParser } from "arktype/internal/type.ts";
import type { AssertType, ValidationResultType } from "./types";
import { Validation } from "./Validation";

// biome-ignore lint/complexity/noBannedTypes: trust me
export const Assert: TypeParser<{}> = A.type;

type ConcreteValidation = {
  new (
    // biome-ignore lint/suspicious/noExplicitAny: mixin pattern requires any
    ...args: any[]
  ): {
    getConstraint(): AssertType;
    getErrorMessage(): string | null;
    validate(data: unknown, constraint?: AssertType): ValidationResultType;
  };
};

export function createConstraint(constraintFn: () => AssertType, errorMessage: string | null): ConcreteValidation {
  return class extends Validation {
    public getConstraint(): AssertType {
      return constraintFn();
    }

    public getErrorMessage(): string | null {
      return errorMessage;
    }
  };
}

/**
 * Convert a JSON Schema type to TypeScript type string
 */
export const jsonSchemaToTypeString = (schema: unknown): string => {
  if (!schema || typeof schema !== "object") return "unknown";

  const schemaObj = schema as Record<string, unknown>;

  // Handle type property
  if (schemaObj.type) {
    switch (schemaObj.type) {
      case "string":
        return "string";
      case "number":
      case "integer":
        return "number";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      case "array":
        if (schemaObj.items) {
          return `${jsonSchemaToTypeString(schemaObj.items)}[]`;
        }
        return "unknown[]";
      case "object":
        if (schemaObj.properties && typeof schemaObj.properties === "object") {
          const props: string[] = [];
          const required = Array.isArray(schemaObj.required) ? schemaObj.required : [];

          for (const [key, value] of Object.entries(schemaObj.properties)) {
            const isRequired = required.includes(key);
            const propType = jsonSchemaToTypeString(value);
            props.push(`${key}${isRequired ? "" : "?"}: ${propType}`);
          }

          return `{ ${props.join("; ")} }`;
        }
        return "Record<string, unknown>";
    }
  }

  // Handle anyOf/oneOf (union types)
  if (schemaObj.anyOf || schemaObj.oneOf) {
    const schemas = schemaObj.anyOf || schemaObj.oneOf;
    if (Array.isArray(schemas)) {
      return schemas.map((s: unknown) => jsonSchemaToTypeString(s)).join(" | ");
    }
  }

  // Handle allOf (intersection types)
  if (schemaObj.allOf && Array.isArray(schemaObj.allOf)) {
    return schemaObj.allOf.map((s: unknown) => jsonSchemaToTypeString(s)).join(" & ");
  }

  return "unknown";
};
