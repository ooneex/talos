# @talosjs/database

Database layer with a decorator-based ORM for PostgreSQL, MySQL, SQLite, Turso, Cloudflare and ClickHouse, plus Redis and MongoDB drivers. PostgreSQL, MySQL and SQLite use Bun's native `SQL` client; Turso uses `@libsql/client`, Cloudflare uses the Worker binding, ClickHouse uses `@clickhouse/client`, and MongoDB uses the official `mongodb` client.

## Installation

```bash
bun add @talosjs/database
```

## Quick start

```typescript
import {
  Column,
  DataSource,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type RelationType,
} from "@talosjs/database";

@Entity("users")
class User {
  @PrimaryGeneratedColumn("uuid")
  public id?: string;

  @Column({ type: "varchar", length: 120, unique: true })
  public email = "";

  @OneToMany(() => Post, (post) => post.author, { cascade: true })
  public posts?: Post[];
}

@Entity("posts")
class Post {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "varchar" })
  public title = "";

  @ManyToOne(() => User, (user) => user.posts, { onDelete: "CASCADE" })
  public author?: RelationType<User> | null;
}

const dataSource = new DataSource({
  type: "postgres",
  url: "postgres://app:secret@localhost:5432/app",
  entities: [User, Post],
  synchronize: true,
});

await dataSource.initialize();

const users = dataSource.getRepository(User);
const alice = await users.save(users.create({ email: "alice@example.com", posts: [{ title: "Hello" }] }));

const found = await users.findOne({ where: { email: "alice@example.com" }, relations: { posts: true } });

const popular = await dataSource
  .createQueryBuilder(Post, "post")
  .leftJoinAndSelect("post.author", "author")
  .where("post.title ILIKE :term", { term: "%hello%" })
  .orderBy("post.id", "DESC")
  .take(10)
  .getMany();

await dataSource.transaction(async (manager) => {
  await manager.increment(Post, { id: 1 }, "views", 1);
  await manager.softRemove(alice);
});
```

## What is in the box

| Area | Surface |
|---|---|
| Entities | `@Entity`, `@Column`, `@PrimaryColumn`, `@PrimaryGeneratedColumn` (`increment`, `uuid`, `rowid`, `identity`), `@CreateDateColumn`, `@UpdateDateColumn`, `@DeleteDateColumn`, `@VersionColumn`, `@Index`, `@Unique`, entity inheritance |
| Relations | `@OneToOne`, `@OneToMany`, `@ManyToOne`, `@ManyToMany` with `@JoinColumn` / `@JoinTable`, eager loading, cascades (`insert`, `update`, `remove`, `soft-remove`, `recover`), `orphanedRowAction`, `onDelete` / `onUpdate` |
| Connection | `DataSource` owns the selected native driver client: `initialize`, `destroy`, `dropDatabase`, `query`; relational drivers also provide `synchronize`, `transaction`, repositories and query builders; bring your own client through `options.client` |
| Manager & repository | `create`, `merge`, `preload`, `save`, `remove`, `softRemove`, `recover`, `insert`, `update`, `upsert`, `delete`, `softDelete`, `restore`, `clear`, `increment`, `decrement`, `find*`, `count*`, `exists*`, `sum`, `average`, `minimum`, `maximum`, `Repository.extend` |
| Find options | `where` (objects, arrays, nested relations), `select`, `relations`, `order`, `skip` / `take`, `withDeleted`, `loadEagerRelations`; operators `Equal`, `Not`, `In`, `Like`, `ILike`, `Between`, `MoreThan`, `LessThan`, `IsNull`, `Raw`, `And`, `Or`, `Any`, `ArrayContains`, `JsonContains`, … |
| Query builders | `SelectQueryBuilder` (joins, `Brackets`, group / having, pagination, locking, `getRawMany`, `getManyAndCount`, streaming-free hydration), `InsertQueryBuilder` (`orUpdate`, `orIgnore`, `returning`), `UpdateQueryBuilder`, `DeleteQueryBuilder`, `SoftDeleteQueryBuilder`, `RelationQueryBuilder` (`of().add()/remove()/set()/loadMany()`) |
| Transactions | callback transactions with isolation levels, nested savepoints, `QueryRunner` for manual control; SQLite transactions are serialised on the single connection |
| Schema | `SchemaBuilder` creates tables, foreign keys, unique constraints and indexes in dependency order (`synchronize: true`); `dropSchema` for test databases |
| Naming | `DefaultNamingStrategy` (TypeORM-compatible hashed constraint names), `SnakeNamingStrategy`, custom `INamingStrategy` |
| Errors | `QueryFailedError`, `EntityNotFoundError`, `EntityMetadataNotFoundError`, `TransactionNotStartedError`, … all extend `DatabaseException` |
| Key-value | `RedisDriver` on Bun's native `RedisClient`; compatible with Redis, Valkey and Dragonfly RESP servers |
| Documents | `MongoDriver` on the official `MongoClient`; native commands and direct typed client access |

### Drivers

| `type` | Backed by | Notes |
|---|---|---|
| `postgres` | Bun `SQL` (PostgreSQL adapter) | `RETURNING`, `ILIKE`, arrays, `jsonb`, schemas, `gen_random_uuid()` |
| `mysql` | Bun `SQL` (MySQL adapter) | `ON DUPLICATE KEY UPDATE`, `LAST_INSERT_ID()` reloads, backtick quoting |
| `sqlite` | Bun `SQL` (SQLite adapter) | file or `:memory:`, foreign keys on by default, WAL and busy timeout options |
| `turso` | [`@libsql/client`](https://docs.turso.tech/sdk/ts/reference) | Remote Turso, local files and embedded replicas with the SQLite ORM dialect |
| `cloudflare` | `CloudflareDriver` with a Worker database binding | SQLite dialect, prepared statements, schema synchronization and repositories |
| `clickhouse` | [`@clickhouse/client`](https://clickhouse.com/docs/integrations/language-clients/js) | HTTP(S), `JSONEachRow`, typed query parameters, `MergeTree` synchronization |
| `redis` | Bun `RedisClient` | Native commands, TLS, reconnects and auto-pipelining; also speaks to Valkey and Dragonfly |
| `mongodb` | [`mongodb`](https://www.mongodb.com/docs/drivers/node/current/) | Native database commands, collection management and typed `MongoClient` access |

### Redis

Redis participates in the same `DataSource` driver lifecycle as the SQL databases. The initialized `client` is Bun's native `RedisClient`, with its fully typed command API, connection management, TLS, reconnect, offline queue and automatic pipelining controls.

```typescript
import { DataSource } from "@talosjs/database";

const redis = new DataSource({
  type: "redis",
  url: "redis://username:password@localhost:6379",
  connectionTimeout: 5_000,
  enableAutoPipelining: true,
});

await redis.initialize();
await redis.client.set("greeting", "Hello from Bun!");
const greeting = await redis.client.get("greeting");

await redis.destroy();
```

When the URL is omitted, Bun reads `REDIS_URL`, then `VALKEY_URL`, and otherwise connects to its localhost default. Dragonfly uses the same RESP protocol, so it does not need a separate driver. `DataSource.query()` accepts a Redis command name and argument array for untyped or unsupported commands; use `DataSource.client` for Bun's typed methods. Relational entities, schema synchronization, repositories and transactions are not supported by the Redis driver.

### MongoDB

MongoDB participates in the same `DataSource` lifecycle through the official Node.js driver. Use the typed client for collection operations, or `DataSource.query()` for native database commands. The first query argument is the command name; the parameter array contains the command value followed by an optional options document.

```typescript
const documents = new DataSource({
  type: "mongodb",
  url: "mongodb://localhost:27017/app",
  database: "app",
  poolSize: 10,
});

await documents.initialize();
await documents.client.db("app").collection("events").insertOne({ type: "created" });

const [{ ok }] = await documents.query<{ ok: number }>("ping");
const users = await documents.query("find", ["users", { filter: { active: true } }]);

await documents.destroy();
```

The URL defaults to `mongodb://127.0.0.1:27017`. `poolSize` maps to `maxPoolSize`, `connectTimeoutMS` is forwarded, and remaining official client settings go in `extra`. `dropDatabase()` enumerates and drops collections. SQL repositories, schema synchronization and the SQL transaction API are not supported by the MongoDB driver; use the native client for document CRUD, indexes and sessions.

### Turso

Turso uses the production-ready `@libsql/client` integration recommended for ORMs. It shares the SQLite dialect, so entities, repositories, query builders and schema synchronization work with remote Turso databases, local files and in-memory databases.

```typescript
const turso = new DataSource({
  type: "turso",
  url: "libsql://app-organization.turso.io",
  authToken: process.env.TURSO_AUTH_TOKEN,
  entities: [User],
  synchronize: false,
});

await turso.initialize();
const users = await turso.getRepository(User).find();
await turso.destroy();
```

`syncUrl`, `syncInterval`, `concurrency`, `timeout` and `intMode` map directly to the libSQL client; remaining settings go in `extra`. Talos callback and `QueryRunner` transactions are rejected because they require one reserved Bun SQL connection. Use `turso.client.batch()` or `turso.client.transaction()` when atomic Turso operations are needed.

### Cloudflare

Pass the Cloudflare binding from the Worker's environment into `DataSource`. The driver uses Cloudflare prepared statements and SQLite SQL semantics, including numbered `?1`, `?2`, … placeholders generated by the ORM.

```typescript
import { DataSource, type ICloudflareDatabase } from "@talosjs/database";

export default {
  async fetch(_request: Request, env: { DB: ICloudflareDatabase }): Promise<Response> {
    const database = new DataSource({
      type: "cloudflare",
      client: env.DB,
      entities: [User],
      synchronize: false,
    });

    await database.initialize();
    const users = await database.getRepository(User).find();
    await database.destroy();

    return Response.json(users);
  },
};
```

The Worker runtime owns the binding, so `destroy()` does not close it. Cloudflare does not support connection-scoped `BEGIN` / `COMMIT` calls through separate binding invocations; callback transactions and manual `QueryRunner` transactions therefore fail explicitly, while normal repository writes run without an automatic transaction. Use Cloudflare's `batch()` API directly when a group of statements must execute sequentially and atomically.

### ClickHouse

Pass the HTTP(S) endpoint and credentials to `DataSource`. Initialization uses an authenticated `SELECT 1` ping, and `destroy()` closes the official client when the data source created it.

```typescript
const analytics = new DataSource({
  type: "clickhouse",
  url: "https://cluster.example:8443",
  username: "default",
  password: "secret",
  database: "analytics",
  entities: [Event],
});

await analytics.initialize();

const recent = await analytics.query<{ id: string; occurred_at: string }>(
  "SELECT id, occurred_at FROM events WHERE occurred_at >= $1 ORDER BY occurred_at DESC LIMIT $2",
  ["2026-01-01 00:00:00", 100],
);
```

The driver translates positional `$1` placeholders into ClickHouse typed query parameters. `SELECT`, `SHOW`, `DESCRIBE` and `EXPLAIN` statements use `JSONEachRow`; other statements use `command()`. ORM updates and deletes run as synchronous `ALTER TABLE ... UPDATE/DELETE` mutations.

With `synchronize: true`, tables use `MergeTree` and order by the entity's primary columns. ClickHouse does not enforce the ORM's foreign keys, unique constraints or regular relational indexes, so synchronization omits them. Transactions and upserts are rejected explicitly. Use UUID generated primary columns when the database should create IDs; ClickHouse has no auto-increment equivalent.

Connection controls map as follows: `poolSize` to `max_open_connections`, `requestTimeoutMS` to `request_timeout`, and `clickhouseSettings` to `clickhouse_settings`. `compression` is passed through directly. Any other official client option can be supplied in `extra`.

### The Bun `SQL` client

The PostgreSQL, MySQL and SQLite drivers adapt [Bun's built-in `SQL` client](https://bun.com/docs/runtime/sql): the data source calls `new SQL({ adapter })`, runs statements through `sql.unsafe(text, parameters)`, reserves a pooled connection with `sql.reserve()` for each transaction (SQLite serialises them on its single connection) and closes the pool with `sql.close()` on `destroy()`. The pool is yours to use directly:

```typescript
const sql = dataSource.client; // Bun.SQL, available once initialize() ran

const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM ${sql("users")} WHERE age > ${18}`;

await sql.begin(async (tx) => {
  await tx`UPDATE accounts SET balance = balance - ${100} WHERE id = ${1}`;
});
```

Pass an existing native client through `options.client` when it is shared with other code; the data source then neither opens nor closes it. For Bun SQL drivers, pool size, timeouts, TLS, `prepare` and `bigint` map onto the Bun options (`poolSize`, `connectTimeoutMS`, `ssl`, `prepare`, `bigint`); anything else goes through `extra`. `QueryFailedError` keeps the native driver error in `driverError` and exposes `code` and `sqlState` when the adapter reports them.

### Coming from TypeORM

The decorators, `DataSource`, `EntityManager`, `Repository`, find options and query-builder APIs follow TypeORM's names, so most call sites port unchanged. Differences worth knowing:

- Column types must be declared (`@Column({ type: "varchar" })`); nothing is inferred from `reflect-metadata`.
- To-one relation properties that reference a class declared later in the file (or in a circular import) should be typed with `RelationType<T>` so `emitDecoratorMetadata` does not evaluate the class too early.
- `synchronize` only creates what is missing — it never alters or drops existing tables. Use migrations for that.
- `save()` returns the objects it was given, with generated columns filled in; plain objects stay plain unless created through `create()`.
- Type aliases end with `Type` and interfaces start with `I` (`DataSourceOptionsType`, `FindManyOptionsType`, `INamingStrategy`).

## Documentation

Read the full documentation at [docs.talosjs.com/components/database](https://docs.talosjs.com/components/database).

## License

MIT
