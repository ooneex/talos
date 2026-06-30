import { DataSource } from "typeorm";
import { DatabaseException } from "./DatabaseException";
import { decorator } from "./decorators";
import { TypeormDatabase } from "./TypeormDatabase";

@decorator.database()
export class TypeormPgDatabase extends TypeormDatabase {
  public getSource(_database?: string): DataSource {
    const url = "";

    if (!url) {
      throw new DatabaseException(
        "Database URL is required. Please provide a URL either through the constructor options or set the DATABASE_URL environment variable.",
        "CONNECTION_FAILED",
      );
    }

    this.source = new DataSource({
      synchronize: false,
      entities: [
        // Load your entities here
      ],
      extra: {
        max: 10,
        // idleTimeoutMillis: 30000,
      },
      url,
      type: "postgres",
    });

    return this.source;
  }
}
