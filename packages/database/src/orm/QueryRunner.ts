import type { ReservedSQL, SQL } from "bun";
import type { ObjectLiteralType, QueryResultType, TransactionIsolationLevelType } from "../types";
import type { DataSource } from "./DataSource";
import type { IDriver } from "./driver/AbstractDriver";
import { EntityManager } from "./EntityManager";
import { QueryFailedError, QueryRunnerAlreadyReleasedError, TransactionNotStartedError } from "./errors";

type BunResultType = unknown[] & {
  count?: number | null;
  command?: string | null;
  lastInsertRowid?: number | bigint | null;
  affectedRows?: number | null;
};

const WRITE_COMMANDS: ReadonlySet<string> = new Set(["INSERT", "UPDATE", "DELETE"]);

/**
 * Runs SQL against the data source and owns a transaction when one is open.
 *
 * Outside a transaction queries go to the pool. `startTransaction()` reserves a connection (or takes
 * the SQLite lock) so that every later query of this runner runs inside the same transaction; nested
 * calls become savepoints.
 */
export class QueryRunner {
  public isTransactionActive = false;
  public isReleased = false;
  /** Free-form data carried along with the runner, e.g. to hand context to subscribers. */
  public readonly data: ObjectLiteralType = {};
  private reserved: ReservedSQL | undefined;
  private releaseLock: (() => void) | undefined;
  private transactionDepth = 0;
  private managerInstance: EntityManager | undefined;

  public constructor(public readonly dataSource: DataSource) {}

  /** An entity manager whose every operation runs through this runner. */
  public get manager(): EntityManager {
    if (!this.managerInstance) {
      this.managerInstance = new EntityManager(this.dataSource, this);
    }

    return this.managerInstance;
  }

  public get driver(): IDriver {
    return this.dataSource.driver;
  }

  public async query<Row = ObjectLiteralType>(sql: string, parameters: unknown[] = []): Promise<QueryResultType<Row>> {
    if (this.isReleased) {
      throw new QueryRunnerAlreadyReleasedError();
    }

    const { logger, logging } = this.dataSource;

    if (logging && logger) {
      logger.logQuery(sql, parameters);
    }

    try {
      const result = (await this.connection.unsafe(sql, parameters as never)) as BunResultType;

      return normalizeResult<Row>(result);
    } catch (error) {
      if (logger) {
        logger.logQueryError(error, sql, parameters);
      }

      throw new QueryFailedError(sql, parameters, error);
    }
  }

  public async startTransaction(isolationLevel?: TransactionIsolationLevelType): Promise<void> {
    if (this.isReleased) {
      throw new QueryRunnerAlreadyReleasedError();
    }

    if (this.isTransactionActive) {
      this.transactionDepth += 1;
      await this.query(`SAVEPOINT ${this.savepointName()}`);

      return;
    }

    if (this.driver.supportsReservedConnections) {
      this.reserved = await this.dataSource.client.reserve();
    } else {
      this.releaseLock = await this.dataSource.transactionLock.acquire();
    }

    try {
      for (const statement of this.driver.beginTransactionStatements(isolationLevel)) {
        await this.query(statement);
      }
    } catch (error) {
      this.releaseConnection();
      throw error;
    }

    this.isTransactionActive = true;
    this.transactionDepth = 1;
  }

  public async commitTransaction(): Promise<void> {
    if (!this.isTransactionActive) {
      throw new TransactionNotStartedError();
    }

    if (this.transactionDepth > 1) {
      await this.query(`RELEASE SAVEPOINT ${this.savepointName()}`);
      this.transactionDepth -= 1;

      return;
    }

    try {
      await this.query("COMMIT");
    } finally {
      this.endTransaction();
    }
  }

  public async rollbackTransaction(): Promise<void> {
    if (!this.isTransactionActive) {
      throw new TransactionNotStartedError();
    }

    if (this.transactionDepth > 1) {
      await this.query(`ROLLBACK TO SAVEPOINT ${this.savepointName()}`);
      this.transactionDepth -= 1;

      return;
    }

    try {
      await this.query("ROLLBACK");
    } finally {
      this.endTransaction();
    }
  }

  /** Rolls back anything still open and hands the connection back. The runner cannot be used afterwards. */
  public async release(): Promise<void> {
    if (this.isReleased) {
      return;
    }

    if (this.isTransactionActive) {
      this.transactionDepth = 1;

      try {
        await this.query("ROLLBACK");
      } finally {
        this.endTransaction();
      }
    }

    this.isReleased = true;
  }

  private get connection(): SQL | ReservedSQL {
    return this.reserved ?? this.dataSource.client;
  }

  private savepointName(): string {
    return `talos_sp_${this.transactionDepth}`;
  }

  private endTransaction(): void {
    this.isTransactionActive = false;
    this.transactionDepth = 0;
    this.releaseConnection();
  }

  private releaseConnection(): void {
    this.reserved?.release();
    this.reserved = undefined;
    this.releaseLock?.();
    this.releaseLock = undefined;
  }
}

const normalizeResult = <Row>(result: BunResultType): QueryResultType<Row> => {
  // Bun hands back an Array subclass carrying the metadata; reuse it rather than copying every row.
  const records = (Array.isArray(result) ? result : Array.from(result)) as Row[];
  const command = result.command ?? "";
  const affected = WRITE_COMMANDS.has(command)
    ? (result.affectedRows ?? result.count ?? records.length)
    : records.length;

  return {
    records,
    affected: Number(affected ?? 0),
    lastInsertRowid: result.lastInsertRowid ?? null,
  };
};
