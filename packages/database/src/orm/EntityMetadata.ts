import type {
  CascadeOptionType,
  ClassType,
  ColumnMetadataArgsType,
  ColumnModeType,
  ColumnOptionsType,
  ColumnType,
  EntityIdType,
  IValueTransformer,
  ObjectLiteralType,
  OnDeleteType,
  OnUpdateType,
  PrimaryGeneratedColumnType,
  RelationMetadataArgsType,
  RelationOptionsType,
  RelationTypeType,
  TableMetadataArgsType,
} from "../types";
import { classifyColumnType, type HydrationKindType } from "./driver/columnTypes";
import { MissingPrimaryColumnError } from "./errors";

export type IndexMetadataType = {
  name: string;
  columns: ColumnMetadata[];
  isUnique: boolean;
  where?: string | undefined;
  synchronize: boolean;
};

export type UniqueMetadataType = {
  name: string;
  columns: ColumnMetadata[];
};

export type ForeignKeyMetadataType = {
  name: string;
  columns: ColumnMetadata[];
  referencedEntityMetadata: EntityMetadata;
  referencedColumns: ColumnMetadata[];
  onDelete?: OnDeleteType | undefined;
  onUpdate?: OnUpdateType | undefined;
};

export type JunctionColumnType = {
  databaseName: string;
  /** The column this junction column points to. */
  referencedColumn: ColumnMetadata;
};

/** The junction table of a many-to-many relation, seen from one of its sides. */
export type JunctionMetadataType = {
  tableName: string;
  schema?: string | undefined;
  /** Junction columns pointing at the entity that holds this relation. */
  joinColumns: JunctionColumnType[];
  /** Junction columns pointing at the related entity. */
  inverseJoinColumns: JunctionColumnType[];
};

type ColumnMetadataInitType = {
  entityMetadata: EntityMetadata;
  args: ColumnMetadataArgsType;
  databaseName: string;
  generationStrategy?: PrimaryGeneratedColumnType | undefined;
  isVirtual?: boolean;
};

/** Columns declared without a type are stored as text; entity values pass through untouched. */
const DEFAULT_COLUMN_TYPE: ColumnType = "varchar";

export class ColumnMetadata {
  public readonly entityMetadata: EntityMetadata;
  public readonly target: ClassType;
  public readonly propertyName: string;
  public readonly databaseName: string;
  public readonly mode: ColumnModeType;
  public readonly options: ColumnOptionsType;
  public readonly type: ColumnType;
  public readonly length: string | number | undefined;
  public readonly width: number | undefined;
  public readonly precision: number | null | undefined;
  public readonly scale: number | undefined;
  public readonly default: unknown;
  public readonly comment: string | undefined;
  public readonly enum: (string | number)[] | undefined;
  public readonly isPrimary: boolean;
  public readonly isNullable: boolean;
  public readonly isUnique: boolean;
  public readonly isArray: boolean;
  public readonly isGenerated: boolean;
  public readonly generationStrategy: PrimaryGeneratedColumnType | undefined;
  public readonly isCreateDate: boolean;
  public readonly isUpdateDate: boolean;
  public readonly isDeleteDate: boolean;
  public readonly isVersion: boolean;
  public readonly isSelect: boolean;
  public readonly isInsert: boolean;
  public readonly isUpdate: boolean;
  public readonly transformers: IValueTransformer[];
  /** Exists only through a relation's join column — no `@Column()` declares it on the class. */
  public readonly isVirtual: boolean;
  /** The conversion raw values of this column go through, decided once from the type. */
  public readonly hydrationKind: HydrationKindType;
  /** Set on foreign key columns: the relation that owns them and the column they reference. */
  public relationMetadata: RelationMetadata | undefined;
  public referencedColumn: ColumnMetadata | undefined;

  public constructor(init: ColumnMetadataInitType) {
    const { args, databaseName } = init;
    const options = args.options;

    this.entityMetadata = init.entityMetadata;
    this.target = args.target;
    this.propertyName = args.propertyName;
    this.databaseName = databaseName;
    this.mode = args.mode;
    this.options = options;
    this.type =
      options.type ??
      (args.mode === "version"
        ? "integer"
        : args.mode === "createDate" || args.mode === "updateDate" || args.mode === "deleteDate"
          ? "timestamp"
          : DEFAULT_COLUMN_TYPE);
    this.length = options.length;
    this.width = options.width;
    this.precision = options.precision;
    this.scale = options.scale;
    this.default = options.default;
    this.comment = options.comment;
    this.enum = options.enum === undefined ? undefined : normalizeEnum(options.enum);
    this.isPrimary = options.primary === true;
    this.isNullable = options.nullable === true;
    this.isUnique = options.unique === true;
    this.isArray = options.array === true;
    this.generationStrategy = init.generationStrategy;
    this.isGenerated = init.generationStrategy !== undefined;
    this.isCreateDate = args.mode === "createDate";
    this.isUpdateDate = args.mode === "updateDate";
    this.isDeleteDate = args.mode === "deleteDate";
    this.isVersion = args.mode === "version";
    this.isSelect = options.select !== false;
    this.isInsert = options.insert !== false;
    this.isUpdate = options.update !== false;
    this.transformers = options.transformer
      ? Array.isArray(options.transformer)
        ? options.transformer
        : [options.transformer]
      : [];
    this.isVirtual = init.isVirtual === true;
    this.hydrationKind = classifyColumnType(this.type, this.isArray);
  }

  /** Reads the value this column stores for `entity`, following a relation for foreign key columns. */
  public getEntityValue(entity: ObjectLiteralType): unknown {
    if (this.relationMetadata && this.referencedColumn) {
      const related = entity[this.relationMetadata.propertyName];

      if (related !== undefined) {
        if (related === null) {
          return null;
        }

        return typeof related === "object" ? this.referencedColumn.getEntityValue(related) : related;
      }

      if (this.isVirtual) {
        return undefined;
      }
    }

    return entity[this.propertyName];
  }

  /** Writes a hydrated value on `entity`. Virtual foreign key columns have no property to write. */
  public setEntityValue(entity: ObjectLiteralType, value: unknown): void {
    if (this.isVirtual) {
      return;
    }

    entity[this.propertyName] = value;
  }

  /** Applies the `to` side of the transformers, outermost last. */
  public transformTo(value: unknown): unknown {
    let current = value;

    for (const transformer of this.transformers) {
      current = transformer.to(current);
    }

    return current;
  }

  /** Applies the `from` side of the transformers, in reverse declaration order. */
  public transformFrom(value: unknown): unknown {
    let current = value;

    for (let index = this.transformers.length - 1; index >= 0; index -= 1) {
      current = (this.transformers[index] as IValueTransformer).from(current);
    }

    return current;
  }
}

const normalizeEnum = (value: readonly (string | number)[] | Record<string, string | number>): (string | number)[] => {
  if (Array.isArray(value)) {
    return [...value];
  }

  const entries = Object.entries(value as Record<string, string | number>);
  // A numeric TS enum also has reverse mappings (value → key); keep the members only.
  const isNumeric = entries.some(([, member]) => typeof member === "number");

  return entries.filter(([key]) => !isNumeric || Number.isNaN(Number(key))).map(([, member]) => member);
};

type RelationMetadataInitType = {
  entityMetadata: EntityMetadata;
  args: RelationMetadataArgsType;
};

export class RelationMetadata {
  public readonly entityMetadata: EntityMetadata;
  public readonly target: ClassType;
  public readonly propertyName: string;
  public readonly relationType: RelationTypeType;
  public readonly options: RelationOptionsType;
  public readonly isEager: boolean;
  public readonly isNullable: boolean;
  public readonly onDelete: OnDeleteType | undefined;
  public readonly onUpdate: OnUpdateType | undefined;
  public readonly createForeignKeyConstraints: boolean;
  public readonly orphanedRowAction: RelationOptionsType["orphanedRowAction"];
  public readonly typeThunk: RelationMetadataArgsType["type"];
  public readonly inverseSideProperty: RelationMetadataArgsType["inverseSideProperty"];
  /** Set by the builder once every entity is known. */
  public inverseEntityMetadata: EntityMetadata;
  public inverseRelation: RelationMetadata | undefined;
  public inverseSidePropertyPath: string | undefined;
  /** Whether this side holds the foreign key (many-to-one, one-to-one / many-to-many with the join decorator). */
  public isOwning = false;
  /** Foreign key columns on this entity's table; empty on non-owning sides. */
  public joinColumns: ColumnMetadata[] = [];
  /** Many-to-many only: the junction table seen from this side. */
  public junction: JunctionMetadataType | undefined;
  private readonly cascades: CascadeOptionType[];

  public constructor(init: RelationMetadataInitType) {
    const { args } = init;
    const options = args.options;

    this.entityMetadata = init.entityMetadata;
    this.target = args.target;
    this.propertyName = args.propertyName;
    this.relationType = args.relationType;
    this.options = options;
    this.typeThunk = args.type;
    this.inverseSideProperty = args.inverseSideProperty;
    this.isEager = options.eager === true;
    this.isNullable = options.nullable !== false;
    this.onDelete = options.onDelete;
    this.onUpdate = options.onUpdate;
    this.createForeignKeyConstraints = options.createForeignKeyConstraints !== false;
    this.orphanedRowAction = options.orphanedRowAction;
    this.cascades =
      options.cascade === true
        ? ["insert", "update", "remove", "soft-remove", "recover"]
        : Array.isArray(options.cascade)
          ? options.cascade
          : [];
    this.inverseEntityMetadata = init.entityMetadata;
  }

  public get isManyToOne(): boolean {
    return this.relationType === "many-to-one";
  }

  public get isOneToMany(): boolean {
    return this.relationType === "one-to-many";
  }

  public get isOneToOne(): boolean {
    return this.relationType === "one-to-one";
  }

  public get isManyToMany(): boolean {
    return this.relationType === "many-to-many";
  }

  public get isOneToOneOwner(): boolean {
    return this.isOneToOne && this.isOwning;
  }

  public get isOneToOneNotOwner(): boolean {
    return this.isOneToOne && !this.isOwning;
  }

  public get isManyToManyOwner(): boolean {
    return this.isManyToMany && this.isOwning;
  }

  public get isManyToManyNotOwner(): boolean {
    return this.isManyToMany && !this.isOwning;
  }

  /** Holds a single related entity (many-to-one, one-to-one). */
  public get isToOne(): boolean {
    return this.isManyToOne || this.isOneToOne;
  }

  /** Holds an array of related entities (one-to-many, many-to-many). */
  public get isToMany(): boolean {
    return this.isOneToMany || this.isManyToMany;
  }

  /** The foreign key columns live on this entity's own table. */
  public get isWithJoinColumn(): boolean {
    return this.isManyToOne || this.isOneToOneOwner;
  }

  public get isCascadeInsert(): boolean {
    return this.cascades.includes("insert");
  }

  public get isCascadeUpdate(): boolean {
    return this.cascades.includes("update");
  }

  public get isCascadeRemove(): boolean {
    return this.cascades.includes("remove");
  }

  public get isCascadeSoftRemove(): boolean {
    return this.cascades.includes("soft-remove");
  }

  public get isCascadeRecover(): boolean {
    return this.cascades.includes("recover");
  }

  public getEntityValue(entity: ObjectLiteralType): unknown {
    return entity[this.propertyName];
  }

  public setEntityValue(entity: ObjectLiteralType, value: unknown): void {
    entity[this.propertyName] = value;
  }
}

type EntityMetadataInitType = {
  args: TableMetadataArgsType;
  tableName: string;
};

/** Everything derived from `columns` and `relations`, computed once so the hot paths only read. */
type DerivedMetadataType = {
  columnCount: number;
  relationCount: number;
  ownColumns: ColumnMetadata[];
  primaryColumns: ColumnMetadata[];
  nonPrimaryColumns: ColumnMetadata[];
  generatedColumns: ColumnMetadata[];
  createDateColumn: ColumnMetadata | undefined;
  updateDateColumn: ColumnMetadata | undefined;
  deleteDateColumn: ColumnMetadata | undefined;
  versionColumn: ColumnMetadata | undefined;
  eagerRelations: RelationMetadata[];
  ownerRelations: RelationMetadata[];
  manyToManyOwnerRelations: RelationMetadata[];
  columnsByProperty: Map<string, ColumnMetadata>;
  columnsByDatabaseName: Map<string, ColumnMetadata>;
  relationsByProperty: Map<string, RelationMetadata>;
};

export class EntityMetadata {
  public readonly target: ClassType;
  /** The class name; also what a string entity target resolves against. */
  public readonly name: string;
  public readonly tableName: string;
  public readonly schema: string | undefined;
  public readonly database: string | undefined;
  public readonly synchronize: boolean;
  public readonly comment: string | undefined;
  public columns: ColumnMetadata[] = [];
  public relations: RelationMetadata[] = [];
  public indices: IndexMetadataType[] = [];
  public uniques: UniqueMetadataType[] = [];
  public foreignKeys: ForeignKeyMetadataType[] = [];
  private readonly propertiesMap: ObjectLiteralType = {};
  private derivedCache: DerivedMetadataType | undefined;
  private sealed = false;

  public constructor(init: EntityMetadataInitType) {
    this.target = init.args.target;
    this.name = init.args.target.name;
    this.tableName = init.tableName;
    this.schema = init.args.schema;
    this.database = init.args.database;
    this.synchronize = init.args.synchronize !== false;
    this.comment = init.args.comment;
  }

  /**
   * Marks the metadata as fully wired so that the derived collections below are computed once and
   * reused. Until then (while the builder still flips relation flags) every getter recomputes. Columns
   * or relations added after sealing are picked up automatically.
   */
  public seal(): void {
    this.sealed = true;
    this.derivedCache = undefined;
  }

  /** `schema.table` when a schema is set, plain table name otherwise. */
  public get tablePath(): string {
    return this.schema ? `${this.schema}.${this.tableName}` : this.tableName;
  }

  /** Columns declared with a decorator — excludes foreign keys that exist only through a relation. */
  public get ownColumns(): ColumnMetadata[] {
    return this.derived.ownColumns;
  }

  public get primaryColumns(): ColumnMetadata[] {
    return this.derived.primaryColumns;
  }

  public get nonPrimaryColumns(): ColumnMetadata[] {
    return this.derived.nonPrimaryColumns;
  }

  public get generatedColumns(): ColumnMetadata[] {
    return this.derived.generatedColumns;
  }

  public get createDateColumn(): ColumnMetadata | undefined {
    return this.derived.createDateColumn;
  }

  public get updateDateColumn(): ColumnMetadata | undefined {
    return this.derived.updateDateColumn;
  }

  public get deleteDateColumn(): ColumnMetadata | undefined {
    return this.derived.deleteDateColumn;
  }

  public get versionColumn(): ColumnMetadata | undefined {
    return this.derived.versionColumn;
  }

  public get hasMultiplePrimaryKeys(): boolean {
    return this.derived.primaryColumns.length > 1;
  }

  public get eagerRelations(): RelationMetadata[] {
    return this.derived.eagerRelations;
  }

  /** Relations whose foreign key columns sit on this table. */
  public get ownerRelations(): RelationMetadata[] {
    return this.derived.ownerRelations;
  }

  public get manyToManyOwnerRelations(): RelationMetadata[] {
    return this.derived.manyToManyOwnerRelations;
  }

  public findColumnWithPropertyName(propertyName: string): ColumnMetadata | undefined {
    return this.derived.columnsByProperty.get(propertyName);
  }

  public findColumnWithDatabaseName(databaseName: string): ColumnMetadata | undefined {
    return this.derived.columnsByDatabaseName.get(databaseName);
  }

  public findRelationWithPropertyPath(propertyPath: string): RelationMetadata | undefined {
    return this.derived.relationsByProperty.get(propertyPath);
  }

  public hasRelationWithPropertyPath(propertyPath: string): boolean {
    return this.findRelationWithPropertyPath(propertyPath) !== undefined;
  }

  /** The foreign key columns of a relation, whether declared explicitly or created for it. */
  public findJoinColumnsForRelation(propertyName: string): ColumnMetadata[] {
    return this.columns.filter((column) => column.relationMetadata?.propertyName === propertyName);
  }

  /** Every property name mapped to itself — what inverse-side selectors such as `(user) => user.posts` run against. */
  public createPropertiesMap(): ObjectLiteralType {
    if (Object.keys(this.propertiesMap).length === 0) {
      for (const column of this.ownColumns) {
        this.propertiesMap[column.propertyName] = column.propertyName;
      }

      for (const relation of this.relations) {
        this.propertiesMap[relation.propertyName] = relation.propertyName;
      }
    }

    return this.propertiesMap;
  }

  /** A fresh instance, built with the class constructor so field initializers run. */
  public create(): ObjectLiteralType {
    return new (this.target as new () => ObjectLiteralType)();
  }

  /** Whether every primary column has a value on `entity`. */
  public hasId(entity: ObjectLiteralType | null | undefined): boolean {
    if (!entity || typeof entity !== "object") {
      return false;
    }

    for (const column of this.primaryColumns) {
      if (!isIdValue(column.getEntityValue(entity))) {
        return false;
      }
    }

    return true;
  }

  /** Primary property → value, or undefined when a primary value is missing. */
  public getEntityIdMap(entity: ObjectLiteralType | null | undefined): ObjectLiteralType | undefined {
    if (!entity || typeof entity !== "object") {
      return undefined;
    }

    const map: ObjectLiteralType = {};

    for (const column of this.primaryColumns) {
      const value = column.getEntityValue(entity);

      if (!isIdValue(value)) {
        return undefined;
      }

      map[column.propertyName] = value;
    }

    return map;
  }

  /** The primary value itself for a single key, the property → value map for a composite key. */
  public getEntityIdMixedMap(entity: ObjectLiteralType | null | undefined): EntityIdType | undefined {
    const map = this.getEntityIdMap(entity);

    if (map === undefined) {
      return undefined;
    }

    if (!this.hasMultiplePrimaryKeys) {
      const [column] = this.primaryColumns;

      return column ? (map[column.propertyName] as EntityIdType) : undefined;
    }

    return map;
  }

  /** Normalises a bare id or an id map into a primary property → value map. */
  public ensureEntityIdMap(id: EntityIdType): ObjectLiteralType {
    if (typeof id === "object" && !(id instanceof Date)) {
      const map: ObjectLiteralType = {};

      for (const column of this.primaryColumns) {
        map[column.propertyName] = column.getEntityValue(id as ObjectLiteralType);
      }

      return map;
    }

    const [column] = this.primaryColumns;

    if (!column || this.hasMultiplePrimaryKeys) {
      throw new MissingPrimaryColumnError(this.name);
    }

    return { [column.propertyName]: id };
  }

  /** A stable string for a primary key, used to group joined rows and de-duplicate results. */
  public getIdKey(idMap: ObjectLiteralType): string {
    const columns = this.primaryColumns;

    if (columns.length === 1) {
      return idKeyPart(idMap[(columns[0] as ColumnMetadata).propertyName]);
    }

    return columns.map((column) => idKeyPart(idMap[column.propertyName])).join("|");
  }

  /** Whether two entities (or id maps) share the same primary key. */
  public compareIds(first: ObjectLiteralType | undefined, second: ObjectLiteralType | undefined): boolean {
    if (!first || !second) {
      return false;
    }

    return this.primaryColumns.every((column) => {
      const left = first[column.propertyName];
      const right = second[column.propertyName];

      return left instanceof Date && right instanceof Date ? left.getTime() === right.getTime() : left === right;
    });
  }

  private get derived(): DerivedMetadataType {
    const cache = this.derivedCache;

    if (
      cache &&
      this.sealed &&
      cache.columnCount === this.columns.length &&
      cache.relationCount === this.relations.length
    ) {
      return cache;
    }

    const derived = this.computeDerived();

    if (this.sealed) {
      this.derivedCache = derived;
    }

    return derived;
  }

  private computeDerived(): DerivedMetadataType {
    const { columns, relations } = this;
    const columnsByProperty = new Map<string, ColumnMetadata>();
    const columnsByDatabaseName = new Map<string, ColumnMetadata>();
    const relationsByProperty = new Map<string, RelationMetadata>();

    for (const column of columns) {
      // Foreign key columns that only exist through a relation have no property of their own.
      if (!column.isVirtual && !columnsByProperty.has(column.propertyName)) {
        columnsByProperty.set(column.propertyName, column);
      }

      if (!columnsByDatabaseName.has(column.databaseName)) {
        columnsByDatabaseName.set(column.databaseName, column);
      }
    }

    for (const relation of relations) {
      if (!relationsByProperty.has(relation.propertyName)) {
        relationsByProperty.set(relation.propertyName, relation);
      }
    }

    return {
      columnCount: columns.length,
      relationCount: relations.length,
      ownColumns: columns.filter((column) => !column.isVirtual),
      primaryColumns: columns.filter((column) => column.isPrimary),
      nonPrimaryColumns: columns.filter((column) => !column.isPrimary),
      generatedColumns: columns.filter((column) => column.isGenerated),
      createDateColumn: columns.find((column) => column.isCreateDate),
      updateDateColumn: columns.find((column) => column.isUpdateDate),
      deleteDateColumn: columns.find((column) => column.isDeleteDate),
      versionColumn: columns.find((column) => column.isVersion),
      eagerRelations: relations.filter((relation) => relation.isEager),
      ownerRelations: relations.filter((relation) => relation.isWithJoinColumn),
      manyToManyOwnerRelations: relations.filter((relation) => relation.isManyToManyOwner),
      columnsByProperty,
      columnsByDatabaseName,
      relationsByProperty,
    };
  }
}

const isIdValue = (value: unknown): boolean => value !== undefined && value !== null && value !== "";

const idKeyPart = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    return value instanceof Date ? value.toISOString() : JSON.stringify(value);
  }

  return String(value);
};
