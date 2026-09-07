import { toCamelCase } from "@talosjs/utils/toCamelCase";
import { toSnakeCase } from "@talosjs/utils/toSnakeCase";
import type { INamingStrategy } from "../types";

const sha1 = (input: string): string => {
  const hasher = new Bun.CryptoHasher("sha1");
  hasher.update(input);

  return hasher.digest("hex");
};

/** Constraint names are hashes, like TypeORM's, so they fit every engine's identifier limit. */
const constraintName = (prefix: string, tableName: string, columnNames: string[], suffix = ""): string =>
  `${prefix}${sha1(`${tableName}_${[...columnNames].sort().join("_")}${suffix}`).slice(0, 27)}`;

/**
 * TypeORM's default names: snake_case tables, property names as column names, camelCase join columns
 * (`userId`) and junction columns (`usersId`).
 */
export class DefaultNamingStrategy implements INamingStrategy {
  public tableName(className: string, customName?: string): string {
    return customName ?? toSnakeCase(className);
  }

  public columnName(propertyName: string, customName?: string, embeddedPrefixes: string[] = []): string {
    const name = customName ?? propertyName;

    return embeddedPrefixes.length > 0 ? toCamelCase([...embeddedPrefixes, name].join("_")) : name;
  }

  public relationName(propertyName: string): string {
    return propertyName;
  }

  public joinColumnName(relationName: string, referencedColumnName: string): string {
    return toCamelCase(`${relationName}_${referencedColumnName}`);
  }

  public joinTableName(firstTableName: string, secondTableName: string, firstPropertyName: string): string {
    return toSnakeCase(`${firstTableName}_${firstPropertyName.replace(/\./g, "_")}_${secondTableName}`);
  }

  public joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return toCamelCase(`${tableName}_${columnName ?? propertyName}`);
  }

  public joinTableInverseColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return this.joinTableColumnName(tableName, propertyName, columnName);
  }

  public primaryKeyName(tableName: string, columnNames: string[]): string {
    return constraintName("PK_", tableName, columnNames);
  }

  public uniqueConstraintName(tableName: string, columnNames: string[]): string {
    return constraintName("UQ_", tableName, columnNames);
  }

  public indexName(tableName: string, columnNames: string[], where?: string): string {
    return constraintName("IDX_", tableName, columnNames, where ? `_${where}` : "").slice(0, 30);
  }

  public foreignKeyName(
    tableName: string,
    columnNames: string[],
    referencedTableName: string,
    referencedColumnNames: string[],
  ): string {
    return constraintName(
      "FK_",
      tableName,
      columnNames,
      `_${referencedTableName}_${[...referencedColumnNames].sort().join("_")}`,
    );
  }
}

/** Everything in snake_case: `user_id` join columns, `users_id` junction columns, `created_at` columns. */
export class SnakeNamingStrategy extends DefaultNamingStrategy {
  public override columnName(propertyName: string, customName?: string, embeddedPrefixes: string[] = []): string {
    const prefix = embeddedPrefixes.length > 0 ? `${toSnakeCase(embeddedPrefixes.join("_"))}_` : "";

    return `${prefix}${customName ?? toSnakeCase(propertyName)}`;
  }

  public override relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  public override joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }

  public override joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return toSnakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
}
