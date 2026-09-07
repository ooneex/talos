import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { RelationType } from "../../src";
import { DataSource } from "../../src/orm/DataSource";
import { Column, DeleteDateColumn, PrimaryGeneratedColumn } from "../../src/orm/decorators/columns";
import { Entity } from "../../src/orm/decorators/Entity";
import { JoinColumn, ManyToOne, OneToMany, OneToOne } from "../../src/orm/decorators/relations";
import type { EntityManager } from "../../src/orm/EntityManager";
import { MissingDeleteDateColumnError } from "../../src/orm/errors";
import { fixtureEntities, Post, Profile, seedAlice, Tag, User } from "../fixtures/entities";

@Entity("ep_teams")
class Team {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "varchar" })
  public name = "";

  @OneToMany(
    () => Member,
    (member) => member.team,
    { orphanedRowAction: "delete" },
  )
  public members?: Member[];
}

@Entity("ep_members")
class Member {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "varchar" })
  public name = "";

  @ManyToOne(
    () => Team,
    (team) => team.members,
    { nullable: true, onDelete: "SET NULL" },
  )
  public team?: Team | null;
}

@Entity("ep_boards")
class Board {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "varchar" })
  public name = "";

  @DeleteDateColumn()
  public deletedAt?: Date | null;

  @OneToMany(
    () => Card,
    (card) => card.board,
    { cascade: true, orphanedRowAction: "soft-delete" },
  )
  public cards?: Card[];
}

@Entity("ep_cards")
class Card {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "varchar" })
  public title = "";

  @DeleteDateColumn()
  public deletedAt?: Date | null;

  @ManyToOne(
    () => Board,
    (board) => board.cards,
    { nullable: true },
  )
  public board?: Board | null;
}

@Entity("ep_shelves")
class Shelf {
  @PrimaryGeneratedColumn()
  public id?: number;

  @OneToMany(
    () => Book,
    (book) => book.shelf,
    { cascade: true, orphanedRowAction: "disable" },
  )
  public books?: Book[];
}

@Entity("ep_books")
class Book {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "varchar" })
  public title = "";

  @ManyToOne(
    () => Shelf,
    (shelf) => shelf.books,
    { nullable: true },
  )
  public shelf?: Shelf | null;
}

@Entity("ep_accounts")
class Account {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "varchar" })
  public email = "";

  @OneToOne(
    () => Wallet,
    (wallet) => wallet.account,
    { cascade: true },
  )
  public wallet?: RelationType<Wallet>;
}

@Entity("ep_wallets")
class Wallet {
  @PrimaryGeneratedColumn()
  public id?: number;

  @Column({ type: "integer" })
  public balance = 0;

  @OneToOne(
    () => Account,
    (account) => account.wallet,
    { cascade: true },
  )
  @JoinColumn()
  public account?: Account;
}

const localEntities = [Team, Member, Board, Card, Shelf, Book, Account, Wallet];

describe("EntityPersister", () => {
  let dataSource: DataSource;
  let manager: EntityManager;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: "sqlite",
      database: ":memory:",
      entities: [...fixtureEntities, ...localEntities],
      synchronize: true,
    });
    await dataSource.initialize();
    manager = dataSource.manager;
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  describe("save", () => {
    test("should insert owners before dependants and wire the foreign keys", async () => {
      const alice = await seedAlice(dataSource);

      const rows = await manager.query<{ id: string; profile_id: number }>("SELECT id, profile_id FROM users");
      const posts = await manager.query<{ id: number; author_id: string }>(
        "SELECT id, author_id FROM posts ORDER BY id",
      );
      const junction = await manager.query<{ postsId: number; tagsId: number }>(
        'SELECT "postsId", "tagsId" FROM post_tags ORDER BY "postsId", "tagsId"',
      );

      expect(rows).toEqual([{ id: "u1", profile_id: 1 }]);
      expect(posts).toEqual([
        { id: 1, author_id: "u1" },
        { id: 2, author_id: "u1" },
      ]);
      expect(junction).toEqual([
        { postsId: 1, tagsId: 1 },
        { postsId: 1, tagsId: 2 },
        { postsId: 2, tagsId: 2 },
      ]);
      // The inverse side of the one-to-many is filled in on the children.
      expect(alice.posts?.every((post) => post.author === alice)).toBe(true);
    });

    test("should update rows that already exist, soft-deleted ones included", async () => {
      const alice = await seedAlice(dataSource);

      await manager.softRemove(alice);
      alice.name = "Still here";

      await manager.save(alice);

      const stored = await manager.findOne(User, { where: { id: "u1" }, withDeleted: true });

      expect(stored?.name).toBe("Still here");
      expect(stored?.deletedAt).toBeInstanceOf(Date);
      expect(stored?.version).toBe(3);
      expect(await manager.count(User)).toBe(0);
    });

    test("should not issue an update when nothing but the primary key is set", async () => {
      const queries: string[] = [];
      const logging = new DataSource({
        type: "sqlite",
        database: ":memory:",
        entities: [Profile],
        synchronize: true,
        logging: true,
        logger: { logQuery: (query) => queries.push(query), logQueryError: () => undefined },
      });

      await logging.initialize();

      try {
        await logging.manager.insert(Profile, { bio: "kept" });
        queries.length = 0;

        await logging.manager.save(Object.assign(new Profile(), { id: 1 }));

        expect(queries.filter((query) => /^(UPDATE|INSERT)/.test(query))).toEqual([]);
        expect(queries.some((query) => query.startsWith("SELECT"))).toBe(true);
        expect((await logging.manager.findOneBy(Profile, { id: 1 }))?.bio).toBe("kept");
      } finally {
        await logging.destroy();
      }
    });

    test("should assign, clear and ignore unsaved owner relations on update", async () => {
      const alice = await seedAlice(dataSource);
      await manager.save(User, { id: "u2", name: "Bob" });
      const [first, second] = alice.posts as [Post, Post];

      first.author = Object.assign(new User(), { id: "u2" });
      second.author = null;
      await manager.save([first, second]);

      expect(await manager.query("SELECT id, author_id FROM posts ORDER BY id")).toEqual([
        { id: 1, author_id: "u2" },
        { id: 2, author_id: null },
      ]);

      // An author without an id cannot be referenced and is left alone.
      first.author = Object.assign(new User(), { name: "ghost" });
      await manager.save(first);

      expect(await manager.query("SELECT author_id FROM posts WHERE id = 1")).toEqual([{ author_id: "u2" }]);
    });

    test("should attach existing children of a one-to-many without cascade and delete the orphans", async () => {
      const [ann, ben, cid] = (await manager.save(
        manager.create(Member, [{ name: "Ann" }, { name: "Ben" }, { name: "Cid" }]),
      )) as [Member, Member, Member];
      const team = manager.create(Team, { name: "Core", members: [ann, ben] });

      await manager.save(team);

      expect(await manager.query('SELECT id, "teamId" FROM ep_members ORDER BY id')).toEqual([
        { id: 1, teamId: 1 },
        { id: 2, teamId: 1 },
        { id: 3, teamId: null },
      ]);

      team.members = [ben, cid];
      await manager.save(team);

      // Ann is now an orphan and the relation asked for orphans to be deleted.
      expect(await manager.query('SELECT id, "teamId" FROM ep_members ORDER BY id')).toEqual([
        { id: 2, teamId: 1 },
        { id: 3, teamId: 1 },
      ]);

      // Children without an id are skipped when the relation does not cascade.
      team.members = [ben, Object.assign(new Member(), { name: "new" })];
      await manager.save(team);
      expect(await manager.count(Member)).toBe(1);
    });

    test("should nullify orphans by default", async () => {
      const alice = await seedAlice(dataSource);

      alice.posts = [alice.posts?.[0] as Post];
      await manager.save(alice);

      expect(await manager.query("SELECT id, author_id FROM posts ORDER BY id")).toEqual([
        { id: 1, author_id: "u1" },
        { id: 2, author_id: null },
      ]);
    });

    test("should soft-delete or leave orphans alone when the relation says so", async () => {
      const board = await manager.save(manager.create(Board, { name: "b", cards: [{ title: "a" }, { title: "b" }] }));
      const shelf = await manager.save(manager.create(Shelf, { books: [{ title: "x" }, { title: "y" }] }));

      board.cards = [board.cards?.[0] as Card];
      shelf.books = [shelf.books?.[0] as Book];
      await manager.save([board]);
      await manager.save(shelf);

      const cards = await manager.query<{ id: number; deletedAt: string | null; boardId: number }>(
        'SELECT id, "deletedAt", "boardId" FROM ep_cards ORDER BY id',
      );

      expect(cards.map((card) => [card.id, card.deletedAt === null, card.boardId])).toEqual([
        [1, true, 1],
        [2, false, 1],
      ]);
      expect(await manager.query('SELECT id, "shelfId" FROM ep_books ORDER BY id')).toEqual([
        { id: 1, shelfId: 1 },
        { id: 2, shelfId: 1 },
      ]);
    });

    test("should keep junction rows in step with the array on the entity", async () => {
      const alice = await seedAlice(dataSource);
      const post = alice.posts?.[0] as Post;
      const news = post.tags?.find((tag) => tag.label === "news") as Tag;

      post.tags = [news, Object.assign(new Tag(), { label: "fresh" })];
      await manager.save(post);

      expect(await manager.query('SELECT "tagsId" FROM post_tags WHERE "postsId" = 1 ORDER BY "tagsId"')).toEqual([
        { tagsId: 2 },
        { tagsId: 3 },
      ]);
      expect(await manager.count(Tag)).toBe(3);

      // Saving again with the same tags issues no junction change; cascade update refreshes the tag.
      news.label = "news!";
      await manager.save(post);
      expect(await manager.query('SELECT COUNT(*) AS n FROM post_tags WHERE "postsId" = 1')).toEqual([{ n: 2 }]);
      expect((await manager.findOneBy(Tag, { id: 2 }))?.label).toBe("news!");

      post.tags = [];
      await manager.save(post);
      expect(await manager.query('SELECT COUNT(*) AS n FROM post_tags WHERE "postsId" = 1')).toEqual([{ n: 0 }]);
    });

    test("should link from the inverse side of a many-to-many", async () => {
      const alice = await seedAlice(dataSource);
      const tag = await manager.save(Object.assign(new Tag(), { label: "solo" }));

      tag.posts = alice.posts ?? [];
      await manager.save(tag);

      expect(await manager.query('SELECT "postsId" FROM post_tags WHERE "tagsId" = 3 ORDER BY "postsId"')).toEqual([
        { postsId: 1 },
        { postsId: 2 },
      ]);
    });

    test("should save a one-to-one from the non-owning side and survive the cycle", async () => {
      const account = manager.create(Account, { email: "a@b.c", wallet: { balance: 10 } });

      await manager.save(account);

      expect(account.id).toBe(1);
      expect(account.wallet?.id).toBe(1);
      expect(account.wallet?.account).toBe(account);
      expect(await manager.query('SELECT id, balance, "accountId" FROM ep_wallets')).toEqual([
        { id: 1, balance: 10, accountId: 1 },
      ]);

      const loaded = await manager.findOne(Account, { where: { id: 1 }, relations: { wallet: true } });

      expect(loaded?.wallet?.balance).toBe(10);
    });

    test("should visit every entity once even when the graph loops", async () => {
      const alice = manager.create(User, { id: "u1", name: "A", posts: [{ title: "loop" }] });
      const post = alice.posts?.[0] as Post;

      post.author = alice;
      await manager.save(alice);

      expect(await manager.count(User)).toBe(1);
      expect(await manager.count(Post)).toBe(1);
    });
  });

  describe("remove", () => {
    test("should remove dependants first, then the entity, then what it owns", async () => {
      const account = await manager.save(manager.create(Account, { email: "x", wallet: { balance: 1 } }));
      const wallet = account.wallet as Wallet;

      await manager.remove(account);

      expect(account.id).toBeUndefined();
      expect(wallet.id).toBeUndefined();
      expect(await manager.count(Account)).toBe(0);
      expect(await manager.count(Wallet)).toBe(0);

      const alice = await seedAlice(dataSource);
      const profile = alice.profile as Profile;

      await manager.remove(alice);

      expect(profile.id).toBeUndefined();
      expect(await manager.count(Profile)).toBe(0);
      expect(await manager.count(Post)).toBe(0);
    });

    test("should leave children alone when the relation does not cascade and skip entities without ids", async () => {
      const [ann] = (await manager.save(manager.create(Member, [{ name: "Ann" }]))) as [Member];
      const team = await manager.save(manager.create(Team, { name: "T", members: [ann] }));

      await manager.remove(team);
      await manager.remove(Object.assign(new Member(), { name: "unsaved" }));

      expect(await manager.count(Team)).toBe(0);
      expect(await manager.query('SELECT id, "teamId" FROM ep_members')).toEqual([{ id: 1, teamId: null }]);
    });
  });

  describe("softRemove / recover", () => {
    test("should cascade through relations whose target can be soft-deleted", async () => {
      const board = await manager.save(manager.create(Board, { name: "b", cards: [{ title: "a" }, { title: "b" }] }));

      await manager.softRemove(board);

      expect(board.deletedAt).toBeInstanceOf(Date);
      expect(board.cards?.every((card) => card.deletedAt instanceof Date)).toBe(true);
      expect(await manager.count(Board)).toBe(0);
      expect(await manager.count(Card)).toBe(0);

      await manager.recover(board);

      expect(board.deletedAt).toBeNull();
      expect(board.cards?.every((card) => card.deletedAt === null)).toBe(true);
      expect(await manager.count(Card)).toBe(2);
    });

    test("should skip cascades to entities without a delete date column and entities without ids", async () => {
      const alice = await seedAlice(dataSource);

      alice.posts?.push(Object.assign(new Post(), { title: "unsaved" }));
      await manager.softRemove(alice);

      expect(await manager.count(User)).toBe(0);
      expect(await manager.count(Post)).toBe(2);

      const fresh = Object.assign(new User(), { name: "no id" });

      await manager.softRemove(fresh);
      expect(fresh.deletedAt).toBeUndefined();
    });

    test("should reject entities that cannot be soft-deleted", async () => {
      const post = await manager.save(Object.assign(new Post(), { title: "hard" }));

      await expect(manager.softRemove(post)).rejects.toBeInstanceOf(MissingDeleteDateColumnError);
      await expect(manager.recover(Post, post)).rejects.toBeInstanceOf(MissingDeleteDateColumnError);
    });
  });
});
