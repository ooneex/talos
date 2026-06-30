import { describe, expect, test } from "bun:test";
import { HttpStatus } from "@talosjs/http-status";
import { RoleException } from "@/RoleException";

describe("RoleException", () => {
  test("should set name to RoleException", () => {
    const err = new RoleException("Access denied", "ROLE_ADMIN");
    expect(err.name).toBe("RoleException");
  });

  test("should be an instance of Error", () => {
    const err = new RoleException("Access denied", "ROLE_ADMIN");
    expect(err).toBeInstanceOf(Error);
  });

  test("should carry the correct message", () => {
    const err = new RoleException("Insufficient permissions", "ROLE_USER");
    expect(err.message).toBe("Insufficient permissions");
  });

  test("should default to Forbidden status", () => {
    const err = new RoleException("Forbidden", "ROLE_GUEST");
    expect(err.status).toBe(HttpStatus.Code.Forbidden);
  });

  test("should store role as key", () => {
    const err = new RoleException("Forbidden", "ROLE_GUEST");
    expect(err.key).toBe("ROLE_GUEST");
  });

  test("should default data to empty object when omitted", () => {
    const err = new RoleException("Forbidden", "ROLE_ADMIN");
    expect(err.data).toEqual({});
  });

  test("should store extra data", () => {
    const err = new RoleException("Forbidden", "ROLE_USER", { resource: "invoice" });
    expect(err.data).toEqual({ resource: "invoice" });
  });

  test("should be frozen data", () => {
    const err = new RoleException("Forbidden", "ROLE_USER", { resource: "invoice" });
    expect(Object.isFrozen(err.data)).toBe(true);
  });
});
