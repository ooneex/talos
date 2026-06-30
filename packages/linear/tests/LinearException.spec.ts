import { describe, expect, test } from "bun:test";
import { LinearException } from "@/index";

describe("LinearException", () => {
  test("should create exception with message", () => {
    const error = new LinearException("Something went wrong", "LINEAR_ERROR");

    expect(error.message).toBe("Something went wrong");
    expect(error.name).toBe("LinearException");
    expect(error.key).toBe("LINEAR_ERROR");
    expect(error.status).toBe(500);
  });

  test("should create exception with data", () => {
    const data = { id: "abc-123", cause: "Not found" };
    const error = new LinearException("Failed to fetch issue", "ISSUE_FETCH_ERROR", data);

    expect(error.message).toBe("Failed to fetch issue");
    expect(error.data).toEqual(data);
  });

  test("should be an instance of Error", () => {
    const error = new LinearException("Error", "LINEAR_ERROR");

    expect(error).toBeInstanceOf(Error);
  });

  test("should have default empty data when not provided", () => {
    const error = new LinearException("Error", "LINEAR_ERROR");

    expect(error.data).toEqual({});
  });
});
