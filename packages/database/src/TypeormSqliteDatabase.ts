import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { DataSource } from "typeorm";
import { DatabaseException } from "./DatabaseException";
import { TypeormDatabase } from "./TypeormDatabase";

export class TypeormSqliteDatabase extends TypeormDatabase {
  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    super();
  }

  public getSource(database?: string): DataSource {
    database = database || this.env.SQLITE_DATABASE_PATH;

    if (!database) {
      throw new DatabaseException(
        "SQLite database path is required. Please provide a database path either through the constructor options or set the SQLITE_DATABASE_PATH environment variable.",
        "CONNECTION_FAILED",
      );
    }

    if (!this.source) {
      this.source = new DataSource({
        synchronize: false,
        entities: [
          // Load your entities here
        ],
        enableWAL: true,
        timeout: 30_000,
        database,
        type: "better-sqlite3",
      });
    }

    return this.source;
  }
}
