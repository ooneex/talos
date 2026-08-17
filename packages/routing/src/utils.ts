import { type AssertType, type IAssert, isAssert, isAssertRecord, jsonSchemaToTypeString } from "@talosjs/validation";
import type { RouteConfigType, ValidRoutePathType } from "./types";

/**
 * Resolve an IAssert wrapper down to the constraint it carries
 */
const resolveAssert = (assert: AssertType | IAssert): AssertType =>
  isAssert(assert) ? resolveAssert(assert.getConstraint()) : assert;

const normalizeTypeString = (typeString: string): string =>
  typeString === "unknown" || typeString === "{  }" || typeString === "Record<string, unknown>" ? "never" : typeString;

/**
 * Convert a constraint — arktype type, IAssert or record of either — to its TypeScript type string
 */
const assertToTypeString = (assert: AssertType | IAssert): string => {
  try {
    const constraint = resolveAssert(assert);

    if (isAssertRecord(constraint)) {
      const properties = Object.entries(constraint).map(([key, entry]) => `${key}: ${assertToTypeString(entry)}`);

      return properties.length > 0 ? `{ ${properties.join("; ")} }` : "never";
    }

    return normalizeTypeString(jsonSchemaToTypeString(constraint.toJsonSchema()));
  } catch {
    return "never";
  }
};

// Type guards and validation helpers
export const isValidRoutePath = (path: string): path is ValidRoutePathType => {
  // Runtime validation
  if (!path.startsWith("/")) return false;
  if (path.includes("//")) return false;
  if (path.includes("::")) return false;
  if (path.endsWith(":")) return false;
  if (path.includes("/:")) {
    // Check for malformed parameters
    const isMalformed = (segment: string): boolean =>
      segment === ":" || (segment.includes(":") && !segment.startsWith(":"));

    if (path.split("/").some(isMalformed)) return false;
  }
  return true;
};

/**
 * Extract parameter names from a route path at runtime
 */
export const extractParameterNames = (path: string): string[] => {
  const matches = path.match(/:([^/]+)/g);
  return matches ? matches.map((match) => match.slice(1)) : [];
};

/**
 * Convert RouteConfigType to TypeScript type string representation
 *
 * @param config - Route configuration object
 * @returns TypeScript type definition as a string
 *
 * @example
 * ```ts
 * const config = {
 *   params: {
 *     id: Assert("string"),
 *     emailId: Assert("string"),
 *   },
 *   payload: Assert({ name: "string" }),
 *   queries: Assert({ limit: "number" }),
 *   response: Assert({ success: "boolean", message: "string" }),
 * };
 *
 * const typeString = routeConfigToTypeString(config);
 * // Returns:
 * // {
 * //   response: { success: boolean; message: string };
 * //   params: { id: string; emailId: string };
 * //   payload: { name: string };
 * //   queries: { limit: number };
 * // }
 * ```
 */
export const routeConfigToTypeString = (
  config: Pick<RouteConfigType, "params" | "queries" | "payload" | "response">,
): string => {
  if (!config.response && !config.params && !config.payload && !config.queries) {
    return "never";
  }

  const typeProperties: string[] = [];

  for (const key of ["response", "params", "payload", "queries"] as const) {
    const assert = config[key];

    if (assert) {
      typeProperties.push(`${key}: ${assertToTypeString(assert)}`);
    }
  }

  return `{\n  ${typeProperties.join(";\n  ")};\n}`;
};

/**
 * Helper function to convert AssertType/IAssert to JSON Schema
 */
const assertToJsonSchema = (assert: AssertType | IAssert): Record<string, unknown> => {
  try {
    const constraint = resolveAssert(assert);

    if (isAssertRecord(constraint)) {
      const properties: Record<string, unknown> = {};

      for (const [key, entry] of Object.entries(constraint)) {
        const schema = assertToJsonSchema(entry);
        delete schema.$schema;
        schema.required = true;
        properties[key] = schema;
      }

      return { type: "object", properties };
    }

    return constraint.toJsonSchema() as Record<string, unknown>;
  } catch {
    return { type: "unknown" };
  }
};

/**
 * Build the documented schema of a route section, flagging each property as required or not
 */
const buildRouteSchema = (assert: AssertType | IAssert): Record<string, unknown> => {
  const { $schema: _$schema, ...schema } = assertToJsonSchema(assert);

  // a record constraint already flags each of its properties as required
  if (schema.type === "object" && schema.properties && !isAssertRecord(resolveAssert(assert))) {
    const { required, ...schemaWithoutRequired } = schema;
    const requiredFields = new Set((required as string[]) || []);
    const properties = schema.properties as Record<string, unknown>;

    for (const key of Object.keys(properties)) {
      (properties[key] as Record<string, unknown>).required = requiredFields.has(key);
    }

    return schemaWithoutRequired;
  }

  return schema;
};

/**
 * Convert RouteConfigType to JSON documentation format
 *
 * @param config - Route configuration object
 * @returns JSON documentation object with route metadata and schemas
 *
 * @example
 * ```ts
 * const config = {
 *   name: "api.users.delete",
 *   path: "/users/:id/emails/:emailId",
 *   method: "DELETE",
 *   description: "Delete a user by ID",
 *   params: {
 *     id: Assert("string"),
 *     emailId: Assert("string"),
 *   },
 *   payload: Assert({ name: "string" }),
 *   queries: Assert({ limit: "number" }),
 *   response: Assert({ success: "boolean", message: "string" }),
 *   env: [Environment.LOCAL],
 *   roles: ["ROLE_ADMIN"],
 *   isSocket: false,
 * };
 *
 * const jsonDoc = routeConfigToJsonDoc(config);
 * // Returns:
 * // {
 * //   name: "api.users.delete",
 * //   path: "/users/:id/emails/:emailId",
 * //   method: "DELETE",
 * //   description: "Delete a user by ID",
 * //   isSocket: false,
 * //   parameters: ["id", "emailId"],
 * //   schemas: {
 * //     params: { type: "object", properties: { id: { type: "string" }, emailId: { type: "string" } } },
 * //     queries: { type: "object", properties: { limit: { type: "number" } } },
 * //     payload: { type: "object", properties: { name: { type: "string" } } },
 * //     response: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } }
 * //   },
 * //   security: {
 * //     environments: ["LOCAL"],
 * //     roles: ["ADMIN"],
 * //     allowedIPs: [],
 * //     allowedHosts: []
 * //   }
 * // }
 * ```
 */
export const routeConfigToJsonDoc = (config: RouteConfigType): Record<string, unknown> => {
  const doc: Record<string, unknown> = {
    name: config.name,
    path: config.path,
    method: config.method,
    version: config.version,
    description: config.description,
    controller: config.controller.name,
    isSocket: config.isSocket,
    parameters: extractParameterNames(config.path),
  };

  const schemas: Record<string, Record<string, unknown>> = {};

  for (const key of ["params", "queries", "payload", "files", "response"] as const) {
    const assert = config[key];

    if (assert) {
      schemas[key] = buildRouteSchema(assert);
    }
  }

  if (Object.keys(schemas).length > 0) {
    doc.schemas = schemas;
  }

  const security: Record<string, unknown> = {};

  if (config.env && config.env.length > 0) {
    security.environments = config.env;
  }

  if (config.roles && config.roles.length > 0) {
    security.roles = config.roles;
  }

  if (config.ip && config.ip.length > 0) {
    security.allowedIPs = config.ip;
  }

  if (config.host && config.host.length > 0) {
    security.allowedHosts = config.host;
  }

  if (Object.keys(security).length > 0) {
    doc.security = security;
  }

  return doc;
};
