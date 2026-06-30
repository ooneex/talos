import { describe, expect, test } from "bun:test";
import { Environment } from "@talosjs/app-env";
import type { ContextType, IController } from "@talosjs/controller";
import type { IResponse } from "@talosjs/http-response";
import { Assert } from "@talosjs/validation";
import type { RouteConfigType } from "@/types";
import { extractParameterNames, isValidRoutePath, routeConfigToJsonDoc, routeConfigToTypeString } from "@/utils";

class MockController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    return context.response;
  }
}

class CustomUserController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    return context.response;
  }
}

describe("isValidRoutePath", () => {
  test("validates correct paths", () => {
    expect(isValidRoutePath("/users")).toBe(true);
    expect(isValidRoutePath("/users/:id")).toBe(true);
    expect(isValidRoutePath("/users/:id/posts/:postId")).toBe(true);
    expect(isValidRoutePath("/api/v1/users")).toBe(true);
  });

  test("rejects invalid paths", () => {
    expect(isValidRoutePath("users")).toBe(false);
    expect(isValidRoutePath("/users//posts")).toBe(false);
    expect(isValidRoutePath("/users/:")).toBe(false);
    expect(isValidRoutePath("/users/::id")).toBe(false);
    expect(isValidRoutePath("/:id:")).toBe(false);
  });
});

describe("extractParameterNames", () => {
  test("extracts single parameter", () => {
    expect(extractParameterNames("/users/:id")).toEqual(["id"]);
  });

  test("extracts multiple parameters", () => {
    expect(extractParameterNames("/users/:id/posts/:postId")).toEqual(["id", "postId"]);
  });

  test("returns empty array for paths without parameters", () => {
    expect(extractParameterNames("/users")).toEqual([]);
  });

  test("extracts parameters from complex paths", () => {
    expect(extractParameterNames("/users/:userId/emails/:emailId/state/:state")).toEqual([
      "userId",
      "emailId",
      "state",
    ]);
  });
});

describe("routeConfigToTypeString", () => {
  test("converts simple string params to type string", () => {
    const config = {
      params: {
        id: Assert("string"),
        emailId: Assert("string"),
      },
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("params: { id: string; emailId: string }");
  });

  test("converts object payload to type string", () => {
    const config = {
      payload: Assert({
        name: "string",
        age: "number",
      }),
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("payload:");
    expect(result).toContain("name: string");
    expect(result).toContain("age: number");
  });

  test("converts queries to type string", () => {
    const config = {
      queries: Assert({
        limit: "number",
        offset: "number",
      }),
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("queries: { limit: number; offset: number }");
  });

  test("converts response to type string", () => {
    const config = {
      response: Assert({
        success: "boolean",
        message: "string",
      }),
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("response:");
    expect(result).toContain("success: boolean");
    expect(result).toContain("message: string");
  });

  test("converts complete route config to type string", () => {
    const config = {
      params: {
        state: Assert("string"),
        id: Assert("string"),
        emailId: Assert("string"),
      },
      payload: Assert({
        name: "string",
      }),
      queries: Assert({
        limit: "number",
      }),
      response: Assert({
        success: "boolean",
        message: "string",
      }),
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("response:");
    expect(result).toContain("success: boolean");
    expect(result).toContain("message: string");
    expect(result).toContain("params:");
    expect(result).toContain("state: string");
    expect(result).toContain("id: string");
    expect(result).toContain("emailId: string");
    expect(result).toContain("payload: { name: string }");
    expect(result).toContain("queries: { limit: number }");
  });

  test("handles optional properties", () => {
    const config = {
      payload: Assert({
        name: "string",
        "age?": "number",
      }),
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("payload:");
    expect(result).toContain("name: string");
    expect(result).toContain("age?: number");
  });

  test("handles array types", () => {
    const config = {
      payload: Assert({
        tags: "string[]",
      }),
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("payload:");
    expect(result).toContain("tags: string[]");
  });

  test("handles nested objects", () => {
    const config = {
      payload: Assert({
        user: {
          name: "string",
          email: "string",
        },
      }),
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("payload:");
    expect(result).toContain("user:");
    expect(result).toContain("name: string");
    expect(result).toContain("email: string");
  });

  test("handles boolean types", () => {
    const config = {
      queries: Assert({
        active: "boolean",
      }),
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("queries: { active: boolean }");
  });

  test("handles number types", () => {
    const config = {
      params: {
        count: Assert("number"),
      },
    };

    const result = routeConfigToTypeString(config);

    expect(result).toContain("params: { count: number }");
  });

  test("handles empty config", () => {
    const config = {};

    const result = routeConfigToTypeString(config);

    expect(result).toBe("never");
  });

  test("returns properly formatted multi-line type string", () => {
    const config = {
      response: Assert({
        success: "boolean",
      }),
      params: {
        id: Assert("string"),
      },
    };

    const result = routeConfigToTypeString(config);

    expect(result).toMatch(/^\{\n/);
    expect(result).toMatch(/\n\}$/);
    expect(result).toContain(";\n  ");
  });
});

describe("routeConfigToJsonDoc", () => {
  test("converts minimal route config to JSON documentation", () => {
    const config: RouteConfigType = {
      name: "api.users.list",
      path: "/users",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "List all users",
      isSocket: false,
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.name).toBe("api.users.list");
    expect(result.path).toBe("/users");
    expect(result.method).toBe("GET");
    expect(result.version).toBe(1);
    expect(result.controller).toBe("MockController");
    expect(result.description).toBe("List all users");
    expect(result.isSocket).toBe(false);
    expect(result.parameters).toEqual([]);
    expect(result.schemas).toBeUndefined();
    expect(result.security).toBeUndefined();
  });

  test("includes controller name in JSON documentation", () => {
    const config: RouteConfigType = {
      name: "api.users.create",
      path: "/users",
      method: "POST",
      version: 1,
      controller: MockController,
      description: "Create a new user",
      isSocket: false,
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.controller).toBe("MockController");
  });

  test("includes custom controller name in JSON documentation", () => {
    const config: RouteConfigType = {
      name: "api.users.update",
      path: "/users/:id",
      method: "PUT",
      version: 1,
      controller: CustomUserController,
      description: "Update user by ID",
      isSocket: false,
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.controller).toBe("CustomUserController");
    expect(result.name).toBe("api.users.update");
    expect(result.path).toBe("/users/:id");
  });

  test("extracts parameters from route path", () => {
    const config: RouteConfigType = {
      name: "api.users.show",
      path: "/users/:id",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "Get user by ID",
      isSocket: false,
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.parameters).toEqual(["id"]);
  });

  test("extracts multiple parameters from route path", () => {
    const config: RouteConfigType = {
      name: "api.users.delete",
      path: "/users/:userId/emails/:emailId",
      method: "DELETE",
      version: 1,
      controller: MockController,
      description: "Delete user email",
      isSocket: false,
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.parameters).toEqual(["userId", "emailId"]);
  });

  test("converts params to JSON schema", () => {
    const config: RouteConfigType = {
      name: "api.users.show",
      path: "/users/:id",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "Get user by ID",
      isSocket: false,
      params: {
        id: Assert("string"),
      },
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.schemas).toBeDefined();
    const schemas = result.schemas as Record<string, unknown>;
    expect(schemas.params).toBeDefined();
    const paramsSchema = schemas.params as Record<string, unknown>;
    expect(paramsSchema.type).toBe("object");
    expect(paramsSchema.properties).toBeDefined();
    const properties = paramsSchema.properties as Record<string, unknown>;
    const idProperty = properties.id as Record<string, unknown>;
    expect(idProperty.required).toBe(true);
  });

  test("converts multiple params to JSON schema", () => {
    const config: RouteConfigType = {
      name: "api.users.delete",
      path: "/users/:userId/emails/:emailId",
      method: "DELETE",
      version: 1,
      controller: MockController,
      description: "Delete user email",
      isSocket: false,
      params: {
        userId: Assert("string"),
        emailId: Assert("string"),
      },
    };

    const result = routeConfigToJsonDoc(config);

    const schemas = result.schemas as Record<string, unknown>;
    const paramsSchema = schemas.params as Record<string, unknown>;
    const properties = paramsSchema.properties as Record<string, unknown>;
    expect(Object.keys(properties)).toHaveLength(2);
    const userIdProperty = properties.userId as Record<string, unknown>;
    const emailIdProperty = properties.emailId as Record<string, unknown>;
    expect(userIdProperty.required).toBe(true);
    expect(emailIdProperty.required).toBe(true);
  });

  test("converts queries to JSON schema", () => {
    const config: RouteConfigType = {
      name: "api.users.list",
      path: "/users",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "List users",
      isSocket: false,
      queries: Assert({
        limit: "number",
        offset: "number",
      }),
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.schemas).toBeDefined();
    const schemas = result.schemas as Record<string, unknown>;
    expect(schemas.queries).toBeDefined();
    const queriesSchema = schemas.queries as Record<string, unknown>;
    expect(queriesSchema.$schema).toBeUndefined();
    expect(queriesSchema.required).toBeUndefined();
    const queriesProperties = queriesSchema.properties as Record<string, unknown>;
    expect(queriesProperties.limit).toBeDefined();
    expect((queriesProperties.limit as Record<string, unknown>).required).toBe(true);
    expect(queriesProperties.offset).toBeDefined();
    expect((queriesProperties.offset as Record<string, unknown>).required).toBe(true);
  });

  test("converts payload to JSON schema", () => {
    const config: RouteConfigType = {
      name: "api.users.create",
      path: "/users",
      method: "POST",
      version: 1,
      controller: MockController,
      description: "Create user",
      isSocket: false,
      payload: Assert({
        name: "string",
        email: "string",
      }),
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.schemas).toBeDefined();
    const schemas = result.schemas as Record<string, unknown>;
    expect(schemas.payload).toBeDefined();
    const payloadSchema = schemas.payload as Record<string, unknown>;
    expect(payloadSchema.$schema).toBeUndefined();
    expect(payloadSchema.required).toBeUndefined();
    const payloadProperties = payloadSchema.properties as Record<string, unknown>;
    expect(payloadProperties.name).toBeDefined();
    expect((payloadProperties.name as Record<string, unknown>).required).toBe(true);
    expect(payloadProperties.email).toBeDefined();
    expect((payloadProperties.email as Record<string, unknown>).required).toBe(true);
  });

  test("converts response to JSON schema", () => {
    const config: RouteConfigType = {
      name: "api.users.create",
      path: "/users",
      method: "POST",
      version: 1,
      controller: MockController,
      description: "Create user",
      isSocket: false,
      response: Assert({
        success: "boolean",
        message: "string",
      }),
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.schemas).toBeDefined();
    const schemas = result.schemas as Record<string, unknown>;
    expect(schemas.response).toBeDefined();
    const responseSchema = schemas.response as Record<string, unknown>;
    expect(responseSchema.$schema).toBeUndefined();
    expect(responseSchema.required).toBeUndefined();
    const responseProperties = responseSchema.properties as Record<string, unknown>;
    expect(responseProperties.success).toBeDefined();
    expect((responseProperties.success as Record<string, unknown>).required).toBe(true);
    expect(responseProperties.message).toBeDefined();
    expect((responseProperties.message as Record<string, unknown>).required).toBe(true);
  });

  test("converts complete route config with all schemas", () => {
    const config: RouteConfigType = {
      name: "api.users.update",
      path: "/users/:id",
      method: "PUT",
      version: 1,
      controller: MockController,
      description: "Update user",
      isSocket: false,
      params: {
        id: Assert("string"),
      },
      queries: Assert({
        validate: "boolean",
      }),
      payload: Assert({
        name: "string",
        email: "string",
      }),
      response: Assert({
        success: "boolean",
        data: {
          id: "string",
          name: "string",
        },
      }),
    };

    const result = routeConfigToJsonDoc(config);

    const schemas = result.schemas as Record<string, unknown>;
    expect(schemas.params).toBeDefined();
    expect(schemas.queries).toBeDefined();
    expect(schemas.payload).toBeDefined();
    expect(schemas.response).toBeDefined();

    const queriesSchema = schemas.queries as Record<string, unknown>;
    expect(queriesSchema.$schema).toBeUndefined();
    expect(queriesSchema.required).toBeUndefined();
    const queriesProperties = queriesSchema.properties as Record<string, unknown>;
    expect((queriesProperties.validate as Record<string, unknown>).required).toBe(true);

    const payloadSchema = schemas.payload as Record<string, unknown>;
    expect(payloadSchema.$schema).toBeUndefined();
    expect(payloadSchema.required).toBeUndefined();
    const payloadProperties = payloadSchema.properties as Record<string, unknown>;
    expect((payloadProperties.name as Record<string, unknown>).required).toBe(true);
    expect((payloadProperties.email as Record<string, unknown>).required).toBe(true);

    const responseSchema = schemas.response as Record<string, unknown>;
    expect(responseSchema.$schema).toBeUndefined();
    expect(responseSchema.required).toBeUndefined();
    const responseProperties = responseSchema.properties as Record<string, unknown>;
    expect((responseProperties.success as Record<string, unknown>).required).toBe(true);
  });

  test("does not include security object when no security config provided", () => {
    const config: RouteConfigType = {
      name: "api.users.list",
      path: "/users",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "List users",
      isSocket: false,
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.security).toBeUndefined();
  });

  test("includes environments in security when provided", () => {
    const config: RouteConfigType = {
      name: "api.debug.info",
      path: "/debug",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "Debug info",
      isSocket: false,
      env: [Environment.LOCAL, Environment.DEVELOPMENT],
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.security).toBeDefined();
    const security = result.security as Record<string, unknown>;
    expect(security.environments).toEqual([Environment.LOCAL, Environment.DEVELOPMENT]);
    expect(security.roles).toBeUndefined();
    expect(security.allowedIPs).toBeUndefined();
    expect(security.allowedHosts).toBeUndefined();
  });

  test("includes roles in security when provided", () => {
    const config: RouteConfigType = {
      name: "api.users.list",
      path: "/admin/users",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "Admin users",
      isSocket: false,
      roles: ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"],
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.security).toBeDefined();
    const security = result.security as Record<string, unknown>;
    expect(security.roles).toEqual(["ROLE_ADMIN", "ROLE_SUPER_ADMIN"]);
    expect(security.environments).toBeUndefined();
    expect(security.allowedIPs).toBeUndefined();
    expect(security.allowedHosts).toBeUndefined();
  });

  test("includes allowedIPs in security when provided", () => {
    const config: RouteConfigType = {
      name: "api.internal.stats",
      path: "/internal/stats",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "Internal stats",
      isSocket: false,
      ip: ["127.0.0.1", "192.168.1.1"],
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.security).toBeDefined();
    const security = result.security as Record<string, unknown>;
    expect(security.allowedIPs).toEqual(["127.0.0.1", "192.168.1.1"]);
    expect(security.environments).toBeUndefined();
    expect(security.roles).toBeUndefined();
    expect(security.allowedHosts).toBeUndefined();
  });

  test("includes allowedHosts in security when provided", () => {
    const config: RouteConfigType = {
      name: "api.webhook.receive",
      path: "/webhook",
      method: "POST",
      version: 1,
      controller: MockController,
      description: "Webhook endpoint",
      isSocket: false,
      host: ["example.com", "api.example.com"],
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.security).toBeDefined();
    const security = result.security as Record<string, unknown>;
    expect(security.allowedHosts).toEqual(["example.com", "api.example.com"]);
    expect(security.environments).toBeUndefined();
    expect(security.roles).toBeUndefined();
    expect(security.allowedIPs).toBeUndefined();
  });

  test("includes all security properties when all provided", () => {
    const config: RouteConfigType = {
      name: "api.users.create",
      path: "/secure",
      method: "POST",
      version: 1,
      controller: MockController,
      description: "Secure endpoint",
      isSocket: false,
      env: [Environment.PRODUCTION],
      roles: ["ROLE_ADMIN"],
      ip: ["10.0.0.1"],
      host: ["secure.example.com"],
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.security).toBeDefined();
    const security = result.security as Record<string, unknown>;
    expect(security.environments).toEqual([Environment.PRODUCTION]);
    expect(security.roles).toEqual(["ROLE_ADMIN"]);
    expect(security.allowedIPs).toEqual(["10.0.0.1"]);
    expect(security.allowedHosts).toEqual(["secure.example.com"]);
  });

  test("does not include empty arrays in security", () => {
    const config: RouteConfigType = {
      name: "api.users.list",
      path: "/users",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "List users",
      isSocket: false,
      env: [],
      roles: [],
      ip: [],
      host: [],
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.security).toBeUndefined();
  });

  test("handles socket routes", () => {
    const config: RouteConfigType = {
      name: "api.chat.connect",
      path: "/chat/:roomId",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "Chat socket",
      isSocket: true,
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.isSocket).toBe(true);
    expect(result.parameters).toEqual(["roomId"]);
  });

  test("handles complex nested payload schemas", () => {
    const config: RouteConfigType = {
      name: "api.users.create",
      path: "/users",
      method: "POST",
      version: 1,
      controller: MockController,
      description: "Create user",
      isSocket: false,
      payload: Assert({
        name: "string",
        address: {
          street: "string",
          city: "string",
        },
        tags: "string[]",
      }),
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.schemas).toBeDefined();
    const schemas = result.schemas as Record<string, unknown>;
    expect(schemas.payload).toBeDefined();
  });

  test("handles optional properties in schemas", () => {
    const config: RouteConfigType = {
      name: "api.users.update",
      path: "/users/:id",
      method: "PATCH",
      version: 1,
      controller: MockController,
      description: "Update user",
      isSocket: false,
      payload: Assert({
        name: "string",
        "age?": "number",
      }),
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.schemas).toBeDefined();
    const schemas = result.schemas as Record<string, unknown>;
    expect(schemas.payload).toBeDefined();
  });

  test("does not include schemas property when no schemas defined", () => {
    const config: RouteConfigType = {
      name: "api.ping.show",
      path: "/ping",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "Ping endpoint",
      isSocket: false,
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.schemas).toBeUndefined();
  });

  test("handles route with only params schema", () => {
    const config: RouteConfigType = {
      name: "api.users.delete",
      path: "/users/:id",
      method: "DELETE",
      version: 1,
      controller: MockController,
      description: "Delete user",
      isSocket: false,
      params: {
        id: Assert("string"),
      },
    };

    const result = routeConfigToJsonDoc(config);

    const schemas = result.schemas as Record<string, unknown>;
    expect(schemas.params).toBeDefined();
    expect(schemas.queries).toBeUndefined();
    expect(schemas.payload).toBeUndefined();
    expect(schemas.response).toBeUndefined();
  });

  test("generates complete JSON documentation for complex route", () => {
    const config: RouteConfigType = {
      name: "api.users.delete",
      path: "/users/:id/emails/:emailId/state/:state",
      method: "DELETE",
      version: 1,
      controller: MockController,
      description: "Delete a user by ID",
      isSocket: false,
      params: {
        state: Assert("string"),
        id: Assert("string"),
        emailId: Assert("string"),
      },
      payload: Assert({
        name: "string",
      }),
      queries: Assert({
        limit: "number",
      }),
      response: Assert({
        success: "boolean",
        message: "string",
      }),
      env: [Environment.LOCAL],
      roles: ["ROLE_ADMIN"],
    };

    const result = routeConfigToJsonDoc(config);

    expect(result.name).toBe("api.users.delete");
    expect(result.path).toBe("/users/:id/emails/:emailId/state/:state");
    expect(result.method).toBe("DELETE");
    expect(result.version).toBe(1);
    expect(result.controller).toBe("MockController");
    expect(result.description).toBe("Delete a user by ID");
    expect(result.isSocket).toBe(false);
    expect(result.parameters).toEqual(["id", "emailId", "state"]);
    expect(result.schemas).toBeDefined();
    expect(result.security).toBeDefined();

    const schemas = result.schemas as Record<string, unknown>;
    expect(schemas.params).toBeDefined();
    expect(schemas.queries).toBeDefined();
    expect(schemas.payload).toBeDefined();
    expect(schemas.response).toBeDefined();

    const security = result.security as Record<string, unknown>;
    expect(security.environments).toEqual([Environment.LOCAL]);
    expect(security.roles).toEqual(["ROLE_ADMIN"]);
  });
});
