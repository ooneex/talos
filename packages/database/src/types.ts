import type { RedisClient, SQL, TLSOptions } from "bun";
import type { FindOperator } from "./orm/FindOperator";
import type { Repository } from "./orm/Repository";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type DatabaseClassType = new (...args: any[]) => IDatabase | IRedisDatabase | ISqlDatabase;

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type DragonflyDatabaseClassType = new (...args: any[]) => IDragonflyDatabase;

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type RedisDatabaseClassType = new (...args: any[]) => IRedisDatabase;

export type RedisConnectionOptionsType = {
  url?: string;
  connectionTimeout?: number;
  idleTimeout?: number;
  autoReconnect?: boolean;
  maxRetries?: number;
  enableOfflineQueue?: boolean;
  enableAutoPipelining?: boolean;
  tls?:
    | boolean
    | {
        rejectUnauthorized?: boolean;
        ca?: string;
        cert?: string;
        key?: string;
      };
};

export type DragonflyConnectionOptionsType = RedisConnectionOptionsType;

export interface IDatabase {
  open: () => Promise<void>;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}

export interface IRedisDatabase {
  open: () => Promise<RedisClient>;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}

export interface IDragonflyDatabase {
  open: () => Promise<RedisClient>;
  close: () => Promise<void>;
  ping: () => Promise<boolean>;
  drop: () => Promise<void>;
}

export interface ISqlDatabase {
  open: <Entity extends ObjectLiteralType>(
    entity: EntityTargetType<Entity>,
    database?: string,
  ) => Promise<Repository<Entity>>;
  close: () => Promise<void>;
  drop: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// ORM — shared primitives
// ---------------------------------------------------------------------------

/** Any object whose properties are read dynamically — entity instances and plain rows alike. */
// biome-ignore lint/suspicious/noExplicitAny: an index signature of `any` is the only one class instances satisfy
export type ObjectLiteralType = Record<string, any>;

/** A class, abstract or not. Decorators hand the constructor over as this. */
// biome-ignore lint/suspicious/noExplicitAny: constructor parameters are unknown to the ORM
export type ClassType<T = ObjectLiteralType> = abstract new (...args: any[]) => T;

/** How an entity is referred to: its class, or the name it was registered under. */
export type EntityTargetType<Entity = ObjectLiteralType> = ClassType<Entity> | string;

export type DeepPartialType<T> =
  | T
  | (T extends Array<infer U>
      ? DeepPartialType<U>[]
      : T extends Map<infer K, infer V>
        ? Map<DeepPartialType<K>, DeepPartialType<V>>
        : T extends Set<infer M>
          ? Set<DeepPartialType<M>>
          : T extends object
            ? { [K in keyof T]?: DeepPartialType<T[K]> }
            : T);

/**
 * The shape `update()` and `insert()` accept — a partial entity whose values may also be raw SQL thunks.
 *
 * A generic `ObjectLiteralType` target relaxes to any object; a concrete entity is checked property by
 * property, nullable relations included.
 */
export type QueryDeepPartialEntityType<Entity> = QueryDeepPartialEntityInnerType<
  ObjectLiteralType extends Entity ? unknown : Entity
>;

// Homomorphic on purpose: a mapped type distributes over `Relation | null | undefined` and leaves primitives alone.
type QueryDeepPartialEntityInnerType<Entity> = {
  [P in keyof Entity]?:
    | Entity[P]
    | (() => string)
    | (Entity[P] extends Array<infer U>
        ? Array<QueryDeepPartialEntityInnerType<U>>
        : Entity[P] extends ReadonlyArray<infer U>
          ? ReadonlyArray<QueryDeepPartialEntityInnerType<U>>
          : QueryDeepPartialEntityInnerType<Entity[P]>);
};

export type DatabaseTypeType = "postgres" | "mysql" | "mariadb" | "sqlite";

export type TransactionIsolationLevelType = "READ UNCOMMITTED" | "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";

// ---------------------------------------------------------------------------
// ORM — column & relation options (the decorator inputs)
// ---------------------------------------------------------------------------

export type PrimaryGeneratedColumnType = "increment" | "uuid" | "rowid" | "identity";

export type WithLengthColumnType =
  | "character varying"
  | "varying character"
  | "char varying"
  | "nvarchar"
  | "national varchar"
  | "character"
  | "native character"
  | "varchar"
  | "char"
  | "nchar"
  | "national char"
  | "varchar2"
  | "nvarchar2"
  | "raw"
  | "binary"
  | "varbinary"
  | "string";

export type WithPrecisionColumnType =
  | "float"
  | "double"
  | "dec"
  | "decimal"
  | "smalldecimal"
  | "fixed"
  | "numeric"
  | "real"
  | "double precision"
  | "number"
  | "datetime"
  | "datetime2"
  | "datetimeoffset"
  | "time"
  | "time with time zone"
  | "time without time zone"
  | "timestamp"
  | "timestamp without time zone"
  | "timestamp with time zone"
  | "timestamp with local time zone";

export type SimpleColumnType =
  | "simple-array"
  | "simple-json"
  | "simple-enum"
  | "int"
  | "int2"
  | "int4"
  | "int8"
  | "integer"
  | "tinyint"
  | "smallint"
  | "mediumint"
  | "bigint"
  | "bool"
  | "boolean"
  | "text"
  | "tinytext"
  | "mediumtext"
  | "longtext"
  | "citext"
  | "date"
  | "timetz"
  | "timestamptz"
  | "year"
  | "bytea"
  | "blob"
  | "tinyblob"
  | "mediumblob"
  | "longblob"
  | "enum"
  | "json"
  | "jsonb"
  | "uuid"
  | "inet"
  | "cidr"
  | "macaddr"
  | "money"
  | "interval"
  | "xml"
  | "point"
  | "bit"
  | "varbit"
  | "tsvector"
  | "rowid"
  | "serial"
  | "bigserial";

export type ColumnType =
  | WithLengthColumnType
  | WithPrecisionColumnType
  | SimpleColumnType
  | BooleanConstructor
  | DateConstructor
  | NumberConstructor
  | StringConstructor;

export interface IValueTransformer {
  /** Turns the entity value into the value written to the database. */
  to: (value: unknown) => unknown;
  /** Turns the database value into the entity value. */
  from: (value: unknown) => unknown;
}

export type ColumnOptionsType = {
  /** Database column name. Defaults to the property name run through the naming strategy. */
  name?: string;
  type?: ColumnType;
  length?: string | number;
  width?: number;
  nullable?: boolean;
  /** Column is written on INSERT (default true). */
  insert?: boolean;
  /** Column is written on UPDATE (default true). */
  update?: boolean;
  /** Column is part of the default selection (default true). */
  select?: boolean;
  /** Static default, or a thunk returning a raw SQL expression used in the DDL. */
  default?: unknown;
  primary?: boolean;
  unique?: boolean;
  comment?: string;
  precision?: number | null;
  scale?: number;
  charset?: string;
  collation?: string;
  /** Allowed values of an `enum` / `simple-enum` column. */
  enum?: readonly (string | number)[] | Record<string, string | number>;
  enumName?: string;
  /** Column holds a database array (PostgreSQL). */
  array?: boolean;
  transformer?: IValueTransformer | IValueTransformer[];
  unsigned?: boolean;
  zerofill?: boolean;
};

export type PrimaryColumnOptionsType = ColumnOptionsType;

export type EntityOptionsType = {
  /** Table name. Defaults to the class name run through the naming strategy. */
  name?: string;
  schema?: string;
  database?: string;
  /** Skipped by `synchronize()` when false. */
  synchronize?: boolean;
  comment?: string;
};

export type IndexOptionsType = {
  unique?: boolean;
  /** Partial index predicate, raw SQL. */
  where?: string;
  synchronize?: boolean;
};

export type OnDeleteType = "RESTRICT" | "CASCADE" | "SET NULL" | "DEFAULT" | "NO ACTION";
export type OnUpdateType = OnDeleteType;
export type CascadeOptionType = "insert" | "update" | "remove" | "soft-remove" | "recover";

/**
 * Wraps the type of a to-one relation property so that `emitDecoratorMetadata` records `Object`
 * instead of the related class. Without it, two entities that reference each other (or a class
 * declared further down the file) fail at load time with "Cannot access 'X' before initialization".
 *
 * @example
 * @OneToOne(() => Wallet, (wallet) => wallet.account, { cascade: true })
 * public wallet?: RelationType<Wallet>;
 */
export type RelationType<T> = T;

export type RelationOptionsType = {
  /** Which operations on the owner propagate to the related entities. */
  cascade?: boolean | CascadeOptionType[];
  nullable?: boolean;
  onDelete?: OnDeleteType;
  onUpdate?: OnUpdateType;
  /** Loaded by every `find*` call without asking. */
  eager?: boolean;
  persistence?: boolean;
  orphanedRowAction?: "nullify" | "delete" | "soft-delete" | "disable";
  createForeignKeyConstraints?: boolean;
};

export type JoinColumnOptionsType = {
  /** Foreign key column on this table. */
  name?: string;
  /** Column it points to on the other table. Defaults to the target's primary column. */
  referencedColumnName?: string;
  foreignKeyConstraintName?: string;
};

export type JoinTableOptionsType = {
  /** Junction table name. */
  name?: string;
  schema?: string;
  database?: string;
  joinColumn?: JoinColumnOptionsType;
  inverseJoinColumn?: JoinColumnOptionsType;
  synchronize?: boolean;
};

export type JoinTableMultipleColumnsOptionsType = Omit<JoinTableOptionsType, "joinColumn" | "inverseJoinColumn"> & {
  joinColumns?: JoinColumnOptionsType[];
  inverseJoinColumns?: JoinColumnOptionsType[];
};

export type RelationTypeType = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

// biome-ignore lint/suspicious/noExplicitAny: the inverse-side selector receives the related entity
export type InverseSideSelectorType<T> = string | ((object: T) => any);

// ---------------------------------------------------------------------------
// ORM — metadata args (what the decorators record)
// ---------------------------------------------------------------------------

export type TableMetadataArgsType = {
  target: ClassType;
  name?: string | undefined;
  schema?: string | undefined;
  database?: string | undefined;
  synchronize?: boolean | undefined;
  comment?: string | undefined;
};

export type ColumnModeType = "regular" | "createDate" | "updateDate" | "deleteDate" | "version";

export type ColumnMetadataArgsType = {
  target: ClassType;
  propertyName: string;
  mode: ColumnModeType;
  options: ColumnOptionsType;
};

export type GeneratedMetadataArgsType = {
  target: ClassType;
  propertyName: string;
  strategy: PrimaryGeneratedColumnType;
};

export type RelationMetadataArgsType = {
  target: ClassType;
  propertyName: string;
  relationType: RelationTypeType;
  /** The related entity: a thunk returning its class (or name), or its name directly. */
  type: string | (() => EntityTargetType);
  inverseSideProperty?: InverseSideSelectorType<ObjectLiteralType> | undefined;
  options: RelationOptionsType;
};

export type JoinColumnMetadataArgsType = {
  target: ClassType;
  propertyName: string;
  name?: string | undefined;
  referencedColumnName?: string | undefined;
  foreignKeyConstraintName?: string | undefined;
};

export type JoinTableMetadataArgsType = {
  target: ClassType;
  propertyName: string;
  name?: string | undefined;
  schema?: string | undefined;
  joinColumns?: JoinColumnOptionsType[] | undefined;
  inverseJoinColumns?: JoinColumnOptionsType[] | undefined;
};

export type IndexMetadataArgsType = {
  target: ClassType;
  name?: string | undefined;
  /** Property names, or a selector picking them off the entity. */
  columns?: string[] | ((object: ObjectLiteralType) => ObjectLiteralType) | undefined;
  /** Set when the decorator sits on a property. */
  propertyName?: string | undefined;
  unique?: boolean | undefined;
  where?: string | undefined;
  synchronize?: boolean | undefined;
};

export type UniqueMetadataArgsType = {
  target: ClassType;
  name?: string | undefined;
  columns?: string[] | ((object: ObjectLiteralType) => ObjectLiteralType) | undefined;
  propertyName?: string | undefined;
};

// ---------------------------------------------------------------------------
// ORM — naming & logging
// ---------------------------------------------------------------------------

export interface INamingStrategy {
  tableName: (className: string, customName?: string) => string;
  columnName: (propertyName: string, customName?: string, embeddedPrefixes?: string[]) => string;
  relationName: (propertyName: string) => string;
  joinColumnName: (relationName: string, referencedColumnName: string) => string;
  joinTableName: (
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
    secondPropertyName?: string,
  ) => string;
  joinTableColumnName: (tableName: string, propertyName: string, columnName?: string) => string;
  joinTableInverseColumnName: (tableName: string, propertyName: string, columnName?: string) => string;
  primaryKeyName: (tableName: string, columnNames: string[]) => string;
  uniqueConstraintName: (tableName: string, columnNames: string[]) => string;
  indexName: (tableName: string, columnNames: string[], where?: string) => string;
  foreignKeyName: (
    tableName: string,
    columnNames: string[],
    referencedTableName: string,
    referencedColumnNames: string[],
  ) => string;
}

export interface IQueryLogger {
  logQuery: (query: string, parameters?: unknown[]) => void;
  logQueryError: (error: unknown, query: string, parameters?: unknown[]) => void;
}

// ---------------------------------------------------------------------------
// ORM — DataSource options
// ---------------------------------------------------------------------------

type BaseDataSourceOptionsType = {
  /** Entity classes this data source manages. Defaults to every class decorated with `@Entity()`. */
  entities?: EntityTargetType[];
  /** Create missing tables and indexes on `initialize()`. Never alters existing tables. */
  synchronize?: boolean;
  /** Drop every table before synchronizing. Test databases only. */
  dropSchema?: boolean;
  /** Forward every query to `logger`. */
  logging?: boolean;
  logger?: IQueryLogger;
  namingStrategy?: INamingStrategy;
  /** Prefix applied to every table name. */
  entityPrefix?: string;
  /** Extra Bun `SQL` options merged into the client configuration. */
  extra?: Record<string, unknown>;
  /** Bring your own Bun `SQL` client — the data source then neither creates nor configures one. */
  client?: SQL;
  /** Maximum number of pooled connections (PostgreSQL / MySQL). */
  poolSize?: number;
  /** Connection timeout in milliseconds (PostgreSQL / MySQL). */
  connectTimeoutMS?: number;
};

export type PostgresDataSourceOptionsType = BaseDataSourceOptionsType & {
  type: "postgres";
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string | (() => string | Promise<string>);
  database?: string;
  /** Default schema for unqualified tables. */
  schema?: string;
  ssl?: boolean | TLSOptions;
  /** Server-side named prepared statements (default true). Disable behind PgBouncer in transaction mode. */
  prepare?: boolean;
  /** Return `bigint` values as `BigInt` instead of strings. */
  bigint?: boolean;
};

export type MysqlDataSourceOptionsType = BaseDataSourceOptionsType & {
  type: "mysql" | "mariadb";
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string | (() => string | Promise<string>);
  database?: string;
  ssl?: boolean | TLSOptions;
  bigint?: boolean;
};

export type SqliteDataSourceOptionsType = BaseDataSourceOptionsType & {
  type: "sqlite";
  /** File path, `:memory:`, or a `sqlite://` URL. */
  database: string;
  /** Switch the journal to write-ahead logging on connect. */
  enableWAL?: boolean;
  /** Busy timeout in milliseconds, how long a writer waits for a lock. */
  timeout?: number;
  /** Alias of `timeout`. */
  busyTimeout?: number;
  readonly?: boolean;
  /** Enforce foreign keys (default true). */
  foreignKeys?: boolean;
};

export type DataSourceOptionsType =
  | PostgresDataSourceOptionsType
  | MysqlDataSourceOptionsType
  | SqliteDataSourceOptionsType;

// ---------------------------------------------------------------------------
// ORM — find options
// ---------------------------------------------------------------------------

export type EqualOperatorType<T> = FindOperator<T>;

export type FindOptionsWherePropertyType<Property> = Property extends Promise<infer I>
  ? FindOptionsWherePropertyType<NonNullable<I>>
  : Property extends Array<infer I>
    ? FindOptionsWherePropertyType<NonNullable<I>>
    : // biome-ignore lint/suspicious/noExplicitAny: methods are excluded from where clauses, whatever their signature
      Property extends (...args: any[]) => any
      ? never
      : Property extends Uint8Array
        ? Property | FindOperator<Property>
        : Property extends Date
          ? Property | FindOperator<Property>
          : Property extends object
            ?
                | FindOptionsWhereType<Property>
                | FindOptionsWhereType<Property>[]
                | EqualOperatorType<Property>
                | FindOperator<unknown>
                | boolean
                | Property
            : Property | FindOperator<Property> | null;

export type FindOptionsWhereType<Entity> = {
  [P in keyof Entity]?: P extends "toString" ? unknown : FindOptionsWherePropertyType<NonNullable<Entity[P]>>;
};

export type FindOptionsOrderValueType =
  | "ASC"
  | "DESC"
  | "asc"
  | "desc"
  | 1
  | -1
  | {
      direction?: "asc" | "desc" | "ASC" | "DESC";
      nulls?: "first" | "last" | "FIRST" | "LAST";
    };

export type FindOptionsOrderPropertyType<Property> = Property extends Promise<infer I>
  ? FindOptionsOrderPropertyType<NonNullable<I>>
  : Property extends Array<infer I>
    ? FindOptionsOrderPropertyType<NonNullable<I>>
    : // biome-ignore lint/suspicious/noExplicitAny: methods cannot be ordered by
      Property extends (...args: any[]) => any
      ? never
      : Property extends Uint8Array
        ? FindOptionsOrderValueType
        : Property extends Date
          ? FindOptionsOrderValueType
          : Property extends object
            ? FindOptionsOrderType<Property> | FindOptionsOrderValueType
            : FindOptionsOrderValueType;

export type FindOptionsOrderType<Entity> = {
  [P in keyof Entity]?: P extends "toString" ? unknown : FindOptionsOrderPropertyType<NonNullable<Entity[P]>>;
};

export type FindOptionsRelationsPropertyType<Property> = Property extends Promise<infer I>
  ? FindOptionsRelationsPropertyType<NonNullable<I>> | boolean
  : Property extends Array<infer I>
    ? FindOptionsRelationsPropertyType<NonNullable<I>> | boolean
    : // biome-ignore lint/suspicious/noExplicitAny: methods are not relations
      Property extends (...args: any[]) => any
      ? never
      : Property extends Uint8Array
        ? boolean
        : Property extends Date
          ? boolean
          : Property extends object
            ? FindOptionsRelationsType<Property> | boolean
            : boolean;

export type FindOptionsRelationsType<Entity> = {
  [P in keyof Entity]?: P extends "toString" ? unknown : FindOptionsRelationsPropertyType<NonNullable<Entity[P]>>;
};

export type FindOptionsRelationByStringType = string[];

export type FindOptionsSelectPropertyType<Property> = Property extends Promise<infer I>
  ? FindOptionsSelectPropertyType<I> | boolean
  : Property extends Array<infer I>
    ? FindOptionsSelectPropertyType<I> | boolean
    : // biome-ignore lint/suspicious/noExplicitAny: methods cannot be selected
      Property extends (...args: any[]) => any
      ? never
      : Property extends Uint8Array
        ? boolean
        : Property extends Date
          ? boolean
          : Property extends object
            ? FindOptionsSelectType<Property>
            : boolean;

export type FindOptionsSelectType<Entity> = {
  [P in keyof Entity]?: P extends "toString" ? unknown : FindOptionsSelectPropertyType<NonNullable<Entity[P]>>;
};

export type FindOptionsSelectByStringType<Entity> = (keyof Entity)[];

export type FindOneOptionsType<Entity = ObjectLiteralType> = {
  /** SQL comment prepended to the query. */
  comment?: string;
  select?: FindOptionsSelectType<Entity> | FindOptionsSelectByStringType<Entity>;
  where?: FindOptionsWhereType<Entity>[] | FindOptionsWhereType<Entity>;
  relations?: FindOptionsRelationsType<Entity> | FindOptionsRelationByStringType;
  order?: FindOptionsOrderType<Entity>;
  /** Include soft-deleted rows. */
  withDeleted?: boolean;
  /** Load `eager` relations (default true). */
  loadEagerRelations?: boolean;
};

export type FindManyOptionsType<Entity = ObjectLiteralType> = FindOneOptionsType<Entity> & {
  skip?: number;
  take?: number;
};

export type SaveOptionsType = {
  /** Run the whole save in one transaction (default true). */
  transaction?: boolean;
  /** Re-read generated and defaulted columns after writing (default true). */
  reload?: boolean;
  /** Save many entities in batches of this size. */
  chunk?: number;
  data?: ObjectLiteralType;
};

export type RemoveOptionsType = {
  transaction?: boolean;
  chunk?: number;
  data?: ObjectLiteralType;
};

export type UpsertOptionsType<Entity> = {
  /** Property names forming the conflict target — a unique or primary key. */
  conflictPaths: string[] | { [P in keyof Entity]?: true };
  /** Do not write when the incoming values equal the stored row. */
  skipUpdateIfNoValuesChanged?: boolean;
  /** Overwrite only these properties on conflict; default is every non-conflict column. */
  upsertType?: "on-conflict-do-update" | "on-duplicate-key-update";
};

/** The primary key of an entity — a single value, or a property → value map for composite keys. */
export type EntityIdType = string | number | bigint | Date | ObjectLiteralType;

export type FindCriteriaType<Entity> =
  | string
  | string[]
  | number
  | number[]
  | Date
  | Date[]
  | FindOptionsWhereType<Entity>
  | FindOptionsWhereType<Entity>[];

/** Result of a raw query — the rows plus the metadata Bun reports on them. */
export type QueryResultType<Row = ObjectLiteralType> = {
  records: Row[];
  affected: number;
  lastInsertRowid: number | bigint | null;
};
