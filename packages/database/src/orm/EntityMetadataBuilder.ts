import type { ClassType, INamingStrategy, JoinColumnOptionsType, ObjectLiteralType } from "../types";
import {
  ColumnMetadata,
  EntityMetadata,
  type JunctionColumnType,
  type JunctionMetadataType,
  RelationMetadata,
} from "./EntityMetadata";
import {
  EntityMetadataNotFoundError,
  EntityPropertyNotFoundError,
  MissingPrimaryColumnError,
  RelationNotFoundError,
} from "./errors";
import type { MetadataArgsStorage } from "./MetadataArgsStorage";

type ColumnSelectorType = string[] | ((object: ObjectLiteralType) => ObjectLiteralType);

const dedupeByProperty = <T extends { propertyName: string }>(items: T[]): T[] => {
  const byProperty = new Map<string, T>();

  for (const item of items) {
    byProperty.set(item.propertyName, item);
  }

  return [...byProperty.values()];
};

/**
 * Turns the args the decorators recorded into `EntityMetadata` for one data source. Naming and table
 * prefixes are per data source, which is why metadata is not built once globally.
 */
export class EntityMetadataBuilder {
  public constructor(
    private readonly storage: MetadataArgsStorage,
    private readonly namingStrategy: INamingStrategy,
    private readonly entityPrefix = "",
  ) {}

  public build(targets: ClassType[]): EntityMetadata[] {
    const metadatas = targets.map((target) => this.createEntityMetadata(target));

    for (const metadata of metadatas) {
      this.resolveRelationTargets(metadata, metadatas);
    }

    for (const metadata of metadatas) {
      this.resolveInverseRelations(metadata);
    }

    for (const metadata of metadatas) {
      this.buildJoinColumns(metadata);
    }

    for (const metadata of metadatas) {
      this.buildJunctions(metadata);
    }

    for (const metadata of metadatas) {
      if (metadata.primaryColumns.length === 0) {
        throw new MissingPrimaryColumnError(metadata.name);
      }

      this.buildIndices(metadata);
      this.buildUniques(metadata);
      this.buildForeignKeys(metadata);
      metadata.seal();
    }

    return metadatas;
  }

  private createEntityMetadata(target: ClassType): EntityMetadata {
    const [tableArgs] = this.storage.filterTables(target);

    if (!tableArgs) {
      throw new EntityMetadataNotFoundError(target);
    }

    const tree = this.storage.inheritanceTree(target);
    const metadata = new EntityMetadata({
      args: tableArgs,
      tableName: `${this.entityPrefix}${this.namingStrategy.tableName(target.name, tableArgs.name)}`,
    });

    metadata.columns = dedupeByProperty(this.storage.filterColumns(tree)).map(
      (args) =>
        new ColumnMetadata({
          entityMetadata: metadata,
          args,
          databaseName: this.namingStrategy.columnName(args.propertyName, args.options.name),
          generationStrategy: this.storage.findGenerated(tree, args.propertyName)?.strategy,
        }),
    );

    metadata.relations = dedupeByProperty(this.storage.filterRelations(tree)).map(
      (args) => new RelationMetadata({ entityMetadata: metadata, args }),
    );

    return metadata;
  }

  private resolveRelationTargets(metadata: EntityMetadata, metadatas: EntityMetadata[]): void {
    for (const relation of metadata.relations) {
      const resolved = typeof relation.typeThunk === "string" ? relation.typeThunk : relation.typeThunk();
      const inverse =
        typeof resolved === "string"
          ? metadatas.find((candidate) => candidate.name === resolved || candidate.tableName === resolved)
          : metadatas.find((candidate) => candidate.target === resolved);

      if (!inverse) {
        throw new EntityMetadataNotFoundError(resolved);
      }

      relation.inverseEntityMetadata = inverse;

      if (typeof relation.inverseSideProperty === "string") {
        relation.inverseSidePropertyPath = relation.inverseSideProperty;
      } else if (typeof relation.inverseSideProperty === "function") {
        relation.inverseSidePropertyPath = String(relation.inverseSideProperty(inverse.createPropertiesMap()));
      }
    }
  }

  private resolveInverseRelations(metadata: EntityMetadata): void {
    const tree = this.storage.inheritanceTree(metadata.target);

    for (const relation of metadata.relations) {
      const inverse = relation.inverseEntityMetadata;

      relation.inverseRelation = relation.inverseSidePropertyPath
        ? inverse.findRelationWithPropertyPath(relation.inverseSidePropertyPath)
        : inverse.relations.find(
            (candidate) =>
              candidate.inverseSidePropertyPath === relation.propertyName &&
              candidate.inverseEntityMetadata === metadata,
          );

      if (relation.inverseSidePropertyPath && !relation.inverseRelation) {
        throw new RelationNotFoundError(relation.inverseSidePropertyPath, inverse.name);
      }

      const hasJoinColumn = this.storage.filterJoinColumns(tree, relation.propertyName).length > 0;
      const hasJoinTable = this.storage.findJoinTable(tree, relation.propertyName) !== undefined;

      relation.isOwning =
        relation.isManyToOne || (relation.isOneToOne && hasJoinColumn) || (relation.isManyToMany && hasJoinTable);

      if (relation.isOneToMany && (!relation.inverseRelation || !relation.inverseRelation.isManyToOne)) {
        throw new RelationNotFoundError(
          `${relation.propertyName} (a one-to-many needs the inverse many-to-one on ${inverse.name})`,
          metadata.name,
        );
      }
    }
  }

  private buildJoinColumns(metadata: EntityMetadata): void {
    const tree = this.storage.inheritanceTree(metadata.target);

    for (const relation of metadata.ownerRelations) {
      const inverse = relation.inverseEntityMetadata;
      const joinColumnArgs = this.storage.filterJoinColumns(tree, relation.propertyName);
      const specs: JoinColumnOptionsType[] =
        joinColumnArgs.length > 0 ? joinColumnArgs : inverse.primaryColumns.map(() => ({}));

      relation.joinColumns = specs.map((spec, index) => {
        const referencedColumn = spec.referencedColumnName
          ? this.findColumn(inverse, spec.referencedColumnName)
          : inverse.primaryColumns[index];

        if (!referencedColumn) {
          throw new EntityPropertyNotFoundError(spec.referencedColumnName ?? `primary column #${index}`, inverse.name);
        }

        const databaseName =
          spec.name ?? this.namingStrategy.joinColumnName(relation.propertyName, referencedColumn.propertyName);
        const existing = metadata.findColumnWithDatabaseName(databaseName);
        const column =
          existing ??
          new ColumnMetadata({
            entityMetadata: metadata,
            args: {
              target: relation.target,
              propertyName: relation.propertyName,
              mode: "regular",
              options: {
                name: databaseName,
                type: referencedColumn.type,
                nullable: relation.isNullable,
                ...(referencedColumn.length !== undefined && { length: referencedColumn.length }),
                ...(referencedColumn.precision !== undefined && { precision: referencedColumn.precision }),
                ...(referencedColumn.scale !== undefined && { scale: referencedColumn.scale }),
              },
            },
            databaseName,
            isVirtual: true,
          });

        column.relationMetadata = relation;
        column.referencedColumn = referencedColumn;

        if (!existing) {
          metadata.columns.push(column);
        }

        return column;
      });
    }
  }

  private buildJunctions(metadata: EntityMetadata): void {
    const tree = this.storage.inheritanceTree(metadata.target);

    for (const relation of metadata.manyToManyOwnerRelations) {
      const args = this.storage.findJoinTable(tree, relation.propertyName);
      const inverse = relation.inverseEntityMetadata;
      const tableName =
        args?.name ??
        this.namingStrategy.joinTableName(
          metadata.tableName,
          inverse.tableName,
          relation.propertyName,
          relation.inverseSidePropertyPath,
        );

      const joinColumns = this.buildJunctionColumns(metadata, args?.joinColumns, (column) =>
        this.namingStrategy.joinTableColumnName(metadata.tableName, column.propertyName, column.databaseName),
      );
      const inverseJoinColumns = this.buildJunctionColumns(inverse, args?.inverseJoinColumns, (column) => {
        const name = this.namingStrategy.joinTableInverseColumnName(
          inverse.tableName,
          column.propertyName,
          column.databaseName,
        );

        // A self-referencing relation would name both sides identically.
        return joinColumns.some((joinColumn) => joinColumn.databaseName === name) ? `${name}_1` : name;
      });

      const junction: JunctionMetadataType = {
        tableName: `${this.entityPrefix}${tableName}`,
        schema: args?.schema ?? metadata.schema,
        joinColumns,
        inverseJoinColumns,
      };

      relation.junction = junction;

      if (relation.inverseRelation) {
        relation.inverseRelation.junction = {
          tableName: junction.tableName,
          schema: junction.schema,
          joinColumns: inverseJoinColumns,
          inverseJoinColumns: joinColumns,
        };
      }
    }

    for (const relation of metadata.relations) {
      if (relation.isManyToMany && !relation.junction && !relation.inverseRelation?.isOwning) {
        throw new RelationNotFoundError(
          `${relation.propertyName} (a many-to-many needs @JoinTable() on one side)`,
          metadata.name,
        );
      }
    }
  }

  private buildJunctionColumns(
    metadata: EntityMetadata,
    specs: JoinColumnOptionsType[] | undefined,
    defaultName: (referencedColumn: ColumnMetadata) => string,
  ): JunctionColumnType[] {
    const list: JoinColumnOptionsType[] =
      specs && specs.length > 0 ? specs : metadata.primaryColumns.map((): JoinColumnOptionsType => ({}));

    return list.map((spec, index) => {
      const referencedColumn = spec.referencedColumnName
        ? this.findColumn(metadata, spec.referencedColumnName)
        : metadata.primaryColumns[index];

      if (!referencedColumn) {
        throw new EntityPropertyNotFoundError(spec.referencedColumnName ?? `primary column #${index}`, metadata.name);
      }

      return { databaseName: spec.name ?? defaultName(referencedColumn), referencedColumn };
    });
  }

  private buildIndices(metadata: EntityMetadata): void {
    const tree = this.storage.inheritanceTree(metadata.target);

    metadata.indices = this.storage.filterIndices(tree).map((args) => {
      const columns = this.resolveColumns(metadata, args.columns);

      return {
        name:
          args.name ??
          this.namingStrategy.indexName(
            metadata.tableName,
            columns.map((column) => column.databaseName),
            args.where,
          ),
        columns,
        isUnique: args.unique === true,
        where: args.where,
        synchronize: args.synchronize !== false,
      };
    });
  }

  private buildUniques(metadata: EntityMetadata): void {
    const tree = this.storage.inheritanceTree(metadata.target);
    const uniques = this.storage.filterUniques(tree).map((args) => {
      const columns = this.resolveColumns(metadata, args.columns);

      return {
        name:
          args.name ??
          this.namingStrategy.uniqueConstraintName(
            metadata.tableName,
            columns.map((column) => column.databaseName),
          ),
        columns,
      };
    });

    const singleColumns = [
      ...metadata.columns.filter((column) => column.isUnique && !column.isPrimary).map((column) => [column]),
      ...metadata.relations.filter((relation) => relation.isOneToOneOwner).map((relation) => relation.joinColumns),
    ];

    for (const columns of singleColumns) {
      const names = columns.map((column) => column.databaseName);

      if (!uniques.some((unique) => unique.columns.map((column) => column.databaseName).join() === names.join())) {
        uniques.push({ name: this.namingStrategy.uniqueConstraintName(metadata.tableName, names), columns });
      }
    }

    metadata.uniques = uniques;
  }

  private buildForeignKeys(metadata: EntityMetadata): void {
    const tree = this.storage.inheritanceTree(metadata.target);

    metadata.foreignKeys = metadata.ownerRelations
      .filter((relation) => relation.createForeignKeyConstraints)
      .map((relation) => {
        const [joinColumnArgs] = this.storage.filterJoinColumns(tree, relation.propertyName);
        const referencedColumns = relation.joinColumns.map((column) => column.referencedColumn as ColumnMetadata);

        return {
          name:
            joinColumnArgs?.foreignKeyConstraintName ??
            this.namingStrategy.foreignKeyName(
              metadata.tableName,
              relation.joinColumns.map((column) => column.databaseName),
              relation.inverseEntityMetadata.tablePath,
              referencedColumns.map((column) => column.databaseName),
            ),
          columns: relation.joinColumns,
          referencedEntityMetadata: relation.inverseEntityMetadata,
          referencedColumns,
          onDelete: relation.onDelete,
          onUpdate: relation.onUpdate,
        };
      });
  }

  /** A column by property name, falling back to its database name. */
  private findColumn(metadata: EntityMetadata, name: string): ColumnMetadata | undefined {
    return metadata.findColumnWithPropertyName(name) ?? metadata.findColumnWithDatabaseName(name);
  }

  private resolveColumns(metadata: EntityMetadata, selector: ColumnSelectorType | undefined): ColumnMetadata[] {
    const selected = typeof selector === "function" ? selector(metadata.createPropertiesMap()) : (selector ?? []);
    // A selector may return the property names (`(user) => [user.email]`) or an object keyed by them.
    const names = Array.isArray(selected) ? selected.map(String) : Object.keys(selected);

    return names.flatMap((name) => {
      const column = this.findColumn(metadata, name);

      if (column) {
        return [column];
      }

      const joinColumns = metadata.findJoinColumnsForRelation(name);

      if (joinColumns.length === 0) {
        throw new EntityPropertyNotFoundError(name, metadata.name);
      }

      return joinColumns;
    });
  }
}
