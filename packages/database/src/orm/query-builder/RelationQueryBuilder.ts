import type { EntityIdType, ObjectLiteralType } from "../../types";
import type { ColumnMetadata, EntityMetadata, JunctionMetadataType, RelationMetadata } from "../EntityMetadata";
import { InvalidCriteriaError, RelationNotFoundError } from "../errors";
import { chunkByParameters, QueryBuilder } from "./QueryBuilder";

type RelationValueType = ObjectLiteralType | EntityIdType;
/** One junction row: the owner (the entity in `of()`) and the related entity, as ids or entities. */
export type RelationPairType = readonly [RelationValueType, RelationValueType];

/**
 * Manipulates one relation without loading or saving whole entities.
 *
 * @example
 * await dataSource.createQueryBuilder().relation(PostEntity, "categories").of(post).add(category);
 * await dataSource.createQueryBuilder().relation(PostEntity, "author").of(postId).set(authorId);
 * const categories = await dataSource.createQueryBuilder().relation(PostEntity, "categories").of(post).loadMany();
 */
export class RelationQueryBuilder<Entity extends ObjectLiteralType> extends QueryBuilder<Entity> {
  /** The entity (or entities, or ids) whose relation is manipulated. */
  public of(entity: RelationValueType | RelationValueType[]): this {
    this.expressionMap.of = entity;

    return this;
  }

  /** Points a to-one relation at `value` (`null` clears it). */
  public async set(value: RelationValueType | null): Promise<void> {
    const relation = this.relation;

    if (!relation.isToOne) {
      throw new InvalidCriteriaError(
        `Relation "${relation.propertyName}" holds many entities; use add() and remove() instead of set().`,
        value,
      );
    }

    const ofIds = this.idMaps(this.metadata, this.expressionMap.of);

    if (relation.isWithJoinColumn) {
      const fkValues = value === null ? null : this.idMaps(relation.inverseEntityMetadata, value)[0];

      await this.updateForeignKey(this.metadata, relation, fkValues ?? null, ofIds);

      return;
    }

    const inverse = relation.inverseRelation;

    if (!inverse) {
      throw new RelationNotFoundError(relation.propertyName, this.metadata.name);
    }

    if (value === null) {
      await this.clearForeignKey(relation.inverseEntityMetadata, inverse, ofIds);

      return;
    }

    const [ofId] = ofIds;

    if (!ofId || ofIds.length > 1) {
      throw new InvalidCriteriaError("set() on a non-owning one-to-one needs exactly one owner entity in of().", value);
    }

    await this.updateForeignKey(
      relation.inverseEntityMetadata,
      inverse,
      ofId,
      this.idMaps(relation.inverseEntityMetadata, value),
    );
  }

  /** Attaches entities to a to-many relation. */
  public async add(value: RelationValueType | RelationValueType[]): Promise<void> {
    const relation = this.relation;
    const ofIds = this.idMaps(this.metadata, this.expressionMap.of);
    const valueIds = this.idMaps(relation.inverseEntityMetadata, value);

    if (valueIds.length === 0 || ofIds.length === 0) {
      return;
    }

    if (relation.isOneToMany) {
      const inverse = this.requireInverse(relation);
      const [ofId] = ofIds;

      if (!ofId || ofIds.length > 1) {
        throw new InvalidCriteriaError("add() on a one-to-many needs exactly one owner entity in of().", value);
      }

      await this.updateForeignKey(relation.inverseEntityMetadata, inverse, ofId, valueIds);

      return;
    }

    const junction = this.requireJunction(relation, value);
    const pairs: [ObjectLiteralType, ObjectLiteralType][] = [];

    for (const ofId of ofIds) {
      for (const valueId of valueIds) {
        pairs.push([ofId, valueId]);
      }
    }

    await this.insertJunctionRows(junction, pairs);
  }

  /**
   * Links explicit owner → related pairs of a many-to-many in as few statements as possible, where
   * `add()` links every entity in `of()` with every value.
   */
  public async addPairs(pairs: readonly RelationPairType[]): Promise<void> {
    const relation = this.relation;
    const junction = this.requireJunction(relation, pairs);

    await this.insertJunctionRows(junction, this.idPairs(relation, pairs));
  }

  /** Unlinks explicit owner → related pairs of a many-to-many. */
  public async removePairs(pairs: readonly RelationPairType[]): Promise<void> {
    const relation = this.relation;
    const { tableName, schema, joinColumns, inverseJoinColumns } = this.requireJunction(relation, pairs, "set(null)");
    const table = this.driver.escapePath(tableName, schema);
    const idPairs = this.idPairs(relation, pairs);

    for (const chunk of chunkByParameters(
      idPairs,
      joinColumns.length + inverseJoinColumns.length,
      this.driver.maxBoundParameters,
    )) {
      const groups = chunk.map(
        ([ofId, valueId]) =>
          `(${this.idListCondition(joinColumns, [ofId])} AND ${this.idListCondition(inverseJoinColumns, [valueId])})`,
      );

      await this.runBound(`DELETE FROM ${table} WHERE ${groups.join(" OR ")}`);
    }
  }

  /** Detaches entities from a to-many relation. */
  public async remove(value: RelationValueType | RelationValueType[]): Promise<void> {
    const relation = this.relation;
    const ofIds = this.idMaps(this.metadata, this.expressionMap.of);
    const valueIds = this.idMaps(relation.inverseEntityMetadata, value);

    if (valueIds.length === 0 || ofIds.length === 0) {
      return;
    }

    if (relation.isOneToMany) {
      const inverse = this.requireInverse(relation);

      await this.clearForeignKey(relation.inverseEntityMetadata, inverse, ofIds, valueIds);

      return;
    }

    const { tableName, schema, joinColumns, inverseJoinColumns } = this.requireJunction(relation, value, "set(null)");
    const ofCondition = this.idListCondition(joinColumns, ofIds);
    const valueCondition = this.idListCondition(inverseJoinColumns, valueIds);

    await this.runBound(
      `DELETE FROM ${this.driver.escapePath(tableName, schema)} WHERE ${ofCondition} AND ${valueCondition}`,
    );
  }

  public async addAndRemove(
    added: RelationValueType | RelationValueType[],
    removed: RelationValueType | RelationValueType[],
  ): Promise<void> {
    await this.remove(removed);
    await this.add(added);
  }

  /** Loads the related entity of a to-one relation for the single entity in `of()`. */
  public async loadOne<T = ObjectLiteralType>(): Promise<T | undefined> {
    const [related] = await this.loadRelated();

    return related as T | undefined;
  }

  /** Loads the related entities of a to-many relation for the entities in `of()`. */
  public async loadMany<T = ObjectLiteralType>(): Promise<T[]> {
    return (await this.loadRelated()) as T[];
  }

  public getQuery(): string {
    throw new InvalidCriteriaError(
      "A relation query builder runs its operations directly; it has no single query.",
      undefined,
    );
  }

  private get metadata(): EntityMetadata {
    const metadata = this.mainMetadata;

    if (!metadata) {
      throw new InvalidCriteriaError("relation() needs an entity target.", this.expressionMap.relationPropertyPath);
    }

    return metadata;
  }

  private get relation(): RelationMetadata {
    const path = this.expressionMap.relationPropertyPath ?? "";
    const relation = this.metadata.findRelationWithPropertyPath(path);

    if (!relation) {
      throw new RelationNotFoundError(path, this.metadata.name);
    }

    return relation;
  }

  private requireInverse(relation: RelationMetadata): RelationMetadata {
    const inverse = relation.inverseRelation;

    if (!inverse) {
      throw new RelationNotFoundError(relation.propertyName, this.metadata.name);
    }

    return inverse;
  }

  private requireJunction(relation: RelationMetadata, value: unknown, alternative = "set()"): JunctionMetadataType {
    if (!relation.isManyToMany || !relation.junction) {
      throw new InvalidCriteriaError(
        `Relation "${relation.propertyName}" holds one entity; use ${alternative}.`,
        value,
      );
    }

    return relation.junction;
  }

  private idPairs(
    relation: RelationMetadata,
    pairs: readonly RelationPairType[],
  ): [ObjectLiteralType, ObjectLiteralType][] {
    const result: [ObjectLiteralType, ObjectLiteralType][] = [];

    for (const [owner, related] of pairs) {
      const [ownerId] = this.idMaps(this.metadata, owner);
      const [relatedId] = this.idMaps(relation.inverseEntityMetadata, related);

      if (ownerId && relatedId) {
        result.push([ownerId, relatedId]);
      }
    }

    return result;
  }

  private async insertJunctionRows(
    junction: JunctionMetadataType,
    pairs: readonly (readonly [ObjectLiteralType, ObjectLiteralType])[],
  ): Promise<void> {
    if (pairs.length === 0) {
      return;
    }

    const { tableName, schema, joinColumns, inverseJoinColumns } = junction;
    const table = this.driver.escapePath(tableName, schema);
    const columns = [...joinColumns, ...inverseJoinColumns]
      .map((column) => this.escape(column.databaseName))
      .join(", ");
    const ignore = this.driver.ignoreConflictClause();
    const tail = ignore ? ` ${ignore}` : "";
    const keyword = this.driver.insertKeyword(true);

    for (const chunk of chunkByParameters(
      pairs,
      joinColumns.length + inverseJoinColumns.length,
      this.driver.maxBoundParameters,
    )) {
      const rows = chunk.map(([ofId, valueId]) => {
        const values = [
          ...joinColumns.map((column) =>
            this.parameterFor(ofId[column.referencedColumn.propertyName], column.referencedColumn),
          ),
          ...inverseJoinColumns.map((column) =>
            this.parameterFor(valueId[column.referencedColumn.propertyName], column.referencedColumn),
          ),
        ];

        return `(${values.join(", ")})`;
      });

      await this.runBound(`${keyword} ${table} (${columns}) VALUES ${rows.join(", ")}${tail}`);
    }
  }

  /** Binds the named parameters registered so far and runs the statement. */
  private async runBound(sql: string): Promise<void> {
    const [bound, parameters] = this.bindParameters(sql);

    await this.runQuery(bound, parameters);
  }

  private idMaps(metadata: EntityMetadata, value: unknown): ObjectLiteralType[] {
    if (value === undefined || value === null) {
      return [];
    }

    const list = Array.isArray(value) ? value : [value];

    return list.map((item) => {
      if (typeof item === "object" && item !== null && !(item instanceof Date)) {
        const idMap = metadata.getEntityIdMap(item as ObjectLiteralType);

        if (!idMap) {
          throw new InvalidCriteriaError(`Entity of type "${metadata.name}" has no primary key value.`, item);
        }

        return idMap;
      }

      return metadata.ensureEntityIdMap(item as EntityIdType);
    });
  }

  private parameterFor(value: unknown, column: ColumnMetadata): string {
    return `${this.createParameter(this.driver.prepareParameter(value, column))}${this.driver.parameterCast(column)}`;
  }

  /** `(col = :a AND col2 = :b) OR (...)` over the ids, using the junction/foreign key columns. */
  private idListCondition(
    columns: { databaseName: string; referencedColumn: ColumnMetadata | undefined }[],
    ids: ObjectLiteralType[],
  ): string {
    const groups = ids.map((id) =>
      columns
        .map((column) => {
          const referenced = column.referencedColumn as ColumnMetadata;

          return `${this.escape(column.databaseName)} = ${this.parameterFor(id[referenced.propertyName], referenced)}`;
        })
        .join(" AND "),
    );

    return groups.length === 1 ? (groups[0] ?? "0=1") : groups.map((group) => `(${group})`).join(" OR ");
  }

  /** Points the foreign key columns of `relation` (on `metadata`'s table) at `target` for the given rows. */
  private async updateForeignKey(
    metadata: EntityMetadata,
    relation: RelationMetadata,
    target: ObjectLiteralType | null,
    rowIds: ObjectLiteralType[],
  ): Promise<void> {
    if (rowIds.length === 0) {
      return;
    }

    const assignments = relation.joinColumns.map((column) => {
      const referenced = column.referencedColumn as ColumnMetadata;
      const value = target === null ? null : target[referenced.propertyName];

      return `${this.escape(column.databaseName)} = ${this.parameterFor(value, referenced)}`;
    });
    const where = this.idListCondition(
      metadata.primaryColumns.map((column) => ({ databaseName: column.databaseName, referencedColumn: column })),
      rowIds,
    );
    await this.runBound(
      `UPDATE ${this.driver.escapePath(metadata.tableName, metadata.schema)} SET ${assignments.join(", ")} WHERE ${where}`,
    );
  }

  /** Nulls the foreign key of rows pointing at `ownerIds`, optionally only for `rowIds`. */
  private async clearForeignKey(
    metadata: EntityMetadata,
    relation: RelationMetadata,
    ownerIds: ObjectLiteralType[],
    rowIds?: ObjectLiteralType[],
  ): Promise<void> {
    const assignments = relation.joinColumns.map((column) => `${this.escape(column.databaseName)} = NULL`);
    const conditions = [this.idListCondition(relation.joinColumns, ownerIds)];

    if (rowIds) {
      conditions.push(
        this.idListCondition(
          metadata.primaryColumns.map((column) => ({ databaseName: column.databaseName, referencedColumn: column })),
          rowIds,
        ),
      );
    }

    await this.runBound(
      `UPDATE ${this.driver.escapePath(metadata.tableName, metadata.schema)} SET ${assignments.join(", ")} WHERE ${conditions.map((condition) => `(${condition})`).join(" AND ")}`,
    );
  }

  private async loadRelated(): Promise<ObjectLiteralType[]> {
    const relation = this.relation;
    const ofIds = this.idMaps(this.metadata, this.expressionMap.of);

    if (ofIds.length === 0) {
      return [];
    }

    const owners = await this.dataSource
      .createQueryBuilder(this.metadata.target, "owner", this.queryRunner)
      .leftJoinAndSelect(`owner.${relation.propertyName}`, "related")
      .whereInIds(ofIds)
      .getMany();
    const related: ObjectLiteralType[] = [];

    for (const owner of owners) {
      const value = relation.getEntityValue(owner);

      if (Array.isArray(value)) {
        related.push(...(value as ObjectLiteralType[]));
      } else if (value) {
        related.push(value as ObjectLiteralType);
      }
    }

    return related;
  }
}
