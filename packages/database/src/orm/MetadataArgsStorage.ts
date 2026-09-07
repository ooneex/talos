import type {
  ClassType,
  ColumnMetadataArgsType,
  GeneratedMetadataArgsType,
  IndexMetadataArgsType,
  JoinColumnMetadataArgsType,
  JoinTableMetadataArgsType,
  RelationMetadataArgsType,
  TableMetadataArgsType,
  UniqueMetadataArgsType,
} from "../types";

/**
 * Everything the decorators record, kept until a DataSource turns it into EntityMetadata.
 *
 * Args are stored per declaring class. `inheritanceTree()` lists a class with its ancestors so a
 * column declared on a base class is picked up by every entity extending it.
 */
export class MetadataArgsStorage {
  public readonly tables: TableMetadataArgsType[] = [];
  public readonly columns: ColumnMetadataArgsType[] = [];
  public readonly generations: GeneratedMetadataArgsType[] = [];
  public readonly relations: RelationMetadataArgsType[] = [];
  public readonly joinColumns: JoinColumnMetadataArgsType[] = [];
  public readonly joinTables: JoinTableMetadataArgsType[] = [];
  public readonly indices: IndexMetadataArgsType[] = [];
  public readonly uniques: UniqueMetadataArgsType[] = [];

  public filterTables(target: ClassType): TableMetadataArgsType[] {
    return this.tables.filter((table) => table.target === target);
  }

  public filterColumns(targets: ClassType[]): ColumnMetadataArgsType[] {
    return this.filterByTargets(this.columns, targets);
  }

  public findGenerated(targets: ClassType[], propertyName: string): GeneratedMetadataArgsType | undefined {
    return this.filterByTargets(this.generations, targets).find((generated) => generated.propertyName === propertyName);
  }

  public filterRelations(targets: ClassType[]): RelationMetadataArgsType[] {
    return this.filterByTargets(this.relations, targets);
  }

  public filterJoinColumns(targets: ClassType[], propertyName: string): JoinColumnMetadataArgsType[] {
    return this.filterByTargets(this.joinColumns, targets).filter(
      (joinColumn) => joinColumn.propertyName === propertyName,
    );
  }

  public findJoinTable(targets: ClassType[], propertyName: string): JoinTableMetadataArgsType | undefined {
    return this.filterByTargets(this.joinTables, targets).find((joinTable) => joinTable.propertyName === propertyName);
  }

  public filterIndices(targets: ClassType[]): IndexMetadataArgsType[] {
    return this.filterByTargets(this.indices, targets);
  }

  public filterUniques(targets: ClassType[]): UniqueMetadataArgsType[] {
    return this.filterByTargets(this.uniques, targets);
  }

  /** The class followed by its ancestors, closest first, stopping before `Object`. */
  public inheritanceTree(target: ClassType): ClassType[] {
    const tree: ClassType[] = [];
    let current: unknown = target;

    while (typeof current === "function" && current !== Function.prototype) {
      tree.push(current as ClassType);
      current = Object.getPrototypeOf(current);
    }

    return tree;
  }

  private filterByTargets<T extends { target: ClassType }>(items: T[], targets: ClassType[]): T[] {
    // Ancestors first so a subclass redefining a property overrides the parent's declaration.
    const ordered = [...targets].reverse();
    const byTarget = new Map<ClassType, T[]>();

    for (const item of items) {
      if (!targets.includes(item.target)) {
        continue;
      }

      const list = byTarget.get(item.target) ?? [];
      list.push(item);
      byTarget.set(item.target, list);
    }

    return ordered.flatMap((target) => byTarget.get(target) ?? []);
  }
}

const STORAGE_KEY = Symbol.for("@talosjs/database:metadata-args-storage");

type GlobalWithStorageType = typeof globalThis & { [STORAGE_KEY]?: MetadataArgsStorage };

/**
 * The single storage every decorator writes to. It lives on `globalThis` so that a bundled copy of the
 * package and the source loaded side by side (tests, dev servers) still see one registry.
 */
export const getMetadataArgsStorage = (): MetadataArgsStorage => {
  const scope = globalThis as GlobalWithStorageType;

  if (!scope[STORAGE_KEY]) {
    scope[STORAGE_KEY] = new MetadataArgsStorage();
  }

  return scope[STORAGE_KEY];
};
