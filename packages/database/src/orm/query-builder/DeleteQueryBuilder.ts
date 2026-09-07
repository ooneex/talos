import type { EntityTargetType, ObjectLiteralType } from "../../types";
import { InvalidCriteriaError } from "../errors";
import { QueryBuilder } from "./QueryBuilder";
import { DeleteResult } from "./results";

/**
 * Builds and runs `DELETE` statements.
 *
 * @example
 * await dataSource.createQueryBuilder().delete().from(UserEntity).where("id = :id", { id }).execute();
 */
export class DeleteQueryBuilder<Entity extends ObjectLiteralType> extends QueryBuilder<Entity> {
  public from<T extends ObjectLiteralType>(
    target: EntityTargetType<T> | string,
    aliasName?: string,
  ): DeleteQueryBuilder<T> {
    const metadata = this.dataSource.hasMetadata(target) ? this.dataSource.getMetadata(target) : undefined;

    this.expressionMap.mainAlias = this.createAlias(
      aliasName ?? metadata?.tableName ?? this.getTargetName(target),
      target,
    );

    return this as unknown as DeleteQueryBuilder<T>;
  }

  /** Columns (or `*`) to return; PostgreSQL and SQLite only. */
  public returning(returning: string | string[]): this {
    this.expressionMap.returning = returning;

    return this;
  }

  public getQuery(): string {
    const mainAlias = this.expressionMap.mainAlias;

    if (!mainAlias) {
      throw new InvalidCriteriaError("Cannot build a DELETE without a target: call from() first.", undefined);
    }

    const table = this.getTableName(mainAlias);
    const tableName = mainAlias.metadata?.tableName ?? mainAlias.tableName ?? mainAlias.name;
    const where = this.createWhereExpression();
    let sql: string;

    if (mainAlias.name === tableName) {
      sql = `DELETE FROM ${table}${where}`;
    } else if (this.driver.type === "mysql" || this.driver.type === "mariadb") {
      sql = `DELETE ${this.escape(mainAlias.name)} FROM ${table} ${this.escape(mainAlias.name)}${where}`;
    } else {
      sql = `DELETE FROM ${table} AS ${this.escape(mainAlias.name)}${where}`;
    }

    const returning = this.createReturningExpression();

    return returning ? `${sql} RETURNING ${returning}` : sql;
  }

  public async execute(): Promise<DeleteResult> {
    const [sql, parameters] = this.getQueryAndParameters();
    const result = await this.runQuery(sql, parameters);
    const deleteResult = new DeleteResult();

    deleteResult.raw = result.records;
    deleteResult.affected = result.affected;

    return deleteResult;
  }

  private createReturningExpression(): string | undefined {
    const requested = this.expressionMap.returning;

    if (!this.driver.supportsReturning || requested === undefined) {
      return undefined;
    }

    const metadata = this.mainMetadata;
    const list = Array.isArray(requested) ? requested : [requested];

    return list
      .map((item) => {
        if (item === "*") {
          return "*";
        }

        const column = metadata?.findColumnWithPropertyName(item);

        return column ? this.escape(column.databaseName) : this.replacePropertyNames(item);
      })
      .join(", ");
  }
}
