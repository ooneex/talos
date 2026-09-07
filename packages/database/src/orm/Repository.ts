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
  UpsertOptionsType,
} from "../types";
import type { EntityManager } from "./EntityManager";
import type { EntityMetadata } from "./EntityMetadata";
import type { QueryRunner } from "./QueryRunner";
import type { DeleteResult, InsertResult, UpdateResult } from "./query-builder/results";
import type { SelectQueryBuilder } from "./query-builder/SelectQueryBuilder";

/**
 * The entity manager's operations, fixed to one entity.
 *
 * @example
 * const users = dataSource.getRepository(UserEntity);
 * const user = users.create({ email: "a@b.c" });
 * await users.save(user);
 * const found = await users.findOneBy({ email: "a@b.c" });
 */
export class Repository<Entity extends ObjectLiteralType> {
  public constructor(
    public readonly target: EntityTargetType<Entity>,
    public readonly manager: EntityManager,
    public readonly queryRunner?: QueryRunner,
  ) {}

  public get metadata(): EntityMetadata {
    return this.manager.connection.getMetadata(this.target);
  }

  public createQueryBuilder(alias?: string, queryRunner?: QueryRunner): SelectQueryBuilder<Entity> {
    return this.manager.createQueryBuilder(
      this.target,
      alias ?? this.metadata.tableName,
      queryRunner ?? this.queryRunner,
    );
  }

  public hasId(entity: Entity): boolean {
    return this.manager.hasId(this.target, entity);
  }

  public getId(entity: Entity): EntityIdType | undefined {
    return this.manager.getId(this.target, entity);
  }

  public create(): Entity;
  public create(plain: DeepPartialType<Entity>): Entity;
  public create(plains: DeepPartialType<Entity>[]): Entity[];
  public create(plain?: DeepPartialType<Entity> | DeepPartialType<Entity>[]): Entity | Entity[] {
    if (Array.isArray(plain)) {
      return this.manager.create(this.target, plain);
    }

    return this.manager.create(this.target, plain ?? ({} as DeepPartialType<Entity>));
  }

  public merge(mergeInto: Entity, ...plains: DeepPartialType<Entity>[]): Entity {
    return this.manager.merge(this.target, mergeInto, ...plains);
  }

  public async preload(plain: DeepPartialType<Entity>): Promise<Entity | undefined> {
    return this.manager.preload(this.target, plain);
  }

  public async save<T extends DeepPartialType<Entity>>(
    entities: T[],
    options?: SaveOptionsType,
  ): Promise<(T & Entity)[]>;
  public async save<T extends DeepPartialType<Entity>>(entity: T, options?: SaveOptionsType): Promise<T & Entity>;
  public async save<T extends DeepPartialType<Entity>>(
    entityOrEntities: T | T[],
    options?: SaveOptionsType,
  ): Promise<(T & Entity) | (T & Entity)[]> {
    if (Array.isArray(entityOrEntities)) {
      return this.manager.save(this.target, entityOrEntities, options);
    }

    return this.manager.save(this.target, entityOrEntities, options);
  }

  public async remove(entities: Entity[], options?: RemoveOptionsType): Promise<Entity[]>;
  public async remove(entity: Entity, options?: RemoveOptionsType): Promise<Entity>;
  public async remove(entityOrEntities: Entity | Entity[], options?: RemoveOptionsType): Promise<Entity | Entity[]> {
    if (Array.isArray(entityOrEntities)) {
      return this.manager.remove(this.target, entityOrEntities, options);
    }

    return this.manager.remove(this.target, entityOrEntities, options);
  }

  public async softRemove(entities: Entity[], options?: SaveOptionsType): Promise<Entity[]>;
  public async softRemove(entity: Entity, options?: SaveOptionsType): Promise<Entity>;
  public async softRemove(entityOrEntities: Entity | Entity[], options?: SaveOptionsType): Promise<Entity | Entity[]> {
    if (Array.isArray(entityOrEntities)) {
      return this.manager.softRemove(this.target, entityOrEntities, options);
    }

    return this.manager.softRemove(this.target, entityOrEntities, options);
  }

  public async recover(entities: Entity[], options?: SaveOptionsType): Promise<Entity[]>;
  public async recover(entity: Entity, options?: SaveOptionsType): Promise<Entity>;
  public async recover(entityOrEntities: Entity | Entity[], options?: SaveOptionsType): Promise<Entity | Entity[]> {
    if (Array.isArray(entityOrEntities)) {
      return this.manager.recover(this.target, entityOrEntities, options);
    }

    return this.manager.recover(this.target, entityOrEntities, options);
  }

  public async insert(
    entity: QueryDeepPartialEntityType<Entity> | QueryDeepPartialEntityType<Entity>[],
  ): Promise<InsertResult> {
    return this.manager.insert(this.target, entity);
  }

  public async update(
    criteria: FindCriteriaType<Entity>,
    partialEntity: QueryDeepPartialEntityType<Entity>,
  ): Promise<UpdateResult> {
    return this.manager.update(this.target, criteria, partialEntity);
  }

  public async upsert(
    entityOrEntities: QueryDeepPartialEntityType<Entity> | QueryDeepPartialEntityType<Entity>[],
    conflictPathsOrOptions: string[] | UpsertOptionsType<Entity>,
  ): Promise<InsertResult> {
    return this.manager.upsert(this.target, entityOrEntities, conflictPathsOrOptions);
  }

  public async delete(criteria: FindCriteriaType<Entity>): Promise<DeleteResult> {
    return this.manager.delete(this.target, criteria);
  }

  public async softDelete(criteria: FindCriteriaType<Entity>): Promise<UpdateResult> {
    return this.manager.softDelete(this.target, criteria);
  }

  public async restore(criteria: FindCriteriaType<Entity>): Promise<UpdateResult> {
    return this.manager.restore(this.target, criteria);
  }

  public async exists(options?: FindManyOptionsType<Entity>): Promise<boolean> {
    return this.manager.exists(this.target, options);
  }

  public async existsBy(where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[]): Promise<boolean> {
    return this.manager.existsBy(this.target, where);
  }

  public async count(options?: FindManyOptionsType<Entity>): Promise<number> {
    return this.manager.count(this.target, options);
  }

  public async countBy(where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[]): Promise<number> {
    return this.manager.countBy(this.target, where);
  }

  public async sum(
    columnName: keyof Entity & string,
    where?: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number | null> {
    return this.manager.sum(this.target, columnName, where);
  }

  public async average(
    columnName: keyof Entity & string,
    where?: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number | null> {
    return this.manager.average(this.target, columnName, where);
  }

  public async minimum(
    columnName: keyof Entity & string,
    where?: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number | null> {
    return this.manager.minimum(this.target, columnName, where);
  }

  public async maximum(
    columnName: keyof Entity & string,
    where?: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<number | null> {
    return this.manager.maximum(this.target, columnName, where);
  }

  public async find(options?: FindManyOptionsType<Entity>): Promise<Entity[]> {
    return this.manager.find(this.target, options);
  }

  public async findBy(where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[]): Promise<Entity[]> {
    return this.manager.findBy(this.target, where);
  }

  public async findAndCount(options?: FindManyOptionsType<Entity>): Promise<[Entity[], number]> {
    return this.manager.findAndCount(this.target, options);
  }

  public async findAndCountBy(
    where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[],
  ): Promise<[Entity[], number]> {
    return this.manager.findAndCountBy(this.target, where);
  }

  public async findByIds(ids: EntityIdType[]): Promise<Entity[]> {
    return this.manager.findByIds(this.target, ids);
  }

  public async findOne(options: FindOneOptionsType<Entity>): Promise<Entity | null> {
    return this.manager.findOne(this.target, options);
  }

  public async findOneBy(where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[]): Promise<Entity | null> {
    return this.manager.findOneBy(this.target, where);
  }

  public async findOneById(id: EntityIdType): Promise<Entity | null> {
    return this.manager.findOneById(this.target, id);
  }

  public async findOneOrFail(options: FindOneOptionsType<Entity>): Promise<Entity> {
    return this.manager.findOneOrFail(this.target, options);
  }

  public async findOneByOrFail(where: FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[]): Promise<Entity> {
    return this.manager.findOneByOrFail(this.target, where);
  }

  public async query<Row = ObjectLiteralType>(sql: string, parameters?: unknown[]): Promise<Row[]> {
    return this.manager.query<Row>(sql, parameters);
  }

  public async clear(): Promise<void> {
    return this.manager.clear(this.target);
  }

  public async increment(
    criteria: FindCriteriaType<Entity>,
    propertyPath: string,
    value: number | string,
  ): Promise<UpdateResult> {
    return this.manager.increment(this.target, criteria, propertyPath, value);
  }

  public async decrement(
    criteria: FindCriteriaType<Entity>,
    propertyPath: string,
    value: number | string,
  ): Promise<UpdateResult> {
    return this.manager.decrement(this.target, criteria, propertyPath, value);
  }

  /** A repository with extra methods; `this` inside them is the extended repository. */
  public extend<CustomRepository>(
    custom: CustomRepository & ThisType<this & CustomRepository>,
  ): this & CustomRepository {
    const extended = Object.create(this) as this & CustomRepository;

    return Object.assign(extended, custom);
  }
}
