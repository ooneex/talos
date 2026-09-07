import type { ColumnType } from "../../types";

/** How a raw database value of a column becomes the entity value; decided once per column. */
export type HydrationKindType =
  | "array"
  | "boolean"
  | "datetime"
  | "date"
  | "json"
  | "simple-array"
  | "integer"
  | "none";

const BOOLEAN_TYPES: ReadonlySet<string> = new Set(["boolean", "bool"]);
const DATETIME_TYPES: ReadonlySet<string> = new Set([
  "timestamp",
  "timestamptz",
  "timestamp with time zone",
  "timestamp without time zone",
  "timestamp with local time zone",
  "datetime",
  "datetime2",
  "datetimeoffset",
]);
const JSON_TYPES: ReadonlySet<string> = new Set(["json", "jsonb", "simple-json"]);
const INTEGER_TYPES: ReadonlySet<string> = new Set([
  "int",
  "int2",
  "int4",
  "int8",
  "integer",
  "tinyint",
  "smallint",
  "mediumint",
  "bigint",
  "serial",
  "bigserial",
  "rowid",
]);
const FLOAT_TYPES: ReadonlySet<string> = new Set([
  "float",
  "float4",
  "float8",
  "double",
  "double precision",
  "real",
  "dec",
  "decimal",
  "numeric",
  "number",
  "smalldecimal",
  "fixed",
]);

export const typeName = (type: ColumnType): string => (typeof type === "function" ? type.name.toLowerCase() : type);

export const isBooleanType = (type: ColumnType): boolean => BOOLEAN_TYPES.has(typeName(type));
export const isDateTimeType = (type: ColumnType): boolean => type === Date || DATETIME_TYPES.has(typeName(type));
export const isDateType = (type: ColumnType): boolean => type === "date";
export const isJsonType = (type: ColumnType): boolean => JSON_TYPES.has(typeName(type));
export const isIntegerType = (type: ColumnType): boolean => type === Number || INTEGER_TYPES.has(typeName(type));
export const isNumericType = (type: ColumnType): boolean => isIntegerType(type) || FLOAT_TYPES.has(typeName(type));

/** Picks the hydration a column needs; `bigint` values stay strings so nothing is lost. */
export const classifyColumnType = (type: ColumnType, isArray: boolean): HydrationKindType => {
  if (isArray) {
    return "array";
  }

  if (isBooleanType(type)) {
    return "boolean";
  }

  if (isDateTimeType(type)) {
    return "datetime";
  }

  if (isDateType(type)) {
    return "date";
  }

  if (isJsonType(type)) {
    return "json";
  }

  if (type === "simple-array") {
    return "simple-array";
  }

  if (isIntegerType(type) && typeName(type) !== "bigint") {
    return "integer";
  }

  return "none";
};
