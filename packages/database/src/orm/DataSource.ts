import { DatabaseException } from "../DatabaseException";
import type {
  ClassType,
  DatabaseClientType,
  DataSourceClientType,
  DataSourceOptionsType,
  EntityTargetType,
  INamingStrategy,
  IQueryLogger,
  ObjectLiteralType,
  TransactionIsolationLevelType,
} from "../types";
import { AsyncLock } from "./AsyncLock";
import type { IDriver } from "./driver/AbstractDriver";
import { createDriver } from "./driver/createDriver";
import { EntityManager } from "./EntityManager";
import type { EntityMetadata } from "./EntityMetadata";
import { EntityMetadataBuilder } from "./EntityMetadataBuilder";
import {
  CannotConnectAlreadyConnectedError,
  CannotExecuteNotConnectedError,
  EntityMetadataNotFoundError,
} from "./errors";
import { getMetadataArgsStorage } from "./MetadataArgsStorage";
import { DefaultNamingStrategy } from "./NamingStrategy";
import { QueryRunner } from "./QueryRunner";
import { SelectQueryBuilder } from "./query-builder/SelectQueryBuilder";
import { Repository } from "./Repository";
import { SchemaBuilder } from "./SchemaBuilder";

/**
 * One database: its connection pool, the entities it manages, and the entry points to query them.
 *
 * @example
 * const dataSource = new DataSource({ type: "sqlite", database: ":memory:", entities: [UserEntity], synchronize: true });
 * await dataSource.initialize();
 * const users = dataSource.getRepository(UserEntity);
 */
export class DataSource<Options extends DataSourceOptionsType = DataSourceOptionsType> {
  public readonly driver: IDriver;
  public readonly namingStrategy: INamingStrategy;
  public readonly logger: IQueryLogger | undefined;
  public readonly logging: boolean;
  /** Serialises transactions on drivers that expose a single connection. */
  public readonly transactionLock = new AsyncLock();
  public readonly manager: EntityManager;
  public isInitialized = false;
  public entityMetadatas: EntityMetadata[] = [];
  private clientInstance: DatabaseClientType | undefined;
  private readonly repositories = new Map<EntityMetadata, Repository<ObjectLiteralType>>();

  public constructor(public readonly options: Options) {
    this.driver = createDriver(options);
    this.namingStrategy = options.namingStrategy ?? new DefaultNamingStrategy();
    this.logger = options.logger;
    this.logging = options.logging === true && options.logger !== undefined;
    this.manager = new EntityManager(this);
  }

  /** The native driver client. Throws until `initialize()` ran. */
  public get client(): DataSourceClientType<Options> {
    if (!this.clientInstance || !this.isInitialized) {
      throw new CannotExecuteNotConnectedError();
    }

    return this.clientInstance as DataSourceClientType<Options>;
  }

  /** Builds the entity metadata, opens the pool and, when asked, drops and synchronizes the schema. */
  public async initialize(): Promise<this> {
    if (this.isInitialized) {
      throw new CannotConnectAlreadyConnectedError();
    }

    this.entityMetadatas = this.buildMetadatas();
    this.repositories.clear();

    let client: DatabaseClientType | undefined;

    try {
      client = this.options.client ?? this.driver.createClient();
      await this.driver.connect(client);
    } catch (error) {
      if (client && !this.options.client) {
        await this.driver.disconnect(client).catch(() => undefined);
      }

      throw new DatabaseException(
        `Could not connect to the ${this.options.type} database: ${error instanceof Error ? error.message : String(error)}`,
        "CONNECTION_FAILED",
        { driverError: error },
      );
    }

    this.clientInstance = client;
    this.isInitialized = true;

    if (this.options.dropSchema) {
      await this.dropDatabase();
    }

    if (this.options.synchronize) {
      await this.synchronize();
    }

    return this;
  }

  /** Closes the native client. A client passed through `options.client` is left open for its owner. */
  public async destroy(): Promise<void> {
    if (!this.isInitialized) {
      throw new CannotExecuteNotConnectedError();
    }

    const client = this.clientInstance;

    this.isInitialized = false;
    this.clientInstance = undefined;

    if (client && !this.options.client) {
      await this.driver.disconnect(client);
    }
  }

  /** Creates missing tables, indices and constraints. Optionally drops everything first. */
  public async synchronize(dropBeforeSync = false): Promise<void> {
    if (dropBeforeSync) {
      await this.dropDatabase();
    }

    const runner = this.createQueryRunner();

    try {
      await this.createSchemaBuilder().synchronize(runner);
    } finally {
      await runner.release();
    }
  }

  /** Drops every table of the database. */
  public async dropDatabase(): Promise<void> {
    const runner = this.createQueryRunner();

    try {
      await this.createSchemaBuilder().drop(runner);
    } finally {
      await runner.release();
    }
  }

  public createSchemaBuilder(): SchemaBuilder {
    return new SchemaBuilder(this.driver, this.namingStrategy, this.entityMetadatas);
  }

  public hasMetadata(target: EntityTargetType | ClassType): boolean {
    return this.findMetadata(target) !== undefined;
  }

  public getMetadata(target: EntityTargetType | ClassType): EntityMetadata {
    const metadata = this.findMetadata(target);

    if (!metadata) {
      throw new EntityMetadataNotFoundError(target);
    }

    return metadata;
  }

  public getRepository<Entity extends ObjectLiteralType>(target: EntityTargetType<Entity>): Repository<Entity> {
    const metadata = this.getMetadata(target);
    const existing = this.repositories.get(metadata);

    if (existing) {
      return existing as Repository<Entity>;
    }

    const repository = new Repository<Entity>(target, this.manager);

    this.repositories.set(metadata, repository as Repository<ObjectLiteralType>);

    return repository;
  }

  public createQueryRunner(): QueryRunner {
    return new QueryRunner(this);
  }

  public createQueryBuilder(queryRunner?: QueryRunner): SelectQueryBuilder<ObjectLiteralType>;
  public createQueryBuilder<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    alias: string,
    queryRunner?: QueryRunner,
  ): SelectQueryBuilder<Entity>;
  public createQueryBuilder<Entity extends ObjectLiteralType>(
    targetOrRunner?: EntityTargetType<Entity> | QueryRunner,
    alias?: string,
    queryRunner?: QueryRunner,
  ): SelectQueryBuilder<Entity> {
    if (targetOrRunner instanceof QueryRunner || targetOrRunner === undefined) {
      return new SelectQueryBuilder<Entity>(this, targetOrRunner);
    }

    return new SelectQueryBuilder<Entity>(this, queryRunner)
      .select()
      .from(targetOrRunner, alias ?? this.getMetadata(targetOrRunner).tableName);
  }

  /** Runs a raw driver command. SQL uses placeholders; Redis uses arguments; MongoDB uses `[value, options]`. */
  public async query<Row = ObjectLiteralType>(
    sql: string,
    parameters: unknown[] = [],
    queryRunner?: QueryRunner,
  ): Promise<Row[]> {
    const runner = queryRunner ?? this.createQueryRunner();

    try {
      return (await runner.query<Row>(sql, parameters)).records;
    } finally {
      if (!queryRunner) {
        await runner.release();
      }
    }
  }

  /** Runs `work` inside a transaction with a manager bound to it; commits on return, rolls back on throw. */
  public async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
  public async transaction<T>(
    isolationLevel: TransactionIsolationLevelType,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T>;
  public async transaction<T>(
    isolationOrWork: TransactionIsolationLevelType | ((manager: EntityManager) => Promise<T>),
    maybeWork?: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (typeof isolationOrWork === "function") {
      return this.manager.transaction(isolationOrWork);
    }

    return this.manager.transaction(isolationOrWork, maybeWork as (manager: EntityManager) => Promise<T>);
  }

  private findMetadata(target: EntityTargetType | ClassType): EntityMetadata | undefined {
    if (typeof target === "string") {
      return this.entityMetadatas.find((metadata) => metadata.name === target || metadata.tableName === target);
    }

    return (
      this.entityMetadatas.find((metadata) => metadata.target === target) ??
      // The same class loaded twice (bundled and from source) still names the same entity.
      this.entityMetadatas.find((metadata) => metadata.name === target.name && this.isDecoratedEntity(target))
    );
  }

  private isDecoratedEntity(target: ClassType): boolean {
    return getMetadataArgsStorage().filterTables(target).length > 0;
  }

  private buildMetadatas(): EntityMetadata[] {
    const storage = getMetadataArgsStorage();
    const targets: ClassType[] = this.options.entities
      ? this.options.entities.map((entity) => {
          if (typeof entity === "string") {
            const table = storage.tables.find(
              (candidate) => candidate.target.name === entity || candidate.name === entity,
            );

            if (!table) {
              throw new EntityMetadataNotFoundError(entity);
            }

            return table.target;
          }

          return entity;
        })
      : storage.tables.map((table) => table.target);

    return new EntityMetadataBuilder(storage, this.namingStrategy, this.options.entityPrefix ?? "").build([
      ...new Set(targets),
    ]);
  }
}
