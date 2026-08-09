import type { FilterType } from "./types.ts";

// Columns "id" and "text" live at the table root; every other field is nested under "metadata".
export const toColumnName = (field: string): string =>
  field === "id" || field === "text" ? field : `metadata.${field}`;

export const buildFilter = <T extends { metadata: Record<string, unknown> }>(filter: FilterType<T>): string => {
  if ("AND" in filter) {
    return `(${filter.AND.map(buildFilter).join(" AND ")})`;
  }
  if ("OR" in filter) {
    return `(${filter.OR.map(buildFilter).join(" OR ")})`;
  }
  if ("NOT" in filter) {
    return `NOT (${buildFilter(filter.NOT)})`;
  }

  const col = toColumnName(String(filter.field));

  if (
    filter.op === "IS NULL" ||
    filter.op === "IS NOT NULL" ||
    filter.op === "IS TRUE" ||
    filter.op === "IS NOT TRUE" ||
    filter.op === "IS FALSE" ||
    filter.op === "IS NOT FALSE"
  ) {
    return `${col} ${filter.op}`;
  }

  if (filter.op === "IN") {
    const values = filter.value.map((v) => (typeof v === "string" ? `'${v}'` : v));
    return `${col} IN (${values.join(", ")})`;
  }

  if (filter.op === "LIKE" || filter.op === "NOT LIKE") {
    return `${col} ${filter.op} '${filter.value}'`;
  }

  // Comparison operators (>, >=, <, <=, =) and any forward-compatible unsupported operator
  // share the same "<col> <op> <value>" shape.
  return `${col} ${filter.op} ${typeof filter.value === "string" ? `'${filter.value}'` : filter.value}`;
};
