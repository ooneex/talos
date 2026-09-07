import type { ClassType, EntityIdType, EntityTargetType, ObjectLiteralType } from "../../types";
import { Brackets, type IWhereExpressionBuilder, NotBrackets, type WhereConditionInputType } from "../Brackets";
import type { DataSource } from "../DataSource";
import type { IDriver } from "../driver/AbstractDriver";
import type { EntityMetadata } from "../EntityMetadata";
import { ParameterNotSetError } from "../errors";
import type { QueryRunner } from "../QueryRunner";
import { type AliasType, QueryExpressionMap, type WherePartType } from "./QueryExpressionMap";
import { WhereBuilder, type WhereParametersType } from "./WhereBuilder";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Named parameters: `:name`, or `:...name` to spread an array into a placeholder list. Skips `::casts`. */
const PARAMETER_PATTERN = /(?<![:\w])(:)(\.\.\.)?([A-Za-z_][A-Za-z0-9_]*)/g;

type PropertyReplacerType = {
  pattern: RegExp | undefined;
  replacements: Record<string, string>;
  columnCount: number;
  relationCount: number;
};

/** Compiled `alias.property` rewrites per entity metadata; metadata lives as long as its data source. */
const propertyReplacers = new WeakMap<EntityMetadata, Map<string, PropertyReplacerType>>();

/** Splits `items` so that no slice binds more than `maxBoundParameters` values at `valuesPerItem` each. */
export const chunkByParameters = <T>(items: readonly T[], valuesPerItem: number, maxBoundParameters: number): T[][] => {
  const size = Math.max(1, Math.floor(maxBoundParameters / Math.max(1, valuesPerItem)));

  if (items.length <= size) {
    return [items as T[]];
  }

  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

/**
 * Behaviour every builder shares: aliases, where clauses, named parameters, and the translation of
 * `alias.property` references into escaped column names.
 */
export abstract class QueryBuilder<Entity extends ObjectLiteralType> implements IWhereExpressionBuilder {
  public readonly expressionMap: QueryExpressionMap;

  public constructor(
    public readonly dataSource: DataSource,
    protected queryRunner?: QueryRunner,
    expressionMap?: QueryExpressionMap,
  ) {
    this.expressionMap = expressionMap ?? new QueryExpressionMap();
  }

  public abstract getQuery(): string;

  /** The main alias name; the table name when the builder was not given one. */
  public get alias(): string {
    return this.expressionMap.mainAlias?.name ?? "";
  }

  protected get driver(): IDriver {
    return this.dataSource.driver;
  }

  /** The generated SQL with named parameters still in place. */
  public getSql(): string {
    return this.getQuery();
  }

  /** The SQL with driver placeholders and the matching positional parameter list. */
  public getQueryAndParameters(): [string, unknown[]] {
    return this.bindParameters(this.getQuery());
  }

  public setParameter(key: string, value: unknown): this {
    this.expressionMap.parameters[key] = value;

    return this;
  }

  public setParameters(parameters: ObjectLiteralType): this {
    for (const [key, value] of Object.entries(parameters)) {
      this.setParameter(key, value);
    }

    return this;
  }

  public getParameters(): ObjectLiteralType {
    return { ...this.expressionMap.parameters };
  }

  public where(condition: WhereConditionInputType<Entity, this>, parameters?: ObjectLiteralType): this {
    this.expressionMap.wheres = [];

    return this.addWhere("simple", condition, parameters);
  }

  public andWhere(condition: WhereConditionInputType<Entity, this>, parameters?: ObjectLiteralType): this {
    return this.addWhere("and", condition, parameters);
  }

  public orWhere(condition: WhereConditionInputType<Entity, this>, parameters?: ObjectLiteralType): this {
    return this.addWhere("or", condition, parameters);
  }

  /** `WHERE` on the primary key(s): a single id, a composite id map, or a list of either. */
  public whereInIds(ids: EntityIdType | EntityIdType[]): this {
    return this.where(this.getWhereInIdsCondition(ids));
  }

  public andWhereInIds(ids: EntityIdType | EntityIdType[]): this {
    return this.andWhere(this.getWhereInIdsCondition(ids));
  }

  public orWhereInIds(ids: EntityIdType | EntityIdType[]): this {
    return this.orWhere(this.getWhereInIdsCondition(ids));
  }

  public comment(comment: string): this {
    this.expressionMap.comment = comment;

    return this;
  }

  /** Reuses the given runner (and its transaction) for every query this builder executes. */
  public setQueryRunner(queryRunner: QueryRunner): this {
    this.queryRunner = queryRunner;

    return this;
  }

  public escape(name: string): string {
    return this.driver.escape(name);
  }

  /** Whether the builder's main target is an entity with metadata rather than a raw table. */
  public hasMetadata(): boolean {
    return this.expressionMap.mainAlias?.metadata !== undefined;
  }

  protected get mainMetadata(): EntityMetadata | undefined {
    return this.expressionMap.mainAlias?.metadata;
  }

  /** A runner to execute with: the one given, or a fresh one released after the query. */
  protected obtainQueryRunner(): { runner: QueryRunner; owned: boolean } {
    if (this.queryRunner) {
      return { runner: this.queryRunner, owned: false };
    }

    return { runner: this.dataSource.createQueryRunner(), owned: true };
  }

  protected async runQuery<Row = ObjectLiteralType>(sql: string, parameters: unknown[]) {
    const { runner, owned } = this.obtainQueryRunner();

    try {
      return await runner.query<Row>(sql, parameters);
    } finally {
      if (owned) {
        await runner.release();
      }
    }
  }

  protected createAlias(name: string, target?: EntityTargetType | string): AliasType {
    if (target === undefined) {
      return this.expressionMap.createAlias({ name });
    }

    if (this.dataSource.hasMetadata(target)) {
      return this.expressionMap.createAlias({ name, metadata: this.dataSource.getMetadata(target) });
    }

    return this.expressionMap.createAlias({ name, tableName: typeof target === "string" ? target : target.name });
  }

  /** Registers an internal parameter and returns its `:name` reference. */
  protected createParameter(value: unknown): string {
    const name = `orm_param_${this.expressionMap.parameterCounter}`;

    this.expressionMap.parameterCounter += 1;
    this.expressionMap.parameters[name] = value;

    return `:${name}`;
  }

  protected getTableName(alias: AliasType): string {
    if (alias.subQuery) {
      return alias.subQuery;
    }

    if (alias.metadata) {
      return this.driver.escapePath(alias.metadata.tableName, alias.metadata.schema);
    }

    return this.driver.escapePath(alias.tableName ?? alias.name);
  }

  /**
   * Rewrites `alias.property` into `"alias"."column"` for every alias that has metadata, so that
   * conditions and selections can be written in terms of entity properties.
   */
  protected replacePropertyNames(statement: string): string {
    let result = statement;

    for (const alias of this.expressionMap.aliases) {
      const metadata = alias.metadata;

      if (!metadata) {
        continue;
      }

      // A statement without the alias cannot contain a reference to rewrite.
      if (!result.includes(alias.name)) {
        continue;
      }

      const { pattern, replacements } = this.propertyReplacer(alias, metadata);

      if (pattern) {
        result = result.replace(pattern, (_match, path: string) => replacements[path] ?? _match);
      }
    }

    return result;
  }

  /** The compiled rewrite for one alias, computed once per metadata, alias name and dialect. */
  private propertyReplacer(alias: AliasType, metadata: EntityMetadata): PropertyReplacerType {
    let byAlias = propertyReplacers.get(metadata);

    if (!byAlias) {
      byAlias = new Map();
      propertyReplacers.set(metadata, byAlias);
    }

    const cacheKey = `${this.driver.type}:${alias.name}`;
    const cached = byAlias.get(cacheKey);

    if (
      cached &&
      cached.columnCount === metadata.columns.length &&
      cached.relationCount === metadata.relations.length
    ) {
      return cached;
    }

    const replacements = this.propertyReplacements(alias);
    const paths = Object.keys(replacements).sort((left, right) => right.length - left.length);
    const replacer: PropertyReplacerType = {
      pattern:
        paths.length === 0
          ? undefined
          : new RegExp(
              `(?<![\\w."'\`:])${escapeRegExp(alias.name)}\\.(${paths.map(escapeRegExp).join("|")})(?![\\w.])`,
              "g",
            ),
      replacements,
      columnCount: metadata.columns.length,
      relationCount: metadata.relations.length,
    };

    byAlias.set(cacheKey, replacer);

    return replacer;
  }

  protected createWhereExpression(): string {
    const conditions = this.expressionMap.wheres
      .map((where, index) => {
        if (index === 0) {
          return where.condition;
        }

        return `${where.type === "or" ? "OR" : "AND"} ${where.condition}`;
      })
      .join(" ");

    const metadata = this.mainMetadata;
    const softDeleteCondition =
      metadata?.deleteDateColumn && !this.expressionMap.withDeleted && this.expressionMap.queryType === "select"
        ? `${this.escape(this.alias)}.${this.escape(metadata.deleteDateColumn.databaseName)} IS NULL`
        : undefined;

    if (conditions.length === 0) {
      return softDeleteCondition ? ` WHERE ${softDeleteCondition}` : "";
    }

    return softDeleteCondition ? ` WHERE ${softDeleteCondition} AND (${conditions})` : ` WHERE ${conditions}`;
  }

  /** Turns a where input into SQL, registering the parameters it needs. */
  protected computeWhereCondition(
    condition: WhereConditionInputType<Entity, this>,
    parameters?: ObjectLiteralType,
  ): string {
    if (parameters) {
      this.setParameters(parameters);
    }

    if (typeof condition === "string") {
      return this.replacePropertyNames(condition);
    }

    if (typeof condition === "function") {
      return this.replacePropertyNames(condition(this));
    }

    if (condition instanceof Brackets) {
      const previous = this.expressionMap.wheres;

      this.expressionMap.wheres = [];
      condition.whereFactory(this);

      const nested = this.expressionMap.wheres
        .map((where, index) =>
          index === 0 ? where.condition : `${where.type === "or" ? "OR" : "AND"} ${where.condition}`,
        )
        .join(" ");

      this.expressionMap.wheres = previous;

      if (nested.length === 0) {
        return "";
      }

      return condition instanceof NotBrackets ? `NOT (${nested})` : `(${nested})`;
    }

    const metadata = this.mainMetadata;
    const where = condition as ObjectLiteralType | ObjectLiteralType[];

    if (!metadata) {
      return this.computeRawObjectWhere(where);
    }

    return this.createWhereBuilder().build(where, metadata, this.alias);
  }

  /** How a relation reached in a where object is joined; builders without joins refuse. */
  protected createWhereBuilder(): WhereBuilder {
    return new WhereBuilder(this.driver, this.whereParameters());
  }

  protected whereParameters(): WhereParametersType {
    return {
      create: (value) => this.createParameter(value),
      set: (name, value) => {
        this.setParameter(name, value);
      },
    };
  }

  protected getWhereInIdsCondition(ids: EntityIdType | EntityIdType[]): string {
    const metadata = this.mainMetadata;
    const list = Array.isArray(ids) ? ids : [ids];

    if (!metadata) {
      return this.computeRawObjectWhere({ id: list.length === 1 ? list[0] : list } as ObjectLiteralType);
    }

    const idMaps = list.map((id) => metadata.ensureEntityIdMap(id));
    const whereBuilder = this.createWhereBuilder();

    if (!metadata.hasMultiplePrimaryKeys) {
      const [column] = metadata.primaryColumns;

      if (!column) {
        return "0=1";
      }

      const values = idMaps.map((map) => map[column.propertyName]);

      return whereBuilder.build(
        { [column.propertyName]: values.length === 1 ? values[0] : values },
        metadata,
        this.alias,
      );
    }

    return whereBuilder.build(idMaps, metadata, this.alias);
  }

  protected bindParameters(sql: string): [string, unknown[]] {
    const values: unknown[] = [];
    const bound = sql.replace(PARAMETER_PATTERN, (match, _colon: string, spread: string | undefined, name: string) => {
      if (!(name in this.expressionMap.parameters)) {
        throw new ParameterNotSetError(name, match);
      }

      const value = this.expressionMap.parameters[name];

      if (spread) {
        const items = Array.isArray(value) ? value : [value];

        if (items.length === 0) {
          return "NULL";
        }

        let list = "";

        for (const item of items) {
          values.push(this.driver.prepareParameter(item));
          list += `${list ? ", " : ""}${this.driver.createParameter(values.length - 1)}`;
        }

        return list;
      }

      values.push(this.driver.prepareParameter(value));

      return this.driver.createParameter(values.length - 1);
    });

    return [bound, values];
  }

  protected getTargetName(target: EntityTargetType | ClassType): string {
    return typeof target === "string" ? target : target.name;
  }

  private addWhere(
    type: WherePartType["type"],
    condition: WhereConditionInputType<Entity, this>,
    parameters?: ObjectLiteralType,
  ): this {
    const sql = this.computeWhereCondition(condition, parameters);

    if (sql.length > 0) {
      this.expressionMap.wheres.push({ type, condition: sql });
    }

    return this;
  }

  /** A where object on a raw table: keys are column names. */
  private computeRawObjectWhere(condition: ObjectLiteralType | ObjectLiteralType[]): string {
    const groups = (Array.isArray(condition) ? condition : [condition]).map((group) =>
      Object.entries(group)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => {
          const column = `${this.escape(this.alias)}.${this.escape(key)}`;

          if (value === null) {
            return `${column} IS NULL`;
          }

          if (Array.isArray(value)) {
            return value.length === 0
              ? "0=1"
              : `${column} IN (${value.map((item) => this.createParameter(item)).join(", ")})`;
          }

          return `${column} = ${this.createParameter(value)}`;
        })
        .join(" AND "),
    );

    const parts = groups.filter((group) => group.length > 0);

    return parts.length > 1 ? parts.map((part) => `(${part})`).join(" OR ") : (parts[0] ?? "");
  }

  private propertyReplacements(alias: AliasType): Record<string, string> {
    const metadata = alias.metadata as EntityMetadata;
    const escapedAlias = this.escape(alias.name);
    const replacements: Record<string, string> = {};

    for (const column of metadata.ownColumns) {
      replacements[column.propertyName] = `${escapedAlias}.${this.escape(column.databaseName)}`;
    }

    for (const relation of metadata.ownerRelations) {
      const [joinColumn] = relation.joinColumns;

      if (relation.joinColumns.length === 1 && joinColumn) {
        replacements[relation.propertyName] ??= `${escapedAlias}.${this.escape(joinColumn.databaseName)}`;
      }

      for (const column of relation.joinColumns) {
        if (column.referencedColumn) {
          replacements[`${relation.propertyName}.${column.referencedColumn.propertyName}`] =
            `${escapedAlias}.${this.escape(column.databaseName)}`;
        }
      }
    }

    return replacements;
  }
}
