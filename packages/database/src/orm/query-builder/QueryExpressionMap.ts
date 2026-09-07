import type { ObjectLiteralType } from "../../types";
import type { EntityMetadata, RelationMetadata } from "../EntityMetadata";

export type QueryTypeType = "select" | "insert" | "update" | "delete" | "soft-delete" | "restore" | "relation";

export type AliasType = {
  name: string;
  metadata?: EntityMetadata | undefined;
  /** Table name for aliases that are not entities. */
  tableName?: string | undefined;
  /** SQL of a sub query used as a table. */
  subQuery?: string | undefined;
};

export type JoinAttributeType = {
  direction: "INNER" | "LEFT";
  alias: AliasType;
  /** Alias whose relation is joined, for relation joins. */
  parentAlias?: string | undefined;
  relation?: RelationMetadata | undefined;
  condition?: string | undefined;
  /** Whether the joined columns are part of the selection (`*AndSelect`, `*AndMap*`). */
  isSelected: boolean;
  /** `alias.property` the joined entities are mapped onto (`*AndMapOne/Many`). */
  mapToProperty?: string | undefined;
  isMappingMany?: boolean | undefined;
  /** Many-to-many joins go through the junction table under this alias. */
  junctionAlias?: string | undefined;
};

export type WherePartType = { type: "simple" | "and" | "or"; condition: string };

export type OrderByType = Record<string, { order: "ASC" | "DESC"; nulls?: "NULLS FIRST" | "NULLS LAST" | undefined }>;

export type SelectionType = { selection: string; aliasName?: string | undefined };

export type OnUpdateType = {
  conflictColumns: string[];
  overwriteColumns: string[];
  skipUpdateIfNoValuesChanged?: boolean | undefined;
};

export type LockModeType = "pessimistic_read" | "pessimistic_write" | "for_no_key_update";

/** Everything a query builder accumulated; the concrete builders read it to write SQL. */
export class QueryExpressionMap {
  public queryType: QueryTypeType = "select";
  public mainAlias: AliasType | undefined;
  public aliases: AliasType[] = [];
  /** Names of the aliases added with `addFrom()`. */
  public extraFromAliases: string[] = [];
  public selects: SelectionType[] = [];
  public joinAttributes: JoinAttributeType[] = [];
  public wheres: WherePartType[] = [];
  public havings: WherePartType[] = [];
  public orderBys: OrderByType = {};
  public groupBys: string[] = [];
  public limit: number | undefined;
  public offset: number | undefined;
  public take: number | undefined;
  public skip: number | undefined;
  public parameters: ObjectLiteralType = {};
  public parameterCounter = 0;
  public withDeleted = false;
  public selectDistinct = false;
  public selectDistinctOn: string[] = [];
  public lockMode: LockModeType | undefined;
  public comment: string | undefined;
  public insertColumns: string[] | undefined;
  public valuesSet: ObjectLiteralType | ObjectLiteralType[] | undefined;
  public onIgnore = false;
  public onUpdate: OnUpdateType | undefined;
  public returning: string | string[] | undefined;
  /** Write generated values (ids, dates, versions) back onto the entities given to insert/update. */
  public updateEntity = true;
  public relationPropertyPath: string | undefined;
  public of: unknown;
  public isSubQuery = false;
  public parentQueryBuilderCounter = 0;

  public createAlias(alias: AliasType): AliasType {
    const existing = this.aliases.find((candidate) => candidate.name === alias.name);

    if (existing) {
      return existing;
    }

    this.aliases.push(alias);

    return alias;
  }

  public findAlias(name: string): AliasType | undefined {
    return this.aliases.find((alias) => alias.name === name);
  }

  public clone(): QueryExpressionMap {
    const map = new QueryExpressionMap();

    map.queryType = this.queryType;
    map.mainAlias = this.mainAlias;
    map.aliases = [...this.aliases];
    map.extraFromAliases = [...this.extraFromAliases];
    map.selects = this.selects.map((select) => ({ ...select }));
    map.joinAttributes = this.joinAttributes.map((join) => ({ ...join }));
    map.wheres = this.wheres.map((where) => ({ ...where }));
    map.havings = this.havings.map((having) => ({ ...having }));
    map.orderBys = { ...this.orderBys };
    map.groupBys = [...this.groupBys];
    map.limit = this.limit;
    map.offset = this.offset;
    map.take = this.take;
    map.skip = this.skip;
    map.parameters = { ...this.parameters };
    map.parameterCounter = this.parameterCounter;
    map.withDeleted = this.withDeleted;
    map.selectDistinct = this.selectDistinct;
    map.selectDistinctOn = [...this.selectDistinctOn];
    map.lockMode = this.lockMode;
    map.comment = this.comment;
    map.insertColumns = this.insertColumns ? [...this.insertColumns] : undefined;
    map.valuesSet = this.valuesSet;
    map.onIgnore = this.onIgnore;
    map.onUpdate = this.onUpdate
      ? {
          ...this.onUpdate,
          conflictColumns: [...this.onUpdate.conflictColumns],
          overwriteColumns: [...this.onUpdate.overwriteColumns],
        }
      : undefined;
    map.returning = this.returning;
    map.updateEntity = this.updateEntity;
    map.relationPropertyPath = this.relationPropertyPath;
    map.of = this.of;
    map.isSubQuery = this.isSubQuery;
    map.parentQueryBuilderCounter = this.parentQueryBuilderCounter;

    return map;
  }
}
