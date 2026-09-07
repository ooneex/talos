import type {
  EntityTargetType,
  FindManyOptionsType,
  FindOptionsOrderValueType,
  ObjectLiteralType,
  QueryDeepPartialEntityType,
} from "../../types";
import type { WhereConditionInputType } from "../Brackets";
import type { DataSource } from "../DataSource";
import type { ColumnMetadata, EntityMetadata, RelationMetadata } from "../EntityMetadata";
import {
  EntityNotFoundError,
  EntityPropertyNotFoundError,
  InvalidCriteriaError,
  RelationNotFoundError,
} from "../errors";
import type { QueryRunner } from "../QueryRunner";
import { DeleteQueryBuilder } from "./DeleteQueryBuilder";
import { InsertQueryBuilder } from "./InsertQueryBuilder";
import { QueryBuilder } from "./QueryBuilder";
import type { AliasType, JoinAttributeType, LockModeType, QueryExpressionMap } from "./QueryExpressionMap";
import { RawSqlResultsToEntityTransformer, rawColumnName } from "./RawSqlResultsToEntityTransformer";
import { RelationQueryBuilder } from "./RelationQueryBuilder";
import { SoftDeleteQueryBuilder } from "./SoftDeleteQueryBuilder";
import { UpdateQueryBuilder } from "./UpdateQueryBuilder";
import { WhereBuilder } from "./WhereBuilder";

type OrderDirectionType = "ASC" | "DESC";
type NullsOrderType = "NULLS FIRST" | "NULLS LAST";
type SubQueryFactoryType = (qb: SelectQueryBuilder<ObjectLiteralType>) => SelectQueryBuilder<ObjectLiteralType>;
type JoinTargetType = EntityTargetType | string | SubQueryFactoryType;

/** Arrow functions have no `prototype`; classes and plain functions do. */
const isSubQueryFactory = (value: unknown): value is SubQueryFactoryType =>
  typeof value === "function" && !("prototype" in value);

const DISTINCT_ALIAS = "distinctAlias";

/**
 * Builds and runs `SELECT` statements, and hydrates the rows into entities.
 *
 * @example
 * const users = await dataSource
 *   .createQueryBuilder(UserEntity, "user")
 *   .leftJoinAndSelect("user.posts", "post")
 *   .where("user.isActive = :active", { active: true })
 *   .orderBy("user.createdAt", "DESC")
 *   .take(20)
 *   .getMany();
 */
export class SelectQueryBuilder<Entity extends ObjectLiteralType> extends QueryBuilder<Entity> {
  private parentQueryBuilder: SelectQueryBuilder<ObjectLiteralType> | undefined;

  public constructor(dataSource: DataSource, queryRunner?: QueryRunner, expressionMap?: QueryExpressionMap) {
    super(dataSource, queryRunner, expressionMap);
    this.expressionMap.queryType = "select";
  }

  // ---------------------------------------------------------------------------
  // Switching to other statement kinds
  // ---------------------------------------------------------------------------

  public insert(): InsertQueryBuilder<Entity> {
    this.expressionMap.queryType = "insert";

    return new InsertQueryBuilder<Entity>(this.dataSource, this.queryRunner, this.expressionMap);
  }

  public update(): UpdateQueryBuilder<Entity>;
  public update(updateSet: QueryDeepPartialEntityType<Entity>): UpdateQueryBuilder<Entity>;
  public update<T extends ObjectLiteralType>(
    entity: EntityTargetType<T>,
    updateSet?: QueryDeepPartialEntityType<T>,
  ): UpdateQueryBuilder<T>;
  public update(
    entityOrUpdateSet?: EntityTargetType | QueryDeepPartialEntityType<Entity>,
    maybeUpdateSet?: ObjectLiteralType,
  ): UpdateQueryBuilder<ObjectLiteralType> {
    const isTarget = typeof entityOrUpdateSet === "function" || typeof entityOrUpdateSet === "string";
    const updateSet = isTarget ? maybeUpdateSet : (entityOrUpdateSet as ObjectLiteralType | undefined);

    if (isTarget) {
      const target = entityOrUpdateSet as EntityTargetType;
      const metadata = this.dataSource.hasMetadata(target) ? this.dataSource.getMetadata(target) : undefined;

      this.expressionMap.mainAlias = this.createAlias(metadata?.tableName ?? this.getTargetName(target), target);
    }

    this.expressionMap.queryType = "update";

    if (updateSet) {
      this.expressionMap.valuesSet = updateSet;
    }

    return new UpdateQueryBuilder<ObjectLiteralType>(this.dataSource, this.queryRunner, this.expressionMap);
  }

  public delete(): DeleteQueryBuilder<Entity> {
    this.expressionMap.queryType = "delete";

    return new DeleteQueryBuilder<Entity>(this.dataSource, this.queryRunner, this.expressionMap);
  }

  public softDelete(): SoftDeleteQueryBuilder<Entity> {
    this.expressionMap.queryType = "soft-delete";

    return new SoftDeleteQueryBuilder<Entity>(this.dataSource, this.queryRunner, this.expressionMap);
  }

  public restore(): SoftDeleteQueryBuilder<Entity> {
    this.expressionMap.queryType = "restore";

    return new SoftDeleteQueryBuilder<Entity>(this.dataSource, this.queryRunner, this.expressionMap);
  }

  /** Works on one relation of an entity: `relation(Post, "categories").of(post).add(category)`. */
  public relation(propertyPath: string): RelationQueryBuilder<Entity>;
  public relation<T extends ObjectLiteralType>(
    target: EntityTargetType<T>,
    propertyPath: string,
  ): RelationQueryBuilder<T>;
  public relation(
    targetOrPath: EntityTargetType | string,
    maybePath?: string,
  ): RelationQueryBuilder<ObjectLiteralType> {
    const propertyPath = maybePath ?? (targetOrPath as string);

    if (maybePath !== undefined) {
      const metadata = this.dataSource.getMetadata(targetOrPath);

      this.expressionMap.mainAlias = this.createAlias(metadata.tableName, targetOrPath);
    }

    this.expressionMap.queryType = "relation";
    this.expressionMap.relationPropertyPath = propertyPath;

    return new RelationQueryBuilder<ObjectLiteralType>(this.dataSource, this.queryRunner, this.expressionMap);
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  public select(): this;
  public select(selection: string | string[], selectionAliasName?: string): this;
  public select(selection?: string | string[], selectionAliasName?: string): this {
    this.expressionMap.queryType = "select";
    this.expressionMap.selects = [];

    if (selection === undefined) {
      return this;
    }

    return this.addSelect(selection, selectionAliasName);
  }

  public addSelect(selection: string | string[], selectionAliasName?: string): this {
    const list = Array.isArray(selection) ? selection : [selection];

    for (const item of list) {
      this.expressionMap.selects.push({
        selection: item,
        aliasName: list.length === 1 ? selectionAliasName : undefined,
      });
    }

    return this;
  }

  public distinct(distinct = true): this {
    this.expressionMap.selectDistinct = distinct;

    return this;
  }

  /** PostgreSQL `DISTINCT ON (...)`. */
  public distinctOn(distinctOn: string[]): this {
    this.expressionMap.selectDistinctOn = distinctOn;

    return this;
  }

  public from<T extends ObjectLiteralType>(
    target: EntityTargetType<T> | string | SubQueryFactoryType,
    aliasName: string,
  ): SelectQueryBuilder<T> {
    this.expressionMap.mainAlias = this.createFromAlias(target, aliasName);

    return this as unknown as SelectQueryBuilder<T>;
  }

  public addFrom<T extends ObjectLiteralType>(
    target: EntityTargetType<T> | string | SubQueryFactoryType,
    aliasName: string,
  ): SelectQueryBuilder<T> {
    this.createFromAlias(target, aliasName);
    this.expressionMap.extraFromAliases.push(aliasName);

    return this as unknown as SelectQueryBuilder<T>;
  }

  /** A builder whose SQL is embedded in parentheses and whose parameters land on this builder. */
  public subQuery(): SelectQueryBuilder<ObjectLiteralType> {
    const qb = new SelectQueryBuilder<ObjectLiteralType>(this.dataSource, this.queryRunner);

    qb.expressionMap.isSubQuery = true;
    qb.parentQueryBuilder = this as unknown as SelectQueryBuilder<ObjectLiteralType>;

    return qb;
  }

  // ---------------------------------------------------------------------------
  // Joins
  // ---------------------------------------------------------------------------

  public innerJoin(
    entityOrProperty: JoinTargetType,
    alias: string,
    condition?: string,
    parameters?: ObjectLiteralType,
  ): this {
    return this.join("INNER", entityOrProperty, alias, condition, parameters, false);
  }

  public leftJoin(
    entityOrProperty: JoinTargetType,
    alias: string,
    condition?: string,
    parameters?: ObjectLiteralType,
  ): this {
    return this.join("LEFT", entityOrProperty, alias, condition, parameters, false);
  }

  public innerJoinAndSelect(
    entityOrProperty: JoinTargetType,
    alias: string,
    condition?: string,
    parameters?: ObjectLiteralType,
  ): this {
    return this.join("INNER", entityOrProperty, alias, condition, parameters, true);
  }

  public leftJoinAndSelect(
    entityOrProperty: JoinTargetType,
    alias: string,
    condition?: string,
    parameters?: ObjectLiteralType,
  ): this {
    return this.join("LEFT", entityOrProperty, alias, condition, parameters, true);
  }

  public innerJoinAndMapOne(
    mapToProperty: string,
    entityOrProperty: JoinTargetType,
    alias: string,
    condition?: string,
    parameters?: ObjectLiteralType,
  ): this {
    return this.join("INNER", entityOrProperty, alias, condition, parameters, true, mapToProperty, false);
  }

  public leftJoinAndMapOne(
    mapToProperty: string,
    entityOrProperty: JoinTargetType,
    alias: string,
    condition?: string,
    parameters?: ObjectLiteralType,
  ): this {
    return this.join("LEFT", entityOrProperty, alias, condition, parameters, true, mapToProperty, false);
  }

  public innerJoinAndMapMany(
    mapToProperty: string,
    entityOrProperty: JoinTargetType,
    alias: string,
    condition?: string,
    parameters?: ObjectLiteralType,
  ): this {
    return this.join("INNER", entityOrProperty, alias, condition, parameters, true, mapToProperty, true);
  }

  public leftJoinAndMapMany(
    mapToProperty: string,
    entityOrProperty: JoinTargetType,
    alias: string,
    condition?: string,
    parameters?: ObjectLiteralType,
  ): this {
    return this.join("LEFT", entityOrProperty, alias, condition, parameters, true, mapToProperty, true);
  }

  // ---------------------------------------------------------------------------
  // Grouping, ordering, paging
  // ---------------------------------------------------------------------------

  public groupBy(groupBy?: string): this {
    this.expressionMap.groupBys = groupBy === undefined ? [] : [groupBy];

    return this;
  }

  public addGroupBy(groupBy: string): this {
    this.expressionMap.groupBys.push(groupBy);

    return this;
  }

  public having(having: WhereConditionInputType, parameters?: ObjectLiteralType): this {
    this.expressionMap.havings = [];

    return this.addHaving("simple", having, parameters);
  }

  public andHaving(having: WhereConditionInputType, parameters?: ObjectLiteralType): this {
    return this.addHaving("and", having, parameters);
  }

  public orHaving(having: WhereConditionInputType, parameters?: ObjectLiteralType): this {
    return this.addHaving("or", having, parameters);
  }

  public orderBy(): this;
  public orderBy(sort: string, order?: OrderDirectionType, nulls?: NullsOrderType): this;
  public orderBy(order: Record<string, OrderDirectionType>): this;
  public orderBy(
    sortOrMap?: string | Record<string, OrderDirectionType>,
    order: OrderDirectionType = "ASC",
    nulls?: NullsOrderType,
  ): this {
    this.expressionMap.orderBys = {};

    if (sortOrMap === undefined) {
      return this;
    }

    if (typeof sortOrMap === "string") {
      return this.addOrderBy(sortOrMap, order, nulls);
    }

    for (const [sort, direction] of Object.entries(sortOrMap)) {
      this.addOrderBy(sort, direction);
    }

    return this;
  }

  public addOrderBy(sort: string, order: OrderDirectionType = "ASC", nulls?: NullsOrderType): this {
    this.expressionMap.orderBys[sort] = { order, nulls };

    return this;
  }

  /** Raw `LIMIT`; prefer `take()` when joins are involved. */
  public limit(limit?: number): this {
    this.expressionMap.limit = limit;

    return this;
  }

  /** Raw `OFFSET`; prefer `skip()` when joins are involved. */
  public offset(offset?: number): this {
    this.expressionMap.offset = offset;

    return this;
  }

  /** Number of entities to return; correct across to-many joins. */
  public take(take?: number): this {
    this.expressionMap.take = take;

    return this;
  }

  /** Number of entities to skip; correct across to-many joins. */
  public skip(skip?: number): this {
    this.expressionMap.skip = skip;

    return this;
  }

  public withDeleted(): this {
    this.expressionMap.withDeleted = true;

    return this;
  }

  /** `FOR UPDATE` / `FOR SHARE`; ignored on SQLite. */
  public setLock(lockMode: LockModeType): this {
    this.expressionMap.lockMode = lockMode;

    return this;
  }

  /** Applies find options (`select`, `where`, `relations`, `order`, paging, soft-delete flags). */
  public setFindOptions(options: FindManyOptionsType<Entity>): this {
    const metadata = this.requireMetadata();

    if (options.comment) {
      this.comment(options.comment);
    }

    if (options.withDeleted) {
      this.withDeleted();
    }

    if (options.relations) {
      this.applyRelationsOption(options.relations, this.alias, metadata);
    }

    if (options.loadEagerRelations !== false) {
      this.joinEagerRelations(this.alias, metadata, new Set([metadata]));
    }

    if (options.select) {
      this.select();
      this.applySelectOption(options.select, this.alias, metadata);
    }

    if (options.where) {
      this.where(options.where as ObjectLiteralType);
    }

    if (options.order) {
      this.applyOrderOption(options.order, this.alias, metadata);
    }

    if (options.skip !== undefined) {
      this.skip(options.skip);
    }

    if (options.take !== undefined) {
      this.take(options.take);
    }

    return this;
  }

  // ---------------------------------------------------------------------------
  // SQL
  // ---------------------------------------------------------------------------

  public getQuery(): string {
    const sql =
      this.createCommentExpression() +
      this.createSelectExpression() +
      this.createJoinExpression() +
      this.createWhereExpression() +
      this.createGroupByExpression() +
      this.createHavingExpression() +
      this.createOrderByExpression() +
      this.createLimitOffsetExpression() +
      this.createLockExpression();

    return this.expressionMap.isSubQuery ? `(${sql})` : sql;
  }

  public clone(): SelectQueryBuilder<Entity> {
    const qb = new SelectQueryBuilder<Entity>(this.dataSource, this.queryRunner, this.expressionMap.clone());

    qb.parentQueryBuilder = this.parentQueryBuilder;

    return qb;
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  public async getRawMany<T = ObjectLiteralType>(): Promise<T[]> {
    const [sql, parameters] = this.getQueryAndParameters();
    const result = await this.runQuery<T>(sql, parameters);

    return result.records;
  }

  public async getRawOne<T = ObjectLiteralType>(): Promise<T | undefined> {
    const [first] = await this.getRawMany<T>();

    return first;
  }

  /** Alias of `getRawMany()`. */
  public async execute<T = ObjectLiteralType>(): Promise<T[]> {
    return this.getRawMany<T>();
  }

  public async getRawAndEntities<T = ObjectLiteralType>(): Promise<{ raw: T[]; entities: Entity[] }> {
    const metadata = this.requireMetadata();
    const mainAlias = this.expressionMap.mainAlias as AliasType;
    let raw: ObjectLiteralType[];

    if (this.needsTwoStepPagination()) {
      const ids = await this.loadPaginatedIds(metadata);

      if (ids.length === 0) {
        return { raw: [], entities: [] };
      }

      const qb = this.clone();

      qb.expressionMap.take = undefined;
      qb.expressionMap.skip = undefined;
      qb.andWhereInIds(ids);
      raw = await qb.getRawMany();
    } else {
      raw = await this.getRawMany();
    }

    const transformer = new RawSqlResultsToEntityTransformer(this.expressionMap, this.driver);

    return { raw: raw as T[], entities: transformer.transform(raw, mainAlias) as Entity[] };
  }

  public async getMany(): Promise<Entity[]> {
    const { entities } = await this.getRawAndEntities();

    return entities;
  }

  public async getOne(): Promise<Entity | null> {
    const [entity] = await this.getMany();

    return entity ?? null;
  }

  public async getOneOrFail(): Promise<Entity> {
    const entity = await this.getOne();

    if (!entity) {
      throw new EntityNotFoundError(this.mainMetadata?.name ?? this.alias, this.getParameters());
    }

    return entity;
  }

  public async getCount(): Promise<number> {
    const [sql, parameters] = this.bindParameters(this.getCountQuery());
    const result = await this.runQuery<{ cnt: number | string | bigint }>(sql, parameters);

    return Number(result.records[0]?.cnt ?? 0);
  }

  public async getExists(): Promise<boolean> {
    const [sql, parameters] = this.bindParameters(this.getExistsQuery());
    const result = await this.runQuery(sql, parameters);

    return result.records.length > 0;
  }

  public async getManyAndCount(): Promise<[Entity[], number]> {
    const entities = await this.getMany();
    const count = await this.getCount();

    return [entities, count];
  }

  // ---------------------------------------------------------------------------
  // Internals — joins & find options
  // ---------------------------------------------------------------------------

  /** Adds a non-selected join for a relation reached from a where/order object, reusing an existing one. */
  protected override createWhereBuilder(): WhereBuilder {
    return new WhereBuilder(this.driver, this.whereParameters(), (parentAlias, relation) =>
      this.ensureRelationJoin(parentAlias, relation, false),
    );
  }

  protected override createParameter(value: unknown): string {
    if (this.parentQueryBuilder) {
      return this.parentQueryBuilder.createParameter(value);
    }

    return super.createParameter(value);
  }

  public override setParameter(key: string, value: unknown): this {
    if (this.parentQueryBuilder) {
      this.parentQueryBuilder.setParameter(key, value);
    }

    return super.setParameter(key, value);
  }

  private requireMetadata(): EntityMetadata {
    const metadata = this.mainMetadata;

    if (!metadata) {
      throw new InvalidCriteriaError("This query has no entity target; use getRawMany() for raw tables.", this.alias);
    }

    return metadata;
  }

  private createFromAlias(target: EntityTargetType | string | SubQueryFactoryType, aliasName: string): AliasType {
    if (isSubQueryFactory(target)) {
      const subQuery = target(this.subQuery()).getQuery();

      return this.expressionMap.createAlias({ name: aliasName, subQuery });
    }

    return this.createAlias(aliasName, target);
  }

  private join(
    direction: "INNER" | "LEFT",
    entityOrProperty: JoinTargetType,
    aliasName: string,
    condition: string | undefined,
    parameters: ObjectLiteralType | undefined,
    isSelected: boolean,
    mapToProperty?: string,
    isMappingMany?: boolean,
  ): this {
    if (parameters) {
      this.setParameters(parameters);
    }

    const existing = this.expressionMap.joinAttributes.find((join) => join.alias.name === aliasName);

    if (existing) {
      existing.isSelected = existing.isSelected || isSelected;

      if (condition) {
        existing.condition = condition;
      }

      return this;
    }

    if (isSubQueryFactory(entityOrProperty)) {
      const subQuery = entityOrProperty(this.subQuery()).getQuery();
      const alias = this.expressionMap.createAlias({ name: aliasName, subQuery });

      this.expressionMap.joinAttributes.push({
        direction,
        alias,
        condition,
        isSelected: false,
        mapToProperty,
        isMappingMany,
      });

      return this;
    }

    const relationJoin = typeof entityOrProperty === "string" ? this.resolveRelationPath(entityOrProperty) : undefined;

    if (relationJoin) {
      const { parentAlias, relation } = relationJoin;
      const alias = this.createAlias(aliasName, relation.inverseEntityMetadata.target);

      this.expressionMap.joinAttributes.push({
        direction,
        alias,
        parentAlias: parentAlias.name,
        relation,
        condition,
        isSelected,
        mapToProperty,
        isMappingMany,
        junctionAlias: relation.isManyToMany ? `${parentAlias.name}_${aliasName}` : undefined,
      });

      return this;
    }

    const alias = this.createAlias(aliasName, entityOrProperty);

    this.expressionMap.joinAttributes.push({
      direction,
      alias,
      condition,
      isSelected: isSelected && alias.metadata !== undefined,
      mapToProperty,
      isMappingMany,
    });

    return this;
  }

  /** `alias.property` where `alias` is a known entity alias and `property` one of its relations. */
  private resolveRelationPath(path: string): { parentAlias: AliasType; relation: RelationMetadata } | undefined {
    const dot = path.indexOf(".");

    if (dot === -1) {
      return undefined;
    }

    const parentAlias = this.expressionMap.findAlias(path.slice(0, dot));

    if (!parentAlias?.metadata) {
      return undefined;
    }

    const propertyPath = path.slice(dot + 1);
    const relation = parentAlias.metadata.findRelationWithPropertyPath(propertyPath);

    if (!relation) {
      throw new RelationNotFoundError(propertyPath, parentAlias.metadata.name);
    }

    return { parentAlias, relation };
  }

  private ensureRelationJoin(parentAliasName: string, relation: RelationMetadata, select: boolean): string {
    const aliasName = `${parentAliasName}_${relation.propertyName}`;

    this.join("LEFT", `${parentAliasName}.${relation.propertyName}`, aliasName, undefined, undefined, select);

    return aliasName;
  }

  private applyRelationsOption(
    relations: ObjectLiteralType | string[],
    aliasName: string,
    metadata: EntityMetadata,
  ): void {
    if (Array.isArray(relations)) {
      for (const path of relations) {
        let currentAlias = aliasName;
        let currentMetadata = metadata;

        for (const segment of path.split(".")) {
          const relation = currentMetadata.findRelationWithPropertyPath(segment);

          if (!relation) {
            throw new RelationNotFoundError(path, metadata.name);
          }

          currentAlias = this.ensureRelationJoin(currentAlias, relation, true);
          currentMetadata = relation.inverseEntityMetadata;
        }
      }

      return;
    }

    for (const [property, value] of Object.entries(relations)) {
      if (!value) {
        continue;
      }

      const relation = metadata.findRelationWithPropertyPath(property);

      if (!relation) {
        throw new RelationNotFoundError(property, metadata.name);
      }

      const joinAlias = this.ensureRelationJoin(aliasName, relation, true);

      if (typeof value === "object") {
        this.applyRelationsOption(value as ObjectLiteralType, joinAlias, relation.inverseEntityMetadata);
      }
    }
  }

  private joinEagerRelations(aliasName: string, metadata: EntityMetadata, visited: Set<EntityMetadata>): void {
    for (const relation of metadata.eagerRelations) {
      const inverse = relation.inverseEntityMetadata;

      if (visited.has(inverse)) {
        continue;
      }

      const joinAlias = this.ensureRelationJoin(aliasName, relation, true);

      this.joinEagerRelations(joinAlias, inverse, new Set([...visited, inverse]));
    }
  }

  private applySelectOption(
    select: ObjectLiteralType | (keyof Entity)[],
    aliasName: string,
    metadata: EntityMetadata,
  ): void {
    if (Array.isArray(select)) {
      for (const property of select) {
        this.addSelect(`${aliasName}.${String(property)}`);
      }

      return;
    }

    for (const [property, value] of Object.entries(select)) {
      if (!value) {
        continue;
      }

      if (metadata.findColumnWithPropertyName(property)) {
        this.addSelect(`${aliasName}.${property}`);
        continue;
      }

      const relation = metadata.findRelationWithPropertyPath(property);

      if (!relation) {
        throw new EntityPropertyNotFoundError(property, metadata.name);
      }

      const joinAlias = this.ensureRelationJoin(aliasName, relation, true);

      if (typeof value === "object") {
        this.applySelectOption(value as ObjectLiteralType, joinAlias, relation.inverseEntityMetadata);
      } else {
        this.addSelect(joinAlias);
      }
    }
  }

  private applyOrderOption(order: ObjectLiteralType, aliasName: string, metadata: EntityMetadata): void {
    for (const [property, value] of Object.entries(order)) {
      if (value === undefined) {
        continue;
      }

      if (metadata.findColumnWithPropertyName(property)) {
        const { direction, nulls } = normalizeOrder(value as FindOptionsOrderValueType);

        this.addOrderBy(`${aliasName}.${property}`, direction, nulls);
        continue;
      }

      const relation = metadata.findRelationWithPropertyPath(property);

      if (!relation) {
        throw new EntityPropertyNotFoundError(property, metadata.name);
      }

      if (typeof value === "object" && value !== null && !("direction" in value)) {
        const joinAlias = this.ensureRelationJoin(aliasName, relation, false);

        this.applyOrderOption(value as ObjectLiteralType, joinAlias, relation.inverseEntityMetadata);
        continue;
      }

      const { direction, nulls } = normalizeOrder(value as FindOptionsOrderValueType);

      // Ordering by a relation orders by its foreign key.
      this.addOrderBy(`${aliasName}.${property}`, direction, nulls);
    }
  }

  private addHaving(
    type: "simple" | "and" | "or",
    having: WhereConditionInputType,
    parameters?: ObjectLiteralType,
  ): this {
    const condition = this.computeWhereCondition(having, parameters);

    if (condition.length > 0) {
      this.expressionMap.havings.push({ type, condition });
    }

    return this;
  }

  // ---------------------------------------------------------------------------
  // Internals — SQL fragments
  // ---------------------------------------------------------------------------

  private get selectedAliases(): AliasType[] {
    const main = this.expressionMap.mainAlias;
    const joined = this.expressionMap.joinAttributes.filter((join) => join.isSelected).map((join) => join.alias);

    return main ? [main, ...joined] : joined;
  }

  private hasSelectedJoins(): boolean {
    return this.expressionMap.joinAttributes.some((join) => join.isSelected);
  }

  /** The columns of an entity alias that the current selection covers. */
  private selectedColumns(alias: AliasType): ColumnMetadata[] {
    const metadata = alias.metadata;

    if (!metadata) {
      return [];
    }

    const selects = this.expressionMap.selects;
    const selectsWhole = selects.length === 0 || selects.some((select) => select.selection === alias.name);
    const partial = selects
      .map((select) => select.selection)
      .filter((selection) => selection.startsWith(`${alias.name}.`))
      .map((selection) => selection.slice(alias.name.length + 1));
    const columns = selectsWhole
      ? metadata.columns.filter((column) => column.isSelect || column.isPrimary)
      : metadata.columns.filter((column) => partial.includes(column.propertyName) && !column.isVirtual);

    if (columns.length === 0 && partial.length === 0 && alias !== this.expressionMap.mainAlias) {
      // A joined-and-selected alias not mentioned by an explicit select() still gets its columns.
      return metadata.columns.filter((column) => column.isSelect || column.isPrimary);
    }

    if (!selectsWhole && this.hasSelectedJoins()) {
      // Hydration groups rows by primary key, so partial selections must keep it.
      for (const primary of metadata.primaryColumns) {
        if (!columns.includes(primary)) {
          columns.push(primary);
        }
      }
    }

    return columns;
  }

  private isEntitySelection(selection: string): boolean {
    if (this.expressionMap.findAlias(selection)?.metadata) {
      return true;
    }

    const dot = selection.indexOf(".");

    if (dot === -1) {
      return false;
    }

    const alias = this.expressionMap.findAlias(selection.slice(0, dot));

    return alias?.metadata?.findColumnWithPropertyName(selection.slice(dot + 1)) !== undefined;
  }

  private createCommentExpression(): string {
    const comment = this.expressionMap.comment;

    return comment ? `/* ${comment.replace(/\*\//g, "")} */ ` : "";
  }

  private createSelectExpression(): string {
    const mainAlias = this.expressionMap.mainAlias;

    if (!mainAlias) {
      throw new InvalidCriteriaError("Cannot build a SELECT without a FROM: call from() first.", undefined);
    }

    const selections: string[] = [];

    for (const alias of this.selectedAliases) {
      if (!alias.metadata) {
        if (this.expressionMap.selects.some((select) => select.selection === alias.name)) {
          selections.push(`${this.escape(alias.name)}.*`);
        }

        continue;
      }

      for (const column of this.selectedColumns(alias)) {
        selections.push(
          `${this.escape(alias.name)}.${this.escape(column.databaseName)} AS ${this.escape(rawColumnName(alias.name, column.databaseName))}`,
        );
      }
    }

    for (const select of this.expressionMap.selects) {
      if (this.isEntitySelection(select.selection) || this.expressionMap.findAlias(select.selection)) {
        continue;
      }

      const expression = this.replacePropertyNames(select.selection);

      selections.push(select.aliasName ? `${expression} AS ${this.escape(select.aliasName)}` : expression);
    }

    if (selections.length === 0) {
      selections.push("*");
    }

    const distinctOn =
      this.expressionMap.selectDistinctOn.length > 0
        ? `DISTINCT ON (${this.expressionMap.selectDistinctOn.map((item) => this.replacePropertyNames(item)).join(", ")}) `
        : "";
    const distinct = this.expressionMap.selectDistinct ? "DISTINCT " : "";
    const extraFroms = this.expressionMap.extraFromAliases
      .map((name) => this.expressionMap.findAlias(name))
      .filter((alias): alias is AliasType => alias !== undefined);
    const froms = [mainAlias, ...extraFroms].map((alias) => `${this.getTableName(alias)} ${this.escape(alias.name)}`);

    return `SELECT ${distinct}${distinctOn}${selections.join(", ")} FROM ${froms.join(", ")}`;
  }

  private createJoinExpression(): string {
    return this.expressionMap.joinAttributes.map((join) => this.createSingleJoin(join)).join("");
  }

  private createSingleJoin(join: JoinAttributeType): string {
    const destination = this.escape(join.alias.name);
    const table = this.getTableName(join.alias);
    const condition = join.condition ? this.replacePropertyNames(join.condition) : undefined;

    if (!join.relation || !join.parentAlias) {
      return ` ${join.direction} JOIN ${table} ${destination}${condition ? ` ON ${condition}` : ""}`;
    }

    const relation = join.relation;
    const parent = this.escape(join.parentAlias);
    const softDelete =
      join.alias.metadata?.deleteDateColumn && !this.expressionMap.withDeleted
        ? ` AND ${destination}.${this.escape(join.alias.metadata.deleteDateColumn.databaseName)} IS NULL`
        : "";
    const extra = condition ? ` AND (${condition})` : "";

    if (relation.isWithJoinColumn) {
      const on = relation.joinColumns
        .map(
          (column) =>
            `${destination}.${this.escape((column.referencedColumn as ColumnMetadata).databaseName)} = ${parent}.${this.escape(column.databaseName)}`,
        )
        .join(" AND ");

      return ` ${join.direction} JOIN ${table} ${destination} ON ${on}${softDelete}${extra}`;
    }

    if (relation.isOneToMany || relation.isOneToOneNotOwner) {
      const inverse = relation.inverseRelation;

      if (!inverse) {
        throw new RelationNotFoundError(relation.propertyName, relation.entityMetadata.name);
      }

      const on = inverse.joinColumns
        .map(
          (column) =>
            `${destination}.${this.escape(column.databaseName)} = ${parent}.${this.escape((column.referencedColumn as ColumnMetadata).databaseName)}`,
        )
        .join(" AND ");

      return ` ${join.direction} JOIN ${table} ${destination} ON ${on}${softDelete}${extra}`;
    }

    const junction = relation.junction;
    const junctionAlias = join.junctionAlias;

    if (!junction || !junctionAlias) {
      throw new RelationNotFoundError(relation.propertyName, relation.entityMetadata.name);
    }

    const junctionEscaped = this.escape(junctionAlias);
    const junctionOn = junction.joinColumns
      .map(
        (column) =>
          `${junctionEscaped}.${this.escape(column.databaseName)} = ${parent}.${this.escape(column.referencedColumn.databaseName)}`,
      )
      .join(" AND ");
    const targetOn = junction.inverseJoinColumns
      .map(
        (column) =>
          `${destination}.${this.escape(column.referencedColumn.databaseName)} = ${junctionEscaped}.${this.escape(column.databaseName)}`,
      )
      .join(" AND ");

    return (
      ` ${join.direction} JOIN ${this.driver.escapePath(junction.tableName, junction.schema)} ${junctionEscaped} ON ${junctionOn}` +
      ` ${join.direction} JOIN ${table} ${destination} ON ${targetOn}${softDelete}${extra}`
    );
  }

  private createGroupByExpression(): string {
    if (this.expressionMap.groupBys.length === 0) {
      return "";
    }

    return ` GROUP BY ${this.expressionMap.groupBys.map((item) => this.replacePropertyNames(item)).join(", ")}`;
  }

  private createHavingExpression(): string {
    if (this.expressionMap.havings.length === 0) {
      return "";
    }

    const conditions = this.expressionMap.havings
      .map((having, index) =>
        index === 0 ? having.condition : `${having.type === "or" ? "OR" : "AND"} ${having.condition}`,
      )
      .join(" ");

    return ` HAVING ${conditions}`;
  }

  private createOrderByExpression(): string {
    const entries = Object.entries(this.expressionMap.orderBys);

    if (entries.length === 0) {
      return "";
    }

    const clauses = entries.map(([sort, { order, nulls }]) => {
      const expression = this.replacePropertyNames(sort);
      const nullsClause = nulls && this.driver.type !== "mysql" && this.driver.type !== "mariadb" ? ` ${nulls}` : "";

      return `${expression} ${order}${nullsClause}`;
    });

    return ` ORDER BY ${clauses.join(", ")}`;
  }

  private createLimitOffsetExpression(): string {
    const map = this.expressionMap;
    const limit = map.limit ?? (this.needsTwoStepPagination() ? undefined : map.take);
    const offset = map.offset ?? (this.needsTwoStepPagination() ? undefined : map.skip);
    const clause = this.driver.buildLimitOffset(limit, offset);

    return clause ? ` ${clause}` : "";
  }

  private createLockExpression(): string {
    const mode = this.expressionMap.lockMode;

    if (!mode || this.driver.type === "sqlite") {
      return "";
    }

    if (mode === "pessimistic_write") {
      return " FOR UPDATE";
    }

    if (mode === "for_no_key_update") {
      return this.driver.type === "postgres" ? " FOR NO KEY UPDATE" : " FOR UPDATE";
    }

    return this.driver.type === "postgres" ? " FOR SHARE" : " LOCK IN SHARE MODE";
  }

  /** Paging entities through a to-many join needs the ids first, then the rows. */
  private needsTwoStepPagination(): boolean {
    const map = this.expressionMap;

    if (map.take === undefined && map.skip === undefined) {
      return false;
    }

    return map.joinAttributes.some((join) => join.isSelected && (join.relation?.isToMany || join.isMappingMany));
  }

  private async loadPaginatedIds(metadata: EntityMetadata): Promise<ObjectLiteralType[]> {
    const inner = this.clone();

    inner.expressionMap.take = undefined;
    inner.expressionMap.skip = undefined;
    inner.expressionMap.limit = undefined;
    inner.expressionMap.offset = undefined;
    inner.expressionMap.orderBys = {};

    const distinct = this.escape(DISTINCT_ALIAS);
    const selections = metadata.primaryColumns.map(
      (column) =>
        `${distinct}.${this.escape(rawColumnName(this.alias, column.databaseName))} AS ${this.escape(`ids_${rawColumnName(this.alias, column.databaseName)}`)}`,
    );
    const orderClauses: string[] = [];

    for (const [sort, { order, nulls }] of Object.entries(this.expressionMap.orderBys)) {
      const rawName = this.rawNameOfOrderBy(sort);

      if (!rawName) {
        throw new InvalidCriteriaError(
          `Cannot paginate with joins while ordering by "${sort}": order by a selected entity column or a selection alias.`,
          sort,
        );
      }

      const expression = `${distinct}.${this.escape(rawName)}`;

      selections.push(expression);
      orderClauses.push(`${expression} ${order}${nulls && this.driver.type === "postgres" ? ` ${nulls}` : ""}`);
    }

    for (const column of metadata.primaryColumns) {
      orderClauses.push(`${distinct}.${this.escape(rawColumnName(this.alias, column.databaseName))} ASC`);
    }

    const sql =
      `SELECT DISTINCT ${selections.join(", ")} FROM (${inner.getQuery()}) ${distinct}` +
      ` ORDER BY ${orderClauses.join(", ")} ${this.driver.buildLimitOffset(this.expressionMap.take, this.expressionMap.skip)}`;
    const [bound, parameters] = this.bindParameters(sql);
    const result = await this.runQuery(bound, parameters);

    return result.records.map((row) => {
      const idMap: ObjectLiteralType = {};

      for (const column of metadata.primaryColumns) {
        idMap[column.propertyName] = this.driver.hydrateValue(
          row[`ids_${rawColumnName(this.alias, column.databaseName)}`],
          column,
        );
      }

      return idMap;
    });
  }

  /** The raw result column an ORDER BY expression maps to, when it targets a selected column. */
  private rawNameOfOrderBy(sort: string): string | undefined {
    const dot = sort.indexOf(".");

    if (dot !== -1) {
      const alias = this.expressionMap.findAlias(sort.slice(0, dot));
      const column = alias?.metadata?.findColumnWithPropertyName(sort.slice(dot + 1));

      if (alias && column && this.selectedAliases.includes(alias)) {
        return rawColumnName(alias.name, column.databaseName);
      }

      return undefined;
    }

    return this.expressionMap.selects.find((select) => select.aliasName === sort)?.aliasName;
  }

  private getCountQuery(): string {
    const metadata = this.mainMetadata;
    const mainAlias = this.expressionMap.mainAlias;

    if (!mainAlias) {
      throw new InvalidCriteriaError("Cannot count without a FROM: call from() first.", undefined);
    }

    const countExpression = metadata
      ? this.driver.buildCountDistinct(
          metadata.primaryColumns.map((column) => `${this.escape(this.alias)}.${this.escape(column.databaseName)}`),
        )
      : "COUNT(*)";

    return (
      `${this.createCommentExpression()}SELECT ${countExpression} AS ${this.escape("cnt")} FROM ${this.getTableName(mainAlias)} ${this.escape(mainAlias.name)}` +
      this.createJoinExpression() +
      this.createWhereExpression()
    );
  }

  private getExistsQuery(): string {
    const mainAlias = this.expressionMap.mainAlias;

    if (!mainAlias) {
      throw new InvalidCriteriaError("Cannot check existence without a FROM: call from() first.", undefined);
    }

    return (
      `SELECT 1 AS ${this.escape("row_exists")} FROM ${this.getTableName(mainAlias)} ${this.escape(mainAlias.name)}` +
      this.createJoinExpression() +
      this.createWhereExpression() +
      ` ${this.driver.buildLimitOffset(1)}`
    );
  }
}

const normalizeOrder = (
  value: FindOptionsOrderValueType,
): { direction: OrderDirectionType; nulls?: NullsOrderType } => {
  if (typeof value === "object") {
    const direction = (value.direction ?? "ASC").toUpperCase() as OrderDirectionType;
    return value.nulls ? { direction, nulls: `NULLS ${value.nulls.toUpperCase()}` as NullsOrderType } : { direction };
  }

  if (value === -1 || String(value).toUpperCase() === "DESC") {
    return { direction: "DESC" };
  }

  return { direction: "ASC" };
};
