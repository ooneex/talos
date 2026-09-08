import type { DataSource } from "./orm/DataSource";
import type { EntityManager } from "./orm/EntityManager";
import type { Repository } from "./orm/Repository";
import type { DataSourceOptionsType, EntityTargetType, ISqlDatabase, ObjectLiteralType } from "./types";

/**
 * A lazily initialised SQL data source behind the `IDatabase` contract.
 *
 * Subclasses build the `DataSource` in `getSource()`; the first `open()` connects it.
 *
 * @example
 * @decorator.database()
 * export class MainDatabase extends SqlDatabase {
 *   public constructor(@inject(AppEnv) private readonly env: AppEnv) {
 *     super();
 *   }
 *
 *   public getSource(): DataSource {
 *     this.source ??= new DataSource({ type: "postgres", url: this.env.DATABASE_URL, entities: [UserEntity] });
 *
 *     return this.source;
 *   }
 * }
 */
export abstract class SqlDatabase<Options extends DataSourceOptionsType = DataSourceOptionsType>
  implements ISqlDatabase
{
  protected source: DataSource<Options> | undefined;

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
}
