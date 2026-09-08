import { describe, expect, test } from "bun:test";
import { DatabaseException } from "../../src/DatabaseException";
import {
  CannotConnectAlreadyConnectedError,
  CannotExecuteNotConnectedError,
  DriverFeatureNotSupportedError,
  EntityMetadataNotFoundError,
  EntityNotFoundError,
  EntityPropertyNotFoundError,
  InsertValuesMissingError,
  InvalidCriteriaError,
  MissingDeleteDateColumnError,
  MissingDriverError,
  MissingPrimaryColumnError,
  ParameterNotSetError,
  QueryFailedError,
  QueryRunnerAlreadyReleasedError,
  RelationNotFoundError,
  TransactionAlreadyStartedError,
  TransactionNotStartedError,
  TransactionsNotSupportedError,
  UpdateValuesMissingError,
} from "../../src/orm/errors";

describe("orm errors", () => {
  test("EntityNotFoundError should describe the criteria", () => {
    const error = new EntityNotFoundError("User", { id: 1 });

    expect(error).toBeInstanceOf(DatabaseException);
    expect(error.name).toBe("EntityNotFoundError");
    expect(error.key).toBe("ENTITY_NOT_FOUND");
    expect(error.message).toBe('Could not find any entity of type "User" matching: {"id":1}');
    expect(error.data).toEqual({ entity: "User", criteria: { id: 1 } });
  });

  test("EntityNotFoundError should describe dates, bigints, undefined and unserialisable criteria", () => {
    const date = new Date("2024-01-02T03:04:05.000Z");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(new EntityNotFoundError("User", date).message).toEndWith("2024-01-02T03:04:05.000Z");
    expect(new EntityNotFoundError("User", 10n).message).toEndWith("10n");
    expect(new EntityNotFoundError("User", undefined).message).toEndWith("undefined");
    expect(new EntityNotFoundError("User", cyclic).message).toEndWith("[object Object]");
  });

  test("EntityMetadataNotFoundError should name classes and strings alike", () => {
    class Missing {}

    const fromClass = new EntityMetadataNotFoundError(Missing);
    const fromString = new EntityMetadataNotFoundError("missing_table");

    expect(fromClass.name).toBe("EntityMetadataNotFoundError");
    expect(fromClass.key).toBe("ENTITY_METADATA_NOT_FOUND");
    expect(fromClass.message).toContain('"Missing"');
    expect(fromClass.data).toEqual({ target: "Missing" });
    expect(fromString.message).toContain('"missing_table"');
  });

  test("property and relation errors should carry the path and the entity", () => {
    const property = new EntityPropertyNotFoundError("nickname", "User");
    const relation = new RelationNotFoundError("comments", "Post");

    expect(property.name).toBe("EntityPropertyNotFoundError");
    expect(property.key).toBe("ENTITY_PROPERTY_NOT_FOUND");
    expect(property.message).toBe('Property "nickname" was not found in "User"');
    expect(property.data).toEqual({ propertyPath: "nickname", entity: "User" });

    expect(relation.name).toBe("RelationNotFoundError");
    expect(relation.key).toBe("RELATION_NOT_FOUND");
    expect(relation.message).toBe('Relation "comments" was not found in "Post"');
    expect(relation.data).toEqual({ relationPath: "comments", entity: "Post" });
  });

  test("QueryFailedError should keep the query, the parameters and the driver error", () => {
    const driverError = Object.assign(new Error("syntax error"), { code: "42601" });
    const error = new QueryFailedError("SELECT nope", [1], driverError);

    expect(error.name).toBe("QueryFailedError");
    expect(error.key).toBe("QUERY_FAILED");
    expect(error.message).toBe("Query failed: syntax error");
    expect(error.query).toBe("SELECT nope");
    expect(error.parameters).toEqual([1]);
    expect(error.driverError).toBe(driverError);
    expect(error.data).toMatchObject({ query: "SELECT nope", parameters: [1], code: "42601" });
  });

  test("QueryFailedError should stringify non-Error driver errors", () => {
    const error = new QueryFailedError("SELECT 1", [], "boom");

    expect(error.message).toBe("Query failed: boom");
    expect(error.code).toBeUndefined();
    expect(error.sqlState).toBeUndefined();
    expect(error.data).toMatchObject({ code: undefined, sqlState: undefined });
  });

  test("QueryFailedError should expose the SQLSTATE the way each Bun adapter reports it", () => {
    const postgres = new QueryFailedError(
      "INSERT",
      [],
      Object.assign(new Error("duplicate key"), { code: "ERR_POSTGRES_SERVER_ERROR", errno: "23505" }),
    );
    const mysql = new QueryFailedError(
      "INSERT",
      [],
      Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY", errno: 1062, sqlState: "23000" }),
    );
    const sqlite = new QueryFailedError(
      "INSERT",
      [],
      Object.assign(new Error("UNIQUE constraint failed"), { code: "SQLITE_CONSTRAINT_UNIQUE", errno: 2067 }),
    );

    expect(postgres.code).toBe("ERR_POSTGRES_SERVER_ERROR");
    expect(postgres.sqlState).toBe("23505");
    expect(mysql.code).toBe("ER_DUP_ENTRY");
    expect(mysql.sqlState).toBe("23000");
    expect(sqlite.code).toBe("SQLITE_CONSTRAINT_UNIQUE");
    expect(sqlite.sqlState).toBeUndefined();
    expect(postgres.data).toMatchObject({ code: "ERR_POSTGRES_SERVER_ERROR", sqlState: "23505" });
  });

  test("entity shape errors should name the entity", () => {
    const deleteDate = new MissingDeleteDateColumnError("User");
    const primary = new MissingPrimaryColumnError("User");

    expect(deleteDate.name).toBe("MissingDeleteDateColumnError");
    expect(deleteDate.key).toBe("MISSING_DELETE_DATE_COLUMN");
    expect(deleteDate.data).toEqual({ entity: "User" });

    expect(primary.name).toBe("MissingPrimaryColumnError");
    expect(primary.key).toBe("MISSING_PRIMARY_COLUMN");
    expect(primary.message).toContain("@PrimaryColumn");
  });

  test("MissingDriverError should list the supported drivers", () => {
    const error = new MissingDriverError("oracle");

    expect(error.name).toBe("MissingDriverError");
    expect(error.key).toBe("MISSING_DRIVER");
    expect(error.message).toContain('"oracle"');
    expect(error.message).toContain("postgres, mysql, mariadb, sqlite");
    expect(error.message).toContain("redis, mongodb, cloudflare");
    expect(error.message).toContain("sqlite, turso, clickhouse");
    expect(error.data).toEqual({ driverType: "oracle" });
  });

  test("connection and transaction state errors should have stable keys", () => {
    const cases: [DatabaseException, string, string][] = [
      [new CannotConnectAlreadyConnectedError(), "CannotConnectAlreadyConnectedError", "ALREADY_CONNECTED"],
      [new CannotExecuteNotConnectedError(), "CannotExecuteNotConnectedError", "NOT_CONNECTED"],
      [new TransactionNotStartedError(), "TransactionNotStartedError", "TRANSACTION_NOT_STARTED"],
      [new TransactionAlreadyStartedError(), "TransactionAlreadyStartedError", "TRANSACTION_ALREADY_STARTED"],
      [new TransactionsNotSupportedError("clickhouse"), "TransactionsNotSupportedError", "TRANSACTIONS_NOT_SUPPORTED"],
      [
        new DriverFeatureNotSupportedError("clickhouse", "upserts"),
        "DriverFeatureNotSupportedError",
        "DRIVER_FEATURE_NOT_SUPPORTED",
      ],
      [new QueryRunnerAlreadyReleasedError(), "QueryRunnerAlreadyReleasedError", "QUERY_RUNNER_RELEASED"],
      [new UpdateValuesMissingError(), "UpdateValuesMissingError", "UPDATE_VALUES_MISSING"],
      [new InsertValuesMissingError(), "InsertValuesMissingError", "INSERT_VALUES_MISSING"],
    ];

    for (const [error, name, key] of cases) {
      expect(error).toBeInstanceOf(DatabaseException);
      expect(error.name).toBe(name);
      expect(error.key).toBe(key);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  test("ParameterNotSetError should name the parameter and where it was used", () => {
    const error = new ParameterNotSetError("id", ":id");

    expect(error.name).toBe("ParameterNotSetError");
    expect(error.key).toBe("PARAMETER_NOT_SET");
    expect(error.message).toBe('Parameter "id" was used in the query but never set (:id).');
    expect(error.data).toEqual({ name: "id" });
  });

  test("InvalidCriteriaError should carry the criteria", () => {
    const error = new InvalidCriteriaError("Empty criteria are not allowed", {});

    expect(error.name).toBe("InvalidCriteriaError");
    expect(error.key).toBe("INVALID_CRITERIA");
    expect(error.message).toBe("Empty criteria are not allowed");
    expect(error.data).toEqual({ criteria: {} });
  });
});
