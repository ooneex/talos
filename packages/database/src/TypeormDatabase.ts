import type { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from "typeorm";
import type { ITypeormDatabase } from "./types";

export abstract class TypeormDatabase implements ITypeormDatabase {
  protected source: DataSource;
  public abstract getSource(database?: string): DataSource;

  public async open<Entity extends ObjectLiteral>(
    entity: EntityTarget<Entity>,
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
