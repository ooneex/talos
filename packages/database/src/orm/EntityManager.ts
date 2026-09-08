import type {
  DeepPartialType,
  EntityIdType,
  EntityTargetType,
  FindCriteriaType,
  FindManyOptionsType,
  FindOneOptionsType,
  FindOptionsWhereType,
  ObjectLiteralType,
  QueryDeepPartialEntityType,
  RemoveOptionsType,
  SaveOptionsType,
  TransactionIsolationLevelType,
  UpsertOptionsType,
} from "../types";
import type { DataSource } from "./DataSource";
import type { EntityMetadata } from "./EntityMetadata";
import { EntityPersister } from "./EntityPersister";
import { EntityNotFoundError, InvalidCriteriaError } from "./errors";
import { isFindOperator } from "./FindOperator";
import type { QueryRunner } from "./QueryRunner";
import type { DeleteQueryBuilder } from "./query-builder/DeleteQueryBuilder";
import type { QueryBuilder } from "./query-builder/QueryBuilder";
import type { DeleteResult, InsertResult, UpdateResult } from "./query-builder/results";
import type { SelectQueryBuilder } from "./query-builder/SelectQueryBuilder";
import type { SoftDeleteQueryBuilder } from "./query-builder/SoftDeleteQueryBuilder";
import type { UpdateQueryBuilder } from "./query-builder/UpdateQueryBuilder";
import { Repository } from "./Repository";

type AggregateFunctionType = "SUM" | "AVG" | "MIN" | "MAX";

const isPlainObject = (value: unknown): value is ObjectLiteralType =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !isFindOperator(value);

/**
 * Entity operations for every entity of a data source.
 *
 * The data source owns one manager that runs each call on a pooled connection. `transaction()` hands
 * out a manager bound to a single transaction, and `queryRunner.manager` does the same for a runner.
 */
export class EntityManager {
  private readonly repositories = new Map<EntityMetadata, Repository<ObjectLiteralType>>();

  public constructor(
    public readonly connection: DataSource,
    public readonly queryRunner?: QueryRunner,
  ) {}

  /** Alias of `connection`. */
  public get dataSource(): DataSource {
    return this.connection;
  }

  // ---------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------

  /** Runs `work` in a transaction; nested calls on a transactional manager become savepoints. */
  public async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
  public async transaction<T>(
    isolationLevel: TransactionIsolationLevelType,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T>;
  public async transaction<T>(
    isolationOrWork: TransactionIsolationLevelType | ((manager: EntityManager) => Promise<T>),
    maybeWork?: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const work =
      typeof isolationOrWork === "function" ? isolationOrWork : (maybeWork as (manager: EntityManager) => Promise<T>);
    const isolationLevel = typeof isolationOrWork === "string" ? isolationOrWork : undefined;
    const runner = this.queryRunner ?? this.connection.createQueryRunner();
    const owned = this.queryRunner === undefined;

    try {
      await runner.startTransaction(isolationLevel);

      try {
        const result = await work(runner.manager);

        await runner.commitTransaction();

        return result;
      } catch (error) {
        await runner.rollbackTransaction().catch(() => undefined);
        throw error;
      }
    } finally {
      if (owned) {
        await runner.release();
      }
    }
  }

  /** Runs raw SQL and returns the rows. */
  public async query<Row = ObjectLiteralType>(sql: string, parameters: unknown[] = []): Promise<Row[]> {
    return this.connection.query<Row>(sql, parameters, this.queryRunner);
  }

  public createQueryBuilder(): SelectQueryBuilder<ObjectLiteralType>;
  public createQueryBuilder<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    alias: string,
    queryRunner?: QueryRunner,
  ): SelectQueryBuilder<Entity>;
  public createQueryBuilder<Entity extends ObjectLiteralType>(
    target?: EntityTargetType<Entity>,
    alias?: string,
    queryRunner?: QueryRunner,
  ): SelectQueryBuilder<Entity> {
    if (target === undefined) {
      return this.connection.createQueryBuilder(this.queryRunner) as SelectQueryBuilder<Entity>;
    }

    return this.connection.createQueryBuilder(
      target,
      alias ?? this.connection.getMetadata(target).tableName,
      queryRunner ?? this.queryRunner,
    );
  }

  /** A repository bound to this manager (and therefore to its transaction, if any). */
  public getRepository<Entity extends ObjectLiteralType>(target: EntityTargetType<Entity>): Repository<Entity> {
    if (!this.queryRunner) {
      return this.connection.getRepository(target);
    }

    const metadata = this.connection.getMetadata(target);
    const existing = this.repositories.get(metadata);

    if (existing) {
      return existing as Repository<Entity>;
    }

    const repository = new Repository<Entity>(target, this);

    this.repositories.set(metadata, repository as Repository<ObjectLiteralType>);

    return repository;
  }

  /** Releases the runner this manager was created for. */
  public async release(): Promise<void> {
    await this.queryRunner?.release();
  }

  // ---------------------------------------------------------------------------
  // Identity & plain objects
  // ---------------------------------------------------------------------------

  public hasId(entity: ObjectLiteralType): boolean;
  public hasId(target: EntityTargetType, entity: ObjectLiteralType): boolean;
  public hasId(targetOrEntity: EntityTargetType | ObjectLiteralType, maybeEntity?: ObjectLiteralType): boolean {
    const entity = maybeEntity ?? (targetOrEntity as ObjectLiteralType);
    const metadata = maybeEntity
      ? this.connection.getMetadata(targetOrEntity as EntityTargetType)
      : this.connection.getMetadata(entity.constructor as EntityTargetType);

    return metadata.hasId(entity);
  }

  public getId(entity: ObjectLiteralType): EntityIdType | undefined;
  public getId(target: EntityTargetType, entity: ObjectLiteralType): EntityIdType | undefined;
  public getId(
    targetOrEntity: EntityTargetType | ObjectLiteralType,
    maybeEntity?: ObjectLiteralType,
  ): EntityIdType | undefined {
    const entity = maybeEntity ?? (targetOrEntity as ObjectLiteralType);
    const metadata = maybeEntity
      ? this.connection.getMetadata(targetOrEntity as EntityTargetType)
      : this.connection.getMetadata(entity.constructor as EntityTargetType);

    return metadata.getEntityIdMixedMap(entity);
  }

  /** A new entity instance (or several) with the given properties, relations included. */
  public create<Entity extends ObjectLiteralType>(target: EntityTargetType<Entity>): Entity;
  public create<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    plain: DeepPartialType<Entity>,
  ): Entity;
  public create<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    plains: DeepPartialType<Entity>[],
  ): Entity[];
  public create<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    plain?: DeepPartialType<Entity> | DeepPartialType<Entity>[],
  ): Entity | Entity[] {
    const metadata = this.connection.getMetadata(target);

    if (Array.isArray(plain)) {
      return plain.map((item) => this.transformPlain(metadata, metadata.create(), item as ObjectLiteralType) as Entity);
    }

    return this.transformPlain(metadata, metadata.create(), (plain ?? {}) as ObjectLiteralType) as Entity;
  }

  /** Copies the given properties onto `mergeInto`, transforming nested relations into entities. */
  public merge<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    mergeInto: Entity,
    ...plains: DeepPartialType<Entity>[]
  ): Entity {
    const metadata = this.connection.getMetadata(target);

    for (const plain of plains) {
      this.transformPlain(metadata, mergeInto, plain as ObjectLiteralType);
    }

    return mergeInto;
  }

  /** Loads the entity the plain object identifies and merges the plain object into it. */
  public async preload<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    plain: DeepPartialType<Entity>,
  ): Promise<Entity | undefined> {
    const metadata = this.connection.getMetadata(target);
    const idMap = metadata.getEntityIdMap(plain as ObjectLiteralType);

    if (!idMap) {
      return undefined;
    }

    const existing = await this.findOne(target, { where: idMap as FindOptionsWhereType<Entity> });

    if (!existing) {
      return undefined;
    }

    return this.merge(target, existing, plain);
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /** Inserts new entities and updates existing ones, following `cascade` options. Returns the same objects. */
  public async save<Entity extends ObjectLiteralType>(entities: Entity[], options?: SaveOptionsType): Promise<Entity[]>;
  public async save<Entity extends ObjectLiteralType>(entity: Entity, options?: SaveOptionsType): Promise<Entity>;
  public async save<Entity extends ObjectLiteralType, T extends DeepPartialType<Entity>>(
    target: EntityTargetType<Entity>,
    entities: T[],
    options?: SaveOptionsType,
  ): Promise<(T & Entity)[]>;
  public async save<Entity extends ObjectLiteralType, T extends DeepPartialType<Entity>>(
    target: EntityTargetType<Entity>,
    entity: T,
    options?: SaveOptionsType,
  ): Promise<T & Entity>;
  public async save(
    targetOrEntity: EntityTargetType | ObjectLiteralType | ObjectLiteralType[],
    maybeEntityOrOptions?: ObjectLiteralType | ObjectLiteralType[] | SaveOptionsType,
    maybeOptions?: SaveOptionsType,
  ): Promise<ObjectLiteralType | ObjectLiteralType[]> {
    const { target, entities, options, result } = this.splitTargetArguments(
      targetOrEntity,
      maybeEntityOrOptions,
      maybeOptions,
    );

    if (entities.length === 0) {
      return result;
    }

    const metadata = this.metadataFor(target, entities[0] as ObjectLiteralType);
    const chunks = chunk(entities, options.chunk);

    await this.runInTransaction(options.transaction !== false, async (manager) => {
      for (const batch of chunks) {
        await new EntityPersister(manager).save(metadata, batch, options);
      }
    });

    return result;
  }

  /** Deletes the given entities (and cascades), then clears their primary keys. */
  public async remove<Entity extends ObjectLiteralType>(
    entities: Entity[],
    options?: RemoveOptionsType,
  ): Promise<Entity[]>;
  public async remove<Entity extends ObjectLiteralType>(entity: Entity, options?: RemoveOptionsType): Promise<Entity>;
  public async remove<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    entities: Entity[],
    options?: RemoveOptionsType,
  ): Promise<Entity[]>;
  public async remove<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    entity: Entity,
    options?: RemoveOptionsType,
  ): Promise<Entity>;
  public async remove(
    targetOrEntity: EntityTargetType | ObjectLiteralType | ObjectLiteralType[],
    maybeEntityOrOptions?: ObjectLiteralType | ObjectLiteralType[] | RemoveOptionsType,
    maybeOptions?: RemoveOptionsType,
  ): Promise<ObjectLiteralType | ObjectLiteralType[]> {
    const { target, entities, options, result } = this.splitTargetArguments(
      targetOrEntity,
      maybeEntityOrOptions,
      maybeOptions,
    );

    if (entities.length === 0) {
      return result;
    }

    const metadata = this.metadataFor(target, entities[0] as ObjectLiteralType);
    const chunks = chunk(entities, options.chunk);

    await this.runInTransaction(options.transaction !== false, async (manager) => {
      for (const batch of chunks) {
        await new EntityPersister(manager).remove(metadata, batch, options);
      }
    });

    return result;
  }

  /** Sets the delete date of the given entities (and cascades). */
  public async softRemove<Entity extends ObjectLiteralType>(
    entities: Entity[],
    options?: SaveOptionsType,
  ): Promise<Entity[]>;
  public async softRemove<Entity extends ObjectLiteralType>(entity: Entity, options?: SaveOptionsType): Promise<Entity>;
  public async softRemove<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    entities: Entity[],
    options?: SaveOptionsType,
  ): Promise<Entity[]>;
  public async softRemove<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    entity: Entity,
    options?: SaveOptionsType,
  ): Promise<Entity>;
  public async softRemove(
    targetOrEntity: EntityTargetType | ObjectLiteralType | ObjectLiteralType[],
    maybeEntityOrOptions?: ObjectLiteralType | ObjectLiteralType[] | SaveOptionsType,
    maybeOptions?: SaveOptionsType,
  ): Promise<ObjectLiteralType | ObjectLiteralType[]> {
    return this.markDeleted("soft-delete", targetOrEntity, maybeEntityOrOptions, maybeOptions);
  }

  /** Clears the delete date of the given entities (and cascades). */
  public async recover<Entity extends ObjectLiteralType>(
    entities: Entity[],
    options?: SaveOptionsType,
  ): Promise<Entity[]>;
  public async recover<Entity extends ObjectLiteralType>(entity: Entity, options?: SaveOptionsType): Promise<Entity>;
  public async recover<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    entities: Entity[],
    options?: SaveOptionsType,
  ): Promise<Entity[]>;
  public async recover<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    entity: Entity,
    options?: SaveOptionsType,
  ): Promise<Entity>;
  public async recover(
    targetOrEntity: EntityTargetType | ObjectLiteralType | ObjectLiteralType[],
    maybeEntityOrOptions?: ObjectLiteralType | ObjectLiteralType[] | SaveOptionsType,
    maybeOptions?: SaveOptionsType,
  ): Promise<ObjectLiteralType | ObjectLiteralType[]> {
    return this.markDeleted("restore", targetOrEntity, maybeEntityOrOptions, maybeOptions);
  }

  // ---------------------------------------------------------------------------
  // Bulk statements (no cascades, no entity loading)
  // ---------------------------------------------------------------------------

  public async insert<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    entity: QueryDeepPartialEntityType<Entity> | QueryDeepPartialEntityType<Entity>[],
  ): Promise<InsertResult> {
    return this.createQueryBuilder().insert().into(target).values(entity).execute();
  }

  public async update<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    criteria: FindCriteriaType<Entity>,
    partialEntity: QueryDeepPartialEntityType<Entity>,
  ): Promise<UpdateResult> {
    const qb = this.createQueryBuilder()
      .update(target)
      .set(partialEntity as QueryDeepPartialEntityType<ObjectLiteralType>);

    this.applyCriteria(qb, target, criteria);

    return qb.execute();
  }

  /** Inserts, or updates on a conflict on `conflictPaths`. */
  public async upsert<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    entityOrEntities: QueryDeepPartialEntityType<Entity> | QueryDeepPartialEntityType<Entity>[],
    conflictPathsOrOptions: string[] | UpsertOptionsType<Entity>,
  ): Promise<InsertResult> {
    const metadata = this.connection.getMetadata(target);
    const options: UpsertOptionsType<Entity> = Array.isArray(conflictPathsOrOptions)
      ? { conflictPaths: conflictPathsOrOptions }
      : conflictPathsOrOptions;
    const conflictPaths = Array.isArray(options.conflictPaths)
      ? options.conflictPaths
      : Object.keys(options.conflictPaths).filter((key) => (options.conflictPaths as ObjectLiteralType)[key]);
    const entities = Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities];
    const overwrite = new Set<string>();

    for (const entity of entities) {
      for (const key of Object.keys(entity)) {
        if (
          !conflictPaths.includes(key) &&
          (metadata.findColumnWithPropertyName(key) || metadata.hasRelationWithPropertyPath(key))
        ) {
          overwrite.add(key);
        }
      }
    }

    if (metadata.updateDateColumn) {
      overwrite.add(metadata.updateDateColumn.propertyName);
    }

    return this.createQueryBuilder()
      .insert()
      .into(target)
      .values(entities)
      .orUpdate([...overwrite], conflictPaths, { skipUpdateIfNoValuesChanged: options.skipUpdateIfNoValuesChanged })
      .execute();
  }

  public async delete<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    criteria: FindCriteriaType<Entity>,
  ): Promise<DeleteResult> {
    const qb = this.createQueryBuilder().delete().from(target);

    this.applyCriteria(qb, target, criteria);

    return qb.execute();
  }

  public async softDelete<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    criteria: FindCriteriaType<Entity>,
  ): Promise<UpdateResult> {
    const qb = this.createQueryBuilder().softDelete().from(target);

    this.applyCriteria(qb, target, criteria);

    return qb.execute();
  }

  public async restore<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    criteria: FindCriteriaType<Entity>,
  ): Promise<UpdateResult> {
    const qb = this.createQueryBuilder().restore().from(target);

    this.applyCriteria(qb, target, criteria);

    return qb.execute();
  }

  /** Empties the table. */
  public async clear<Entity extends ObjectLiteralType>(target: EntityTargetType<Entity>): Promise<void> {
    const metadata = this.connection.getMetadata(target);
    const statement = this.connection.driver.truncateStatement(
      this.connection.driver.escapePath(metadata.tableName, metadata.schema),
    );

    await this.query(statement);
  }

  public async increment<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    criteria: FindCriteriaType<Entity>,
    propertyPath: string,
    value: number | string,
  ): Promise<UpdateResult> {
    return this.adjust(target, criteria, propertyPath, value, "+");
  }

  public async decrement<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    criteria: FindCriteriaType<Entity>,
    propertyPath: string,
    value: number | string,
  ): Promise<UpdateResult> {
    return this.adjust(target, criteria, propertyPath, value, "-");
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  public async find<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    options: FindManyOptionsType<Entity> = {},
  ): Promise<Entity[]> {
    return this.createFindQueryBuilder(target, options).getMany();
  }

  public async findBy<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<Entity[]> {
    return this.find(target, { where });
  }

  public async findAndCount<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    options: FindManyOptionsType<Entity> = {},
  ): Promise<[Entity[], number]> {
    return this.createFindQueryBuilder(target, options).getManyAndCount();
  }

  public async findAndCountBy<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<[Entity[], number]> {
    return this.findAndCount(target, { where });
  }

  /** Entities with the given primary keys; missing ids are skipped. */
  public async findByIds<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    ids: EntityIdType[],
  ): Promise<Entity[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.createFindQueryBuilder(target, {}).andWhereInIds(ids).getMany();
  }

  public async findOne<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    options: FindOneOptionsType<Entity>,
  ): Promise<Entity | null> {
    return this.createFindQueryBuilder(target, { ...options, take: 1 }).getOne();
  }

  public async findOneBy<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<Entity | null> {
    return this.findOne(target, { where });
  }

  public async findOneById<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    id: EntityIdType,
  ): Promise<Entity | null> {
    return this.createFindQueryBuilder(target, { take: 1 }).andWhereInIds(id).getOne();
  }

  public async findOneOrFail<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    options: FindOneOptionsType<Entity>,
  ): Promise<Entity> {
    const entity = await this.findOne(target, options);

    if (!entity) {
      throw new EntityNotFoundError(this.connection.getMetadata(target).name, options.where);
    }

    return entity;
  }

  public async findOneByOrFail<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<Entity> {
    return this.findOneOrFail(target, { where });
  }

  public async count<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    options: FindManyOptionsType<Entity> = {},
  ): Promise<number> {
    return this.createFindQueryBuilder(target, options).getCount();
  }

  public async countBy<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number> {
    return this.count(target, { where });
  }

  public async exists<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    options: FindManyOptionsType<Entity> = {},
  ): Promise<boolean> {
    return this.createFindQueryBuilder(target, options).getExists();
  }

  public async existsBy<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<boolean> {
    return this.exists(target, { where });
  }

  public async sum<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    columnName: keyof Entity & string,
    where?: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number | null> {
    return this.aggregate(target, "SUM", columnName, where);
  }

  public async average<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    columnName: keyof Entity & string,
    where?: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number | null> {
    return this.aggregate(target, "AVG", columnName, where);
  }

  public async minimum<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    columnName: keyof Entity & string,
    where?: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number | null> {
    return this.aggregate(target, "MIN", columnName, where);
  }

  public async maximum<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    columnName: keyof Entity & string,
    where?: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number | null> {
    return this.aggregate(target, "MAX", columnName, where);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private createFindQueryBuilder<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    options: FindManyOptionsType<Entity>,
  ): SelectQueryBuilder<Entity> {
    const metadata = this.connection.getMetadata(target);

    return this.createQueryBuilder(target, metadata.tableName).setFindOptions(options);
  }

  private async aggregate<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    fn: AggregateFunctionType,
    columnName: string,
    where?: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number | null> {
    const metadata = this.connection.getMetadata(target);
    const alias = metadata.tableName;
    const qb = this.createQueryBuilder(target, alias).select(`${fn}(${alias}.${columnName})`, fn);

    if (where) {
      qb.where(where as ObjectLiteralType);
    }

    const row = await qb.getRawOne<Record<AggregateFunctionType, unknown>>();
    const value = row?.[fn];

    return value === null || value === undefined ? null : Number(value);
  }

  private async adjust<Entity extends ObjectLiteralType>(
    target: EntityTargetType<Entity>,
    criteria: FindCriteriaType<Entity>,
    propertyPath: string,
    value: number | string,
    operator: "+" | "-",
  ): Promise<UpdateResult> {
    const metadata = this.connection.getMetadata(target);
    const column = metadata.findColumnWithPropertyName(propertyPath);
    const amount = Number(value);

    if (!column) {
      throw new InvalidCriteriaError(`Column "${propertyPath}" was not found in "${metadata.name}".`, propertyPath);
    }

    if (!Number.isFinite(amount)) {
      throw new InvalidCriteriaError(`Value "${String(value)}" is not a number.`, value);
    }

    const escaped = this.connection.driver.escape(column.databaseName);

    return this.update(target, criteria, {
      [propertyPath]: () => `${escaped} ${operator} ${amount}`,
    } as unknown as QueryDeepPartialEntityType<Entity>);
  }

  /** Applies update/delete criteria: ids, id lists, or where objects. Refuses empty criteria. */
  private applyCriteria<Entity extends ObjectLiteralType>(
    qb:
      | UpdateQueryBuilder<ObjectLiteralType>
      | DeleteQueryBuilder<ObjectLiteralType>
      | SoftDeleteQueryBuilder<ObjectLiteralType>,
    target: EntityTargetType<Entity>,
    criteria: FindCriteriaType<Entity>,
  ): void {
    const isEmpty =
      criteria === undefined ||
      criteria === null ||
      (Array.isArray(criteria) && criteria.length === 0) ||
      (isPlainObject(criteria) && Object.keys(criteria).length === 0);

    if (isEmpty) {
      throw new InvalidCriteriaError(
        `Empty criteria are not allowed for ${this.connection.getMetadata(target).name}: pass an id, a list of ids or a where object.`,
        criteria,
      );
    }

    if (isPlainObject(criteria) || (Array.isArray(criteria) && criteria.some(isPlainObject))) {
      (qb as QueryBuilder<ObjectLiteralType>).where(criteria as ObjectLiteralType | ObjectLiteralType[]);

      return;
    }

    (qb as QueryBuilder<ObjectLiteralType>).whereInIds(criteria as EntityIdType | EntityIdType[]);
  }

  private async markDeleted(
    mode: "soft-delete" | "restore",
    targetOrEntity: EntityTargetType | ObjectLiteralType | ObjectLiteralType[],
    maybeEntityOrOptions?: ObjectLiteralType | ObjectLiteralType[] | SaveOptionsType,
    maybeOptions?: SaveOptionsType,
  ): Promise<ObjectLiteralType | ObjectLiteralType[]> {
    const { target, entities, options, result } = this.splitTargetArguments(
      targetOrEntity,
      maybeEntityOrOptions,
      maybeOptions,
    );

    if (entities.length === 0) {
      return result;
    }

    const metadata = this.metadataFor(target, entities[0] as ObjectLiteralType);

    await this.runInTransaction(options.transaction !== false, async (manager) => {
      const persister = new EntityPersister(manager);

      for (const batch of chunk(entities, options.chunk)) {
        if (mode === "soft-delete") {
          await persister.softRemove(metadata, batch);
        } else {
          await persister.recover(metadata, batch);
        }
      }
    });

    return result;
  }

  private async runInTransaction<T>(useTransaction: boolean, work: (manager: EntityManager) => Promise<T>): Promise<T> {
    if (!useTransaction || !this.connection.driver.supportsTransactions || this.queryRunner?.isTransactionActive) {
      return work(this);
    }

    return this.transaction(work);
  }

  /** Untangles `(entity)`, `(entities, options)`, `(target, entity, options)` argument shapes. */
  private splitTargetArguments<Options extends ObjectLiteralType>(
    targetOrEntity: EntityTargetType | ObjectLiteralType | ObjectLiteralType[],
    maybeEntityOrOptions?: ObjectLiteralType | ObjectLiteralType[] | Options,
    maybeOptions?: Options,
  ): {
    target: EntityTargetType | undefined;
    entities: ObjectLiteralType[];
    options: Options;
    /** The entity input as the caller passed it, to hand back once processed in place. */
    result: ObjectLiteralType | ObjectLiteralType[];
  } {
    const hasTarget = typeof targetOrEntity === "function" || typeof targetOrEntity === "string";
    const entityInput = (hasTarget ? maybeEntityOrOptions : targetOrEntity) as ObjectLiteralType | ObjectLiteralType[];
    const options = ((hasTarget ? maybeOptions : maybeEntityOrOptions) ?? {}) as Options;
    const entities = Array.isArray(entityInput) ? entityInput : [entityInput];

    return {
      target: hasTarget ? (targetOrEntity as EntityTargetType) : undefined,
      entities,
      options,
      result: entityInput,
    };
  }

  private metadataFor(target: EntityTargetType | undefined, entity: ObjectLiteralType): EntityMetadata {
    return this.connection.getMetadata(target ?? (entity.constructor as EntityTargetType));
  }

  private transformPlain(
    metadata: EntityMetadata,
    entity: ObjectLiteralType,
    plain: ObjectLiteralType,
  ): ObjectLiteralType {
    for (const column of metadata.ownColumns) {
      const value = plain[column.propertyName];

      if (value !== undefined) {
        column.setEntityValue(entity, value);
      }
    }

    for (const relation of metadata.relations) {
      const value = plain[relation.propertyName];

      if (value === undefined) {
        continue;
      }

      if (value === null) {
        relation.setEntityValue(entity, null);
        continue;
      }

      const inverse = relation.inverseEntityMetadata;

      if (relation.isToMany) {
        relation.setEntityValue(
          entity,
          Array.isArray(value) ? value.map((item) => this.toEntity(inverse, item)) : [this.toEntity(inverse, value)],
        );
      } else {
        relation.setEntityValue(entity, this.toEntity(inverse, value));
      }
    }

    return entity;
  }

  private toEntity(metadata: EntityMetadata, value: unknown): ObjectLiteralType {
    if (isPlainObject(value)) {
      const target = value instanceof metadata.target ? value : metadata.create();

      return this.transformPlain(metadata, target, value);
    }

    // A bare value stands for the primary key of the related entity.
    return this.transformPlain(metadata, metadata.create(), metadata.ensureEntityIdMap(value as EntityIdType));
  }
}

const chunk = <T>(items: T[], size: number | undefined): T[][] => {
  if (!size || size <= 0 || items.length <= size) {
    return [items];
  }

  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};
