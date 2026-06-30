import { describe, expect, test } from "bun:test";
import { AssertHostname } from "@/constraints";

describe("AssertHostname", () => {
  const validator = new AssertHostname();

  describe("valid hostnames", () => {
    test("should validate localhost", () => {
      const result = validator.validate("localhost");
      expect(result.isValid).toBe(true);
    });

    test("should validate simple hostnames", () => {
      const validHostnames = ["example", "server", "myhost", "web", "api", "db", "cache"];

      for (const hostname of validHostnames) {
        const result = validator.validate(hostname);
        expect(result.isValid).toBe(true);
      }
    });

    test("should validate hostnames with numbers", () => {
      const validHostnames = ["server1", "host2", "web3", "api4", "db5"];

      for (const hostname of validHostnames) {
        const result = validator.validate(hostname);
        expect(result.isValid).toBe(true);
      }
    });

    test("should validate hostnames with hyphens", () => {
      const validHostnames = ["my-server", "web-api", "test-host", "dev-machine"];

      for (const hostname of validHostnames) {
        const result = validator.validate(hostname);
        expect(result.isValid).toBe(true);
      }
    });

    test("should validate domain names", () => {
      const validDomains = ["example.com", "test.org", "api.example.com", "sub.domain.co.uk"];

      for (const domain of validDomains) {
        const result = validator.validate(domain);
        expect(result.isValid).toBe(true);
      }
    });

    test("should validate empty string (optional hostname)", () => {
      const result = validator.validate("");
      expect(result.isValid).toBe(true);
    });
  });

  describe("valid IP addresses", () => {
    test("should validate IPv4 loopback address", () => {
      const result = validator.validate("127.0.0.1");
      expect(result.isValid).toBe(true);
    });

    test("should validate 0.0.0.0", () => {
      const result = validator.validate("0.0.0.0");
      expect(result.isValid).toBe(true);
    });

    test("should validate standard IPv4 addresses", () => {
      const validIPs = [
        "192.168.1.1",
        "10.0.0.1",
        "172.16.0.1",
        "8.8.8.8",
        "1.1.1.1",
        "255.255.255.255",
        "192.168.0.100",
      ];

      for (const ip of validIPs) {
        const result = validator.validate(ip);
        expect(result.isValid).toBe(true);
      }
    });

    test("should validate boundary IPv4 values", () => {
      const validIPs = ["0.0.0.0", "255.255.255.255", "0.0.0.1", "255.255.255.0", "1.0.0.0", "0.255.0.0"];

      for (const ip of validIPs) {
        const result = validator.validate(ip);
        expect(result.isValid).toBe(true);
      }
    });
  });

  describe("invalid hostnames", () => {
    test("should reject hostnames starting with hyphen", () => {
      const result = validator.validate("-hostname");
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid hostname or IP address");
    });

    test("should reject hostnames ending with hyphen", () => {
      const result = validator.validate("hostname-");
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid hostname or IP address");
    });

    test("should reject hostnames with invalid characters", () => {
      const invalidHostnames = [
        "host_name",
        "host.name.",
        "host..name",
        "host name",
        "host@name",
        "host#name",
        "host$name",
        "host%name",
        "host!name",
      ];

      for (const hostname of invalidHostnames) {
        const result = validator.validate(hostname);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe("Must be a valid hostname or IP address");
      }
    });
  });

  describe("invalid IP addresses", () => {
    test("should reject IPv4 with octets above 255", () => {
      const invalidIPs = ["256.0.0.1", "192.168.1.256", "192.256.1.1", "192.168.256.1", "300.300.300.300"];

      for (const ip of invalidIPs) {
        const result = validator.validate(ip);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe("Must be a valid hostname or IP address");
      }
    });

    test("should reject IPv4 with negative numbers", () => {
      const invalidIPs = ["-1.0.0.1", "192.-168.1.1", "192.168.-1.1", "192.168.1.-1"];

      for (const ip of invalidIPs) {
        const result = validator.validate(ip);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe("Must be a valid hostname or IP address");
      }
    });

    test("should reject incomplete IPv4 addresses", () => {
      // Note: Some incomplete IPs like "192.168.1" and "192" can match as valid hostnames
      // Only test patterns that are clearly invalid for both hostname and IP
      const invalidIPs = ["192.", "192.168.", "192.168.1."];

      for (const ip of invalidIPs) {
        const result = validator.validate(ip);
        expect(result.isValid).toBe(false);
        expect(result.message).toBe("Must be a valid hostname or IP address");
      }
    });

    test("should reject IPv4 with too many octets", () => {
      const result = validator.validate("192.168.1.1.1");
      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Must be a valid hostname or IP address");
    });
  });

  describe("non-string values", () => {
    test("should reject non-string values", () => {
      const invalidValues = [123, null, undefined, {}, [], true, false, Symbol("host"), new Date()];

      for (const value of invalidValues) {
        const result = validator.validate(value);
        expect(result.isValid).toBe(false);
      }
    });

    test("should reject numeric values", () => {
      const result = validator.validate(127001);
      expect(result.isValid).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("should handle very long hostnames", () => {
      const longHostname = "a".repeat(64);
      const result = validator.validate(longHostname);
      expect(result.isValid).toBe(false);
    });

    test("should validate maximum label length (63 characters)", () => {
      const maxLabelHostname = "a".repeat(63);
      const result = validator.validate(maxLabelHostname);
      expect(result.isValid).toBe(true);
    });

    test("should reject hostnames with whitespace", () => {
      const invalidHostnames = [" localhost", "localhost ", " localhost ", "local host", "local\thost", "local\nhost"];

      for (const hostname of invalidHostnames) {
        const result = validator.validate(hostname);
        expect(result.isValid).toBe(false);
      }
    });
  });

  describe("getter methods", () => {
    test("should return constraint correctly", () => {
      const constraint = validator.getConstraint();
      expect(constraint).toBeDefined();
    });

    test("should return error message correctly", () => {
      const errorMessage = validator.getErrorMessage();
      expect(errorMessage).toBe("Must be a valid hostname or IP address");
    });
  });
});
