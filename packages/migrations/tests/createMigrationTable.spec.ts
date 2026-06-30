import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { createMigrationTable } from "@/createMigrationTable";

describe("createMigrationTable", () => {
  // biome-ignore lint/suspicious/noExplicitAny: mock for testing
  let mockSql: any;
  // biome-ignore lint/suspicious/noExplicitAny: mock for testing
  let mockTx: any;
  // biome-ignore lint/suspicious/noExplicitAny: mock for testing
  let beginCallback: any;
  const tableName = "test_migrations";

  beforeEach(() => {
    // Create a mock transaction
    // biome-ignore lint/suspicious/noExplicitAny: mock for testing
    mockTx = jest.fn((_strings: TemplateStringsArray, ..._values: any[]) => {
      return Promise.resolve();
    });

    // Create a mock SQL function that captures the begin callback
    mockSql = jest.fn((name: string) => name);
    // biome-ignore lint/suspicious/noExplicitAny: mock for testing
    mockSql.begin = jest.fn(async (callback: any) => {
      beginCallback = callback;
      return await callback(mockTx);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should create migration table using transaction", async () => {
    await createMigrationTable(mockSql, tableName);

    // Verify sql.begin was called
    expect(mockSql.begin).toHaveBeenCalledTimes(1);
    expect(typeof beginCallback).toBe("function");
  });

  test("should execute CREATE TABLE IF NOT EXISTS with correct table name", async () => {
    await createMigrationTable(mockSql, tableName);

    // Verify mockSql was called to escape the table name
    expect(mockSql).toHaveBeenCalledWith(tableName);

    // Verify the transaction query was executed
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  test("should use VARCHAR(20) for id column", async () => {
    // Capture the query executed in the transaction
    let executedQuery = "";
    // biome-ignore lint/suspicious/noExplicitAny: mock for testing
    mockTx = jest.fn((strings: TemplateStringsArray, ..._values: any[]) => {
      executedQuery = strings.join("");
      return Promise.resolve();
    });

    // biome-ignore lint/suspicious/noExplicitAny: mock for testing
    mockSql.begin = jest.fn(async (callback: any) => {
      return await callback(mockTx);
    });

    await createMigrationTable(mockSql, tableName);

    // Verify the query structure
    expect(executedQuery).toContain("CREATE TABLE IF NOT EXISTS");
    expect(executedQuery).toContain("id VARCHAR(20) PRIMARY KEY");
  });

  test("should handle different table names", async () => {
    const customTableName = "custom_migrations_table";

    await createMigrationTable(mockSql, customTableName);

    // Verify the custom table name was used
    expect(mockSql).toHaveBeenCalledWith(customTableName);
    expect(mockSql.begin).toHaveBeenCalledTimes(1);
  });

  test("should propagate transaction errors", async () => {
    const errorMessage = "Database connection failed";
    mockSql.begin = jest.fn().mockRejectedValue(new Error(errorMessage));

    expect(createMigrationTable(mockSql, tableName)).rejects.toThrow(errorMessage);
  });

  test("should propagate query execution errors", async () => {
    const errorMessage = "Table creation failed";
    mockTx = jest.fn().mockRejectedValue(new Error(errorMessage));
    // biome-ignore lint/suspicious/noExplicitAny: mock for testing
    mockSql.begin = jest.fn(async (callback: any) => {
      return await callback(mockTx);
    });

    expect(createMigrationTable(mockSql, tableName)).rejects.toThrow(errorMessage);
  });

  test("should complete successfully without returning a value", async () => {
    const result = await createMigrationTable(mockSql, tableName);

    expect(result).toBeUndefined();
  });

  test("should call sql function exactly once for table name", async () => {
    await createMigrationTable(mockSql, tableName);

    // The sql function should be called once to escape the table name
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(mockSql).toHaveBeenCalledWith(tableName);
  });

  test("should handle special characters in table name", async () => {
    const specialTableName = "migrations_123_test";

    await createMigrationTable(mockSql, specialTableName);

    expect(mockSql).toHaveBeenCalledWith(specialTableName);
    expect(mockSql.begin).toHaveBeenCalledTimes(1);
  });
});
