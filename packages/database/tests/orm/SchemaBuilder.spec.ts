import { describe, expect, test } from "bun:test";
import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "../../src";
import { ClickHouseDriver } from "../../src/orm/driver/ClickHouseDriver";
import { MysqlDriver } from "../../src/orm/driver/MysqlDriver";
import { PostgresDriver } from "../../src/orm/driver/PostgresDriver";
import { SqliteDriver } from "../../src/orm/driver/SqliteDriver";
import { EntityMetadataBuilder } from "../../src/orm/EntityMetadataBuilder";
import { getMetadataArgsStorage } from "../../src/orm/MetadataArgsStorage";
import { DefaultNamingStrategy, SnakeNamingStrategy } from "../../src/orm/NamingStrategy";
import { SchemaBuilder } from "../../src/orm/SchemaBuilder";
import { createSqliteDataSource } from "../fixtures/entities";
import { buildFixtureMetadatas } from "../fixtures/metadata";

@Entity("sb_settings", { synchronize: false })
class Setting {
  @PrimaryColumn({ type: "varchar" })
  public key = "";
}

@Entity("sb_flags")
class Flag {
  @PrimaryGeneratedColumn("uuid")
  public id?: string;

  @Column({ type: "enum", enum: ["on", "off", "it's"], default: "off" })
  public state = "off";

  @Column({ type: "simple-enum", enum: [1, 2] })
  public level = 1;

  @Column({ type: "integer", unsigned: true, comment: "it's a count" })
  public count = 0;

  @Column({ type: "varchar", nullable: true, default: null })
  public note?: string | null;
}

const naming = new DefaultNamingStrategy();

/** Hashed constraint names are replaced by their prefix so that the DDL can be compared as text. */
const anonymize = (statement: string | undefined): string | undefined =>
  statement?.replace(/(PK|FK|UQ|IDX)_[0-9a-f]{20,}/g, "$1_x");

const statementsFor = (
  driver: SqliteDriver | PostgresDriver | MysqlDriver | ClickHouseDriver,
  metadatas = buildFixtureMetadatas(),
): string[] =>
  new SchemaBuilder(driver, naming, metadatas).createStatements().map((statement) => anonymize(statement) ?? "");

describe("SchemaBuilder", () => {
  test("should create referenced tables first and junctions last, then the indexes", () => {
    const statements = statementsFor(new SqliteDriver({ type: "sqlite", database: ":memory:" }));
    const creates = statements.filter((statement) => statement.startsWith("CREATE TABLE"));
    const tableOrder = creates.map((statement) => statement.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/)?.[1]);

    expect(tableOrder).toEqual(["tags", "profiles", "users", "posts", "post_tags"]);
    expect(statements.slice(creates.length).every((statement) => statement.includes("INDEX"))).toBe(true);
  });

  test("should render the SQLite DDL for columns, constraints and foreign keys", () => {
    const statements = statementsFor(new SqliteDriver({ type: "sqlite", database: ":memory:" }));
    const users = statements.find((statement) => statement.includes('"users" ('));
    const posts = statements.find((statement) => statement.includes('"posts" ('));
    const junction = statements.find((statement) => statement.includes('"post_tags" ('));

    expect(users).toBe(
      `CREATE TABLE IF NOT EXISTS "users" ("id" varchar(20) NOT NULL, "name" varchar(100) NOT NULL, "is_active" boolean NULL DEFAULT 1, "age" integer NOT NULL DEFAULT 0, "settings" text NULL, "roles" text NULL, "secret" varchar NULL, "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, "deleted_at" datetime NULL, "version" integer NOT NULL DEFAULT 1, "profile_id" integer NULL, CONSTRAINT "PK_x" PRIMARY KEY ("id"), CONSTRAINT "UQ_users_name" UNIQUE ("name"), CONSTRAINT "UQ_x" UNIQUE ("profile_id"), CONSTRAINT "FK_x" FOREIGN KEY ("profile_id") REFERENCES "profiles" ("id"))`,
    );
    expect(posts).toBe(
      `CREATE TABLE IF NOT EXISTS "posts" ("id" integer PRIMARY KEY AUTOINCREMENT, "title" varchar NOT NULL, "views" integer NOT NULL DEFAULT 0, "author_id" varchar(20) NULL, CONSTRAINT "FK_x" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE)`,
    );
    expect(junction).toBe(
      `CREATE TABLE IF NOT EXISTS "post_tags" ("postsId" integer NOT NULL, "tagsId" integer NOT NULL, CONSTRAINT "PK_x" PRIMARY KEY ("postsId", "tagsId"), CONSTRAINT "FK_x" FOREIGN KEY ("postsId") REFERENCES "posts" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_x" FOREIGN KEY ("tagsId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
    );
  });

  test("should create the declared indexes, one per to-one foreign key and the junction indexes", () => {
    const statements = statementsFor(new SqliteDriver({ type: "sqlite", database: ":memory:" }));
    const indexes = statements.filter((statement) => statement.includes("INDEX"));

    expect(indexes).toEqual([
      `CREATE INDEX IF NOT EXISTS "IDX_x" ON "users" ("name", "age")`,
      `CREATE INDEX IF NOT EXISTS "IDX_x" ON "posts" ("author_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_x" ON "post_tags" ("postsId")`,
      `CREATE INDEX IF NOT EXISTS "IDX_x" ON "post_tags" ("tagsId")`,
    ]);
  });

  test("should render the PostgreSQL flavour with explicit primary keys, schema and serial ids", () => {
    const driver = new PostgresDriver({ type: "postgres", schema: "app" });
    const statements = statementsFor(driver);
    const posts = statements.find((statement) => statement.includes('"posts" ('));
    const users = statements.find((statement) => statement.includes('"users" ('));

    expect(posts).toBe(
      `CREATE TABLE IF NOT EXISTS "app"."posts" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "views" integer NOT NULL DEFAULT 0, "author_id" character varying(20) NULL, CONSTRAINT "PK_x" PRIMARY KEY ("id"), CONSTRAINT "FK_x" FOREIGN KEY ("author_id") REFERENCES "app"."users" ("id") ON DELETE CASCADE)`,
    );
    expect(users).toContain(`"is_active" boolean NULL DEFAULT true`);
    expect(users).toContain(`"created_at" timestamp without time zone NOT NULL DEFAULT now()`);
    expect(statements).toContain(`CREATE INDEX IF NOT EXISTS "IDX_x" ON "app"."users" ("name", "age")`);
  });

  test("should render the MySQL flavour without foreign key indexes or IF NOT EXISTS on indexes", () => {
    const statements = statementsFor(new MysqlDriver({ type: "mysql" }));
    const posts = statements.find((statement) => statement.includes("`posts` ("));
    const indexes = statements.filter((statement) => statement.includes("INDEX"));

    expect(posts).toBe(
      "CREATE TABLE IF NOT EXISTS `posts` (`id` int AUTO_INCREMENT NOT NULL, `title` varchar(255) NOT NULL, `views` int NOT NULL DEFAULT 0, `author_id` varchar(20) NULL, CONSTRAINT `PK_x` PRIMARY KEY (`id`), CONSTRAINT `FK_x` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE CASCADE)",
    );
    expect(indexes).toEqual(["CREATE INDEX `IDX_x` ON `users` (`name`, `age`)"]);
  });

  test("should render MergeTree tables without unsupported relational constraints or indexes", () => {
    const statements = statementsFor(new ClickHouseDriver({ type: "clickhouse" }));
    const users = statements.find((statement) => statement.includes('"users" ('));
    const posts = statements.find((statement) => statement.includes('"posts" ('));
    const junction = statements.find((statement) => statement.includes('"post_tags" ('));

    expect(statements.every((statement) => !statement.includes("CREATE INDEX"))).toBe(true);
    expect(users).toContain('"id" String');
    expect(users).toContain('"settings" Nullable(String)');
    expect(users).not.toContain("CONSTRAINT");
    expect(users).toEndWith('ENGINE = MergeTree ORDER BY ("id")');
    expect(posts).toContain('"id" Int32');
    expect(posts).toEndWith('ENGINE = MergeTree ORDER BY ("id")');
    expect(junction).toEndWith('ENGINE = MergeTree ORDER BY ("postsId", "tagsId")');
  });

  test("should skip entities that opted out of synchronize and add enum checks, comments and unsigned", () => {
    const metadatas = new EntityMetadataBuilder(getMetadataArgsStorage(), naming, "").build([Setting, Flag]);
    const sqlite = statementsFor(new SqliteDriver({ type: "sqlite", database: ":memory:" }), metadatas);
    const mysql = statementsFor(new MysqlDriver({ type: "mysql" }), metadatas);
    const postgres = statementsFor(new PostgresDriver({ type: "postgres" }), metadatas);

    expect(sqlite.some((statement) => statement.includes("sb_settings"))).toBe(false);
    expect(sqlite).toEqual([
      `CREATE TABLE IF NOT EXISTS "sb_flags" ("id" varchar(36) NOT NULL, "state" varchar NOT NULL DEFAULT 'off', "level" varchar NOT NULL, "count" integer NOT NULL, "note" varchar NULL DEFAULT NULL, CONSTRAINT "PK_x" PRIMARY KEY ("id"), CHECK ("state" IN ('on', 'off', 'it''s')), CHECK ("level" IN (1, 2)))`,
    ]);
    expect(postgres[0]).toContain(`"id" uuid DEFAULT gen_random_uuid() NOT NULL`);
    expect(mysql).toEqual([
      "CREATE TABLE IF NOT EXISTS `sb_flags` (`id` varchar(36) NOT NULL, `state` enum('on', 'off', 'it''s') NOT NULL DEFAULT 'off', `level` varchar(255) NOT NULL, `count` int UNSIGNED NOT NULL COMMENT 'it''s a count', `note` varchar(255) NULL DEFAULT NULL, CONSTRAINT `PK_x` PRIMARY KEY (`id`))",
    ]);
  });

  test("should name columns and constraints through the naming strategy", () => {
    const metadatas = buildFixtureMetadatas(new SnakeNamingStrategy());
    const statements = new SchemaBuilder(
      new SqliteDriver({ type: "sqlite", database: ":memory:" }),
      new SnakeNamingStrategy(),
      metadatas,
    ).createStatements();

    expect(
      statements.some((statement) => statement.includes(`"post_tags" ("posts_id" integer NOT NULL, "tags_id"`)),
    ).toBe(true);
  });

  test("synchronize should be idempotent and drop should remove every table", async () => {
    const dataSource = await createSqliteDataSource();
    const runner = dataSource.createQueryRunner();

    try {
      await dataSource.createSchemaBuilder().synchronize(runner);

      expect((await dataSource.driver.listTables(runner)).sort()).toEqual([
        "post_tags",
        "posts",
        "profiles",
        "tags",
        "users",
      ]);

      await dataSource.createSchemaBuilder().drop(runner);
      expect(await dataSource.driver.listTables(runner)).toEqual([]);

      await dataSource.createSchemaBuilder().drop(runner);
      expect(await dataSource.driver.listTables(runner)).toEqual([]);
    } finally {
      await runner.release();
      await dataSource.destroy();
    }
  });
});
