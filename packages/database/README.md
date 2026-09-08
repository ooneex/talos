# @talosjs/database

Database layer on Bun's native `SQL` client — a decorator-based ORM (entities, relations, repositories, query builders, transactions, schema synchronization) for PostgreSQL, MySQL and SQLite, plus Redis and Dragonfly clients. No TypeORM, no native addons: the only runtime is Bun.

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
| Connection | `DataSource` over a Bun `SQL` pool: `initialize`, `destroy`, `synchronize`, `dropDatabase`, `query`, `transaction`, `getRepository`, `createQueryBuilder`, `createQueryRunner`; bring your own client through `options.client` |
| Manager & repository | `create`, `merge`, `preload`, `save`, `remove`, `softRemove`, `recover`, `insert`, `update`, `upsert`, `delete`, `softDelete`, `restore`, `clear`, `increment`, `decrement`, `find*`, `count*`, `exists*`, `sum`, `average`, `minimum`, `maximum`, `Repository.extend` |
| Find options | `where` (objects, arrays, nested relations), `select`, `relations`, `order`, `skip` / `take`, `withDeleted`, `loadEagerRelations`; operators `Equal`, `Not`, `In`, `Like`, `ILike`, `Between`, `MoreThan`, `LessThan`, `IsNull`, `Raw`, `And`, `Or`, `Any`, `ArrayContains`, `JsonContains`, … |
| Query builders | `SelectQueryBuilder` (joins, `Brackets`, group / having, pagination, locking, `getRawMany`, `getManyAndCount`, streaming-free hydration), `InsertQueryBuilder` (`orUpdate`, `orIgnore`, `returning`), `UpdateQueryBuilder`, `DeleteQueryBuilder`, `SoftDeleteQueryBuilder`, `RelationQueryBuilder` (`of().add()/remove()/set()/loadMany()`) |
| Transactions | callback transactions with isolation levels, nested savepoints, `QueryRunner` for manual control; SQLite transactions are serialised on the single connection |
| Schema | `SchemaBuilder` creates tables, foreign keys, unique constraints and indexes in dependency order (`synchronize: true`); `dropSchema` for test databases |
| Naming | `DefaultNamingStrategy` (TypeORM-compatible hashed constraint names), `SnakeNamingStrategy`, custom `INamingStrategy` |
| Errors | `QueryFailedError`, `EntityNotFoundError`, `EntityMetadataNotFoundError`, `TransactionNotStartedError`, … all extend `DatabaseException` |
| Key-value | `RedisDatabase`, `DragonflyDatabase` and `AbstractRedisDatabase` on `bun`'s `RedisClient` |

### Drivers

| `type` | Backed by | Notes |
|---|---|---|
| `postgres` | Bun `SQL` (PostgreSQL adapter) | `RETURNING`, `ILIKE`, arrays, `jsonb`, schemas, `gen_random_uuid()` |
| `mysql` | Bun `SQL` (MySQL adapter) | `ON DUPLICATE KEY UPDATE`, `LAST_INSERT_ID()` reloads, backtick quoting |
| `sqlite` | Bun `SQL` (SQLite adapter) | file or `:memory:`, foreign keys on by default, WAL and busy timeout options |

### The Bun `SQL` client

Every driver is an adapter of [Bun's built-in `SQL` client](https://bun.com/docs/runtime/sql): the data source calls `new SQL({ adapter })`, runs statements through `sql.unsafe(text, parameters)`, reserves a pooled connection with `sql.reserve()` for each transaction (SQLite serialises them on its single connection) and closes the pool with `sql.close()` on `destroy()`. The pool is yours to use directly:

```typescript
const sql = dataSource.client; // Bun.SQL, available once initialize() ran

const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM ${sql("users")} WHERE age > ${18}`;

await sql.begin(async (tx) => {
  await tx`UPDATE accounts SET balance = balance - ${100} WHERE id = ${1}`;
});
```

Pass an existing client through `options.client` when the pool is shared with other code; the data source then neither opens nor closes it. Pool size, timeouts, TLS, `prepare` and `bigint` map onto the Bun options (`poolSize`, `connectTimeoutMS`, `ssl`, `prepare`, `bigint`); anything else goes through `extra`. `QueryFailedError` keeps the Bun `SQLError` in `driverError` and exposes `code` (the adapter's own code) and `sqlState` (`23505` for a unique violation on PostgreSQL, `23000` on MySQL).

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
