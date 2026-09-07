import { describe, expect, test } from "bun:test";
import {
  And,
  Any,
  ArrayContainedBy,
  ArrayContains,
  ArrayOverlap,
  Between,
  Equal,
  FindOperator,
  type FindOperatorTypeType,
  ILike,
  In,
  IsNull,
  isFindOperator,
  JsonContains,
  LessThan,
  LessThanOrEqual,
  Like,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Or,
  Raw,
} from "../../src/orm/FindOperator";

describe("FindOperator", () => {
  test("single-value factories should record their type and operand", () => {
    const cases: [FindOperator<unknown>, FindOperatorTypeType][] = [
      [Equal(1), "equal"],
      [Not(1), "not"],
      [LessThan(1), "lessThan"],
      [LessThanOrEqual(1), "lessThanOrEqual"],
      [MoreThan(1), "moreThan"],
      [MoreThanOrEqual(1), "moreThanOrEqual"],
      [Like(1), "like"],
      [ILike(1), "ilike"],
      [JsonContains({ a: 1 }), "jsonContains"],
    ];

    for (const [operator, type] of cases) {
      expect(operator).toBeInstanceOf(FindOperator);
      expect(operator.type).toBe(type);
      expect(operator.useParameter).toBe(true);
      expect(operator.multipleParameters).toBe(false);
      expect(operator.child).toBeUndefined();
      expect(operator.children).toEqual([]);
    }

    expect(Equal(1).value).toBe(1);
    expect(JsonContains({ a: 1 }).value).toEqual({ a: 1 });
  });

  test("list factories should bind several parameters", () => {
    expect(In([1, 2]).type).toBe("in");
    expect(In([1, 2]).value).toEqual([1, 2]);
    expect(In([1, 2]).multipleParameters).toBe(true);

    expect(Any([1]).type).toBe("any");
    expect(Any([1]).multipleParameters).toBe(true);

    expect(Between(1, 5).type).toBe("between");
    expect(Between(1, 5).value).toEqual([1, 5]);
    expect(Between(1, 5).multipleParameters).toBe(true);
  });

  test("array factories should keep the operand list and bind one parameter", () => {
    for (const [operator, type] of [
      [ArrayContains([1]), "arrayContains"],
      [ArrayContainedBy([1]), "arrayContainedBy"],
      [ArrayOverlap([1]), "arrayOverlap"],
    ] as const) {
      expect(operator.type).toBe(type);
      expect(operator.value).toEqual([1]);
      expect(operator.multipleParameters).toBe(false);
    }
  });

  test("IsNull should not bind any parameter", () => {
    const operator = IsNull();

    expect(operator.type).toBe("isNull");
    expect(operator.useParameter).toBe(false);
    expect(operator.value).toBe("");
  });

  test("Raw should accept a SQL string or a function with parameters", () => {
    const fromString = Raw("1 = 1");
    const fromFunction = Raw((alias) => `${alias} > :min`, { min: 18 });

    expect(fromString.type).toBe("raw");
    expect(fromString.useParameter).toBe(false);
    expect(fromString.value).toBe("1 = 1");
    expect(fromString.getSql).toBeUndefined();

    expect(fromFunction.useParameter).toBe(true);
    expect(fromFunction.getSql?.('"user"."age"')).toBe('"user"."age" > :min');
    expect(fromFunction.objectLiteralParameters).toEqual({ min: 18 });
    expect(fromFunction.value).toEqual([]);
  });

  test("nested operators should expose the child and unwrap its operand", () => {
    const operator = Not(In([1, 2]));

    expect(operator.type).toBe("not");
    expect(operator.child?.type).toBe("in");
    expect(operator.value).toEqual([1, 2]);
    expect(operator.children).toEqual([]);
  });

  test("And / Or should combine operators and expose them as children", () => {
    const and = And(MoreThan(1), LessThan(9));
    const or = Or(Equal("a"), Equal("b"));

    expect(and.type).toBe("and");
    expect(and.multipleParameters).toBe(true);
    expect(and.children.map((child) => child.type)).toEqual(["moreThan", "lessThan"]);
    expect(and.value).toEqual([1, 9]);
    expect(and.child).toBeUndefined();

    expect(or.type).toBe("or");
    expect(or.children).toHaveLength(2);
  });

  test("transformValue should map plain, array, nested and combined operands", () => {
    const double = (value: unknown): unknown => (value as number) * 2;

    expect(MoreThan(2).transformValue(double).value).toBe(4);
    expect(In([1, 2]).transformValue(double).value).toEqual([2, 4]);

    const nested = Not(Equal(3)).transformValue(double);
    expect(nested.type).toBe("not");
    expect(nested.child?.type).toBe("equal");
    expect(nested.value).toBe(6);

    const combined = And(MoreThan(1), LessThan(4)).transformValue(double);
    expect(combined.children.map((child) => child.value)).toEqual([2, 8]);
    expect(combined.getSql).toBeUndefined();
  });

  test("transformValue should preserve the raw SQL function and its parameters", () => {
    const raw = Raw((alias) => `${alias} > :min`, { min: 1 }).transformValue((value) => value);

    expect(raw.getSql?.("x")).toBe("x > :min");
    expect(raw.objectLiteralParameters).toEqual({ min: 1 });
  });

  test("isFindOperator should accept instances and marked objects from another module copy", () => {
    const foreign = { [Symbol.for("@talosjs/database:find-operator")]: true, type: "equal" };

    expect(isFindOperator(Equal(1))).toBe(true);
    expect(isFindOperator(foreign)).toBe(true);
    expect(isFindOperator({ type: "equal" })).toBe(false);
    expect(isFindOperator(null)).toBe(false);
    expect(isFindOperator("equal")).toBe(false);
  });
});
