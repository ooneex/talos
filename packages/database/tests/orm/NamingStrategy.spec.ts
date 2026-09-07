import { describe, expect, test } from "bun:test";
import { DefaultNamingStrategy, SnakeNamingStrategy } from "../../src/orm/NamingStrategy";

describe("DefaultNamingStrategy", () => {
  const strategy = new DefaultNamingStrategy();

  test("tableName should snake_case the class name unless a custom name is given", () => {
    expect(strategy.tableName("UserProfile")).toBe("user_profile");
    expect(strategy.tableName("UserProfile", "profiles")).toBe("profiles");
  });

  test("columnName should keep the property name and camelCase embedded prefixes", () => {
    expect(strategy.columnName("firstName")).toBe("firstName");
    expect(strategy.columnName("firstName", "first_name")).toBe("first_name");
    expect(strategy.columnName("city", undefined, ["address", "home"])).toBe("addressHomeCity");
  });

  test("relation and join names should follow TypeORM's camelCase defaults", () => {
    expect(strategy.relationName("author")).toBe("author");
    expect(strategy.joinColumnName("author", "id")).toBe("authorId");
    expect(strategy.joinTableName("posts", "tags", "tags")).toBe("posts_tags_tags");
    expect(strategy.joinTableName("posts", "tags", "meta.tags")).toBe("posts_meta_tags_tags");
    expect(strategy.joinTableColumnName("posts", "id")).toBe("postsId");
    expect(strategy.joinTableColumnName("posts", "id", "post_uid")).toBe("postsPostUid");
    expect(strategy.joinTableInverseColumnName("tags", "id")).toBe("tagsId");
  });

  test("constraint names should be prefixed hashes that ignore column order", () => {
    const primary = strategy.primaryKeyName("users", ["id"]);
    const unique = strategy.uniqueConstraintName("users", ["email", "tenant"]);
    const index = strategy.indexName("users", ["email"]);
    const foreignKey = strategy.foreignKeyName("posts", ["author_id"], "users", ["id"]);

    expect(primary).toMatch(/^PK_[0-9a-f]{27}$/);
    expect(unique).toMatch(/^UQ_[0-9a-f]{27}$/);
    expect(index).toMatch(/^IDX_[0-9a-f]{26}$/);
    expect(foreignKey).toMatch(/^FK_[0-9a-f]{27}$/);

    expect(strategy.uniqueConstraintName("users", ["tenant", "email"])).toBe(unique);
    expect(strategy.primaryKeyName("users", ["id"])).toBe(primary);
    expect(strategy.primaryKeyName("accounts", ["id"])).not.toBe(primary);
  });

  test("indexName should change with the partial index condition", () => {
    expect(strategy.indexName("users", ["email"], "deleted_at IS NULL")).not.toBe(
      strategy.indexName("users", ["email"]),
    );
  });

  test("foreignKeyName should depend on the referenced table and columns", () => {
    const toUsers = strategy.foreignKeyName("posts", ["author_id"], "users", ["id"]);
    const toAccounts = strategy.foreignKeyName("posts", ["author_id"], "accounts", ["id"]);

    expect(toUsers).not.toBe(toAccounts);
  });
});

describe("SnakeNamingStrategy", () => {
  const strategy = new SnakeNamingStrategy();

  test("should snake_case columns, relations and join names", () => {
    expect(strategy).toBeInstanceOf(DefaultNamingStrategy);
    expect(strategy.tableName("UserProfile")).toBe("user_profile");
    expect(strategy.columnName("createdAt")).toBe("created_at");
    expect(strategy.columnName("createdAt", "made_on")).toBe("made_on");
    expect(strategy.columnName("zipCode", undefined, ["homeAddress"])).toBe("home_address_zip_code");
    expect(strategy.relationName("blogPosts")).toBe("blog_posts");
    expect(strategy.joinColumnName("author", "id")).toBe("author_id");
    expect(strategy.joinTableColumnName("posts", "id")).toBe("posts_id");
    expect(strategy.joinTableInverseColumnName("tags", "id", "uid")).toBe("tags_uid");
  });
});
