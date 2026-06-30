import { jsonSchemaToTypeString } from "@talosjs/validation";
import type { RouteConfigType, ValidRoutePath } from "./types";

// Type guards and validation helpers
export const isValidRoutePath = (path: string): path is ValidRoutePath => {
  // Runtime validation
  if (!path.startsWith("/")) return false;
  if (path.includes("//")) return false;
  if (path.includes("::")) return false;
  if (path.endsWith(":")) return false;
  if (path.includes("/:")) {
    // Check for malformed parameters
    const segments = path.split("/");
    for (const segment of segments) {
      if (segment.startsWith(":") && segment.length === 1) return false;
      if (segment.includes(":") && !segment.startsWith(":")) return false;
    }
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

  if (config.response) {
    try {
      const constraint = "getConstraint" in config.response ? config.response.getConstraint() : config.response;
      const schema = constraint.toJsonSchema();
      let typeStr = jsonSchemaToTypeString(schema);
      if (typeStr === "unknown" || typeStr === "{  }" || typeStr === "Record<string, unknown>") {
        typeStr = "never";
      }
      typeProperties.push(`response: ${typeStr}`);
    } catch {
      typeProperties.push("response: never");
    }
  }

  if (config.params) {
    const paramProps: string[] = [];

    for (const [key, assert] of Object.entries(config.params)) {
      try {
        const constraint = "getConstraint" in assert ? assert.getConstraint() : assert;
        const schema = constraint.toJsonSchema();
        let typeStr = jsonSchemaToTypeString(schema);
        if (typeStr === "unknown" || typeStr === "{  }" || typeStr === "Record<string, unknown>") {
          typeStr = "never";
        }
        paramProps.push(`${key}: ${typeStr}`);
      } catch {
        paramProps.push(`${key}: never`);
      }
    }

    if (paramProps.length > 0) {
      const paramsType = `{ ${paramProps.join("; ")} }`;
      typeProperties.push(`params: ${paramsType}`);
    } else {
      typeProperties.push("params: never");
    }
  }

  if (config.payload) {
    try {
      const constraint = "getConstraint" in config.payload ? config.payload.getConstraint() : config.payload;
      const schema = constraint.toJsonSchema();
      let typeStr = jsonSchemaToTypeString(schema);
      if (typeStr === "unknown" || typeStr === "{  }" || typeStr === "Record<string, unknown>") {
        typeStr = "never";
      }
      typeProperties.push(`payload: ${typeStr}`);
    } catch {
      typeProperties.push("payload: never");
    }
  }

  if (config.queries) {
    try {
      const constraint = "getConstraint" in config.queries ? config.queries.getConstraint() : config.queries;
      const schema = constraint.toJsonSchema();
      let typeStr = jsonSchemaToTypeString(schema);
      if (typeStr === "unknown" || typeStr === "{  }" || typeStr === "Record<string, unknown>") {
        typeStr = "never";
      }
      typeProperties.push(`queries: ${typeStr}`);
    } catch {
      typeProperties.push("queries: never");
    }
  }

  return `{\n  ${typeProperties.join(";\n  ")};\n}`;
};

/**
 * Helper function to convert AssertType/IAssert to JSON Schema
 */
const assertToJsonSchema = (assert: unknown): Record<string, unknown> => {
  try {
    const constraint =
      assert && typeof assert === "object" && "getConstraint" in assert
        ? (assert as { getConstraint: () => { toJsonSchema: () => Record<string, unknown> } }).getConstraint()
        : (assert as { toJsonSchema: () => Record<string, unknown> });
    return constraint.toJsonSchema();
  } catch {
    return { type: "unknown" };
  }
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

  if (config.params) {
    const paramsSchema: Record<string, unknown> = {
      type: "object",
      properties: {},
    };

    for (const [key, assert] of Object.entries(config.params)) {
      const schema = assertToJsonSchema(assert);
      // Remove $schema from the schema object
      delete schema.$schema;
      // Add required field to each property
      schema.required = true;
      (paramsSchema.properties as Record<string, unknown>)[key] = schema;
    }

    schemas.params = paramsSchema;
  }

  if (config.queries) {
    const schema = assertToJsonSchema(config.queries);
    delete schema.$schema;
    if (schema.type === "object" && schema.properties) {
      const requiredFields = (schema.required as string[]) || [];
      const properties = schema.properties as Record<string, unknown>;
      for (const key of Object.keys(properties)) {
        const propSchema = properties[key] as Record<string, unknown>;
        propSchema.required = requiredFields.includes(key);
      }
      delete schema.required;
    }
    schemas.queries = schema;
  }

  if (config.payload) {
    const schema = assertToJsonSchema(config.payload);
    delete schema.$schema;
    if (schema.type === "object" && schema.properties) {
      const requiredFields = (schema.required as string[]) || [];
      const properties = schema.properties as Record<string, unknown>;
      for (const key of Object.keys(properties)) {
        const propSchema = properties[key] as Record<string, unknown>;
        propSchema.required = requiredFields.includes(key);
      }
      delete schema.required;
    }
    schemas.payload = schema;
  }

  if (config.response) {
    const schema = assertToJsonSchema(config.response);
    delete schema.$schema;
    if (schema.type === "object" && schema.properties) {
      const requiredFields = (schema.required as string[]) || [];
      const properties = schema.properties as Record<string, unknown>;
      for (const key of Object.keys(properties)) {
        const propSchema = properties[key] as Record<string, unknown>;
        propSchema.required = requiredFields.includes(key);
      }
      delete schema.required;
    }
    schemas.response = schema;
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
