import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { generateMigrationVersion } from "@/generateMigrationVersion";

describe("generateMigrationVersion", () => {
  let originalDate: DateConstructor;

  beforeEach(() => {
    // Store original Date
    originalDate = global.Date;
  });

  afterEach(() => {
    // Restore original Date
    global.Date = originalDate;
    jest.restoreAllMocks();
  });

  test("should generate a version string with correct length", () => {
    const version = generateMigrationVersion();

    // Format: YYYYMMDDHHMMSSMMM (17 characters)
    expect(version).toHaveLength(17);
  });

  test("should generate a numeric string", () => {
    const version = generateMigrationVersion();

    expect(version).toMatch(/^\d{17}$/);
  });

  test("should generate consistent format for known date", () => {
    // Mock date: 2025-06-30 21:07:55.123
    const mockDate = new Date("2025-06-30T21:07:55.123Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version).toBe("20250630210755123");
  });

  test("should pad single digit month with zero", () => {
    // Mock date: 2025-01-15 12:00:00.000
    const mockDate = new Date("2025-01-15T12:00:00.000Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version.substring(4, 6)).toBe("01");
  });

  test("should pad single digit day with zero", () => {
    // Mock date: 2025-12-05 12:00:00.000
    const mockDate = new Date("2025-12-05T12:00:00.000Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version.substring(6, 8)).toBe("05");
  });

  test("should pad single digit hour with zero", () => {
    // Mock date: 2025-12-15 09:30:00.000
    const mockDate = new Date("2025-12-15T09:30:00.000Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version.substring(8, 10)).toBe("09");
  });

  test("should pad single digit minutes with zero", () => {
    // Mock date: 2025-12-15 10:05:00.000
    const mockDate = new Date("2025-12-15T10:05:00.000Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version.substring(10, 12)).toBe("05");
  });

  test("should pad single digit seconds with zero", () => {
    // Mock date: 2025-12-15 10:30:07.000
    const mockDate = new Date("2025-12-15T10:30:07.000Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version.substring(12, 14)).toBe("07");
  });

  test("should pad single digit milliseconds with zeros", () => {
    // Mock date: 2025-12-15 10:30:45.001
    const mockDate = new Date("2025-12-15T10:30:45.001Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version.substring(14, 17)).toBe("001");
  });

  test("should pad double digit milliseconds with zero", () => {
    // Mock date: 2025-12-15 10:30:45.050
    const mockDate = new Date("2025-12-15T10:30:45.050Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version.substring(14, 17)).toBe("050");
  });

  test("should handle maximum values correctly", () => {
    // Mock date: 2025-12-31 23:59:59.999
    const mockDate = new Date("2025-12-31T23:59:59.999Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version).toBe("20251231235959999");
  });

  test("should handle minimum values correctly", () => {
    // Mock date: 2025-01-01 00:00:00.000
    const mockDate = new Date("2025-01-01T00:00:00.000Z");
    global.Date = jest.fn(() => mockDate) as unknown as DateConstructor;

    const version = generateMigrationVersion();

    expect(version).toBe("20250101000000000");
  });

  test("should generate different versions for different timestamps", () => {
    const version1 = generateMigrationVersion();

    // Wait a tiny bit to ensure different timestamp
    const start = Date.now();
    while (Date.now() === start) {
      // Busy wait
    }

    const version2 = generateMigrationVersion();

    expect(version1).not.toBe(version2);
  });

  test("should generate versions that can be sorted numerically", () => {
    // Mock dates in different orders
    const mockDate1 = new Date("2025-01-15T10:00:00.000Z");
    const mockDate2 = new Date("2025-12-31T23:59:59.999Z");
    const mockDate3 = new Date("2025-06-15T12:30:45.500Z");

    global.Date = jest.fn(() => mockDate1) as unknown as DateConstructor;
    const version1 = generateMigrationVersion();

    global.Date = jest.fn(() => mockDate2) as unknown as DateConstructor;
    const version2 = generateMigrationVersion();

    global.Date = jest.fn(() => mockDate3) as unknown as DateConstructor;
    const version3 = generateMigrationVersion();

    const sorted = [version2, version1, version3].sort();

    expect(sorted).toEqual([version1, version3, version2]);
  });

  test("should return a string type", () => {
    const version = generateMigrationVersion();

    expect(typeof version).toBe("string");
  });

  test("should start with year in YYYY format", () => {
    const version = generateMigrationVersion();
    const year = Number.parseInt(version.substring(0, 4), 10);
    const currentYear = new Date().getFullYear();

    expect(year).toBe(currentYear);
  });

  test("should have valid month range (01-12)", () => {
    const version = generateMigrationVersion();
    const month = Number.parseInt(version.substring(4, 6), 10);

    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
  });

  test("should have valid day range (01-31)", () => {
    const version = generateMigrationVersion();
    const day = Number.parseInt(version.substring(6, 8), 10);

    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });

  test("should have valid hour range (00-23)", () => {
    const version = generateMigrationVersion();
    const hour = Number.parseInt(version.substring(8, 10), 10);

    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });

  test("should have valid minutes range (00-59)", () => {
    const version = generateMigrationVersion();
    const minutes = Number.parseInt(version.substring(10, 12), 10);

    expect(minutes).toBeGreaterThanOrEqual(0);
    expect(minutes).toBeLessThanOrEqual(59);
  });

  test("should have valid seconds range (00-59)", () => {
    const version = generateMigrationVersion();
    const seconds = Number.parseInt(version.substring(12, 14), 10);

    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(seconds).toBeLessThanOrEqual(59);
  });

  test("should have valid milliseconds range (000-999)", () => {
    const version = generateMigrationVersion();
    const milliseconds = Number.parseInt(version.substring(14, 17), 10);

    expect(milliseconds).toBeGreaterThanOrEqual(0);
    expect(milliseconds).toBeLessThanOrEqual(999);
  });

  test("should be usable as a migration version identifier", () => {
    const version = generateMigrationVersion();

    // Should be sortable
    expect(Number(version)).toBeGreaterThan(0);

    // Should be unique enough (timestamp based)
    expect(version.length).toBe(17);
  });
});
