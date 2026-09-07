import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DataSource } from "../../../src/orm/DataSource";
import {
  EntityNotFoundError,
  EntityPropertyNotFoundError,
  InvalidCriteriaError,
  RelationNotFoundError,
} from "../../../src/orm/errors";
import { MoreThan } from "../../../src/orm/FindOperator";
import { DeleteQueryBuilder } from "../../../src/orm/query-builder/DeleteQueryBuilder";
import { InsertQueryBuilder } from "../../../src/orm/query-builder/InsertQueryBuilder";
import { RelationQueryBuilder } from "../../../src/orm/query-builder/RelationQueryBuilder";
import { SoftDeleteQueryBuilder } from "../../../src/orm/query-builder/SoftDeleteQueryBuilder";
import { UpdateQueryBuilder } from "../../../src/orm/query-builder/UpdateQueryBuilder";
import { createSqliteDataSource, Post, Profile, seedAlice, Tag, User } from "../../fixtures/entities";
import { createDialectDataSource } from "../../fixtures/metadata";

const sqlite = createDialectDataSource("sqlite");
const postgres = createDialectDataSource("postgres");
const mysql = createDialectDataSource("mysql");

const USER_COLUMNS =
  `"user"."id" AS "user_id", "user"."name" AS "user_name", "user"."is_active" AS "user_is_active", ` +
  `"user"."age" AS "user_age", "user"."settings" AS "user_settings", "user"."roles" AS "user_roles", ` +
  `"user"."created_at" AS "user_created_at", "user"."updated_at" AS "user_updated_at", ` +
  `"user"."deleted_at" AS "user_deleted_at", "user"."version" AS "user_version", "user"."profile_id" AS "user_profile_id"`;

describe("SelectQueryBuilder", () => {
  describe("SQL", () => {
    test("should select every selectable column of the entity, skipping select: false ones", () => {
      const sql = sqlite.createQueryBuilder(User, "user").getQuery();

      expect(sql).toBe(`SELECT ${USER_COLUMNS} FROM "users" "user" WHERE "user"."deleted_at" IS NULL`);
    });

    test("should default the alias to the table name and throw without a FROM", () => {
      expect(sqlite.createQueryBuilder(User, "users").alias).toBe("users");
      expect(() => sqlite.createQueryBuilder().select("1").getQuery()).toThrow(InvalidCriteriaError);
    });

    test("select / addSelect should restrict columns and add expressions", () => {
      const sql = sqlite
        .createQueryBuilder(User, "user")
        .select(["user.id", "user.name"])
        .addSelect("COUNT(user.age)", "total")
        .addSelect("user.age")
        .getQuery();

      expect(sql).toStartWith(
        `SELECT "user"."id" AS "user_id", "user"."name" AS "user_name", "user"."age" AS "user_age", COUNT("user"."age") AS "total" FROM`,
      );
    });

    test("selecting a whole alias should keep all of its columns", () => {
      const sql = sqlite.createQueryBuilder(User, "user").select("user").addSelect("1", "one").getQuery();

      expect(sql).toStartWith(`SELECT ${USER_COLUMNS}, 1 AS "one" FROM`);
    });

    test("should support distinct, distinct on and raw tables", () => {
      expect(sqlite.createQueryBuilder().select("*").from("accounts", "a").distinct().getQuery()).toBe(
        `SELECT DISTINCT * FROM "accounts" "a"`,
      );
      expect(sqlite.createQueryBuilder().select("a").from("accounts", "a").getQuery()).toBe(
        `SELECT "a".* FROM "accounts" "a"`,
      );
      expect(sqlite.createQueryBuilder().from("accounts", "a").getQuery()).toBe(`SELECT * FROM "accounts" "a"`);
      expect(postgres.createQueryBuilder(User, "user").select("user.name").distinctOn(["user.name"]).getQuery()).toBe(
        `SELECT DISTINCT ON ("user"."name") "user"."name" AS "user_name" FROM "users" "user" WHERE "user"."deleted_at" IS NULL`,
      );
    });

    test("addFrom should add a second table to the FROM list", () => {
      const sql = sqlite
        .createQueryBuilder()
        .select("a.id", "id")
        .from("accounts", "a")
        .addFrom("sessions", "s")
        .where("s.account_id = a.id")
        .getQuery();

      expect(sql).toBe(`SELECT a.id AS "id" FROM "accounts" "a", "sessions" "s" WHERE s.account_id = a.id`);
    });

    test("should embed sub queries in FROM, joins and conditions with shared parameters", () => {
      const fromSub = sqlite
        .createQueryBuilder()
        .select("stats.total", "total")
        .from((qb) => qb.select("COUNT(*)", "total").from(User, "u").where("u.age > :min", { min: 1 }), "stats")
        .getQuery();

      expect(fromSub).toBe(
        `SELECT stats.total AS "total" FROM (SELECT COUNT(*) AS "total" FROM "users" "u" WHERE "u"."deleted_at" IS NULL AND ("u"."age" > :min)) "stats"`,
      );

      const qb = sqlite.createQueryBuilder(Post, "post");
      const inSub = qb
        .where(`post.author IN ${qb.subQuery().select("u.id").from(User, "u").where({ age: 30 }).getQuery()}`)
        .leftJoin((sub) => sub.select("t.id", "tag_id").from(Tag, "t"), "tags", "tags.tag_id = post.id");

      expect(inSub.getQuery()).toBe(
        `SELECT "post"."id" AS "post_id", "post"."title" AS "post_title", "post"."views" AS "post_views", "post"."author_id" AS "post_author_id" FROM "posts" "post"` +
          ` LEFT JOIN (SELECT "t"."id" AS "t_id" FROM "tags" "t") "tags" ON tags.tag_id = "post"."id"` +
          ` WHERE "post"."author_id" IN (SELECT "u"."id" AS "u_id" FROM "users" "u" WHERE "u"."deleted_at" IS NULL AND ("u"."age" = :orm_param_0))`,
      );
      expect(inSub.getParameters()).toEqual({ orm_param_0: 30 });
    });

    describe("joins", () => {
      test("should join a many-to-one through its foreign key and select the joined columns", () => {
        const sql = sqlite
          .createQueryBuilder(Post, "post")
          .select("post.id")
          .innerJoinAndSelect("post.author", "author")
          .getQuery();

        expect(sql).toContain(`"author"."id" AS "author_id", "author"."name" AS "author_name"`);
        expect(sql).toContain(
          ` INNER JOIN "users" "author" ON "author"."id" = "post"."author_id" AND "author"."deleted_at" IS NULL`,
        );
      });

      test("should join a one-to-many through the inverse foreign key and pass extra conditions", () => {
        const sql = sqlite
          .createQueryBuilder(User, "user")
          .leftJoinAndSelect("user.posts", "post", "post.views > :views", { views: 3 })
          .getQuery();

        expect(sql).toContain(
          ` LEFT JOIN "posts" "post" ON "post"."author_id" = "user"."id" AND ("post"."views" > :views)`,
        );
      });

      test("should join a many-to-many through the junction table", () => {
        const sql = sqlite.createQueryBuilder(Post, "post").leftJoinAndSelect("post.tags", "tag").getQuery();

        expect(sql).toContain(
          ` LEFT JOIN "post_tags" "post_tag" ON "post_tag"."postsId" = "post"."id" LEFT JOIN "tags" "tag" ON "tag"."id" = "post_tag"."tagsId"`,
        );
        expect(sql).toContain(`"tag"."id" AS "tag_id", "tag"."label" AS "tag_label"`);
      });

      test("should join arbitrary entities and raw tables on an explicit condition", () => {
        const sql = sqlite
          .createQueryBuilder(User, "user")
          .select("user.id")
          .leftJoin(Post, "p", "p.author = user.id")
          .innerJoin("audit", "a", "a.user_id = user.id")
          .leftJoinAndSelect(Profile, "profile", "profile.id = user.profile")
          .getQuery();

        expect(sql).toContain(` LEFT JOIN "posts" "p" ON "p"."author_id" = "user"."id"`);
        expect(sql).toContain(` INNER JOIN "audit" "a" ON a.user_id = "user"."id"`);
        expect(sql).toContain(` LEFT JOIN "profiles" "profile" ON "profile"."id" = "user"."profile_id"`);
        expect(sql).toContain(`"profile"."id" AS "profile_id", "profile"."bio" AS "profile_bio"`);
      });

      test("should merge repeated joins of the same alias and upgrade them to selected", () => {
        const qb = sqlite.createQueryBuilder(User, "user").leftJoin("user.posts", "post");

        expect(qb.expressionMap.joinAttributes[0]?.isSelected).toBe(false);

        qb.leftJoinAndSelect("user.posts", "post", "post.views > 1");

        expect(qb.expressionMap.joinAttributes).toHaveLength(1);
        expect(qb.expressionMap.joinAttributes[0]?.isSelected).toBe(true);
        expect(qb.expressionMap.joinAttributes[0]?.condition).toBe("post.views > 1");
      });

      test("should reject unknown relations", () => {
        expect(() => sqlite.createQueryBuilder(User, "user").leftJoin("user.nothing", "n")).toThrow(
          RelationNotFoundError,
        );
      });
    });

    test("should render group by, having, order by and paging", () => {
      const sql = sqlite
        .createQueryBuilder(Post, "post")
        .select("post.author")
        .addSelect("SUM(post.views)", "views")
        .groupBy("post.author")
        .addGroupBy("post.title")
        .having("SUM(post.views) > :min", { min: 1 })
        .andHaving("COUNT(*) > 0")
        .orHaving("1 = 0")
        .orderBy("views", "DESC", "NULLS LAST")
        .addOrderBy("post.title")
        .limit(5)
        .offset(2)
        .getQuery();

      expect(sql).toBe(
        `SELECT "post"."author_id", SUM("post"."views") AS "views" FROM "posts" "post"` +
          ` GROUP BY "post"."author_id", "post"."title" HAVING SUM("post"."views") > :min AND COUNT(*) > 0 OR 1 = 0` +
          ` ORDER BY views DESC NULLS LAST, "post"."title" ASC LIMIT 5 OFFSET 2`,
      );
    });

    test("orderBy should accept a map, reset previous orders and drop NULLS on MySQL", () => {
      const qb = sqlite.createQueryBuilder(User, "user").orderBy("user.age", "DESC").orderBy({ "user.name": "ASC" });

      expect(qb.getQuery()).toEndWith(` ORDER BY "user"."name" ASC`);
      expect(qb.orderBy().getQuery()).not.toContain("ORDER BY");
      expect(mysql.createQueryBuilder(User, "user").orderBy("user.age", "ASC", "NULLS FIRST").getQuery()).toEndWith(
        " ORDER BY `user`.`age` ASC",
      );
    });

    test("take / skip should map to LIMIT / OFFSET when no to-many join is selected", () => {
      expect(sqlite.createQueryBuilder(User, "user").take(2).skip(4).getQuery()).toEndWith(" LIMIT 2 OFFSET 4");
      expect(
        sqlite.createQueryBuilder(User, "user").leftJoinAndSelect("user.posts", "post").take(2).getQuery(),
      ).not.toContain("LIMIT");
      expect(sqlite.createQueryBuilder(User, "user").leftJoin("user.posts", "post").take(2).getQuery()).toEndWith(
        " LIMIT 2",
      );
    });

    test("locks should follow the dialect and be ignored on SQLite", () => {
      expect(sqlite.createQueryBuilder(User, "user").setLock("pessimistic_write").getQuery()).not.toContain("FOR");
      expect(postgres.createQueryBuilder(User, "user").setLock("pessimistic_write").getQuery()).toEndWith(
        " FOR UPDATE",
      );
      expect(postgres.createQueryBuilder(User, "user").setLock("pessimistic_read").getQuery()).toEndWith(" FOR SHARE");
      expect(postgres.createQueryBuilder(User, "user").setLock("for_no_key_update").getQuery()).toEndWith(
        " FOR NO KEY UPDATE",
      );
      expect(mysql.createQueryBuilder(User, "user").setLock("pessimistic_read").getQuery()).toEndWith(
        " LOCK IN SHARE MODE",
      );
      expect(mysql.createQueryBuilder(User, "user").setLock("for_no_key_update").getQuery()).toEndWith(" FOR UPDATE");
    });

    test("should escape identifiers the MySQL way", () => {
      expect(mysql.createQueryBuilder(Post, "post").select("post.id").getQuery()).toBe(
        "SELECT `post`.`id` AS `post_id` FROM `posts` `post`",
      );
    });

    test("clone should produce an independent builder", () => {
      const original = sqlite.createQueryBuilder(User, "user").where("user.age > :min", { min: 1 });
      const clone = original.clone().andWhere("user.name = :name", { name: "x" });

      expect(original.getQuery()).not.toContain(":name");
      expect(clone.getQuery()).toContain(`"user"."name" = :name`);
      expect(original.getParameters()).toEqual({ min: 1 });
    });

    test("should hand over to the other statement builders", () => {
      const qb = sqlite.createQueryBuilder();

      expect(qb.insert()).toBeInstanceOf(InsertQueryBuilder);
      expect(qb.update(User)).toBeInstanceOf(UpdateQueryBuilder);
      expect(qb.update(User, { age: 1 }).expressionMap.valuesSet).toEqual({ age: 1 });
      expect(sqlite.createQueryBuilder(User, "user").update({ age: 2 }).expressionMap.valuesSet).toEqual({ age: 2 });
      expect(qb.delete()).toBeInstanceOf(DeleteQueryBuilder);
      expect(qb.softDelete()).toBeInstanceOf(SoftDeleteQueryBuilder);
      expect(qb.restore()).toBeInstanceOf(SoftDeleteQueryBuilder);
      expect(qb.relation(Post, "tags")).toBeInstanceOf(RelationQueryBuilder);
      expect(sqlite.createQueryBuilder(Post, "post").relation("tags").expressionMap.relationPropertyPath).toBe("tags");
    });

    describe("setFindOptions", () => {
      test("should join relations given as paths or nested objects", () => {
        const paths = sqlite
          .createQueryBuilder(User, "user")
          .setFindOptions({ relations: ["posts.tags"] })
          .getQuery();

        expect(paths).toContain(` LEFT JOIN "posts" "user_posts" ON "user_posts"."author_id" = "user"."id"`);
        expect(paths).toContain(` LEFT JOIN "post_tags" "user_posts_user_posts_tags"`);
        expect(paths).toContain(`"user_posts_tags"."label" AS "user_posts_tags_label"`);

        const nested = sqlite
          .createQueryBuilder(User, "user")
          .setFindOptions({
            relations: { posts: { tags: true, author: false }, profile: true },
            loadEagerRelations: false,
          })
          .getQuery();

        expect(nested).toContain(`"user_posts_tags"."label"`);
        expect(nested).toContain(` LEFT JOIN "profiles" "user_profile" ON "user_profile"."id" = "user"."profile_id"`);
        expect(nested).not.toContain(`"user_posts_author"`);
      });

      test("should join eager relations unless disabled", () => {
        expect(sqlite.createQueryBuilder(User, "user").setFindOptions({}).getQuery()).toContain(
          ` LEFT JOIN "profiles" "user_profile"`,
        );
        expect(
          sqlite.createQueryBuilder(User, "user").setFindOptions({ loadEagerRelations: false }).getQuery(),
        ).not.toContain(`"user_profile"`);
      });

      test("should apply select, where, order, paging and the soft-delete flag", () => {
        const qb = sqlite.createQueryBuilder(User, "user").setFindOptions({
          select: { id: true, name: true, posts: { title: true } },
          where: { age: MoreThan(18) },
          order: { name: "desc", posts: { views: { direction: "asc", nulls: "last" } }, profile: "ASC" },
          skip: 1,
          take: 2,
          withDeleted: true,
          comment: "find",
          loadEagerRelations: false,
        });
        const sql = qb.getQuery();

        expect(sql).toStartWith("/* find */ SELECT ");
        expect(sql).toContain(
          `"user"."id" AS "user_id", "user"."name" AS "user_name", "user_posts"."title" AS "user_posts_title", "user_posts"."id" AS "user_posts_id"`,
        );
        expect(sql).not.toContain('"user"."deleted_at" IS NULL');
        expect(sql).toContain(`WHERE "user"."age" > :orm_param_0`);
        expect(sql).toContain(
          ` ORDER BY "user"."name" DESC, "user_posts"."views" ASC NULLS LAST, "user"."profile_id" ASC`,
        );
        expect(sql).not.toContain("LIMIT");
      });

      test("should select whole relations and columns given as an array", () => {
        const sql = sqlite
          .createQueryBuilder(User, "user")
          .setFindOptions({ select: { id: true, posts: true }, loadEagerRelations: false })
          .getQuery();

        expect(sql).toContain(`"user"."id" AS "user_id", "user_posts"."id" AS "user_posts_id", "user_posts"."title"`);

        const list = sqlite
          .createQueryBuilder(User, "user")
          .setFindOptions({ select: ["id", "name"], loadEagerRelations: false })
          .getQuery();

        expect(list).toStartWith(`SELECT "user"."id" AS "user_id", "user"."name" AS "user_name" FROM`);
      });

      test("should reject unknown relations and properties", () => {
        const qb = () => sqlite.createQueryBuilder(User, "user");

        expect(() => qb().setFindOptions({ relations: ["nothing"] })).toThrow(RelationNotFoundError);
        expect(() => qb().setFindOptions({ relations: { nothing: true } as never })).toThrow(RelationNotFoundError);
        expect(() => qb().setFindOptions({ select: { nothing: true } as never })).toThrow(EntityPropertyNotFoundError);
        expect(() => qb().setFindOptions({ order: { nothing: "ASC" } as never })).toThrow(EntityPropertyNotFoundError);
        expect(() => sqlite.createQueryBuilder().from("accounts", "a").setFindOptions({})).toThrow(
          InvalidCriteriaError,
        );
      });
    });
  });

  describe("execution", () => {
    let dataSource: DataSource;

    beforeAll(async () => {
      dataSource = await createSqliteDataSource();
      await seedAlice(dataSource);
      await dataSource.getRepository(User).save({ id: "u2", name: "Bob", age: 41, isActive: false });
    });

    afterAll(async () => {
      await dataSource.destroy();
    });

    test("getMany should hydrate entities with their eager relations", async () => {
      const users = await dataSource.createQueryBuilder(User, "user").setFindOptions({}).orderBy("user.id").getMany();

      expect(users).toHaveLength(2);
      expect(users[0]).toBeInstanceOf(User);
      expect(users[0]?.profile).toBeInstanceOf(Profile);
      expect(users[0]?.profile?.bio).toBe("hello");
      expect(users[0]?.settings).toEqual({ theme: "dark" });
      expect(users[0]?.roles).toEqual(["admin", "editor"]);
      expect(users[0]?.isActive).toBe(true);
      expect(users[0]?.createdAt).toBeInstanceOf(Date);
      expect(users[0]?.secret).toBeUndefined();
      expect(users[1]?.profile).toBeNull();
      expect(users[1]?.isActive).toBe(false);
    });

    test("joined to-many relations should group rows into arrays", async () => {
      const alice = await dataSource
        .createQueryBuilder(User, "user")
        .leftJoinAndSelect("user.posts", "post")
        .leftJoinAndSelect("post.tags", "tag")
        .where({ id: "u1" })
        .orderBy("post.id")
        .addOrderBy("tag.id")
        .getOneOrFail();

      expect(alice.posts?.map((post) => post.title)).toEqual(["First", "Second"]);
      expect(alice.posts?.[0]?.tags?.map((tag) => tag.label).sort()).toEqual(["intro", "news"]);
      expect(alice.posts?.[1]?.tags?.map((tag) => tag.label)).toEqual(["news"]);

      const bob = await dataSource
        .createQueryBuilder(User, "user")
        .leftJoinAndSelect("user.posts", "post")
        .where({ id: "u2" })
        .getOneOrFail();

      expect(bob.posts).toEqual([]);
    });

    test("getOne / getOneOrFail should return the first entity or throw", async () => {
      expect(await dataSource.createQueryBuilder(User, "user").where({ id: "nope" }).getOne()).toBeNull();
      expect(dataSource.createQueryBuilder(User, "user").where({ id: "nope" }).getOneOrFail()).rejects.toBeInstanceOf(
        EntityNotFoundError,
      );
      expect((await dataSource.createQueryBuilder(User, "user").where({ id: "u2" }).getOne())?.name).toBe("Bob");
    });

    test("getCount should count distinct entities across to-many joins", async () => {
      const qb = dataSource.createQueryBuilder(User, "user").leftJoinAndSelect("user.posts", "post");

      expect(await qb.getCount()).toBe(2);
      expect(await qb.where({ posts: { title: "First" } }).getCount()).toBe(1);
      expect(await dataSource.createQueryBuilder().from("post_tags", "pt").getCount()).toBe(3);
    });

    test("getExists and getManyAndCount", async () => {
      expect(
        await dataSource
          .createQueryBuilder(User, "user")
          .where({ age: MoreThan(40) })
          .getExists(),
      ).toBe(true);
      expect(
        await dataSource
          .createQueryBuilder(User, "user")
          .where({ age: MoreThan(99) })
          .getExists(),
      ).toBe(false);

      const [entities, count] = await dataSource
        .createQueryBuilder(User, "user")
        .orderBy("user.age", "DESC")
        .take(1)
        .getManyAndCount();

      expect(entities.map((user) => user.name)).toEqual(["Bob"]);
      expect(count).toBe(2);
    });

    test("raw results should come back as plain rows", async () => {
      const rows = await dataSource
        .createQueryBuilder(Post, "post")
        .select("post.author", "author")
        .addSelect("SUM(post.views)", "views")
        .groupBy("post.author")
        .getRawMany<{ author: string; views: number }>();

      expect(rows).toEqual([{ author: "u1", views: 15 }]);
      expect(
        await dataSource.createQueryBuilder(Post, "post").select("COUNT(*)", "total").getRawOne<{ total: number }>(),
      ).toEqual({ total: 2 });
      expect(await dataSource.createQueryBuilder(Post, "post").select("post.id").orderBy("post.id").execute()).toEqual([
        { post_id: 1 },
        { post_id: 2 },
      ]);

      const { raw, entities } = await dataSource
        .createQueryBuilder(Post, "post")
        .select("post.id")
        .addSelect("post.views * 2", "doubled")
        .orderBy("post.id")
        .getRawAndEntities<{ post_id: number; doubled: number }>();

      expect(raw.map((row) => row.doubled)).toEqual([20, 10]);
      expect(entities.map((post) => post.id)).toEqual([1, 2]);
      expect(entities[0]).toBeInstanceOf(Post);
    });

    test("take / skip across a to-many join should page entities, not rows", async () => {
      const page = await dataSource
        .createQueryBuilder(Post, "post")
        .leftJoinAndSelect("post.tags", "tag")
        .orderBy("post.views", "ASC")
        .take(1)
        .skip(0)
        .getMany();

      expect(page.map((post) => post.title)).toEqual(["Second"]);

      const second = await dataSource
        .createQueryBuilder(Post, "post")
        .leftJoinAndSelect("post.tags", "tag")
        .orderBy("post.views", "ASC")
        .take(1)
        .skip(1)
        .getMany();

      expect(second.map((post) => post.title)).toEqual(["First"]);
      expect(second[0]?.tags).toHaveLength(2);

      const none = await dataSource
        .createQueryBuilder(Post, "post")
        .leftJoinAndSelect("post.tags", "tag")
        .skip(10)
        .getMany();

      expect(none).toEqual([]);
    });

    test("paging across a to-many join should refuse to order by an unselected expression", async () => {
      const qb = dataSource
        .createQueryBuilder(Post, "post")
        .leftJoinAndSelect("post.tags", "tag")
        .orderBy("LENGTH(post.title)")
        .take(1);

      expect(qb.getMany()).rejects.toBeInstanceOf(InvalidCriteriaError);
    });

    test("join and map should attach arbitrary joins onto properties", async () => {
      const [alice] = await dataSource
        .createQueryBuilder(User, "user")
        .leftJoinAndMapMany("user.posts", Post, "p", "p.author = user.id")
        .leftJoinAndMapOne("user.firstPost", Post, "fp", "fp.author = user.id AND fp.views = :views", { views: 10 })
        .where({ id: "u1" })
        .orderBy("p.id")
        .getMany();

      expect(alice?.posts?.map((post) => post.title)).toEqual(["First", "Second"]);
      expect((alice as User & { firstPost?: Post }).firstPost?.title).toBe("First");
    });

    test("where objects reaching inverse relations should add the join themselves", async () => {
      const authors = await dataSource
        .createQueryBuilder(User, "user")
        .where({ posts: { tags: { label: "intro" } } })
        .getMany();

      expect(authors.map((user) => user.name)).toEqual(["Alice"]);
    });
  });
});
