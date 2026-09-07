import type { DataSourceOptionsType, SqliteDataSourceOptionsType } from "../../src";
import { DataSource } from "../../src/orm/DataSource";
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from "../../src/orm/decorators/columns";
import { Entity, Index, Unique } from "../../src/orm/decorators/Entity";
import { JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, OneToOne } from "../../src/orm/decorators/relations";

@Entity({ name: "profiles" })
export class Profile {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "text", nullable: true })
  public bio?: string | null;
}

@Entity({ name: "tags" })
export class Tag {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "varchar", length: 50, unique: true })
  public label = "";

  @ManyToMany(
    () => Post,
    (post) => post.tags,
  )
  public posts?: Post[];
}

@Entity({ name: "users" })
@Index(["name", "age"])
@Unique("UQ_users_name", ["name"])
export class User {
  @PrimaryColumn({ type: "varchar", length: 20 })
  public id = "";

  @Column({ type: "varchar", length: 100 })
  public name = "";

  @Column({ name: "is_active", type: "boolean", default: true, nullable: true })
  public isActive?: boolean | null;

  @Column({ type: "integer", default: 0 })
  public age = 0;

  @Column({ type: "simple-json", nullable: true })
  public settings?: Record<string, unknown> | null;

  @Column({ type: "simple-array", nullable: true })
  public roles?: string[] | null;

  @Column({ type: "varchar", nullable: true, select: false })
  public secret?: string | null;

  @CreateDateColumn({ name: "created_at" })
  public createdAt?: Date;

  @UpdateDateColumn({ name: "updated_at" })
  public updatedAt?: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  public deletedAt?: Date | null;

  @VersionColumn()
  public version?: number;

  @OneToOne(() => Profile, { cascade: true, eager: true, nullable: true })
  @JoinColumn({ name: "profile_id" })
  public profile?: Profile | null;

  @OneToMany(
    () => Post,
    (post) => post.author,
    { cascade: true },
  )
  public posts?: Post[];
}

@Entity({ name: "posts" })
export class Post {
  @PrimaryGeneratedColumn("increment")
  public id?: number;

  @Column({ type: "varchar" })
  public title = "";

  @Column({ type: "integer", default: 0 })
  public views = 0;

  @ManyToOne(
    () => User,
    (user) => user.posts,
    { onDelete: "CASCADE" },
  )
  @JoinColumn({ name: "author_id" })
  public author?: User | null;

  @ManyToMany(
    () => Tag,
    (tag) => tag.posts,
    { cascade: true },
  )
  @JoinTable({ name: "post_tags" })
  public tags?: Tag[];
}

export const fixtureEntities = [User, Post, Tag, Profile];

export const sqliteOptions = (overrides: Partial<SqliteDataSourceOptionsType> = {}): DataSourceOptionsType => ({
  type: "sqlite",
  database: ":memory:",
  entities: fixtureEntities,
  synchronize: true,
  ...overrides,
});

/** An initialised in-memory SQLite data source with the fixture schema created. */
export const createSqliteDataSource = async (
  overrides: Partial<SqliteDataSourceOptionsType> = {},
): Promise<DataSource> => {
  const dataSource = new DataSource(sqliteOptions(overrides));

  await dataSource.initialize();

  return dataSource;
};

/** Alice with a profile, two posts and two tags, saved through the cascade graph. */
export const seedAlice = async (dataSource: DataSource): Promise<User> => {
  const users = dataSource.getRepository(User);
  const news = Object.assign(new Tag(), { label: "news" });
  const alice = users.create({
    id: "u1",
    name: "Alice",
    age: 30,
    settings: { theme: "dark" },
    roles: ["admin", "editor"],
    profile: { bio: "hello" },
    posts: [
      { title: "First", views: 10, tags: [{ label: "intro" }, news] },
      { title: "Second", views: 5, tags: [news] },
    ],
  });

  return users.save(alice);
};
