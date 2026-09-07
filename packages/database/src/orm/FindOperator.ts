import type { ObjectLiteralType } from "../types";

export type FindOperatorTypeType =
  | "not"
  | "lessThan"
  | "lessThanOrEqual"
  | "moreThan"
  | "moreThanOrEqual"
  | "equal"
  | "between"
  | "in"
  | "any"
  | "isNull"
  | "ilike"
  | "like"
  | "raw"
  | "arrayContains"
  | "arrayContainedBy"
  | "arrayOverlap"
  | "jsonContains"
  | "and"
  | "or";

export type RawSqlFunctionType = (columnAlias: string) => string;

const FIND_OPERATOR_MARK = Symbol.for("@talosjs/database:find-operator");

/**
 * A comparison other than equality inside a `where` object: `{ age: MoreThan(18) }`.
 *
 * The where builder reads `type`, `value` and the parameter flags to write the SQL; the operator
 * itself is inert data.
 */
export class FindOperator<T = unknown> {
  public readonly [FIND_OPERATOR_MARK] = true;
  public readonly type: FindOperatorTypeType;
  public readonly useParameter: boolean;
  public readonly multipleParameters: boolean;
  public readonly getSql: RawSqlFunctionType | undefined;
  public readonly objectLiteralParameters: ObjectLiteralType | undefined;
  private readonly rawValue: T | FindOperator<T> | FindOperator<T>[];

  public constructor(
    type: FindOperatorTypeType,
    value: T | FindOperator<T> | FindOperator<T>[],
    useParameter = true,
    multipleParameters = false,
    getSql?: RawSqlFunctionType,
    objectLiteralParameters?: ObjectLiteralType,
  ) {
    this.type = type;
    this.rawValue = value;
    this.useParameter = useParameter;
    this.multipleParameters = multipleParameters;
    this.getSql = getSql;
    this.objectLiteralParameters = objectLiteralParameters;
  }

  /** The operand: a value, an array of values, or a nested operator's operand. */
  public get value(): T | T[] {
    if (isFindOperator(this.rawValue)) {
      return this.rawValue.value as T | T[];
    }

    if (Array.isArray(this.rawValue) && this.rawValue.every((item) => isFindOperator(item))) {
      return this.rawValue.map((item) => (item as FindOperator<T>).value) as T[];
    }

    return this.rawValue as T | T[];
  }

  /** The nested operator when this one wraps another (`Not(In([...]))`). */
  public get child(): FindOperator<T> | undefined {
    return isFindOperator(this.rawValue) ? (this.rawValue as FindOperator<T>) : undefined;
  }

  /** The operators an `And` / `Or` combines. */
  public get children(): FindOperator<T>[] {
    return Array.isArray(this.rawValue) ? this.rawValue.filter((item) => isFindOperator(item)) : [];
  }

  /** A copy whose operand went through a column transformer. */
  public transformValue(transform: (value: unknown) => unknown): FindOperator<T> {
    if (this.child) {
      return new FindOperator(
        this.type,
        this.child.transformValue(transform),
        this.useParameter,
        this.multipleParameters,
        this.getSql,
        this.objectLiteralParameters,
      );
    }

    if (this.children.length > 0) {
      return new FindOperator(
        this.type,
        this.children.map((child) => child.transformValue(transform)),
        this.useParameter,
        this.multipleParameters,
        this.getSql,
        this.objectLiteralParameters,
      );
    }

    const transformed = Array.isArray(this.rawValue)
      ? (this.rawValue as unknown[]).map(transform)
      : transform(this.rawValue);

    return new FindOperator(
      this.type,
      transformed as T,
      this.useParameter,
      this.multipleParameters,
      this.getSql,
      this.objectLiteralParameters,
    );
  }
}

/** Whether `value` is a FindOperator, including one created by another copy of this module. */
export const isFindOperator = (value: unknown): value is FindOperator<unknown> =>
  value instanceof FindOperator ||
  (typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[FIND_OPERATOR_MARK] === true);

export const Equal = <T>(value: T | FindOperator<T>): FindOperator<T> => new FindOperator("equal", value);

export const Not = <T>(value: T | FindOperator<T>): FindOperator<T> => new FindOperator("not", value);

export const LessThan = <T>(value: T | FindOperator<T>): FindOperator<T> => new FindOperator("lessThan", value);

export const LessThanOrEqual = <T>(value: T | FindOperator<T>): FindOperator<T> =>
  new FindOperator("lessThanOrEqual", value);

export const MoreThan = <T>(value: T | FindOperator<T>): FindOperator<T> => new FindOperator("moreThan", value);

export const MoreThanOrEqual = <T>(value: T | FindOperator<T>): FindOperator<T> =>
  new FindOperator("moreThanOrEqual", value);

/** `LIKE` — case-sensitive on PostgreSQL, case-insensitive on MySQL and SQLite by default. */
export const Like = <T>(value: T | FindOperator<T>): FindOperator<T> => new FindOperator("like", value);

/** Case-insensitive `LIKE`; emitted as `ILIKE` on PostgreSQL and `LOWER(x) LIKE LOWER(y)` elsewhere. */
export const ILike = <T>(value: T | FindOperator<T>): FindOperator<T> => new FindOperator("ilike", value);

export const Between = <T>(from: T | FindOperator<T>, to: T | FindOperator<T>): FindOperator<T> =>
  new FindOperator("between", [from, to] as unknown as T, true, true);

export const In = <T>(values: readonly T[] | FindOperator<T>): FindOperator<T> =>
  new FindOperator("in", values as unknown as T, true, true);

/** PostgreSQL `= ANY(array)`. */
export const Any = <T>(values: readonly T[] | FindOperator<T>): FindOperator<T> =>
  new FindOperator("any", values as unknown as T, true, true);

export const IsNull = (): FindOperator<unknown> => new FindOperator("isNull", "", false);

/** PostgreSQL array `@>`. */
export const ArrayContains = <T>(values: readonly T[] | FindOperator<T>): FindOperator<T> =>
  new FindOperator("arrayContains", values as unknown as T);

/** PostgreSQL array `<@`. */
export const ArrayContainedBy = <T>(values: readonly T[] | FindOperator<T>): FindOperator<T> =>
  new FindOperator("arrayContainedBy", values as unknown as T);

/** PostgreSQL array `&&`. */
export const ArrayOverlap = <T>(values: readonly T[] | FindOperator<T>): FindOperator<T> =>
  new FindOperator("arrayOverlap", values as unknown as T);

/** PostgreSQL `jsonb @>`. */
export const JsonContains = <T extends object>(value: T | FindOperator<T>): FindOperator<T> =>
  new FindOperator("jsonContains", value);

/**
 * A raw SQL condition on the column. The function form receives the escaped column reference and may
 * use named parameters from the second argument.
 *
 * @example
 * where: { createdAt: Raw((alias) => `${alias} > NOW() - INTERVAL '1 day'`) }
 * where: { age: Raw((alias) => `${alias} > :min`, { min: 18 }) }
 */
export const Raw = <T>(valueOrSql: string | RawSqlFunctionType, parameters?: ObjectLiteralType): FindOperator<T> => {
  if (typeof valueOrSql === "string") {
    return new FindOperator("raw", valueOrSql as unknown as T, false);
  }

  return new FindOperator("raw", [] as unknown as T, true, false, valueOrSql, parameters);
};

/** Every operator must match the same column: `{ age: And(MoreThan(18), LessThan(65)) }`. */
export const And = <T>(...operators: FindOperator<T>[]): FindOperator<T> =>
  new FindOperator("and", operators, true, true);

/** Any operator may match the same column: `{ status: Or(Equal("a"), Equal("b")) }`. */
export const Or = <T>(...operators: FindOperator<T>[]): FindOperator<T> =>
  new FindOperator("or", operators, true, true);
