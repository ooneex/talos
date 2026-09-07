import type { ObjectLiteralType } from "../../types";
import type { IDriver } from "../driver/AbstractDriver";
import type { ColumnMetadata, EntityMetadata, RelationMetadata } from "../EntityMetadata";
import { EntityPropertyNotFoundError, InvalidCriteriaError } from "../errors";
import { type FindOperator, isFindOperator } from "../FindOperator";

export type WhereParametersType = {
  /** Registers an anonymous parameter and returns its `:name` reference. */
  create: (value: unknown) => string;
  /** Registers a user-named parameter (from `Raw()`). */
  set: (name: string, value: unknown) => void;
};

/** Returns the alias under which `relation` of `parentAlias` is joined, adding the join if needed. */
export type JoinResolverType = (parentAlias: string, relation: RelationMetadata) => string;

const COMPARISONS: Readonly<Record<string, string>> = {
  lessThan: "<",
  lessThanOrEqual: "<=",
  moreThan: ">",
  moreThanOrEqual: ">=",
  equal: "=",
  like: "LIKE",
  arrayContains: "@>",
  arrayContainedBy: "<@",
  arrayOverlap: "&&",
  jsonContains: "@>",
};

const isPlainObject = (value: unknown): value is ObjectLiteralType =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !isFindOperator(value);

/**
 * Turns a find-options `where` object into SQL for one entity alias.
 *
 * Column values become comparisons, `FindOperator`s become their SQL, and relation values either
 * compare the foreign key directly (owner side, primary values only) or recurse into a join.
 */
export class WhereBuilder {
  public constructor(
    private readonly driver: IDriver,
    private readonly parameters: WhereParametersType,
    private readonly ensureJoin?: JoinResolverType,
  ) {}

  public build(where: ObjectLiteralType | ObjectLiteralType[], metadata: EntityMetadata, alias: string): string {
    if (Array.isArray(where)) {
      const parts = where.map((group) => this.build(group, metadata, alias)).filter((part) => part.length > 0);

      return parts.length > 1 ? parts.map((part) => `(${part})`).join(" OR ") : (parts[0] ?? "");
    }

    const conditions: string[] = [];

    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) {
        continue;
      }

      const column = metadata.findColumnWithPropertyName(key);

      if (column) {
        conditions.push(this.valueCondition(this.columnExpression(alias, column), value, column));
        continue;
      }

      const relation = metadata.findRelationWithPropertyPath(key);

      if (relation) {
        conditions.push(this.relationCondition(alias, relation, value));
        continue;
      }

      throw new EntityPropertyNotFoundError(key, metadata.name);
    }

    return conditions.filter((condition) => condition.length > 0).join(" AND ");
  }

  /** The SQL of a single `FindOperator` applied to `expression`. */
  public operatorCondition(expression: string, operator: FindOperator<unknown>, column?: ColumnMetadata): string {
    const { type } = operator;

    if (type === "and" || type === "or") {
      const parts = operator.children.map((child) => this.operatorCondition(expression, child, column));

      return `(${parts.join(type === "and" ? " AND " : " OR ")})`;
    }

    if (type === "not") {
      if (operator.child) {
        return `NOT(${this.operatorCondition(expression, operator.child, column)})`;
      }

      return operator.value === null
        ? `${expression} IS NOT NULL`
        : `${expression} != ${this.parameter(operator.value, column)}`;
    }

    if (type === "isNull") {
      return `${expression} IS NULL`;
    }

    if (type === "ilike") {
      return this.driver.buildIlike(expression, this.parameter(operator.value, column));
    }

    if (type === "between") {
      const [from, to] = operator.value as unknown[];

      return `${expression} BETWEEN ${this.parameter(from, column)} AND ${this.parameter(to, column)}`;
    }

    if (type === "in" || type === "any") {
      return this.inCondition(expression, operator.value as unknown[], column);
    }

    if (type === "raw") {
      if (operator.getSql) {
        for (const [name, value] of Object.entries(operator.objectLiteralParameters ?? {})) {
          this.parameters.set(name, value);
        }

        return operator.getSql(expression);
      }

      return `${expression} = ${String(operator.value)}`;
    }

    if (type === "arrayContains" || type === "arrayContainedBy" || type === "arrayOverlap" || type === "jsonContains") {
      const operand = type === "jsonContains" ? JSON.stringify(operator.value) : operator.value;

      return `${expression} ${COMPARISONS[type]} ${this.parameter(operand, column)}`;
    }

    const comparison = COMPARISONS[type];

    if (!comparison) {
      throw new InvalidCriteriaError(`Unsupported find operator "${type}".`, operator);
    }

    return `${expression} ${comparison} ${this.parameter(operator.value, column)}`;
  }

  private columnExpression(alias: string, column: ColumnMetadata): string {
    return `${this.driver.escape(alias)}.${this.driver.escape(column.databaseName)}`;
  }

  /** `expression` compared to a where value: operator, null, list, or plain equality. */
  private valueCondition(expression: string, value: unknown, column: ColumnMetadata): string {
    if (isFindOperator(value)) {
      return this.operatorCondition(expression, value, column);
    }

    if (value === null) {
      return `${expression} IS NULL`;
    }

    if (Array.isArray(value) && !column.isArray && column.type !== "simple-array") {
      return this.inCondition(expression, value, column);
    }

    return `${expression} = ${this.parameter(value, column)}`;
  }

  private inCondition(expression: string, values: unknown[], column?: ColumnMetadata): string {
    if (values.length === 0) {
      return "0=1";
    }

    return `${expression} IN (${values.map((value) => this.parameter(value, column)).join(", ")})`;
  }

  private parameter(value: unknown, column?: ColumnMetadata): string {
    return `${this.parameters.create(this.driver.prepareParameter(value, column))}${this.driver.parameterCast(column)}`;
  }

  private relationCondition(alias: string, relation: RelationMetadata, value: unknown): string {
    if (typeof value === "boolean") {
      return "";
    }

    if (relation.isWithJoinColumn) {
      return this.ownerRelationCondition(alias, relation, value);
    }

    if (!this.ensureJoin) {
      throw new InvalidCriteriaError(
        `Cannot filter on relation "${relation.propertyName}" here: it requires a join, which this query does not support.`,
        value,
      );
    }

    const joinAlias = this.ensureJoin(alias, relation);
    const inverse = relation.inverseEntityMetadata;

    if (isPlainObject(value) || (Array.isArray(value) && value.some(isPlainObject))) {
      return this.build(value as ObjectLiteralType | ObjectLiteralType[], inverse, joinAlias);
    }

    const [primary] = inverse.primaryColumns;

    if (!primary) {
      return "";
    }

    return this.valueCondition(this.columnExpression(joinAlias, primary), value, primary);
  }

  private ownerRelationCondition(alias: string, relation: RelationMetadata, value: unknown): string {
    const joinColumns = relation.joinColumns;

    if (value === null) {
      return joinColumns.map((column) => `${this.columnExpression(alias, column)} IS NULL`).join(" AND ");
    }

    if (isPlainObject(value)) {
      const nestedKeys = Object.keys(value).filter((key) => value[key] !== undefined);
      const coversPrimaryOnly = nestedKeys.every((key) =>
        joinColumns.some((column) => column.referencedColumn?.propertyName === key),
      );

      if (coversPrimaryOnly && nestedKeys.length > 0) {
        return joinColumns
          .filter((column) => column.referencedColumn && nestedKeys.includes(column.referencedColumn.propertyName))
          .map((column) =>
            this.valueCondition(
              this.columnExpression(alias, column),
              value[(column.referencedColumn as ColumnMetadata).propertyName],
              column.referencedColumn as ColumnMetadata,
            ),
          )
          .join(" AND ");
      }

      return this.joinedRelationCondition(alias, relation, value);
    }

    if (Array.isArray(value) && value.some(isPlainObject)) {
      return this.joinedRelationCondition(alias, relation, value);
    }

    const [joinColumn] = joinColumns;

    if (joinColumns.length !== 1 || !joinColumn?.referencedColumn) {
      throw new InvalidCriteriaError(
        `Relation "${relation.propertyName}" has a composite key; filter it with an object of its primary properties.`,
        value,
      );
    }

    return this.valueCondition(this.columnExpression(alias, joinColumn), value, joinColumn.referencedColumn);
  }

  private joinedRelationCondition(alias: string, relation: RelationMetadata, value: unknown): string {
    if (!this.ensureJoin) {
      throw new InvalidCriteriaError(
        `Cannot filter on "${relation.propertyName}" by non-primary properties here: it requires a join, which this query does not support.`,
        value,
      );
    }

    const joinAlias = this.ensureJoin(alias, relation);

    return this.build(value as ObjectLiteralType | ObjectLiteralType[], relation.inverseEntityMetadata, joinAlias);
  }
}
