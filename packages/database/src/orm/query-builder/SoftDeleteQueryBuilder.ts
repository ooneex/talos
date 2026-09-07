import type { EntityTargetType, ObjectLiteralType } from "../../types";
import { MissingDeleteDateColumnError } from "../errors";
import { UpdateQueryBuilder } from "./UpdateQueryBuilder";

/**
 * Marks rows deleted (or restores them) by writing the `@DeleteDateColumn()`, bumping the version and
 * update timestamp like a regular update does.
 *
 * @example
 * await dataSource.createQueryBuilder().softDelete().from(UserEntity).where("id = :id", { id }).execute();
 * await dataSource.createQueryBuilder().restore().from(UserEntity).where("id = :id", { id }).execute();
 */
export class SoftDeleteQueryBuilder<Entity extends ObjectLiteralType> extends UpdateQueryBuilder<Entity> {
  private deletedAt: Date | undefined;

  public from<T extends ObjectLiteralType>(target: EntityTargetType<T>, aliasName?: string): SoftDeleteQueryBuilder<T> {
    const metadata = this.dataSource.getMetadata(target);

    this.expressionMap.mainAlias = this.createAlias(aliasName ?? metadata.tableName, target);

    return this as unknown as SoftDeleteQueryBuilder<T>;
  }

  public override getQuery(): string {
    const metadata = this.requireMetadata();
    const column = metadata.deleteDateColumn;

    if (!column) {
      throw new MissingDeleteDateColumnError(metadata.name);
    }

    if (this.expressionMap.queryType === "restore") {
      this.expressionMap.valuesSet = { [column.propertyName]: null };
    } else {
      this.deletedAt ??= new Date();
      this.expressionMap.valuesSet = { [column.propertyName]: this.deletedAt };
    }

    return this.getUpdateQuery();
  }

  private getUpdateQuery(): string {
    // Soft deletes bump the version and update timestamp exactly like an update does.
    const previous = this.expressionMap.queryType;

    this.expressionMap.queryType = "update";

    try {
      return super.getQuery();
    } finally {
      this.expressionMap.queryType = previous;
    }
  }
}
