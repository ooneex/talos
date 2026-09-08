import type { ReservedSQL } from "bun";
import { type Db, type Document, MongoClient } from "mongodb";
import type {
  DatabaseClientType,
  DatabaseTypeType,
  MongoDataSourceOptionsType,
  ObjectLiteralType,
  QueryResultType,
  TransactionIsolationLevelType,
} from "../../types";
import type { ColumnMetadata } from "../EntityMetadata";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../errors";
import type { QueryRunner } from "../QueryRunner";
import { AbstractDriver } from "./AbstractDriver";

const DEFAULT_MONGO_URL = "mongodb://127.0.0.1:27017";

const commandDocument = (command: string, parameters: unknown[]): Document => {
  if (!command || /\s/.test(command)) {
    throw new DriverFeatureNotSupportedError("mongodb", "SQL queries");
  }

  const [value = 1, options] = parameters;

  return {
    ...(options !== null && typeof options === "object" && !Array.isArray(options) ? options : {}),
    [command]: value,
  };
};

const commandRecords = <Row>(result: Document): Row[] => {
  const cursor = result.cursor;

  if (cursor !== null && typeof cursor === "object" && Array.isArray((cursor as Document).firstBatch)) {
    return (cursor as Document).firstBatch as Row[];
  }

  return [result as Row];
};

/** Official MongoDB client driver for native database commands and collection management. */
export class MongoDriver extends AbstractDriver {
  public readonly type: DatabaseTypeType = "mongodb";
  public readonly supportsReturning = false;
  public readonly supportsIlike = false;
  public readonly supportsReservedConnections = false;
  public override readonly supportsTransactions = false;
  public readonly supportsCreateIndexIfNotExists = false;
  public override readonly supportsIndexes = false;
  public override readonly supportsUniqueConstraints = false;
  public override readonly supportsForeignKeys = false;

  public normalizeType(_column: ColumnMetadata): string {
    return this.unsupported("relational column types");
  }

  public generatedColumnDefinition(_column: ColumnMetadata): string | undefined {
    return this.unsupported("generated relational columns");
  }

  public isInlinePrimaryKey(_column: ColumnMetadata): boolean {
    return this.unsupported("relational primary keys");
  }

  public currentTimestamp(): string {
    return this.unsupported("SQL timestamp expressions");
  }

  public buildLimitOffset(_limit?: number, _offset?: number): string {
    return this.unsupported("SQL pagination");
  }

  public buildCountDistinct(_expressions: string[]): string {
    return this.unsupported("SQL aggregates");
  }

  public override beginTransactionStatements(_isolationLevel?: TransactionIsolationLevelType): string[] {
    throw new TransactionsNotSupportedError(this.type);
  }

  public createClient(): MongoClient {
    const options = this.options as MongoDataSourceOptionsType;

    return new MongoClient(options.url ?? DEFAULT_MONGO_URL, {
      ...options.extra,
      ...(options.poolSize !== undefined && { maxPoolSize: options.poolSize }),
      ...(options.connectTimeoutMS !== undefined && { connectTimeoutMS: options.connectTimeoutMS }),
    });
  }

  public override async connect(client: DatabaseClientType): Promise<void> {
    await (client as MongoClient).connect();
    await this.afterConnect(client);
  }

  public override async disconnect(client: DatabaseClientType): Promise<void> {
    await (client as MongoClient).close();
  }

  public override async query<Row = ObjectLiteralType>(
    client: DatabaseClientType | ReservedSQL,
    command: string,
    parameters: unknown[] = [],
  ): Promise<QueryResultType<Row>> {
    const result = await this.database(client as MongoClient).command(commandDocument(command, parameters));
    const records = commandRecords<Row>(result);
    const affected = [result.n, result.modifiedCount, result.deletedCount].find(
      (value): value is number => typeof value === "number",
    );

    return {
      records,
      affected: affected ?? records.length,
      lastInsertRowid: null,
    };
  }

  public async afterConnect(_client: DatabaseClientType): Promise<void> {}

  public async listTables(runner: QueryRunner): Promise<string[]> {
    const collections = await this.database(runner.dataSource.client as MongoClient)
      .listCollections({}, { nameOnly: true })
      .toArray();

    return collections.map((collection) => collection.name);
  }

  public async dropAllTables(runner: QueryRunner, collectionNames: string[]): Promise<void> {
    const database = this.database(runner.dataSource.client as MongoClient);

    await Promise.all(collectionNames.map((name) => database.collection(name).drop()));
  }

  private database(client: MongoClient): Db {
    return client.db((this.options as MongoDataSourceOptionsType).database);
  }

  private unsupported(feature: string): never {
    throw new DriverFeatureNotSupportedError(this.type, feature);
  }
}
