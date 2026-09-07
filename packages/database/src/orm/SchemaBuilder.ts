import type { INamingStrategy } from "../types";
import type { IDriver } from "./driver/AbstractDriver";
import { isDateTimeColumn, typeName } from "./driver/AbstractDriver";
import type { ColumnMetadata, EntityMetadata, ForeignKeyMetadataType, RelationMetadata } from "./EntityMetadata";
import type { QueryRunner } from "./QueryRunner";

type TableDdlType = {
  name: string;
  path: string;
  /** Tables this one references through inline foreign keys. */
  dependsOn: Set<string>;
  create: string;
  after: string[];
};

/**
 * Creates the tables, junction tables, indices and constraints the entity metadata describes.
 *
 * `synchronize()` only ever adds what is missing (`CREATE ... IF NOT EXISTS`); it never alters or drops
 * an existing table. Schema changes on a live database belong to migrations.
 */
export class SchemaBuilder {
  public constructor(
    private readonly driver: IDriver,
    private readonly namingStrategy: INamingStrategy,
    private readonly metadatas: EntityMetadata[],
  ) {}

  public async synchronize(runner: QueryRunner): Promise<void> {
    for (const statement of this.createStatements()) {
      await runner.query(statement);
    }
  }

  /** Drops every table of the database, whether an entity describes it or not. */
  public async drop(runner: QueryRunner): Promise<void> {
    const tables = await this.driver.listTables(runner);

    if (tables.length > 0) {
      await this.driver.dropAllTables(runner, tables);
    }
  }

  /** The DDL `synchronize()` runs, in order. */
  public createStatements(): string[] {
    const tables = this.metadatas
      .filter((metadata) => metadata.synchronize)
      .map((metadata) => this.entityTable(metadata));

    for (const metadata of this.metadatas) {
      for (const relation of metadata.manyToManyOwnerRelations) {
        if (metadata.synchronize && relation.inverseEntityMetadata.synchronize) {
          tables.push(this.junctionTable(metadata, relation));
        }
      }
    }

    const ordered = this.sortByDependencies(tables);
    const statements = ordered.map((table) => table.create);

    for (const table of ordered) {
      statements.push(...table.after);
    }

    return statements;
  }

  private entityTable(metadata: EntityMetadata): TableDdlType {
    const path = this.driver.escapePath(metadata.tableName, metadata.schema);
    const inlinePrimary = metadata.primaryColumns.some((column) => this.driver.isInlinePrimaryKey(column));
    const definitions = metadata.columns.map((column) => this.columnDefinition(column));
    const after: string[] = [];
    const dependsOn = new Set<string>();

    if (!inlinePrimary) {
      const names = metadata.primaryColumns.map((column) => column.databaseName);

      definitions.push(
        `CONSTRAINT ${this.escape(this.namingStrategy.primaryKeyName(metadata.tableName, names))} PRIMARY KEY (${names.map((name) => this.escape(name)).join(", ")})`,
      );
    }

    for (const unique of metadata.uniques) {
      definitions.push(
        `CONSTRAINT ${this.escape(unique.name)} UNIQUE (${unique.columns.map((column) => this.escape(column.databaseName)).join(", ")})`,
      );
    }

    for (const column of metadata.columns) {
      const check = this.enumCheck(column);

      if (check) {
        definitions.push(check);
      }
    }

    for (const foreignKey of metadata.foreignKeys) {
      if (foreignKey.referencedEntityMetadata !== metadata) {
        dependsOn.add(foreignKey.referencedEntityMetadata.tableName);
      }

      definitions.push(this.foreignKeyDefinition(foreignKey));
    }

    for (const index of metadata.indices) {
      if (index.synchronize) {
        after.push(this.indexStatement(metadata, index.name, index.columns, index.isUnique, index.where));
      }
    }

    // Foreign keys need an index to be looked up from the other side; MySQL adds one itself.
    if (this.driver.type !== "mysql" && this.driver.type !== "mariadb") {
      for (const relation of metadata.ownerRelations) {
        if (relation.isOneToOneOwner) {
          continue;
        }

        const names = relation.joinColumns.map((column) => column.databaseName);
        const indexName = this.namingStrategy.indexName(metadata.tableName, names);

        if (!metadata.indices.some((index) => index.name === indexName)) {
          after.push(this.indexStatement(metadata, indexName, relation.joinColumns, false));
        }
      }
    }

    return {
      name: metadata.tableName,
      path,
      dependsOn,
      create: `CREATE TABLE IF NOT EXISTS ${path} (${definitions.join(", ")})`,
      after,
    };
  }

  private junctionTable(metadata: EntityMetadata, relation: RelationMetadata): TableDdlType {
    const junction = relation.junction;

    if (!junction) {
      return { name: "", path: "", dependsOn: new Set(), create: "", after: [] };
    }

    const inverse = relation.inverseEntityMetadata;
    const path = this.driver.escapePath(junction.tableName, junction.schema);
    const allColumns = [...junction.joinColumns, ...junction.inverseJoinColumns];
    const definitions = allColumns.map(
      (column) => `${this.escape(column.databaseName)} ${this.driver.normalizeType(column.referencedColumn)} NOT NULL`,
    );
    const names = allColumns.map((column) => column.databaseName);

    definitions.push(
      `CONSTRAINT ${this.escape(this.namingStrategy.primaryKeyName(junction.tableName, names))} PRIMARY KEY (${names.map((name) => this.escape(name)).join(", ")})`,
    );

    const sides: [EntityMetadata, typeof junction.joinColumns][] = [
      [metadata, junction.joinColumns],
      [inverse, junction.inverseJoinColumns],
    ];
    const after: string[] = [];

    for (const [target, columns] of sides) {
      const columnNames = columns.map((column) => column.databaseName);
      const referencedNames = columns.map((column) => column.referencedColumn.databaseName);
      const constraintName = this.namingStrategy.foreignKeyName(
        junction.tableName,
        columnNames,
        target.tablePath,
        referencedNames,
      );

      definitions.push(
        `CONSTRAINT ${this.escape(constraintName)} FOREIGN KEY (${columnNames.map((name) => this.escape(name)).join(", ")}) REFERENCES ${this.driver.escapePath(target.tableName, target.schema)} (${referencedNames.map((name) => this.escape(name)).join(", ")}) ON DELETE CASCADE ON UPDATE CASCADE`,
      );

      if (this.driver.type !== "mysql" && this.driver.type !== "mariadb") {
        after.push(
          `CREATE INDEX ${this.ifNotExists()}${this.escape(this.namingStrategy.indexName(junction.tableName, columnNames))} ON ${path} (${columnNames.map((name) => this.escape(name)).join(", ")})`,
        );
      }
    }

    return {
      name: junction.tableName,
      path,
      dependsOn: new Set([metadata.tableName, inverse.tableName]),
      create: `CREATE TABLE IF NOT EXISTS ${path} (${definitions.join(", ")})`,
      after,
    };
  }

  private columnDefinition(column: ColumnMetadata): string {
    const parts = [this.escape(column.databaseName)];
    const generated = column.isGenerated ? this.driver.generatedColumnDefinition(column) : undefined;

    parts.push(generated ?? this.driver.normalizeType(column));

    if (column.options.unsigned && (this.driver.type === "mysql" || this.driver.type === "mariadb")) {
      parts.push("UNSIGNED");
    }

    if (!this.driver.isInlinePrimaryKey(column)) {
      if (column.isPrimary || !column.isNullable) {
        parts.push("NOT NULL");
      } else if (column.isNullable) {
        parts.push("NULL");
      }
    }

    const defaultValue = this.defaultDefinition(column);

    if (defaultValue !== undefined) {
      parts.push(`DEFAULT ${defaultValue}`);
    }

    if (column.comment && (this.driver.type === "mysql" || this.driver.type === "mariadb")) {
      parts.push(`COMMENT '${column.comment.replace(/'/g, "''")}'`);
    }

    return parts.join(" ");
  }

  private defaultDefinition(column: ColumnMetadata): string | undefined {
    if (column.default !== undefined) {
      return this.driver.normalizeDefault(column);
    }

    if ((column.isCreateDate || column.isUpdateDate) && isDateTimeColumn(column)) {
      return this.driver.currentTimestamp();
    }

    if (column.isVersion) {
      return "1";
    }

    return undefined;
  }

  /** Enums are stored as text outside MySQL; a CHECK keeps the allowed members. */
  private enumCheck(column: ColumnMetadata): string | undefined {
    const name = typeName(column.type);

    if (!column.enum || (name !== "enum" && name !== "simple-enum")) {
      return undefined;
    }

    if (this.driver.type === "mysql" || this.driver.type === "mariadb") {
      return undefined;
    }

    const members = column.enum.map((member) =>
      typeof member === "number" ? String(member) : `'${String(member).replace(/'/g, "''")}'`,
    );

    return `CHECK (${this.escape(column.databaseName)} IN (${members.join(", ")}))`;
  }

  private foreignKeyDefinition(foreignKey: ForeignKeyMetadataType): string {
    const referenced = foreignKey.referencedEntityMetadata;
    let sql =
      `CONSTRAINT ${this.escape(foreignKey.name)} FOREIGN KEY (${foreignKey.columns.map((column) => this.escape(column.databaseName)).join(", ")})` +
      ` REFERENCES ${this.driver.escapePath(referenced.tableName, referenced.schema)} (${foreignKey.referencedColumns.map((column) => this.escape(column.databaseName)).join(", ")})`;

    if (foreignKey.onDelete && foreignKey.onDelete !== "DEFAULT") {
      sql += ` ON DELETE ${foreignKey.onDelete}`;
    }

    if (foreignKey.onUpdate && foreignKey.onUpdate !== "DEFAULT") {
      sql += ` ON UPDATE ${foreignKey.onUpdate}`;
    }

    return sql;
  }

  private indexStatement(
    metadata: EntityMetadata,
    name: string,
    columns: ColumnMetadata[],
    unique: boolean,
    where?: string,
  ): string {
    const path = this.driver.escapePath(metadata.tableName, metadata.schema);
    const list = columns.map((column) => this.escape(column.databaseName)).join(", ");
    const predicate = where && this.driver.type !== "mysql" && this.driver.type !== "mariadb" ? ` WHERE ${where}` : "";

    return `CREATE ${unique ? "UNIQUE " : ""}INDEX ${this.ifNotExists()}${this.escape(name)} ON ${path} (${list})${predicate}`;
  }

  private ifNotExists(): string {
    return this.driver.supportsCreateIndexIfNotExists ? "IF NOT EXISTS " : "";
  }

  private escape(name: string): string {
    return this.driver.escape(name);
  }

  /** Referenced tables first; tables in a reference cycle keep their declaration order. */
  private sortByDependencies(tables: TableDdlType[]): TableDdlType[] {
    const remaining = tables.filter((table) => table.create.length > 0);
    const ordered: TableDdlType[] = [];
    const done = new Set<string>();

    while (remaining.length > 0) {
      const ready = remaining.filter((table) =>
        [...table.dependsOn].every(
          (dependency) => done.has(dependency) || !remaining.some((other) => other.name === dependency),
        ),
      );
      const batch = ready.length > 0 ? ready : [remaining[0] as TableDdlType];

      for (const table of batch) {
        ordered.push(table);
        done.add(table.name);
        remaining.splice(remaining.indexOf(table), 1);
      }
    }

    return ordered;
  }
}
