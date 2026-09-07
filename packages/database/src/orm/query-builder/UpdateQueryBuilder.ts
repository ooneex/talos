import type { ObjectLiteralType, QueryDeepPartialEntityType } from "../../types";
import type { ColumnMetadata, EntityMetadata } from "../EntityMetadata";
import { EntityPropertyNotFoundError, UpdateValuesMissingError } from "../errors";
import { QueryBuilder } from "./QueryBuilder";
import { UpdateResult } from "./results";

/**
 * Builds and runs `UPDATE` statements.
 *
 * @example
 * await dataSource
 *   .createQueryBuilder()
 *   .update(UserEntity)
 *   .set({ isActive: false, loginCount: () => "login_count + 1" })
 *   .where("id = :id", { id })
 *   .execute();
 */
export class UpdateQueryBuilder<Entity extends ObjectLiteralType> extends QueryBuilder<Entity> {
  protected whereEntities: ObjectLiteralType[] = [];
  /** Values the builder chose itself (update timestamp), kept so they can be synced onto entities. */
  protected autoValues: ObjectLiteralType = {};

  public set(values: QueryDeepPartialEntityType<Entity>): this {
    this.expressionMap.valuesSet = values as ObjectLiteralType;

    return this;
  }

  /** Columns (or `*`) to return; PostgreSQL and SQLite only. */
  public returning(returning: string | string[]): this {
    this.expressionMap.returning = returning;

    return this;
  }

  /** Whether generated values are written back onto the entities given to `whereEntity()` (default true). */
  public updateEntity(enabled: boolean): this {
    this.expressionMap.updateEntity = enabled;

    return this;
  }

  /** Targets the rows of the given entities by primary key and syncs generated values back onto them. */
  public whereEntity(entity: Entity | Entity[]): this {
    const metadata = this.requireMetadata();
    const entities = Array.isArray(entity) ? entity : [entity];

    this.whereEntities = entities;

    return this.whereInIds(entities.map((item) => metadata.getEntityIdMap(item) ?? {}));
  }

  public getQuery(): string {
    const mainAlias = this.expressionMap.mainAlias;

    if (!mainAlias) {
      throw new UpdateValuesMissingError();
    }

    const assignments = this.createAssignments();

    if (assignments.length === 0) {
      throw new UpdateValuesMissingError();
    }

    const sql = `UPDATE ${this.createTargetExpression()} SET ${assignments.join(", ")}${this.createWhereExpression()}`;
    const returning = this.createReturningExpression();

    return returning ? `${sql} RETURNING ${returning}` : sql;
  }

  public async execute(): Promise<UpdateResult> {
    const metadata = this.mainMetadata;
    const [sql, parameters] = this.getQueryAndParameters();
    const result = await this.runQuery(sql, parameters);
    const updateResult = new UpdateResult();

    updateResult.raw = result.records;
    updateResult.affected = result.affected;

    if (!metadata) {
      return updateResult;
    }

    if (this.driver.supportsReturning && this.expressionMap.returning === undefined) {
      updateResult.generatedMaps = result.records.map((row) => this.hydrateRow(metadata, row));
    }

    if (this.expressionMap.updateEntity) {
      this.syncEntities(metadata, updateResult.generatedMaps);
    }

    return updateResult;
  }

  /** Auto-managed values a plain `set()` does not mention: the update timestamp and the version bump. */
  protected createAutoAssignments(metadata: EntityMetadata, values: ObjectLiteralType): string[] {
    const assignments: string[] = [];
    const { updateDateColumn, versionColumn } = metadata;

    if (updateDateColumn && values[updateDateColumn.propertyName] === undefined) {
      const now = (this.autoValues[updateDateColumn.propertyName] as Date | undefined) ?? new Date();

      this.autoValues[updateDateColumn.propertyName] = now;
      assignments.push(`${this.escape(updateDateColumn.databaseName)} = ${this.parameterFor(now, updateDateColumn)}`);
    }

    if (versionColumn && values[versionColumn.propertyName] === undefined) {
      const column = this.escape(versionColumn.databaseName);

      assignments.push(`${column} = ${column} + 1`);
    }

    return assignments;
  }

  protected requireMetadata(): EntityMetadata {
    const metadata = this.mainMetadata;

    if (!metadata) {
      throw new UpdateValuesMissingError();
    }

    return metadata;
  }

  protected parameterFor(value: unknown, column: ColumnMetadata | undefined): string {
    const typeColumn = column?.isVirtual ? column.referencedColumn : column;

    return `${this.createParameter(this.driver.prepareParameter(value, typeColumn))}${this.driver.parameterCast(typeColumn)}`;
  }

  private createTargetExpression(): string {
    const mainAlias = this.expressionMap.mainAlias;

    if (!mainAlias) {
      throw new UpdateValuesMissingError();
    }

    const table = this.getTableName(mainAlias);
    const tableName = mainAlias.metadata?.tableName ?? mainAlias.tableName ?? mainAlias.name;

    if (mainAlias.name === tableName) {
      return table;
    }

    return this.driver.type === "mysql" || this.driver.type === "mariadb"
      ? `${table} ${this.escape(mainAlias.name)}`
      : `${table} AS ${this.escape(mainAlias.name)}`;
  }

  private createAssignments(): string[] {
    const values = this.expressionMap.valuesSet as ObjectLiteralType | undefined;

    if (!values || Array.isArray(values)) {
      throw new UpdateValuesMissingError();
    }

    const metadata = this.mainMetadata;
    const assignments: string[] = [];

    if (!metadata) {
      for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) {
          assignments.push(`${this.escape(key)} = ${this.valueExpression(value, undefined)}`);
        }
      }

      return assignments;
    }

    for (const [propertyName, value] of Object.entries(values)) {
      if (value === undefined) {
        continue;
      }

      const column = metadata.findColumnWithPropertyName(propertyName);

      if (column) {
        assignments.push(`${this.escape(column.databaseName)} = ${this.valueExpression(value, column)}`);
        continue;
      }

      const relation = metadata.findRelationWithPropertyPath(propertyName);

      if (relation?.isWithJoinColumn) {
        for (const joinColumn of relation.joinColumns) {
          const related = value === null || typeof value !== "object" ? value : (value as ObjectLiteralType);
          const referenced = joinColumn.referencedColumn as ColumnMetadata;
          const fkValue =
            related === null
              ? null
              : typeof related === "object"
                ? referenced.getEntityValue(related as ObjectLiteralType)
                : related;

          assignments.push(`${this.escape(joinColumn.databaseName)} = ${this.valueExpression(fkValue, referenced)}`);
        }

        continue;
      }

      throw new EntityPropertyNotFoundError(propertyName, metadata.name);
    }

    if (this.expressionMap.queryType === "update") {
      assignments.push(...this.createAutoAssignments(metadata, values));
    }

    return assignments;
  }

  private valueExpression(value: unknown, column: ColumnMetadata | undefined): string {
    if (typeof value === "function") {
      return String((value as () => string)());
    }

    return this.parameterFor(value, column);
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

    if (!metadata || !this.expressionMap.updateEntity || this.whereEntities.length === 0) {
      return undefined;
    }

    const columns = [...metadata.primaryColumns, ...this.generatedColumns(metadata)];

    return columns.map((column) => this.escape(column.databaseName)).join(", ");
  }

  private generatedColumns(metadata: EntityMetadata): ColumnMetadata[] {
    return metadata.columns.filter(
      (column) => !column.isPrimary && (column.isUpdateDate || column.isDeleteDate || column.isVersion),
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

  /** Writes the values the update produced back onto the entities passed to `whereEntity()`. */
  private syncEntities(metadata: EntityMetadata, generatedMaps: ObjectLiteralType[]): void {
    const values = { ...(this.expressionMap.valuesSet as ObjectLiteralType | undefined), ...this.autoValues };
    const generatedByKey = new Map<string, ObjectLiteralType>();
    const generatedColumns = this.generatedColumns(metadata);

    for (const map of generatedMaps) {
      if (metadata.hasId(map)) {
        generatedByKey.set(metadata.getIdKey(map), map);
      }
    }

    for (const entity of this.whereEntities) {
      const idMap = metadata.getEntityIdMap(entity);
      const generated = idMap ? generatedByKey.get(metadata.getIdKey(idMap)) : undefined;

      for (const column of generatedColumns) {
        if (generated && column.propertyName in generated) {
          column.setEntityValue(entity, generated[column.propertyName]);
        } else if (values[column.propertyName] !== undefined && typeof values[column.propertyName] !== "function") {
          column.setEntityValue(entity, values[column.propertyName]);
        } else if (column.isVersion && !generated) {
          const current = column.getEntityValue(entity);

          column.setEntityValue(entity, typeof current === "number" ? current + 1 : current);
        }
      }
    }
  }
}
