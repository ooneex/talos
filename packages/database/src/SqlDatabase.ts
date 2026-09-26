import type { DataSource } from "./orm/DataSource";
import type { EntityManager } from "./orm/EntityManager";
import type { Repository } from "./orm/Repository";
import type { DataSourceOptionsType, EntityTargetType, ISqlDatabase, ObjectLiteralType } from "./types";

const ENTITIES_PREFIX = "@talosjs/database:entities:";
const SOURCE_PREFIX = "@talosjs/database:source:";

type ProcessSourceType = {
  identity: string;
  source: DataSource<DataSourceOptionsType>;
};

/**
 * One entity registry and one data source per database class, stored on `globalThis` under the class
 * name. A bundled copy of the package and the source loaded beside it still share them.
 */
const entitiesSymbol = (name: string): symbol => Symbol.for(`${ENTITIES_PREFIX}${name}`);

const sourceSymbol = (name: string): symbol => Symbol.for(`${SOURCE_PREFIX}${name}`);

const entityRegistry = (name: string): Set<EntityTargetType> => {
  const scope = globalThis as Record<symbol, Set<EntityTargetType> | undefined>;
  const key = entitiesSymbol(name);
  const existing = scope[key];

  if (existing) {
    return existing;
  }

  const created = new Set<EntityTargetType>();
  scope[key] = created;

  return created;
};

const readProcessSource = (name: string): ProcessSourceType | undefined => {
  return (globalThis as Record<symbol, ProcessSourceType | undefined>)[sourceSymbol(name)];
};

const writeProcessSource = (name: string, value: ProcessSourceType): void => {
  (globalThis as Record<symbol, ProcessSourceType | undefined>)[sourceSymbol(name)] = value;
};

/**
 * A lazily initialised SQL data source behind the `IDatabase` contract.
 *
 * Subclasses build the `DataSource` in `getSource()`. `registerEntities()` collects the entity
 * classes a module persists, and `sharedSource()` reuses one process-wide source for a connection
 * identity. The database never imports those modules.
 *
 * @example
 * @decorator.database()
 * export class MainDatabase extends SqlDatabase {
 *   public constructor(@inject(AppEnv) private readonly env: AppEnv) {
 *     super();
 *   }
 *
 *   public getSource(): DataSource {
 *     const url = this.env.DATABASE_URL ?? "";
 *
 *     return this.sharedSource(url, () => {
 *       return new DataSource({ type: "postgres", url, entities: this.registeredEntities() });
 *     });
 *   }
 * }
 *
 * MainDatabase.registerEntities(UserEntity);
 */
export abstract class SqlDatabase<Options extends DataSourceOptionsType = DataSourceOptionsType>
  implements ISqlDatabase
{
  protected source: DataSource<Options> | undefined;

  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor is needed for Bun function coverage
  public constructor() {}

  /**
   * Declares the entities this database persists.
   *
   * Modules call this on the concrete class so the source can map them without the database
   * importing the modules — every dependency points from the module to the database. Repeated
   * classes are stored once. Register before the source is created; an open source keeps the
   * entities it was built with.
   */
  public static registerEntities(...entities: EntityTargetType[]): void {
    // biome-ignore lint/complexity/noThisInStatic: the receiver is the subclass that owns the registry
    const registry = entityRegistry(this.name);

    for (const entity of entities) {
      registry.add(entity);
    }
  }

  public abstract getSource(database?: string): DataSource<Options>;

  /** The repository of `entity`, connecting the data source first when needed. */
  public async open<Entity extends ObjectLiteralType>(
    entity: EntityTargetType<Entity>,
    database?: string,
  ): Promise<Repository<Entity>> {
    const source = this.getSource(database);

    if (!source.isInitialized) {
      await source.initialize();
    }

    return source.getRepository(entity);
  }

  public async close(database?: string): Promise<void> {
    const source = this.getSource(database);

    if (source.isInitialized) {
      await source.destroy();
    }
  }

  public async drop(database?: string): Promise<void> {
    const source = this.getSource(database);

    if (source.isInitialized) {
      await source.dropDatabase();
    }
  }

  public getEntityManager(database?: string): EntityManager {
    return this.getSource(database).manager;
  }

  /** The entities declared with `registerEntities()` for this database class. */
  protected registeredEntities(): EntityTargetType[] {
    return [...entityRegistry(this.constructor.name)];
  }

  /**
   * The process-wide data source for `identity`.
   *
   * The first call runs `create` and keeps that source for every instance of this class. A later
   * call with the same identity reuses it. A different identity replaces it, and closes the previous
   * source when that source is already connected.
   */
  protected sharedSource(identity: string, create: () => DataSource<Options>): DataSource<Options> {
    if (this.source) {
      return this.source;
    }

    const cached = readProcessSource(this.constructor.name);

    if (cached?.identity === identity) {
      this.source = cached.source as DataSource<Options>;

      return this.source;
    }

    if (cached?.source.isInitialized) {
      void cached.source.destroy();
    }

    this.source = create();
    writeProcessSource(this.constructor.name, { identity, source: this.source });

    return this.source;
  }
}
