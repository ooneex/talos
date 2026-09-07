import type { FindOptionsWhereType, ObjectLiteralType } from "../types";

/**
 * The subset of a query builder a `Brackets` callback may use.
 *
 * Declared with method signatures so a builder typed for one entity still qualifies.
 */
export interface IWhereExpressionBuilder {
  where(condition: WhereConditionInputType, parameters?: ObjectLiteralType): IWhereExpressionBuilder;
  andWhere(condition: WhereConditionInputType, parameters?: ObjectLiteralType): IWhereExpressionBuilder;
  orWhere(condition: WhereConditionInputType, parameters?: ObjectLiteralType): IWhereExpressionBuilder;
}

/**
 * A where input: raw SQL, a where object (or a list of them, OR-ed), brackets, or a factory of raw SQL.
 *
 * The factory receives the builder it is called on (`Builder`), so it may use `escape()` and friends.
 */
export type WhereConditionInputType<
  Entity extends ObjectLiteralType = ObjectLiteralType,
  Builder extends IWhereExpressionBuilder = IWhereExpressionBuilder,
> = string | Brackets | FindOptionsWhereType<Entity> | FindOptionsWhereType<Entity>[] | ((qb: Builder) => string);

/**
 * Groups conditions in parentheses inside a query builder `where`.
 *
 * @example
 * qb.where("user.isActive = :active", { active: true })
 *   .andWhere(new Brackets((qb) => qb.where("user.name = :n1", { n1: "a" }).orWhere("user.name = :n2", { n2: "b" })));
 */
export class Brackets {
  public constructor(public readonly whereFactory: (qb: IWhereExpressionBuilder) => void) {}
}

/** Like `Brackets`, negated: `NOT (...)`. */
export class NotBrackets extends Brackets {}
