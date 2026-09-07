import type { ObjectLiteralType, RemoveOptionsType, SaveOptionsType } from "../types";
import type { EntityManager } from "./EntityManager";
import type { ColumnMetadata, EntityMetadata, RelationMetadata } from "./EntityMetadata";
import { MissingDeleteDateColumnError } from "./errors";
import { chunkByParameters, type QueryBuilder } from "./query-builder/QueryBuilder";
import { rawColumnName } from "./query-builder/RawSqlResultsToEntityTransformer";
import type { RelationPairType } from "./query-builder/RelationQueryBuilder";

type IdMapType = ObjectLiteralType;

const isEntityObject = (value: unknown): value is ObjectLiteralType =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

/** The alias the current database rows are loaded under; their columns are read back through it. */
const ROW_ALIAS = "current";

/** The id maps of the entities that have one, in order. */
const idMapsOf = (metadata: EntityMetadata, entities: readonly ObjectLiteralType[]): IdMapType[] => {
  const idMaps: IdMapType[] = [];

  for (const entity of entities) {
    const idMap = metadata.getEntityIdMap(entity);

    if (idMap) {
      idMaps.push(idMap);
    }
  }

  return idMaps;
};

/** A string identifying a group of hydrated key values, for grouping rows by their owner. */
const keyOf = (values: readonly unknown[]): string =>
  values.map((value) => (value instanceof Date ? value.toISOString() : String(value))).join("|");

/** Whether two values prepared for the same column would write the same thing. */
const sameDatabaseValue = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  if (left === null || right === null || typeof left === "object" || typeof right === "object") {
    return false;
  }

  // Numbers, bigints and numeric strings describe the same stored value.
  return String(left) === String(right);
};

/**
 * Writes entity graphs: decides between insert and update, follows cascades, keeps junction tables and
 * one-to-many foreign keys in step with the arrays held by the entities.
 *
 * Work is done per level of the graph rather than per entity: one select loads the current rows of a
 * whole batch, new rows go out in multi-row inserts, updates only touch the columns that differ, and
 * junction tables are diffed and rewritten for all parents at once. A graph of `n` entities therefore
 * costs a handful of statements per relation, not a handful per entity.
 *
 * Every query goes through the manager it was given, so a transactional manager makes the whole save
 * atomic.
 */
export class EntityPersister {
  public constructor(private readonly manager: EntityManager) {}

  public async save(metadata: EntityMetadata, entities: ObjectLiteralType[], options: SaveOptionsType): Promise<void> {
    await this.persistMany(metadata, entities, new Set(), options);
  }

  public async remove(
    metadata: EntityMetadata,
    entities: ObjectLiteralType[],
    options: RemoveOptionsType,
  ): Promise<void> {
    await this.removeMany(metadata, entities, new Set(), options);
  }

  public async softRemove(metadata: EntityMetadata, entities: ObjectLiteralType[]): Promise<void> {
    await this.markDeleted(metadata, entities, new Set(), "soft-delete");
  }

  public async recover(metadata: EntityMetadata, entities: ObjectLiteralType[]): Promise<void> {
    await this.markDeleted(metadata, entities, new Set(), "restore");
  }

  // ---------------------------------------------------------------------------
  // save
  // ---------------------------------------------------------------------------

  private async persistMany(
    metadata: EntityMetadata,
    entities: readonly unknown[],
    visited: Set<object>,
    options: SaveOptionsType,
  ): Promise<void> {
    const pending = this.claim(entities, visited);

    if (pending.length === 0) {
      return;
    }

    // Owners first: the related row must exist before this row can point at it.
    for (const relation of metadata.ownerRelations) {
      if (this.cascadesSave(relation)) {
        await this.persistMany(relation.inverseEntityMetadata, this.relatedOf(pending, relation), visited, options);
      }
    }

    const existing = new Set<ObjectLiteralType>();

    for (const wave of this.orderByDependencies(metadata, pending)) {
      const rows = await this.loadRows(metadata, wave);
      const inserts: ObjectLiteralType[] = [];

      for (const entity of wave) {
        const row = rows.get(entity);

        if (row) {
          existing.add(entity);
          await this.update(metadata, entity, row);
        } else {
          inserts.push(entity);
        }
      }

      await this.insertMany(metadata, inserts, options);
    }

    // The other side of an inverse one-to-one holds the foreign key and needs the id just written.
    for (const relation of metadata.relations) {
      const inverse = relation.inverseRelation;

      if (!relation.isOneToOneNotOwner || !inverse || !this.cascadesSave(relation)) {
        continue;
      }

      const related: ObjectLiteralType[] = [];

      for (const entity of pending) {
        const value = relation.getEntityValue(entity);

        if (isEntityObject(value)) {
          inverse.setEntityValue(value, entity);
          related.push(value);
        }
      }

      await this.persistMany(relation.inverseEntityMetadata, related, visited, options);
    }

    for (const relation of metadata.relations) {
      if (relation.isOneToMany) {
        await this.persistOneToMany(metadata, relation, pending, existing, visited, options);
      } else if (relation.isManyToMany) {
        await this.persistManyToMany(relation, pending, visited, options);
      }
    }
  }

  /** Slices `items` so that one statement binds at most what the driver is comfortable with. */
  private chunk<T>(items: readonly T[], valuesPerItem: number): T[][] {
    return chunkByParameters(items, valuesPerItem, this.manager.connection.driver.maxBoundParameters);
  }

  /** The entity objects of `entities` not seen before, marked as seen. */
  private claim(entities: readonly unknown[], visited: Set<object>): ObjectLiteralType[] {
    const pending: ObjectLiteralType[] = [];

    for (const entity of entities) {
      if (isEntityObject(entity) && !visited.has(entity)) {
        visited.add(entity);
        pending.push(entity);
      }
    }

    return pending;
  }

  /** The entity objects held by `relation` across `entities`, in order and without duplicates. */
  private relatedOf(entities: readonly ObjectLiteralType[], relation: RelationMetadata): ObjectLiteralType[] {
    const related = new Set<ObjectLiteralType>();

    for (const entity of entities) {
      const value = relation.getEntityValue(entity);

      if (Array.isArray(value)) {
        for (const item of value) {
          if (isEntityObject(item)) {
            related.add(item);
          }
        }
      } else if (isEntityObject(value)) {
        related.add(value);
      }
    }

    return [...related];
  }

  private cascadesSave(relation: RelationMetadata): boolean {
    return relation.isCascadeInsert || relation.isCascadeUpdate;
  }

  /**
   * Splits a batch into waves so that an entity pointing at another entity of the same batch through a
   * self-referencing relation is written after it. Batches without such relations are a single wave.
   */
  private orderByDependencies(metadata: EntityMetadata, entities: ObjectLiteralType[]): ObjectLiteralType[][] {
    const selfRelations = metadata.ownerRelations.filter((relation) => relation.inverseEntityMetadata === metadata);

    if (selfRelations.length === 0) {
      return [entities];
    }

    const batch = new Set(entities);
    const dependencies = new Map<ObjectLiteralType, ObjectLiteralType[]>();

    for (const entity of entities) {
      for (const relation of selfRelations) {
        const related = relation.getEntityValue(entity);

        if (isEntityObject(related) && related !== entity && batch.has(related)) {
          dependencies.set(entity, [...(dependencies.get(entity) ?? []), related]);
        }
      }
    }

    if (dependencies.size === 0) {
      return [entities];
    }

    const waves: ObjectLiteralType[][] = [];
    const written = new Set<ObjectLiteralType>();
    let remaining = entities;

    while (remaining.length > 0) {
      const ready = remaining.filter((entity) =>
        (dependencies.get(entity) ?? []).every((dependency) => written.has(dependency)),
      );

      if (ready.length === 0) {
        // A cycle: nothing can go first, so the rest is written as it is.
        waves.push(remaining);
        break;
      }

      for (const entity of ready) {
        written.add(entity);
      }

      waves.push(ready);
      remaining = remaining.filter((entity) => !written.has(entity));
    }

    return waves;
  }

  /** The current database rows of the entities that have an id, soft-deleted ones included. */
  private async loadRows(
    metadata: EntityMetadata,
    entities: readonly ObjectLiteralType[],
  ): Promise<Map<ObjectLiteralType, ObjectLiteralType>> {
    const rows = new Map<ObjectLiteralType, ObjectLiteralType>();
    const byKey = new Map<string, ObjectLiteralType[]>();
    const idMaps: IdMapType[] = [];

    for (const entity of entities) {
      const idMap = metadata.getEntityIdMap(entity);

      if (!idMap) {
        continue;
      }

      const key = metadata.getIdKey(idMap);
      const owners = byKey.get(key);

      if (owners) {
        owners.push(entity);
      } else {
        byKey.set(key, [entity]);
        idMaps.push(idMap);
      }
    }

    if (idMaps.length === 0) {
      return rows;
    }

    const driver = this.manager.connection.driver;

    for (const chunk of this.chunk(idMaps, metadata.primaryColumns.length)) {
      const records = await this.manager
        .createQueryBuilder(metadata.target, ROW_ALIAS)
        .withDeleted()
        .whereInIds(chunk)
        .getRawMany();

      for (const record of records) {
        const idMap: IdMapType = {};

        for (const column of metadata.primaryColumns) {
          idMap[column.propertyName] = driver.hydrateValue(
            record[rawColumnName(ROW_ALIAS, column.databaseName)],
            column,
          );
        }

        for (const entity of byKey.get(metadata.getIdKey(idMap)) ?? []) {
          rows.set(entity, record);
        }
      }
    }

    return rows;
  }

  private async insertMany(
    metadata: EntityMetadata,
    entities: ObjectLiteralType[],
    options: SaveOptionsType,
  ): Promise<void> {
    if (entities.length === 0) {
      return;
    }

    for (const chunk of this.chunk(entities, metadata.columns.length)) {
      await this.manager
        .createQueryBuilder()
        .insert()
        .into(metadata.target)
        .values(chunk)
        .updateEntity(options.reload !== false)
        .execute();
    }
  }

  /** Writes the columns whose entity value differs from the loaded row; nothing when none does. */
  private async update(metadata: EntityMetadata, entity: ObjectLiteralType, row: ObjectLiteralType): Promise<void> {
    const values = this.changedValues(metadata, entity, row);

    if (Object.keys(values).length === 0) {
      return;
    }

    await this.manager.createQueryBuilder().update(metadata.target).set(values).whereEntity(entity).execute();
  }

  private changedValues(
    metadata: EntityMetadata,
    entity: ObjectLiteralType,
    row: ObjectLiteralType,
  ): ObjectLiteralType {
    const values: ObjectLiteralType = {};

    for (const column of metadata.columns) {
      if (column.isPrimary || !column.isUpdate || column.isCreateDate || column.isUpdateDate || column.isVersion) {
        continue;
      }

      const key = rawColumnName(ROW_ALIAS, column.databaseName);
      const relation = column.relationMetadata;
      const related = relation?.getEntityValue(entity);

      if (relation && column.referencedColumn && related !== undefined) {
        // An unsaved related entity has nothing to point at yet and is left alone.
        if (isEntityObject(related) && !relation.inverseEntityMetadata.hasId(related)) {
          continue;
        }

        const foreignKey =
          related === null ? null : isEntityObject(related) ? column.referencedColumn.getEntityValue(related) : related;

        // The update builder derives the foreign key from the related entity, id or null.
        if (!(key in row) || !this.isUnchanged(column, foreignKey, row[key])) {
          values[relation.propertyName] = related;
        }

        continue;
      }

      const value = column.getEntityValue(entity);

      if (value === undefined || (key in row && this.isUnchanged(column, value, row[key]))) {
        continue;
      }

      values[column.propertyName] = value;
    }

    return values;
  }

  /** Compares an entity value with a raw database value once both are in the form the driver writes. */
  private isUnchanged(column: ColumnMetadata, value: unknown, raw: unknown): boolean {
    const driver = this.manager.connection.driver;
    const typeColumn = column.isVirtual && column.referencedColumn ? column.referencedColumn : column;

    return sameDatabaseValue(
      driver.prepareParameter(value, typeColumn),
      driver.prepareParameter(driver.hydrateValue(raw, typeColumn), typeColumn),
    );
  }

  private async persistOneToMany(
    metadata: EntityMetadata,
    relation: RelationMetadata,
    parents: readonly ObjectLiteralType[],
    existing: ReadonlySet<ObjectLiteralType>,
    visited: Set<object>,
    options: SaveOptionsType,
  ): Promise<void> {
    const inverse = relation.inverseRelation;

    if (!inverse) {
      return;
    }

    const childMetadata = relation.inverseEntityMetadata;
    const childrenOf = new Map<ObjectLiteralType, ObjectLiteralType[]>();
    const allChildren: ObjectLiteralType[] = [];

    for (const parent of parents) {
      const related = relation.getEntityValue(parent);

      if (!Array.isArray(related)) {
        continue;
      }

      const children = related.filter(isEntityObject);

      for (const child of children) {
        inverse.setEntityValue(child, parent);
        allChildren.push(child);
      }

      childrenOf.set(parent, children);
    }

    if (childrenOf.size === 0) {
      return;
    }

    if (this.cascadesSave(relation)) {
      await this.persistMany(childMetadata, allChildren, visited, options);
    } else {
      // Without a cascade, existing children are attached by their foreign key and new ones are skipped.
      for (const [parent, children] of childrenOf) {
        const ids = idMapsOf(childMetadata, children);

        if (ids.length > 0) {
          await this.manager.createQueryBuilder().relation(metadata.target, relation.propertyName).of(parent).add(ids);
        }
      }
    }

    if (relation.orphanedRowAction === "disable") {
      return;
    }

    const owners = parents.filter((parent) => existing.has(parent) && childrenOf.has(parent));

    if (owners.length === 0) {
      return;
    }

    const current = await this.loadChildIds(childMetadata, inverse.joinColumns, owners);
    const orphanIds: IdMapType[] = [];

    for (const owner of owners) {
      const kept = new Set<string>();

      for (const child of childrenOf.get(owner) ?? []) {
        const idMap = childMetadata.getEntityIdMap(child);

        if (idMap) {
          kept.add(childMetadata.getIdKey(idMap));
        }
      }

      for (const idMap of current.get(this.referencedKey(inverse.joinColumns, owner)) ?? []) {
        if (!kept.has(childMetadata.getIdKey(idMap))) {
          orphanIds.push(idMap);
        }
      }
    }

    if (orphanIds.length === 0) {
      return;
    }

    for (const chunk of this.chunk(orphanIds, childMetadata.primaryColumns.length)) {
      if (relation.orphanedRowAction === "delete") {
        await this.manager.createQueryBuilder().delete().from(childMetadata.target).whereInIds(chunk).execute();
      } else if (relation.orphanedRowAction === "soft-delete") {
        await this.manager.createQueryBuilder().softDelete().from(childMetadata.target).whereInIds(chunk).execute();
      } else {
        await this.manager
          .createQueryBuilder()
          .relation(metadata.target, relation.propertyName)
          .of(owners)
          .remove(chunk);
      }
    }
  }

  private async persistManyToMany(
    relation: RelationMetadata,
    parents: readonly ObjectLiteralType[],
    visited: Set<object>,
    options: SaveOptionsType,
  ): Promise<void> {
    const junction = relation.junction;

    if (!junction) {
      return;
    }

    const metadata = relation.entityMetadata;
    const relatedMetadata = relation.inverseEntityMetadata;
    const itemsOf = new Map<ObjectLiteralType, ObjectLiteralType[]>();
    const toPersist: ObjectLiteralType[] = [];

    for (const parent of parents) {
      const related = relation.getEntityValue(parent);

      if (!Array.isArray(related)) {
        continue;
      }

      const items = related.filter(isEntityObject);

      itemsOf.set(parent, items);

      if (this.cascadesSave(relation)) {
        for (const item of items) {
          if (!relatedMetadata.hasId(item) || relation.isCascadeUpdate) {
            toPersist.push(item);
          }
        }
      }
    }

    if (itemsOf.size === 0) {
      return;
    }

    await this.persistMany(relatedMetadata, toPersist, visited, options);

    const owners = [...itemsOf.keys()].filter((parent) => metadata.hasId(parent));
    const current = await this.loadJunctionIds(relation, owners);
    const added: RelationPairType[] = [];
    const removed: RelationPairType[] = [];

    for (const owner of owners) {
      const ownerId = metadata.getEntityIdMap(owner) as IdMapType;
      const wanted = new Map<string, IdMapType>();

      for (const item of itemsOf.get(owner) ?? []) {
        const idMap = relatedMetadata.getEntityIdMap(item);

        if (idMap) {
          wanted.set(relatedMetadata.getIdKey(idMap), idMap);
        }
      }

      const currentIds = current.get(this.referencedKey(junction.joinColumns, owner)) ?? [];
      const currentKeys = new Set(currentIds.map((idMap) => relatedMetadata.getIdKey(idMap)));

      for (const [key, idMap] of wanted) {
        if (!currentKeys.has(key)) {
          added.push([ownerId, idMap]);
        }
      }

      for (const idMap of currentIds) {
        if (!wanted.has(relatedMetadata.getIdKey(idMap))) {
          removed.push([ownerId, idMap]);
        }
      }
    }

    if (removed.length === 0 && added.length === 0) {
      return;
    }

    const relationBuilder = this.manager.createQueryBuilder().relation(metadata.target, relation.propertyName);

    if (removed.length > 0) {
      await relationBuilder.removePairs(removed);
    }

    if (added.length > 0) {
      await relationBuilder.addPairs(added);
    }
  }

  /** The values of `owner` that `columns` reference, as a grouping key. */
  private referencedKey(
    columns: readonly { referencedColumn: ColumnMetadata | undefined }[],
    owner: ObjectLiteralType,
  ): string {
    return keyOf(columns.map((column) => column.referencedColumn?.getEntityValue(owner)));
  }

  /**
   * `WHERE` matching rows whose `columns` point at any of `owners`; a single column becomes an `IN`
   * list, several columns a group of `AND`s per owner.
   */
  private referencedCondition(
    qb: QueryBuilder<ObjectLiteralType>,
    alias: string,
    columns: readonly { databaseName: string; referencedColumn: ColumnMetadata | undefined }[],
    owners: readonly ObjectLiteralType[],
  ): string {
    const escaped = columns.map((column) => `${qb.escape(alias)}.${qb.escape(column.databaseName)}`);
    const [single] = columns;

    if (columns.length === 1 && single) {
      qb.setParameter(
        "owners",
        owners.map((owner) => single.referencedColumn?.getEntityValue(owner)),
      );

      return `${escaped[0]} IN (:...owners)`;
    }

    const groups = owners.map((owner, ownerIndex) =>
      columns
        .map((column, columnIndex) => {
          const name = `owner_${ownerIndex}_${columnIndex}`;

          qb.setParameter(name, column.referencedColumn?.getEntityValue(owner));

          return `${escaped[columnIndex]} = :${name}`;
        })
        .join(" AND "),
    );

    return groups.map((group) => `(${group})`).join(" OR ");
  }

  /** Primary keys of the rows of `metadata` pointing at each owner through `foreignKeyColumns`. */
  private async loadChildIds(
    metadata: EntityMetadata,
    foreignKeyColumns: ColumnMetadata[],
    owners: readonly ObjectLiteralType[],
  ): Promise<Map<string, IdMapType[]>> {
    const driver = this.manager.connection.driver;
    const result = new Map<string, IdMapType[]>();
    const alias = "child";

    for (const chunk of this.chunk(owners, foreignKeyColumns.length)) {
      const qb = this.manager.createQueryBuilder(metadata.target, alias).withDeleted().select([]);

      metadata.primaryColumns.forEach((column, index) => {
        qb.addSelect(`${qb.escape(alias)}.${qb.escape(column.databaseName)}`, `pk_${index}`);
      });
      foreignKeyColumns.forEach((column, index) => {
        qb.addSelect(`${qb.escape(alias)}.${qb.escape(column.databaseName)}`, `fk_${index}`);
      });
      qb.where(this.referencedCondition(qb, alias, foreignKeyColumns, chunk));

      for (const record of await qb.getRawMany()) {
        const idMap: IdMapType = {};

        metadata.primaryColumns.forEach((column, index) => {
          idMap[column.propertyName] = driver.hydrateValue(record[`pk_${index}`], column);
        });

        const ownerKey = keyOf(
          foreignKeyColumns.map((column, index) =>
            driver.hydrateValue(record[`fk_${index}`], column.referencedColumn ?? column),
          ),
        );
        const ids = result.get(ownerKey);

        if (ids) {
          ids.push(idMap);
        } else {
          result.set(ownerKey, [idMap]);
        }
      }
    }

    return result;
  }

  /** Primary keys of the related rows currently linked to each owner through the junction table. */
  private async loadJunctionIds(
    relation: RelationMetadata,
    owners: readonly ObjectLiteralType[],
  ): Promise<Map<string, IdMapType[]>> {
    const junction = relation.junction;
    const result = new Map<string, IdMapType[]>();

    if (!junction || owners.length === 0) {
      return result;
    }

    const driver = this.manager.connection.driver;
    const alias = "junction";

    for (const chunk of this.chunk(owners, junction.joinColumns.length)) {
      const qb = this.manager.createQueryBuilder().select([]).from(junction.tableName, alias);

      junction.joinColumns.forEach((column, index) => {
        qb.addSelect(`${qb.escape(alias)}.${qb.escape(column.databaseName)}`, `owner_${index}`);
      });
      junction.inverseJoinColumns.forEach((column, index) => {
        qb.addSelect(`${qb.escape(alias)}.${qb.escape(column.databaseName)}`, `related_${index}`);
      });
      qb.where(this.referencedCondition(qb, alias, junction.joinColumns, chunk));

      for (const record of await qb.getRawMany()) {
        const ownerKey = keyOf(
          junction.joinColumns.map((column, index) =>
            driver.hydrateValue(record[`owner_${index}`], column.referencedColumn),
          ),
        );
        const idMap: IdMapType = {};

        junction.inverseJoinColumns.forEach((column, index) => {
          idMap[column.referencedColumn.propertyName] = driver.hydrateValue(
            record[`related_${index}`],
            column.referencedColumn,
          );
        });

        const ids = result.get(ownerKey);

        if (ids) {
          ids.push(idMap);
        } else {
          result.set(ownerKey, [idMap]);
        }
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // remove / soft-remove / recover
  // ---------------------------------------------------------------------------

  private async removeMany(
    metadata: EntityMetadata,
    entities: readonly unknown[],
    visited: Set<object>,
    options: RemoveOptionsType,
  ): Promise<void> {
    const pending = this.claim(entities, visited);

    if (pending.length === 0) {
      return;
    }

    // Dependents go first so foreign keys never dangle.
    for (const relation of metadata.relations) {
      if (relation.isCascadeRemove && relation.isToMany) {
        await this.removeMany(relation.inverseEntityMetadata, this.relatedOf(pending, relation), visited, options);
      }
    }

    for (const relation of metadata.relations) {
      if (relation.isCascadeRemove && relation.isOneToOneNotOwner) {
        await this.removeMany(relation.inverseEntityMetadata, this.relatedOf(pending, relation), visited, options);
      }
    }

    for (const chunk of this.chunk(idMapsOf(metadata, pending), metadata.primaryColumns.length)) {
      await this.manager.createQueryBuilder().delete().from(metadata.target).whereInIds(chunk).execute();
    }

    for (const relation of metadata.relations) {
      if (relation.isCascadeRemove && relation.isWithJoinColumn) {
        await this.removeMany(relation.inverseEntityMetadata, this.relatedOf(pending, relation), visited, options);
      }
    }

    for (const entity of pending) {
      for (const column of metadata.primaryColumns) {
        column.setEntityValue(entity, undefined);
      }
    }
  }

  private async markDeleted(
    metadata: EntityMetadata,
    entities: ObjectLiteralType[],
    visited: Set<object>,
    mode: "soft-delete" | "restore",
  ): Promise<void> {
    if (!metadata.deleteDateColumn) {
      throw new MissingDeleteDateColumnError(metadata.name);
    }

    const pending = this.claim(entities, visited);

    for (const relation of metadata.relations) {
      const cascades = mode === "soft-delete" ? relation.isCascadeSoftRemove : relation.isCascadeRecover;

      // A cascade only reaches entities that can be soft-deleted; the others are left as they are.
      if (!cascades || !relation.inverseEntityMetadata.deleteDateColumn) {
        continue;
      }

      const children = this.relatedOf(pending, relation);

      if (children.length > 0) {
        await this.markDeleted(relation.inverseEntityMetadata, children, visited, mode);
      }
    }

    const withIds = pending.filter((entity) => metadata.hasId(entity));

    for (const chunk of this.chunk(withIds, metadata.primaryColumns.length)) {
      const qb =
        mode === "soft-delete"
          ? this.manager.createQueryBuilder().softDelete().from(metadata.target)
          : this.manager.createQueryBuilder().restore().from(metadata.target);

      await qb.whereEntity(chunk).execute();
    }
  }
}
