import { describe, expect, test } from "bun:test";
import { Environment } from "@talosjs/app-env";
import { AssertAppEnv } from "@/constraints";

describe("AssertAppEnv", () => {
  const validator = new AssertAppEnv();
  const environments = Object.values(Environment);

  describe("valid environments", () => {
    test("should validate all valid environment values", () => {
      for (const env of environments) {
        const result = validator.validate(env);
        expect(result.isValid).toBe(true);
      }
    });

    test("should validate 'local' environment", () => {
      const result = validator.validate("local");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'development' environment", () => {
      const result = validator.validate("development");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'staging' environment", () => {
      const result = validator.validate("staging");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'testing' environment", () => {
      const result = validator.validate("testing");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'test' environment", () => {
      const result = validator.validate("test");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'qa' environment", () => {
      const result = validator.validate("qa");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'uat' environment", () => {
      const result = validator.validate("uat");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'integration' environment", () => {
      const result = validator.validate("integration");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'preview' environment", () => {
      const result = validator.validate("preview");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'demo' environment", () => {
      const result = validator.validate("demo");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'sandbox' environment", () => {
      const result = validator.validate("sandbox");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'beta' environment", () => {
      const result = validator.validate("beta");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'canary' environment", () => {
      const result = validator.validate("canary");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'hotfix' environment", () => {
      const result = validator.validate("hotfix");
      expect(result.isValid).toBe(true);
    });

    test("should validate 'production' environment", () => {
      const result = validator.validate("production");
      expect(result.isValid).toBe(true);
    });
  });

  describe("invalid environments", () => {
    test("should reject empty string", () => {
      const result = validator.validate("");
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(`Must be a valid environment (${environments.join(", ")})`);
    });

    test("should reject invalid environment names", () => {
      const invalidEnvs = ["prod", "dev", "stage", "live", "preprod", "release", "master", "main"];

      for (const env of invalidEnvs) {
        const result = validator.validate(env);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe(`Must be a valid environment (${environments.join(", ")})`);
      }
    });

    test("should reject uppercase environment names", () => {
      const uppercaseEnvs = ["LOCAL", "DEVELOPMENT", "STAGING", "TESTING", "PRODUCTION", "QA", "UAT", "BETA", "CANARY"];

      for (const env of uppercaseEnvs) {
        const result = validator.validate(env);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe(`Must be a valid environment (${environments.join(", ")})`);
      }
    });

    test("should reject mixed case environment names", () => {
      const mixedCaseEnvs = ["Local", "Development", "Staging", "Production", "Testing", "Preview", "Demo"];

      for (const env of mixedCaseEnvs) {
        const result = validator.validate(env);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe(`Must be a valid environment (${environments.join(", ")})`);
      }
    });

    test("should reject environment names with extra whitespace", () => {
      const invalidEnvs = [" local", "local ", " local ", "  development", "staging  "];

      for (const env of invalidEnvs) {
        const result = validator.validate(env);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe(`Must be a valid environment (${environments.join(", ")})`);
      }
    });

    test("should reject environment names with special characters", () => {
      const invalidEnvs = [
        "local!",
        "development@",
        "staging#",
        "production$",
        "test-env",
        "test_env",
        "test.env",
        "test/env",
      ];

      for (const env of invalidEnvs) {
        const result = validator.validate(env);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe(`Must be a valid environment (${environments.join(", ")})`);
      }
    });
  });

  describe("non-string values", () => {
    test("should reject non-string values", () => {
      const invalidValues = [123, null, undefined, {}, [], true, false, Symbol("env"), new Date()];

      for (const value of invalidValues) {
        const result = validator.validate(value);
        expect(result.isValid).toBe(false);
      }
    });

    test("should reject numeric values", () => {
      const result = validator.validate(1);
      expect(result.isValid).toBe(false);
    });

    test("should reject boolean values", () => {
      expect(validator.validate(true).isValid).toBe(false);
      expect(validator.validate(false).isValid).toBe(false);
    });
  });

  describe("getter methods", () => {
    test("should return constraint correctly", () => {
      const constraint = validator.getConstraint();
      expect(constraint).toBeDefined();
    });

    test("should return error message correctly", () => {
      const errorMessage = validator.getErrorMessage();
      expect(errorMessage).toBe(`Must be a valid environment (${environments.join(", ")})`);
    });

    test("should include all environments in error message", () => {
      const errorMessage = validator.getErrorMessage();

      for (const env of environments) {
        expect(errorMessage).toContain(env);
      }
    });
  });

  describe("edge cases", () => {
    test("should reject null value", () => {
      const result = validator.validate(null);
      expect(result.isValid).toBe(false);
    });

    test("should reject undefined value", () => {
      const result = validator.validate(undefined);
      expect(result.isValid).toBe(false);
    });

    test("should reject object with toString returning valid env", () => {
      const objWithToString = { toString: () => "local" };
      const result = validator.validate(objWithToString);
      expect(result.isValid).toBe(false);
    });

    test("should handle environment enum values directly", () => {
      expect(validator.validate(Environment.LOCAL).isValid).toBe(true);
      expect(validator.validate(Environment.DEVELOPMENT).isValid).toBe(true);
      expect(validator.validate(Environment.PRODUCTION).isValid).toBe(true);
    });
  });
});
