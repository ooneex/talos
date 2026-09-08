import { DatabaseException } from "../DatabaseException";

const describe = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return `${value}n`;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/** A query returned no row where exactly one was required. */
export class EntityNotFoundError extends DatabaseException {
  public constructor(entityName: string, criteria: unknown) {
    super(`Could not find any entity of type "${entityName}" matching: ${describe(criteria)}`, "ENTITY_NOT_FOUND", {
      entity: entityName,
      criteria,
    });
    this.name = "EntityNotFoundError";
  }
}

/** The target is not an entity this data source knows — not decorated, or not listed in `entities`. */
export class EntityMetadataNotFoundError extends DatabaseException {
  public constructor(target: unknown) {
    const name = typeof target === "function" ? target.name : String(target);
    super(
      `No metadata for "${name}" was found. Decorate the class with @Entity() and list it in the DataSource entities.`,
      "ENTITY_METADATA_NOT_FOUND",
      { target: name },
    );
    this.name = "EntityMetadataNotFoundError";
  }
}

/** A property path used in a query does not exist on the entity. */
export class EntityPropertyNotFoundError extends DatabaseException {
  public constructor(propertyPath: string, entityName: string) {
    super(`Property "${propertyPath}" was not found in "${entityName}"`, "ENTITY_PROPERTY_NOT_FOUND", {
      propertyPath,
      entity: entityName,
    });
    this.name = "EntityPropertyNotFoundError";
  }
}

/** A relation path used in a query does not exist on the entity. */
export class RelationNotFoundError extends DatabaseException {
  public constructor(relationPath: string, entityName: string) {
    super(`Relation "${relationPath}" was not found in "${entityName}"`, "RELATION_NOT_FOUND", {
      relationPath,
      entity: entityName,
    });
    this.name = "RelationNotFoundError";
  }
}

type DriverErrorShapeType = { code?: unknown; errno?: unknown; sqlState?: unknown };

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

/** The driver's own code: `ERR_POSTGRES_SERVER_ERROR`, `ER_DUP_ENTRY`, `SQLITE_CONSTRAINT_UNIQUE`, … */
const driverCodeOf = (driverError: unknown): string | undefined => {
  const code = (driverError as DriverErrorShapeType | null)?.code;

  return typeof code === "string" ? code : undefined;
};

/** The five-character SQLSTATE: Bun reports it as `errno` on PostgreSQL and `sqlState` on MySQL; SQLite has none. */
const sqlStateOf = (driverError: unknown): string | undefined => {
  if (!driverError || typeof driverError !== "object") {
    return undefined;
  }

  const { errno, sqlState } = driverError as DriverErrorShapeType;
  const candidate = typeof sqlState === "string" ? sqlState : errno;

  return typeof candidate === "string" && SQLSTATE_PATTERN.test(candidate) ? candidate : undefined;
};

/**
 * The database rejected a query. `driverError` carries the Bun `SQLError`; `code` is the driver's own
 * error code and `sqlState` the standard SQLSTATE class when the database reports one (`23505` for a
 * unique violation on PostgreSQL, `23000` on MySQL).
 */
export class QueryFailedError extends DatabaseException {
  public readonly query: string;
  public readonly parameters: unknown[];
  public readonly driverError: unknown;
  public readonly code: string | undefined;
  public readonly sqlState: string | undefined;

  public constructor(query: string, parameters: unknown[], driverError: unknown) {
    const detail = driverError instanceof Error ? driverError.message : String(driverError);
    const code = driverCodeOf(driverError);
    const sqlState = sqlStateOf(driverError);

    super(`Query failed: ${detail}`, "QUERY_FAILED", { query, parameters, driverError, code, sqlState });
    this.name = "QueryFailedError";
    this.query = query;
    this.parameters = parameters;
    this.driverError = driverError;
    this.code = code;
    this.sqlState = sqlState;
  }
}

/** Soft delete or restore was asked of an entity without a `@DeleteDateColumn()`. */
export class MissingDeleteDateColumnError extends DatabaseException {
  public constructor(entityName: string) {
    super(`Entity "${entityName}" does not have a delete date column.`, "MISSING_DELETE_DATE_COLUMN", {
      entity: entityName,
    });
    this.name = "MissingDeleteDateColumnError";
  }
}

/** Every entity needs at least one primary column. */
export class MissingPrimaryColumnError extends DatabaseException {
  public constructor(entityName: string) {
    super(
      `Entity "${entityName}" does not have a primary column. Primary column is required to have in all your entities. Use @PrimaryColumn decorator to add a primary column.`,
      "MISSING_PRIMARY_COLUMN",
      { entity: entityName },
    );
    this.name = "MissingPrimaryColumnError";
  }
}

export class MissingDriverError extends DatabaseException {
  public constructor(driverType: string) {
    super(
      `Wrong driver: "${driverType}" given. Supported drivers are: postgres, mysql, mariadb, sqlite, clickhouse.`,
      "MISSING_DRIVER",
      {
        driverType,
      },
    );
    this.name = "MissingDriverError";
  }
}

export class CannotConnectAlreadyConnectedError extends DatabaseException {
  public constructor() {
    super("Cannot create a connection because the data source is already initialized.", "ALREADY_CONNECTED");
    this.name = "CannotConnectAlreadyConnectedError";
  }
}

export class CannotExecuteNotConnectedError extends DatabaseException {
  public constructor() {
    super("Cannot execute operation on a data source that is not initialized.", "NOT_CONNECTED");
    this.name = "CannotExecuteNotConnectedError";
  }
}

export class TransactionNotStartedError extends DatabaseException {
  public constructor() {
    super(
      "Transaction is not started yet, start transaction before committing or rolling it back.",
      "TRANSACTION_NOT_STARTED",
    );
    this.name = "TransactionNotStartedError";
  }
}

export class TransactionAlreadyStartedError extends DatabaseException {
  public constructor() {
    super("Transaction already started for the given query runner.", "TRANSACTION_ALREADY_STARTED");
    this.name = "TransactionAlreadyStartedError";
  }
}

export class TransactionsNotSupportedError extends DatabaseException {
  public constructor(driverType: string) {
    super(`The ${driverType} driver does not support transactions.`, "TRANSACTIONS_NOT_SUPPORTED", { driverType });
    this.name = "TransactionsNotSupportedError";
  }
}

export class DriverFeatureNotSupportedError extends DatabaseException {
  public constructor(driverType: string, feature: string) {
    super(`The ${driverType} driver does not support ${feature}.`, "DRIVER_FEATURE_NOT_SUPPORTED", {
      driverType,
      feature,
    });
    this.name = "DriverFeatureNotSupportedError";
  }
}

export class QueryRunnerAlreadyReleasedError extends DatabaseException {
  public constructor() {
    super("Query runner already released. Cannot run queries anymore.", "QUERY_RUNNER_RELEASED");
    this.name = "QueryRunnerAlreadyReleasedError";
  }
}

export class UpdateValuesMissingError extends DatabaseException {
  public constructor() {
    super(
      "Cannot perform update query because update values are not defined. Call set(...) before execute().",
      "UPDATE_VALUES_MISSING",
    );
    this.name = "UpdateValuesMissingError";
  }
}

export class InsertValuesMissingError extends DatabaseException {
  public constructor() {
    super(
      "Cannot perform insert query because values are not defined. Call values(...) before execute().",
      "INSERT_VALUES_MISSING",
    );
    this.name = "InsertValuesMissingError";
  }
}

/** The query text references a `:name` parameter that was never set. */
export class ParameterNotSetError extends DatabaseException {
  public constructor(name: string, reference: string) {
    super(`Parameter "${name}" was used in the query but never set (${reference}).`, "PARAMETER_NOT_SET", { name });
    this.name = "ParameterNotSetError";
  }
}

/** A `where` on a relation, or a criteria value, could not be turned into SQL. */
export class InvalidCriteriaError extends DatabaseException {
  public constructor(message: string, criteria: unknown) {
    super(message, "INVALID_CRITERIA", { criteria });
    this.name = "InvalidCriteriaError";
  }
}
