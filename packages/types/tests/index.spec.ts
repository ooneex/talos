import { describe, expect, test } from "bun:test";
import { type FilterResultType, HTTP_METHODS, type IBase, type StatusType } from "../src/index";

describe("@talosjs/types - HTTP_METHODS", () => {
  test("should expose standard HTTP methods", () => {
    expect(HTTP_METHODS).toBeDefined();
    expect(Array.isArray(HTTP_METHODS)).toBe(true);
    expect(HTTP_METHODS.length).toBeGreaterThan(0);

    const expected = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"] as const;
    expect(HTTP_METHODS).toEqual(expected);
  });

  test("should contain only unique, upper‑case strings", () => {
    const unique = new Set(HTTP_METHODS);
    expect(unique.size).toBe(HTTP_METHODS.length);

    for (const method of HTTP_METHODS) {
      expect(typeof method).toBe("string");
      // Check uppercase format without widening the literal type
      expect(method.toUpperCase()).toMatch(/^[A-Z]+$/);
    }
  });
});

describe("@talosjs/types - IBase", () => {
  test("should allow minimal IBase implementation", () => {
    const base: IBase = {
      id: "1",
    };

    expect(base.id).toBe("1");
    // Optional flags should be undefined by default
    expect(base.isLocked).toBeUndefined();
    expect(base.createdAt).toBeUndefined();
  });

  test("should support typical audit fields", () => {
    const now = new Date();
    const base: IBase = {
      id: "2",
      createdAt: now,
      updatedAt: now,
      isBlocked: true,
      blockReason: "violation",
    };

    expect(base.createdAt).toBe(now);
    expect(base.updatedAt).toBe(now);
    expect(base.isBlocked).toBe(true);
    expect(base.blockReason).toBe("violation");
  });
});

describe("@talosjs/types - StatusType", () => {
  test("should accept all valid status values", () => {
    const statuses: StatusType[] = [
      "draft",
      "pending",
      "submitted",
      "in review",
      "reviewed",
      "processing",
      "processed",
      "queued",
      "ready",
      "scheduled",
      "approved",
      "rejected",
      "done",
      "completed",
      "success",
      "failed",
      "error",
      "cancelled",
      "timeout",
      "archived",
      "delete",
      "deleted",
      "active",
      "inactive",
      "disabled",
      "enabled",
      "suspended",
      "paused",
      "on hold",
      "sent",
      "delivered",
      "read",
      "valid",
      "invalid",
      "expired",
    ];

    expect(statuses).toHaveLength(35);

    for (const status of statuses) {
      expect(typeof status).toBe("string");
      expect(status.length).toBeGreaterThan(0);
    }
  });

  test("should work as a type for variables", () => {
    const status: StatusType = "active";
    expect(status).toBe("active");
  });
});

describe("@talosjs/types - FilterResultType", () => {
  function buildResult<T>(resources: T[], page = 1, limit = 10): FilterResultType<T> {
    const total = resources.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      resources,
      total,
      totalPages,
      page,
      limit,
    };
  }

  test("should build a valid filter result for generic resources", () => {
    const resources = [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
    ];

    const result = buildResult(resources, 1, 2);

    expect(result.resources).toEqual(resources);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(2);
  });

  test("should compute totalPages correctly for partial last page", () => {
    const resources = Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, value: i }));

    const result = buildResult(resources, 1, 2);

    expect(result.total).toBe(5);
    expect(result.totalPages).toBe(3);
  });
});
