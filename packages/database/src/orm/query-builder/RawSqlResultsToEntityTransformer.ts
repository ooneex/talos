import type { ObjectLiteralType } from "../../types";
import type { IDriver } from "../driver/AbstractDriver";
import type { ColumnMetadata, EntityMetadata } from "../EntityMetadata";
import type { AliasType, QueryExpressionMap } from "./QueryExpressionMap";

/** The raw column name a selected entity column gets: `alias_column`. */
export const rawColumnName = (aliasName: string, databaseName: string): string => `${aliasName}_${databaseName}`;

type ColumnSlotType = { column: ColumnMetadata; key: string };

type ChildPlanType = {
  plan: AliasPlanType;
  many: boolean;
  /** The property of the parent entity the child lands on: a relation or a `mapToProperty` target. */
  property: string;
};

type EntityIndexType = Map<unknown, ObjectLiteralType>;

/** What one alias contributes to a result: worked out once per result instead of once per row. */
type AliasPlanType = {
  metadata: EntityMetadata;
  columns: ColumnSlotType[];
  primaryKeys: string[];
  children: ChildPlanType[];
  /** Whether rows can produce an entity at all: some column is selected or a mapped join lands on it. */
  yields: boolean;
  /** Entities built for this alias, indexed by primary key under each parent entity. */
  byParent: Map<object, EntityIndexType>;
};

const groupKey = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  return value instanceof Date ? value.toISOString() : String(value);
};

/**
 * Turns the flat rows of a joined select into nested entity instances.
 *
 * Rows are walked once; each alias keeps the entities it already produced under a given parent, so one
 * entity with three joined children comes back as one instance holding an array of three, however many
 * rows the database produced.
 */
export class RawSqlResultsToEntityTransformer {
  public constructor(
    private readonly expressionMap: QueryExpressionMap,
    private readonly driver: IDriver,
  ) {}

  public transform(rawResults: ObjectLiteralType[], alias: AliasType): ObjectLiteralType[] {
    const [sample] = rawResults;

    if (!alias.metadata || !sample) {
      return [];
    }

    // Every row of a result has the same columns, so the first one tells which columns are present.
    const root = this.planFor(alias, new Map(), sample);

    if (!root?.yields) {
      return [];
    }

    const entities: ObjectLiteralType[] = [];
    const index: EntityIndexType = new Map();

    for (const row of rawResults) {
      this.visit(row, root, index, undefined, undefined, entities);
    }

    return entities;
  }

  private planFor(
    alias: AliasType,
    plans: Map<string, AliasPlanType>,
    sample: ObjectLiteralType,
  ): AliasPlanType | undefined {
    const metadata = alias.metadata;

    if (!metadata) {
      return undefined;
    }

    const cached = plans.get(alias.name);

    if (cached) {
      return cached;
    }

    const columns: ColumnSlotType[] = [];
    const primaryKeys: string[] = [];

    for (const column of metadata.columns) {
      const key = rawColumnName(alias.name, column.databaseName);

      if (!(key in sample)) {
        continue;
      }

      if (column.isPrimary) {
        primaryKeys.push(key);
      }

      if (!column.isVirtual) {
        columns.push({ column, key });
      }
    }

    const plan: AliasPlanType = {
      metadata,
      columns,
      primaryKeys,
      children: [],
      yields: columns.length > 0,
      byParent: new Map(),
    };

    // Registered before the children so that a join pointing back at this alias reuses the plan.
    plans.set(alias.name, plan);

    for (const join of this.expressionMap.joinAttributes) {
      if (!join.isSelected) {
        continue;
      }

      if (join.mapToProperty) {
        const dot = join.mapToProperty.indexOf(".");
        const property = join.mapToProperty.slice(dot + 1);

        if (dot === -1 || join.mapToProperty.slice(0, dot) !== alias.name || !property) {
          continue;
        }

        const child = this.planFor(join.alias, plans, sample);

        if (child) {
          plan.children.push({ plan: child, many: join.isMappingMany === true, property });
          // A mapped join carries data for the parent even when no parent column is selected.
          plan.yields = true;
        }

        continue;
      }

      if (join.parentAlias === alias.name && join.relation) {
        const child = this.planFor(join.alias, plans, sample);

        if (child) {
          plan.children.push({ plan: child, many: join.relation.isToMany, property: join.relation.propertyName });
        }
      }
    }

    return plan;
  }

  /** The key one row holds for `plan`, `undefined` when the row carries no entity for it (unmatched LEFT JOIN). */
  private keyOf(row: ObjectLiteralType, plan: AliasPlanType): unknown {
    const { primaryKeys } = plan;

    if (primaryKeys.length === 0) {
      // Without primary values every row is its own entity.
      return row;
    }

    if (primaryKeys.length === 1) {
      const value = row[primaryKeys[0] as string];

      return value === null || value === undefined ? undefined : groupKey(value);
    }

    let missing = true;
    let composite = "";

    for (const primaryKey of primaryKeys) {
      const value = row[primaryKey];

      if (value !== null && value !== undefined) {
        missing = false;
      }

      composite += `${String(groupKey(value))}|`;
    }

    return missing ? undefined : composite;
  }

  private visit(
    row: ObjectLiteralType,
    plan: AliasPlanType,
    index: EntityIndexType,
    parent: ObjectLiteralType | undefined,
    link: ChildPlanType | undefined,
    roots: ObjectLiteralType[],
  ): void {
    const key = this.keyOf(row, plan);

    if (key === undefined) {
      return;
    }

    let entity = index.get(key);

    if (!entity) {
      if (link && !link.many && index.size > 0) {
        // A to-one slot keeps the first entity the rows produced for it.
        return;
      }

      entity = this.createEntity(row, plan);
      index.set(key, entity);

      if (!parent || !link) {
        roots.push(entity);
      } else if (link.many) {
        (parent[link.property] as ObjectLiteralType[]).push(entity);
      } else {
        parent[link.property] = entity;
      }
    }

    for (const child of plan.children) {
      if (!child.plan.yields) {
        continue;
      }

      let childIndex = child.plan.byParent.get(entity);

      if (!childIndex) {
        childIndex = new Map();
        child.plan.byParent.set(entity, childIndex);
      }

      this.visit(row, child.plan, childIndex, entity, child, roots);
    }
  }

  private createEntity(row: ObjectLiteralType, plan: AliasPlanType): ObjectLiteralType {
    const entity = plan.metadata.create();

    for (const { column, key } of plan.columns) {
      column.setEntityValue(entity, this.driver.hydrateValue(row[key], column));
    }

    for (const child of plan.children) {
      entity[child.property] = child.many ? [] : null;
    }

    return entity;
  }
}
