import { describe, expect, test } from "bun:test";
import { AuthException } from "@/AuthException";

describe("AuthException", () => {
  test("should default to a server error when the caller states no status", () => {
    const exception = new AuthException("Clerk is unreachable", "PROVIDER_UNAVAILABLE");

    expect(exception.name).toBe("AuthException");
    expect(exception.key).toBe("PROVIDER_UNAVAILABLE");
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual({});
  });

  test("should report the status the caller asked for", () => {
    const exception = new AuthException("Missing bearer token", "MISSING_BEARER_TOKEN", { status: 401 });

    expect(exception.status).toBe(401);
  });

  test("should carry the data the caller attached alongside a stated status", () => {
    const exception = new AuthException("Forbidden", "FORBIDDEN", { status: 403, data: { userId: "user_1" } });

    expect(exception.status).toBe(403);
    expect(exception.data).toEqual({ userId: "user_1" });
  });
});
