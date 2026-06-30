import type { Filter } from "./types.ts";

export const buildFilter = <T extends { metadata: Record<string, unknown> }>(filter: Filter<T>): string => {
  if ("AND" in filter) {
    return `(${filter.AND.map(buildFilter).join(" AND ")})`;
  }
  if ("OR" in filter) {
    return `(${filter.OR.map(buildFilter).join(" OR ")})`;
  }
  if ("NOT" in filter) {
    return `NOT (${buildFilter(filter.NOT)})`;
  }

  const fieldStr = String(filter.field);
  const col = fieldStr === "id" || fieldStr === "text" ? fieldStr : `metadata.${fieldStr}`;

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

  if (filter.op === ">" || filter.op === ">=" || filter.op === "<" || filter.op === "<=" || filter.op === "=") {
    return `${col} ${filter.op} ${typeof filter.value === "string" ? `'${filter.value}'` : filter.value}`;
  }

  return `${col} ${filter.op} ${typeof filter.value === "string" ? `'${filter.value}'` : filter.value}`;
};
