import type { EntityTargetType, ObjectLiteralType, QueryDeepPartialEntityType } from "../../types";
import type { ColumnMetadata, EntityMetadata } from "../EntityMetadata";
import { InsertValuesMissingError } from "../errors";
import { QueryBuilder } from "./QueryBuilder";
import { InsertResult } from "./results";

export type OrUpdateOptionsType = {
  skipUpdateIfNoValuesChanged?: boolean | undefined;
};

/** A column to write: an entity column, or a bare name for raw table inserts. */
type InsertColumnType = {
  databaseName: string;
  column?: ColumnMetadata | undefined;
  getValue: (valueSet: ObjectLiteralType) => unknown;
};

const entityColumn = (column: ColumnMetadata): InsertColumnType => ({
  databaseName: column.databaseName,
  column,
  getValue: (valueSet) => column.getEntityValue(valueSet),
});

const rawColumn = (name: string): InsertColumnType => ({
  databaseName: name,
  getValue: (valueSet) => valueSet[name],
});

/** Fills the values the ORM generates itself before a row is written: uuid ids, timestamps, versions. */
export const applyInsertGeneratedValues = (metadata: EntityMetadata, valueSet: ObjectLiteralType): void => {
  for (const column of metadata.columns) {
    if (column.isVirtual || column.getEntityValue(valueSet) !== undefined) {
      continue;
    }

    if (column.isGenerated && column.generationStrategy === "uuid") {
      column.setEntityValue(valueSet, crypto.randomUUID());
    } else if (column.isCreateDate || column.isUpdateDate) {
      column.setEntityValue(valueSet, new Date());
    } else if (column.isVersion) {
      column.setEntityValue(valueSet, 1);
    }
  }
};

/**
 * Builds and runs `INSERT` statements.
 *
 * @example
 * await dataSource
 *   .createQueryBuilder()
 *   .insert()
 *   .into(UserEntity)
 *   .values([{ name: "a" }, { name: "b" }])
 *   .orIgnore()
 *   .execute();
 */
export class InsertQueryBuilder<Entity extends ObjectLiteralType> extends QueryBuilder<Entity> {
  public into<T extends ObjectLiteralType>(
    target: EntityTargetType<T> | string,
    columns?: string[],
  ): InsertQueryBuilder<T> {
    const metadata = this.dataSource.hasMetadata(target) ? this.dataSource.getMetadata(target) : undefined;

    this.expressionMap.mainAlias = this.createAlias(metadata?.tableName ?? this.getTargetName(target), target);
    this.expressionMap.insertColumns = columns;

    return this as unknown as InsertQueryBuilder<T>;
  }

  public values(values: QueryDeepPartialEntityType<Entity> | QueryDeepPartialEntityType<Entity>[]): this {
    this.expressionMap.valuesSet = values as ObjectLiteralType | ObjectLiteralType[];

    return this;
  }

  /** Skip rows that would violate a unique constraint. */
  public orIgnore(): this {
    this.expressionMap.onIgnore = true;

    return this;
  }

  /**
   * Turn the insert into an upsert: on a conflict on `conflictTarget`, overwrite `overwrite`.
   * Both take property names (or column names) of the target entity.
   */
  public orUpdate(
    overwrite: string[],
    conflictTarget: string | string[] = [],
    options: OrUpdateOptionsType = {},
  ): this {
    const metadata = this.mainMetadata;
    const toDatabaseName = (name: string): string =>
      metadata?.findColumnWithPropertyName(name)?.databaseName ??
      metadata?.findJoinColumnsForRelation(name)[0]?.databaseName ??
      name;

    this.expressionMap.onUpdate = {
      conflictColumns: (Array.isArray(conflictTarget) ? conflictTarget : [conflictTarget]).map(toDatabaseName),
      overwriteColumns: overwrite.map(toDatabaseName),
      skipUpdateIfNoValuesChanged: options.skipUpdateIfNoValuesChanged,
    };

    return this;
  }

  /** Columns (or `*`) to return; PostgreSQL and SQLite only. */
  public returning(returning: string | string[]): this {
    this.expressionMap.returning = returning;

    return this;
  }

  /** Whether generated values are written back onto the given value objects (default true). */
  public updateEntity(enabled: boolean): this {
    this.expressionMap.updateEntity = enabled;

    return this;
  }

  public getQuery(): string {
    const mainAlias = this.expressionMap.mainAlias;

    if (!mainAlias) {
      throw new InsertValuesMissingError();
    }

    const valueSets = this.getValueSets();
    const columns = this.getInsertedColumns(valueSets);
    const table = this.getTableName(mainAlias);
    const keyword = this.driver.insertKeyword(this.expressionMap.onIgnore);
    let sql: string;

    if (columns.length === 0) {
      sql = this.driver.supportsDefaultValues
        ? `${keyword} ${table} DEFAULT VALUES`
        : `${keyword} ${table} () VALUES ${valueSets.map(() => "()").join(", ")}`;
    } else {
      const columnList = columns.map((column) => this.escape(column.databaseName)).join(", ");
      const rows = valueSets.map(
        (valueSet) => `(${columns.map((column) => this.createValueExpression(column, valueSet)).join(", ")})`,
      );

      sql = `${keyword} ${table} (${columnList}) VALUES ${rows.join(", ")}`;
    }

    if (this.expressionMap.onUpdate) {
      const { conflictColumns, overwriteColumns, skipUpdateIfNoValuesChanged } = this.expressionMap.onUpdate;

      sql += ` ${this.driver.upsertClause(
        table,
        conflictColumns.map((column) => this.escape(column)),
        overwriteColumns.map((column) => this.escape(column)),
        skipUpdateIfNoValuesChanged,
      )}`;
    } else if (this.expressionMap.onIgnore) {
      const clause = this.driver.ignoreConflictClause();

      if (clause) {
        sql += ` ${clause}`;
      }
    }

    const returning = this.createReturningExpression();

    return returning ? `${sql} RETURNING ${returning}` : sql;
  }

  public async execute(): Promise<InsertResult> {
    const valueSets = this.getValueSets();
    const metadata = this.mainMetadata;

    if (metadata && this.expressionMap.updateEntity) {
      for (const valueSet of valueSets) {
        applyInsertGeneratedValues(metadata, valueSet);
      }
    }

    const [sql, parameters] = this.getQueryAndParameters();
    const result = await this.runQuery(sql, parameters);
    const insertResult = new InsertResult();

    insertResult.raw = result.records;

    if (!metadata) {
      return insertResult;
    }

    if (this.driver.supportsReturning && this.expressionMap.returning === undefined) {
      result.records.forEach((row, index) => {
        const valueSet = valueSets[index];
        const generatedMap = this.hydrateRow(metadata, row);

        insertResult.generatedMaps.push(generatedMap);

        if (valueSet && this.expressionMap.updateEntity) {
          this.mergeGeneratedMap(metadata, valueSet, generatedMap);
        }
      });
    } else if (!this.driver.supportsReturning) {
      await this.reloadGeneratedValues(metadata, valueSets, result.lastInsertRowid, insertResult);
    }

    if (this.expressionMap.updateEntity) {
      insertResult.identifiers = valueSets.map((valueSet) => metadata.getEntityIdMap(valueSet) ?? {});
    }

    return insertResult;
  }

  private getValueSets(): ObjectLiteralType[] {
    const values = this.expressionMap.valuesSet;

    if (values === undefined) {
      throw new InsertValuesMissingError();
    }

    const list = Array.isArray(values) ? values : [values];

    if (list.length === 0) {
      throw new InsertValuesMissingError();
    }

    return list;
  }

  private getInsertedColumns(valueSets: ObjectLiteralType[]): InsertColumnType[] {
    const metadata = this.mainMetadata;

    if (!metadata) {
      return this.rawColumns(valueSets);
    }

    const requested = this.expressionMap.insertColumns;

    if (requested) {
      return requested.map((name) => {
        const column = metadata.findColumnWithPropertyName(name) ?? metadata.findColumnWithDatabaseName(name);

        return column ? entityColumn(column) : rawColumn(name);
      });
    }

    return metadata.columns
      .filter((column) => {
        if (!column.isInsert) {
          return false;
        }

        if (column.isGenerated && column.generationStrategy !== "uuid") {
          // Database-generated ids are only written when the caller supplied one.
          return valueSets.some((valueSet) => column.getEntityValue(valueSet) !== undefined);
        }

        return true;
      })
      .map(entityColumn);
  }

  /** Raw table inserts: every key used by any row becomes a column. */
  private rawColumns(valueSets: ObjectLiteralType[]): InsertColumnType[] {
    const names = new Set<string>();

    for (const valueSet of valueSets) {
      for (const key of Object.keys(valueSet)) {
        names.add(key);
      }
    }

    return [...names].map(rawColumn);
  }

  private createValueExpression(item: InsertColumnType, valueSet: ObjectLiteralType): string {
    const value = item.getValue(valueSet);

    if (typeof value === "function") {
      return String((value as () => string)());
    }

    if (value === undefined) {
      if (this.driver.supportsDefaultKeyword) {
        return "DEFAULT";
      }

      const fallback = item.column?.default;

      if (fallback !== undefined && typeof fallback !== "function") {
        return this.parameterFor(fallback, item.column);
      }

      return "NULL";
    }

    return this.parameterFor(value, item.column);
  }

  private parameterFor(value: unknown, column: ColumnMetadata | undefined): string {
    const typeColumn = column?.isVirtual ? column.referencedColumn : column;
    const prepared = this.driver.prepareParameter(value, typeColumn);

    return `${this.createParameter(prepared)}${this.driver.parameterCast(typeColumn)}`;
  }

  private createReturningExpression(): string | undefined {
    if (!this.driver.supportsReturning) {
      return undefined;
    }

    const metadata = this.mainMetadata;
    const requested = this.expressionMap.returning;

    if (requested !== undefined) {
      const list = Array.isArray(requested) ? requested : [requested];

      return list
        .map((item) => {
          if (item === "*") {
            return "*";
          }

          const column = metadata?.findColumnWithPropertyName(item);

          return column ? this.escape(column.databaseName) : this.replacePropertyNames(item);
        })
        .join(", ");
    }

    if (!metadata || !this.expressionMap.updateEntity) {
      return undefined;
    }

    const columns = this.returningColumns(metadata);

    return columns.length > 0 ? columns.map((column) => this.escape(column.databaseName)).join(", ") : undefined;
  }

  /** Columns whose value the database may have produced: ids, defaults, timestamps, versions. */
  private returningColumns(metadata: EntityMetadata): ColumnMetadata[] {
    return metadata.columns.filter(
      (column) =>
        !column.isVirtual &&
        (column.isPrimary ||
          column.isGenerated ||
          column.default !== undefined ||
          column.isCreateDate ||
          column.isUpdateDate ||
          column.isDeleteDate ||
          column.isVersion),
    );
  }

  private hydrateRow(metadata: EntityMetadata, row: ObjectLiteralType): ObjectLiteralType {
    const generatedMap: ObjectLiteralType = {};

    for (const column of metadata.columns) {
      if (!column.isVirtual && column.databaseName in row) {
        generatedMap[column.propertyName] = this.driver.hydrateValue(row[column.databaseName], column);
      }
    }

    return generatedMap;
  }

  private mergeGeneratedMap(
    metadata: EntityMetadata,
    valueSet: ObjectLiteralType,
    generatedMap: ObjectLiteralType,
  ): void {
    for (const [propertyName, value] of Object.entries(generatedMap)) {
      const column = metadata.findColumnWithPropertyName(propertyName);

      if (column) {
        column.setEntityValue(valueSet, value);
      }
    }
  }

  /** Without `RETURNING`, ids come from the auto-increment counter and defaults from a follow-up select. */
  private async reloadGeneratedValues(
    metadata: EntityMetadata,
    valueSets: ObjectLiteralType[],
    lastInsertRowid: number | bigint | null,
    insertResult: InsertResult,
  ): Promise<void> {
    const increment = metadata.primaryColumns.find(
      (column) => column.isGenerated && column.generationStrategy !== "uuid",
    );

    if (increment && lastInsertRowid !== null && this.expressionMap.updateEntity) {
      const missing = valueSets.filter((valueSet) => increment.getEntityValue(valueSet) === undefined);
      // MySQL reports the first id of a multi-row insert, SQLite the last one.
      let next = Number(lastInsertRowid) - (this.driver.type === "sqlite" ? missing.length - 1 : 0);

      for (const valueSet of missing) {
        increment.setEntityValue(valueSet, next);
        next += 1;
      }
    }

    if (!this.expressionMap.updateEntity) {
      return;
    }

    const reloadColumns = this.returningColumns(metadata).filter((column) => !column.isPrimary);
    const ids = valueSets.map((valueSet) => metadata.getEntityIdMap(valueSet)).filter((id) => id !== undefined);

    if (reloadColumns.length === 0 || ids.length !== valueSets.length) {
      insertResult.generatedMaps = valueSets.map(() => ({}));

      return;
    }

    const rows = await this.dataSource
      .createQueryBuilder(metadata.target, metadata.tableName, this.queryRunner)
      .whereInIds(ids as ObjectLiteralType[])
      .getMany();
    const rowsByKey = new Map<string, ObjectLiteralType>();

    for (const row of rows) {
      const idMap = metadata.getEntityIdMap(row);

      if (idMap) {
        rowsByKey.set(metadata.getIdKey(idMap), row);
      }
    }

    insertResult.generatedMaps = valueSets.map((valueSet) => {
      const idMap = metadata.getEntityIdMap(valueSet);
      const row = idMap ? rowsByKey.get(metadata.getIdKey(idMap)) : undefined;
      const generatedMap: ObjectLiteralType = {};

      if (row) {
        for (const column of reloadColumns) {
          generatedMap[column.propertyName] = row[column.propertyName];
          column.setEntityValue(valueSet, row[column.propertyName]);
        }
      }

      return generatedMap;
    });
  }
}
