import { describe, expect, test } from "bun:test";
import {
  isBooleanColumn,
  isDateColumn,
  isDateTimeColumn,
  isIntegerColumn,
  isJsonColumn,
  isNumericColumn,
  parseJson,
  toBoolean,
  toDate,
  toDateString,
  typeName,
} from "../../../src/orm/driver/AbstractDriver";
import { PostgresDriver } from "../../../src/orm/driver/PostgresDriver";
import { SqliteDriver } from "../../../src/orm/driver/SqliteDriver";
import { fakeColumn } from "../../fixtures/metadata";

const postgres = new PostgresDriver({ type: "postgres" });
const sqlite = new SqliteDriver({ type: "sqlite", database: ":memory:" });

describe("driver helpers", () => {
  test("typeName should lower-case constructor names and pass strings through", () => {
    expect(typeName(Number)).toBe("number");
    expect(typeName(Date)).toBe("date");
    expect(typeName("jsonb")).toBe("jsonb");
  });

  test("column classifiers should recognise the type families", () => {
    expect(isBooleanColumn(fakeColumn({ type: "bool" }))).toBe(true);
    expect(isBooleanColumn(fakeColumn({ type: Boolean }))).toBe(true);
    expect(isBooleanColumn(fakeColumn({ type: "text" }))).toBe(false);

    expect(isDateTimeColumn(fakeColumn({ type: Date }))).toBe(true);
    expect(isDateTimeColumn(fakeColumn({ type: "timestamptz" }))).toBe(true);
    expect(isDateTimeColumn(fakeColumn({ type: "date" }))).toBe(false);
    expect(isDateColumn(fakeColumn({ type: "date" }))).toBe(true);

    expect(isJsonColumn(fakeColumn({ type: "simple-json" }))).toBe(true);
    expect(isJsonColumn(fakeColumn({ type: "jsonb" }))).toBe(true);

    expect(isIntegerColumn(fakeColumn({ type: Number }))).toBe(true);
    expect(isIntegerColumn(fakeColumn({ type: "bigserial" }))).toBe(true);
    expect(isIntegerColumn(fakeColumn({ type: "decimal" }))).toBe(false);
    expect(isNumericColumn(fakeColumn({ type: "decimal" }))).toBe(true);
    expect(isNumericColumn(fakeColumn({ type: "varchar" }))).toBe(false);
  });

  test("toDate should treat zoneless database timestamps as UTC and keep other inputs", () => {
    expect(toDate("2024-01-02 03:04:05")).toEqual(new Date("2024-01-02T03:04:05Z"));
    expect(toDate("2024-01-02T03:04:05.123")).toEqual(new Date("2024-01-02T03:04:05.123Z"));
    expect(toDate("2024-01-02T03:04:05.000+02:00")).toEqual(new Date("2024-01-02T01:04:05.000Z"));
    expect(toDate(86_400_000)).toEqual(new Date("1970-01-02T00:00:00.000Z"));

    const date = new Date(0);
    expect(toDate(date)).toBe(date);
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeUndefined();
    expect(toDate(true)).toBe(true);
  });

  test("toDateString should keep the calendar day of a Date and leave other values alone", () => {
    expect(toDateString(new Date("2024-05-06T23:59:59Z"))).toBe("2024-05-06");
    expect(toDateString("2024-05-06")).toBe("2024-05-06");
    expect(toDateString(null)).toBeNull();
  });

  test("toBoolean should accept every truthy spelling databases return", () => {
    for (const truthy of [1, "1", "t", "true", 1n, true]) {
      expect(toBoolean(truthy)).toBe(true);
    }

    for (const falsy of [0, "0", "f", "false", 0n, false]) {
      expect(toBoolean(falsy)).toBe(false);
    }

    expect(toBoolean(null)).toBeNull();
    expect(toBoolean(undefined)).toBeUndefined();
  });

  test("parseJson should parse strings and return anything else untouched", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson("not json")).toBe("not json");
    expect(parseJson({ already: true })).toEqual({ already: true });
    expect(parseJson(3)).toBe(3);
  });
});

describe("AbstractDriver", () => {
  test("should double-quote identifiers and qualify them with a schema", () => {
    expect(sqlite.escape('we"ird')).toBe('"we""ird"');
    expect(sqlite.escapePath("users")).toBe('"users"');
    expect(sqlite.escapePath("users", "public")).toBe('"public"."users"');
  });

  test("should number parameters from $1 and add no cast by default", () => {
    expect(sqlite.createParameter(0)).toBe("$1");
    expect(sqlite.createParameter(9)).toBe("$10");
    expect(sqlite.parameterCast(fakeColumn({ type: "jsonb" }))).toBe("");
  });

  describe("prepareParameter", () => {
    test("should bind primitives as-is and null for missing values", () => {
      expect(sqlite.prepareParameter(undefined)).toBeNull();
      expect(sqlite.prepareParameter(null)).toBeNull();
      expect(sqlite.prepareParameter("text")).toBe("text");
      expect(sqlite.prepareParameter(3)).toBe(3);
      expect(sqlite.prepareParameter(10n)).toBe(10n);
      expect(sqlite.prepareParameter(false)).toBe(false);

      const bytes = new Uint8Array([1, 2]);
      expect(sqlite.prepareParameter(bytes)).toBe(bytes);
    });

    test("should run the column transformer before binding", () => {
      const column = fakeColumn({ transformer: { to: (value: unknown) => `${value}!`, from: (value) => value } });

      expect(sqlite.prepareParameter("hi", column)).toBe("hi!");
    });

    test("should keep only the day for date columns and hand timestamps to the dialect", () => {
      const date = new Date("2024-05-06T10:11:12.000Z");

      expect(sqlite.prepareParameter(date, fakeColumn({ type: "date" }))).toBe("2024-05-06");
      expect(sqlite.prepareParameter(date)).toBe("2024-05-06T10:11:12.000Z");
      expect(postgres.prepareParameter(date)).toBe(date);
    });

    test("should serialise arrays according to the column", () => {
      expect(sqlite.prepareParameter(["a", "b"], fakeColumn({ type: "simple-array" }))).toBe("a,b");
      expect(sqlite.prepareParameter([1, 2], fakeColumn({ type: "simple-json" }))).toBe("[1,2]");
      expect(sqlite.prepareParameter([1, 2], fakeColumn({ type: "integer", array: true }))).toBe("[1,2]");
      expect(sqlite.prepareParameter([1, 2])).toBe("[1,2]");
      expect(postgres.prepareParameter(["a", "b"], fakeColumn({ type: "text", array: true }))).toBe('{"a","b"}');
    });

    test("should serialise objects as JSON", () => {
      expect(sqlite.prepareParameter({ theme: "dark" })).toBe('{"theme":"dark"}');
    });
  });

  describe("hydrateValue", () => {
    test("should map undefined to null and run the transformer last", () => {
      const column = fakeColumn({ transformer: { to: (value) => value, from: (value: unknown) => `<${value}>` } });

      expect(sqlite.hydrateValue(undefined, column)).toBe("<null>");
      expect(sqlite.hydrateValue("x", column)).toBe("<x>");
    });

    test("should convert booleans, timestamps, dates and JSON", () => {
      expect(sqlite.hydrateValue(1, fakeColumn({ type: "boolean" }))).toBe(true);
      expect(sqlite.hydrateValue("2024-01-02 03:04:05", fakeColumn({ type: Date }))).toEqual(
        new Date("2024-01-02T03:04:05Z"),
      );
      expect(sqlite.hydrateValue(new Date("2024-05-06T22:00:00Z"), fakeColumn({ type: "date" }))).toBe("2024-05-06");
      expect(sqlite.hydrateValue('{"a":1}', fakeColumn({ type: "simple-json" }))).toEqual({ a: 1 });
    });

    test("should split simple arrays and keep an empty string as an empty list", () => {
      expect(sqlite.hydrateValue("a,b", fakeColumn({ type: "simple-array" }))).toEqual(["a", "b"]);
      expect(sqlite.hydrateValue("", fakeColumn({ type: "simple-array" }))).toEqual([]);
      expect(sqlite.hydrateValue(["kept"], fakeColumn({ type: "simple-array" }))).toEqual(["kept"]);
    });

    test("should turn integer strings into numbers but keep bigint text", () => {
      expect(sqlite.hydrateValue("42", fakeColumn({ type: "integer" }))).toBe(42);
      expect(sqlite.hydrateValue("42", fakeColumn({ type: "bigint" }))).toBe("42");
      expect(sqlite.hydrateValue("9007199254740993", fakeColumn({ type: "integer" }))).toBe("9007199254740993");
      expect(sqlite.hydrateValue("abc", fakeColumn({ type: "varchar" }))).toBe("abc");
    });

    test("should hydrate array columns element by element", () => {
      expect(sqlite.hydrateValue("[1,0]", fakeColumn({ type: "boolean", array: true }))).toEqual([true, false]);
      expect(sqlite.hydrateValue('["1", "2"]', fakeColumn({ type: "integer", array: true }))).toEqual([1, 2]);
      expect(sqlite.hydrateValue('["", "3.5"]', fakeColumn({ type: "decimal", array: true }))).toEqual(["", 3.5]);
      expect(sqlite.hydrateValue('["2024-01-02 03:04:05"]', fakeColumn({ type: Date, array: true }))).toEqual([
        new Date("2024-01-02T03:04:05Z"),
      ]);
      expect(sqlite.hydrateValue("not-an-array", fakeColumn({ type: "text", array: true }))).toBe("not-an-array");
      expect(sqlite.hydrateValue(null, fakeColumn({ type: "text", array: true }))).toBeNull();
    });

    test("should turn the typed arrays Bun decodes PostgreSQL integer arrays into plain arrays", () => {
      const hydrated = postgres.hydrateValue(new Int32Array([7, 42]), fakeColumn({ type: "int", array: true }));

      expect(Array.isArray(hydrated)).toBe(true);
      expect(hydrated).toEqual([7, 42]);
      expect(postgres.hydrateValue(new Float64Array([1.5]), fakeColumn({ type: "float", array: true }))).toEqual([1.5]);
      expect(postgres.hydrateValue(["a", "b"], fakeColumn({ type: "text", array: true }))).toEqual(["a", "b"]);
    });
  });

  describe("normalizeDefault", () => {
    test("should render every default kind as a DDL literal", () => {
      expect(postgres.normalizeDefault(fakeColumn({}))).toBeUndefined();
      expect(postgres.normalizeDefault(fakeColumn({ default: () => "now()" }))).toBe("now()");
      expect(postgres.normalizeDefault(fakeColumn({ default: null }))).toBe("NULL");
      expect(postgres.normalizeDefault(fakeColumn({ default: true }))).toBe("true");
      expect(sqlite.normalizeDefault(fakeColumn({ default: true }))).toBe("1");
      expect(sqlite.normalizeDefault(fakeColumn({ default: false }))).toBe("0");
      expect(postgres.normalizeDefault(fakeColumn({ default: 5 }))).toBe("5");
      expect(postgres.normalizeDefault(fakeColumn({ default: 5n }))).toBe("5");
      expect(postgres.normalizeDefault(fakeColumn({ default: new Date("2024-01-01T00:00:00.000Z") }))).toBe(
        "'2024-01-01T00:00:00.000Z'",
      );
      expect(postgres.normalizeDefault(fakeColumn({ default: "it's" }))).toBe("'it''s'");
      expect(postgres.normalizeDefault(fakeColumn({ default: { a: "'" } }))).toBe(`'{"a":"''"}'`);
    });
  });

  test("should emulate ILIKE where the dialect has none", () => {
    expect(postgres.buildIlike("u.name", "$1")).toBe("u.name ILIKE $1");
    expect(sqlite.buildIlike("u.name", "$1")).toBe("LOWER(u.name) LIKE LOWER($1)");
  });

  test("should write the standard conflict clauses", () => {
    expect(postgres.insertKeyword(true)).toBe("INSERT INTO");
    expect(postgres.ignoreConflictClause()).toBe("ON CONFLICT DO NOTHING");
    expect(postgres.upsertClause('"t"', ['"id"'], [])).toBe('ON CONFLICT ("id") DO NOTHING');
    expect(postgres.upsertClause('"t"', ['"id"'], ['"a"', '"b"'])).toBe(
      'ON CONFLICT ("id") DO UPDATE SET "a" = EXCLUDED."a", "b" = EXCLUDED."b"',
    );
    expect(postgres.upsertClause('"t"', ['"id"'], ['"a"'], true)).toBe(
      'ON CONFLICT ("id") DO UPDATE SET "a" = EXCLUDED."a" WHERE "t"."a" IS DISTINCT FROM EXCLUDED."a"',
    );
    expect(sqlite.upsertClause('"t"', ['"id"'], ['"a"'], true)).toBe(
      'ON CONFLICT ("id") DO UPDATE SET "a" = EXCLUDED."a" WHERE "t"."a" IS NOT EXCLUDED."a"',
    );
  });

  test("should expose the default statements and capabilities", () => {
    expect(postgres.truncateStatement('"t"')).toBe('TRUNCATE TABLE "t"');
    expect(postgres.beginTransactionStatements()).toEqual(["START TRANSACTION"]);
    expect(postgres.beginTransactionStatements("SERIALIZABLE")).toEqual([
      "START TRANSACTION ISOLATION LEVEL SERIALIZABLE",
    ]);
    expect(postgres.supportsDefaultValues).toBe(true);
    expect(postgres.supportsDefaultKeyword).toBe(true);
  });

  test("should append length, precision and scale suffixes", () => {
    expect(postgres.normalizeType(fakeColumn({ type: "varchar", length: 50 }))).toBe("character varying(50)");
    expect(postgres.normalizeType(fakeColumn({ type: "varchar", length: "" }))).toBe("character varying");
    expect(postgres.normalizeType(fakeColumn({ type: "numeric", precision: 10, scale: 2 }))).toBe("numeric(10,2)");
    expect(postgres.normalizeType(fakeColumn({ type: "numeric", precision: 10 }))).toBe("numeric(10)");
    expect(postgres.normalizeType(fakeColumn({ type: "numeric", precision: null, scale: 2 }))).toBe("numeric");
  });
});
