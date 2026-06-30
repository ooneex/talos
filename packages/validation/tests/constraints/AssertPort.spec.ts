import { describe, expect, test } from "bun:test";
import { AssertPort } from "@/constraints";

describe("AssertPort", () => {
  const validator = new AssertPort();

  test("should validate valid port numbers", () => {
    const validPorts = [1, 80, 443, 8080, 3000, 5000, 8000, 8443, 9000, 65535];

    for (const port of validPorts) {
      const result = validator.validate(port);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate common service ports", () => {
    const servicePorts = [
      20, // FTP data
      21, // FTP control
      22, // SSH
      23, // Telnet
      25, // SMTP
      53, // DNS
      80, // HTTP
      110, // POP3
      143, // IMAP
      443, // HTTPS
      465, // SMTPS
      587, // SMTP submission
      993, // IMAPS
      995, // POP3S
      3306, // MySQL
      5432, // PostgreSQL
      6379, // Redis
      27017, // MongoDB
    ];

    for (const port of servicePorts) {
      const result = validator.validate(port);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate boundary values", () => {
    expect(validator.validate(1).isValid).toBe(true);
    expect(validator.validate(65535).isValid).toBe(true);
  });

  test("should reject port 0", () => {
    const result = validator.validate(0);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Must be a valid port number (1-65535)");
  });

  test("should reject negative port numbers", () => {
    const negativePorts = [-1, -80, -443, -1000, -65535];

    for (const port of negativePorts) {
      const result = validator.validate(port);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid port number (1-65535)");
    }
  });

  test("should reject port numbers above 65535", () => {
    const invalidPorts = [65536, 65537, 70000, 100000, 1000000];

    for (const port of invalidPorts) {
      const result = validator.validate(port);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid port number (1-65535)");
    }
  });

  test("should reject floating point numbers", () => {
    const floatPorts = [80.5, 443.1, 8080.9, 3.14, 1.0001];

    for (const port of floatPorts) {
      const result = validator.validate(port);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid port number (1-65535)");
    }
  });

  test("should reject string values", () => {
    const stringPorts = ["80", "443", "8080", "3000", "port", ""];

    for (const port of stringPorts) {
      const result = validator.validate(port);
      expect(result.isValid).toBe(false);
    }
  });

  test("should reject non-number values", () => {
    const invalidValues = [null, undefined, {}, [], true, false, "80", "443", Symbol("port"), new Date(), /regex/];

    for (const value of invalidValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should reject NaN", () => {
    const result = validator.validate(Number.NaN);
    expect(result.isValid).toBe(false);
  });

  test("should reject Infinity", () => {
    const result = validator.validate(Number.POSITIVE_INFINITY);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Must be a valid port number (1-65535)");
  });

  test("should reject negative Infinity", () => {
    const result = validator.validate(Number.NEGATIVE_INFINITY);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Must be a valid port number (1-65535)");
  });

  test("should provide correct error message", () => {
    const result = validator.validate("invalid");
    expect(result.isValid).toBe(false);
    expect(result.message).toBeDefined();
  });

  test("should return constraint correctly", () => {
    const constraint = validator.getConstraint();
    expect(constraint).toBeDefined();
  });

  test("should return error message correctly", () => {
    const errorMessage = validator.getErrorMessage();
    expect(errorMessage).toBe("Must be a valid port number (1-65535)");
  });

  test("should validate ephemeral ports range", () => {
    const ephemeralPorts = [49152, 50000, 55000, 60000, 65535];

    for (const port of ephemeralPorts) {
      const result = validator.validate(port);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate well-known ports range", () => {
    const wellKnownPorts = [1, 80, 443, 1023];

    for (const port of wellKnownPorts) {
      const result = validator.validate(port);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate registered ports range", () => {
    const registeredPorts = [1024, 3000, 8080, 49151];

    for (const port of registeredPorts) {
      const result = validator.validate(port);
      expect(result.isValid).toBe(true);
    }
  });
});
