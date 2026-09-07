import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { DatabaseException } from "./DatabaseException";
import { decorator } from "./decorators";
import { DataSource } from "./orm/DataSource";
import { SqlDatabase } from "./SqlDatabase";

/**
 * A PostgreSQL data source configured from `DATABASE_URL`, managing every decorated entity.
 *
 * @example
 * const database = container.get(PostgresDatabase);
 * const users = await database.open(UserEntity);
 */
@decorator.database()
export class PostgresDatabase extends SqlDatabase {
  public constructor(@inject(AppEnv) private readonly env: AppEnv = new AppEnv()) {
    super();
  }

  public getSource(_database?: string): DataSource {
    if (this.source) {
      return this.source;
    }

    const url = this.env.DATABASE_URL;

    if (!url) {
      throw new DatabaseException(
        "Database URL is required. Please provide a URL either through the constructor options or set the DATABASE_URL environment variable.",
        "CONNECTION_FAILED",
      );
    }

    this.source = new DataSource({
      type: "postgres",
      url,
      synchronize: false,
      poolSize: 10,
    });

    return this.source;
  }
}
