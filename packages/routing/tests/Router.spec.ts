import { beforeEach, describe, expect, test } from "bun:test";
import type { ContextType, IController } from "@talosjs/controller";
import type { IResponse } from "@talosjs/http-response";
import { Router } from "@/Router";
import { RouterException } from "@/RouterException";
import type { RouteConfigType } from "@/types";

class MockController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    return context.response;
  }
}

class AnotherMockController implements IController {
  public async index(context: ContextType): Promise<IResponse> {
    return context.response;
  }
}

describe("Router", () => {
  let router: Router;
  let mockRoute: RouteConfigType;
  let mockSocketRoute: RouteConfigType;

  beforeEach(() => {
    router = new Router();

    mockRoute = {
      name: "api.users.list",
      path: "/users",
      method: "GET",
      version: 1,
      controller: MockController,
      description: "List users",
      isSocket: false,
    };

    mockSocketRoute = {
      name: "api.chat.connect",
      path: "/chat",
      method: "GET",
      version: 1,
      controller: AnotherMockController,
      description: "Chat socket connection",
      isSocket: true,
    };
  });

  describe("addRoute", () => {
    test("should add a route successfully", () => {
      const result = router.addRoute(mockRoute);

      expect(result).toBe(router);
      expect(router.getRoutes().has("/users")).toBe(true);
      expect(router.getRoutes().get("/users")).toHaveLength(1);
      expect(router.getRoutes().get("/users")?.[0]).toEqual(mockRoute);
    });

    test("should add multiple routes with different paths", () => {
      const secondRoute: RouteConfigType = {
        name: "api.posts.list",
        path: "/posts",
        method: "GET",
        version: 1,
        controller: AnotherMockController,
        description: "List posts",
        isSocket: false,
      };

      router.addRoute(mockRoute);
      router.addRoute(secondRoute);

      expect(router.getRoutes().size).toBe(2);
      expect(router.getRoutes().has("/users")).toBe(true);
      expect(router.getRoutes().has("/posts")).toBe(true);
    });

    test("should add multiple routes with same path but different methods", () => {
      const postRoute: RouteConfigType = {
        name: "api.users.create",
        path: "/users",
        method: "POST",
        version: 1,
        controller: AnotherMockController,
        description: "Create user",
        isSocket: false,
      };

      router.addRoute(mockRoute);
      router.addRoute(postRoute);

      const routes = router.getRoutes().get("/users");
      expect(routes).toHaveLength(2);
      const getRoute = routes?.find((r) => r.method === "GET");
      const foundPostRoute = routes?.find((r) => r.method === "POST");
      expect(getRoute).toBeDefined();
      expect(foundPostRoute).toBeDefined();
    });

    test("should throw error when adding route with duplicate name", () => {
      const duplicateNameRoute: RouteConfigType = {
        name: "api.users.list", // Same name as mockRoute
        path: "/different-path",
        method: "GET",
        version: 1,
        controller: AnotherMockController,
        description: "Different route with same name",
        isSocket: false,
      };

      router.addRoute(mockRoute);

      expect(() => router.addRoute(duplicateNameRoute)).toThrow(RouterException);
      expect(() => router.addRoute(duplicateNameRoute)).toThrow("Route with name 'api.users.list' already exists");
    });

    test("should throw error when adding HTTP route with duplicate path and method", () => {
      const duplicateRoute: RouteConfigType = {
        name: "api.users.show",
        path: "/users",
        method: "GET", // Same method as mockRoute
        version: 1,
        controller: AnotherMockController,
        description: "Show user",
        isSocket: false,
      };

      router.addRoute(mockRoute);

      expect(() => router.addRoute(duplicateRoute)).toThrow(RouterException);
      expect(() => router.addRoute(duplicateRoute)).toThrow("Route with path '/users' and method 'GET' already exists");
    });

    test("should add socket route successfully", () => {
      router.addRoute(mockSocketRoute);

      expect(router.getRoutes().has("/chat")).toBe(true);
      expect(router.getRoutes().get("/chat")?.[0]?.isSocket).toBe(true);
    });

    test("should throw error when adding duplicate socket route", () => {
      const duplicateSocketRoute: RouteConfigType = {
        name: "api.chat.duplicate",
        path: "/chat",
        method: "GET",
        version: 1,
        controller: AnotherMockController,
        description: "Another chat socket",
        isSocket: true,
      };

      router.addRoute(mockSocketRoute);

      expect(() => router.addRoute(duplicateSocketRoute)).toThrow(RouterException);
      expect(() => router.addRoute(duplicateSocketRoute)).toThrow("Socket route with path '/chat' already exists");
    });

    test("should allow HTTP and socket routes on same path", () => {
      const httpRoute: RouteConfigType = {
        name: "api.chat.info",
        path: "/chat",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Get chat info",
        isSocket: false,
      };

      router.addRoute(mockSocketRoute);
      router.addRoute(httpRoute);

      const routes = router.getRoutes().get("/chat");
      expect(routes).toHaveLength(2);
      expect(routes?.find((r) => r.isSocket)).toBeDefined();
      expect(routes?.find((r) => !r.isSocket)).toBeDefined();
    });
  });

  describe("findRouteByPath", () => {
    test("should find routes by path", () => {
      router.addRoute(mockRoute);

      const routes = router.findRouteByPath("/users");
      expect(routes).toHaveLength(1);
      expect(routes?.[0]).toEqual(mockRoute);
    });

    test("should return null for non-existent path", () => {
      const routes = router.findRouteByPath("/non-existent");
      expect(routes).toBeNull();
    });

    test("should find multiple routes with same path", () => {
      const createRoute: RouteConfigType = {
        name: "api.users.create",
        path: "/users",
        method: "POST",
        version: 1,
        controller: AnotherMockController,
        description: "Create user",
        isSocket: false,
      };

      router.addRoute(mockRoute);
      router.addRoute(createRoute);

      const routes = router.findRouteByPath("/users");
      expect(routes).toHaveLength(2);
      expect(routes?.[0]?.method).toBe("GET");
      expect(routes?.[1]?.method).toBe("POST");
    });
  });

  describe("findRouteByName", () => {
    test("should find route by name", () => {
      router.addRoute(mockRoute);

      const route = router.findRouteByName("api.users.list");
      expect(route).toEqual(mockRoute);
    });

    test("should return null for non-existent name", () => {
      const route = router.findRouteByName("api.nonexistent.action");
      expect(route).toBeNull();
    });

    test("should find correct route when multiple routes exist", () => {
      const postRoute: RouteConfigType = {
        name: "api.users.create",
        path: "/users",
        method: "POST",
        version: 1,
        controller: AnotherMockController,
        description: "Create user",
        isSocket: false,
      };

      router.addRoute(mockRoute);
      router.addRoute(postRoute);

      const route = router.findRouteByName("api.users.create");
      expect(route).toEqual(postRoute);
    });
  });

  describe("getRoutes", () => {
    test("should return empty map when no routes added", () => {
      const routes = router.getRoutes();
      expect(routes).toBeInstanceOf(Map);
      expect(routes.size).toBe(0);
    });

    test("should return all routes", () => {
      const postRoute: RouteConfigType = {
        name: "api.posts.list",
        path: "/posts",
        method: "GET",
        version: 1,
        controller: AnotherMockController,
        description: "List posts",
        isSocket: false,
      };

      router.addRoute(mockRoute);
      router.addRoute(postRoute);

      const routes = router.getRoutes();
      expect(routes.size).toBe(2);
      expect(routes.has("/users")).toBe(true);
      expect(routes.has("/posts")).toBe(true);
    });
  });

  describe("getSocketRoutes", () => {
    test("should return only socket routes", () => {
      const httpRoute: RouteConfigType = {
        name: "api.users.show",
        path: "/users",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Show user",
        isSocket: false,
      };

      router.addRoute(httpRoute);
      router.addRoute(mockSocketRoute);

      const socketRoutes = router.getSocketRoutes();
      expect(socketRoutes.size).toBe(1);
      expect(socketRoutes.has("/chat")).toBe(true);
      expect(socketRoutes.has("/users")).toBe(false);
    });

    test("should return empty map when no socket routes exist", () => {
      router.addRoute(mockRoute);

      const socketRoutes = router.getSocketRoutes();
      expect(socketRoutes.size).toBe(0);
    });

    test("should filter socket routes from mixed path", () => {
      const httpRoute: RouteConfigType = {
        name: "api.chat.info",
        path: "/chat",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Get chat info",
        isSocket: false,
      };

      router.addRoute(mockSocketRoute);
      router.addRoute(httpRoute);

      const socketRoutes = router.getSocketRoutes();
      expect(socketRoutes.size).toBe(1);
      expect(socketRoutes.get("/chat")).toBeDefined();
      expect(socketRoutes.get("/chat")?.isSocket).toBe(true);
    });
  });

  describe("getHttpRoutes", () => {
    test("should return only HTTP routes", () => {
      const httpRoute: RouteConfigType = {
        name: "api.users.show",
        path: "/users",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Show user",
        isSocket: false,
      };

      router.addRoute(httpRoute);
      router.addRoute(mockSocketRoute);

      const httpRoutes = router.getHttpRoutes();
      expect(httpRoutes.size).toBe(1);
      expect(httpRoutes.has("/users")).toBe(true);
      expect(httpRoutes.has("/chat")).toBe(false);
    });

    test("should return empty map when no HTTP routes exist", () => {
      router.addRoute(mockSocketRoute);

      const httpRoutes = router.getHttpRoutes();
      expect(httpRoutes.size).toBe(0);
    });

    test("should filter HTTP routes from mixed path", () => {
      const httpRoute: RouteConfigType = {
        name: "api.chat.info",
        path: "/chat",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Get chat info",
        isSocket: false,
      };

      router.addRoute(mockSocketRoute);
      router.addRoute(httpRoute);

      const httpRoutes = router.getHttpRoutes();
      expect(httpRoutes.size).toBe(1);
      expect(httpRoutes.get("/chat")).toHaveLength(1);
      expect(httpRoutes.get("/chat")?.[0]?.isSocket).toBe(false);
    });
  });

  describe("generate", () => {
    test("should generate path for route without parameters", () => {
      router.addRoute(mockRoute);

      const path = router.generate("api.users.list");
      expect(path).toBe("/users");
    });

    test("should generate path for route with single parameter", () => {
      const routeWithParam: RouteConfigType = {
        name: "api.users.show",
        path: "/users/:id",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Show user",
        isSocket: false,
      };

      router.addRoute(routeWithParam);

      const path = router.generate("api.users.show", { id: "123" });
      expect(path).toBe("/users/123");
    });

    test("should generate path for route with multiple parameters", () => {
      const routeWithParams: RouteConfigType = {
        name: "api.users.list",
        path: "/users/:userId/bills/:billId",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Show user bill",
        isSocket: false,
      };

      router.addRoute(routeWithParams);

      const path = router.generate("api.users.list", { userId: "123", billId: "456" });
      expect(path).toBe("/users/123/bills/456");
    });

    test("should handle numeric parameters", () => {
      const routeWithParam: RouteConfigType = {
        name: "api.users.show",
        path: "/users/:id",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Show user",
        isSocket: false,
      };

      router.addRoute(routeWithParam);

      const path = router.generate("api.users.show", { id: 123 });
      expect(path).toBe("/users/123");
    });

    test("should throw error for non-existent route name", () => {
      expect(() => router.generate("api.nonexistent.action")).toThrow(RouterException);
      expect(() => router.generate("api.nonexistent.action")).toThrow(
        "Route with name 'api.nonexistent.action' not found",
      );
    });

    test("should throw error when parameters are required but not provided", () => {
      const routeWithParam: RouteConfigType = {
        name: "api.users.show",
        path: "/users/:id",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Show user",
        isSocket: false,
      };

      router.addRoute(routeWithParam);

      expect(() => router.generate("api.users.show")).toThrow(RouterException);
      expect(() => router.generate("api.users.show")).toThrow(
        "Route 'api.users.show' requires parameters, but none were provided",
      );
    });

    test("should throw error when parameters are null", () => {
      const routeWithParam: RouteConfigType = {
        name: "api.users.show",
        path: "/users/:id",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Show user",
        isSocket: false,
      };

      router.addRoute(routeWithParam);

      expect(() => router.generate("api.users.show", null as unknown as Record<string, string>)).toThrow(
        RouterException,
      );
      expect(() => router.generate("api.users.show", null as unknown as Record<string, string>)).toThrow(
        "Route 'api.users.show' requires parameters, but none were provided",
      );
    });

    test("should throw error when required parameter is missing", () => {
      const routeWithParams: RouteConfigType = {
        name: "api.users.list",
        path: "/users/:userId/bills/:billId",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Show user bill",
        isSocket: false,
      };

      router.addRoute(routeWithParams);

      expect(() => router.generate("api.users.list", { userId: "123" })).toThrow(RouterException);
      expect(() => router.generate("api.users.list", { userId: "123" })).toThrow(
        "Missing required parameter 'billId' for route 'api.users.list'",
      );
    });

    test("should handle complex parameter patterns", () => {
      const complexRoute: RouteConfigType = {
        name: "api.users.list",
        path: "/api/v1/users/:userId/posts/:postId/comments/:commentId",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Complex path",
        isSocket: false,
      };

      router.addRoute(complexRoute);

      const path = router.generate("api.users.list", {
        userId: "user123",
        postId: "post456",
        commentId: "comment789",
      });

      expect(path).toBe("/api/v1/users/user123/posts/post456/comments/comment789");
    });

    test("should handle parameters with underscores and numbers", () => {
      const route: RouteConfigType = {
        name: "api.users.list",
        path: "/test/:param_1/:param2_test/:param123",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Test parameters",
        isSocket: false,
      };

      router.addRoute(route);

      const path = router.generate("api.users.list", {
        param_1: "value1",
        param2_test: "value2",
        param123: "value3",
      });

      expect(path).toBe("/test/value1/value2/value3");
    });
  });

  describe("integration tests", () => {
    test("should handle complete workflow", () => {
      const getUserRoute: RouteConfigType = {
        name: "api.users.show",
        path: "/users/:id",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "Get user by ID",
        isSocket: false,
      };

      const createUserRoute: RouteConfigType = {
        name: "api.users.create",
        path: "/users",
        method: "POST",
        version: 1,
        controller: MockController,
        description: "Create new user",
        isSocket: false,
      };

      const chatSocketRoute: RouteConfigType = {
        name: "api.chat.connect",
        path: "/chat/:roomId",
        method: "GET",
        version: 1,
        controller: AnotherMockController,
        description: "Connect to chat room",
        isSocket: true,
      };

      // Add routes
      router.addRoute(getUserRoute);
      router.addRoute(createUserRoute);
      router.addRoute(chatSocketRoute);

      // Test route retrieval
      expect(router.getRoutes().size).toBe(3); // /users/:id, /users, and /chat/:roomId
      expect(router.getHttpRoutes().size).toBe(2); // /users/:id and /users
      expect(router.getSocketRoutes().size).toBe(1); // /chat/:roomId

      // Test finding routes
      expect(router.findRouteByName("api.users.show")).toEqual(getUserRoute);
      expect(router.findRouteByPath("/users/:id")).toHaveLength(1);
      expect(router.findRouteByPath("/users")).toHaveLength(1);
      expect(router.findRouteByPath("/chat/:roomId")).toHaveLength(1);

      // Test path generation
      expect(router.generate("api.users.create")).toBe("/users");
      expect(router.generate("api.users.show", { id: "123" })).toBe("/users/123");
      expect(router.generate("api.chat.connect", { roomId: "room1" })).toBe("/chat/room1");
    });

    test("should maintain route order within path groups", () => {
      const route1: RouteConfigType = {
        name: "api.users.list",
        path: "/users",
        method: "GET",
        version: 1,
        controller: MockController,
        description: "List users",
        isSocket: false,
      };

      const route2: RouteConfigType = {
        name: "api.users.create",
        path: "/users",
        method: "POST",
        version: 1,
        controller: MockController,
        description: "Create user",
        isSocket: false,
      };

      const route3: RouteConfigType = {
        name: "api.users.update",
        path: "/users",
        method: "PUT",
        version: 1,
        controller: MockController,
        description: "Update user",
        isSocket: false,
      };

      router.addRoute(route1);
      router.addRoute(route2);
      router.addRoute(route3);

      const routes = router.findRouteByPath("/users");
      expect(routes).toHaveLength(3);
      expect(routes?.[0]?.method).toBe("GET");
      expect(routes?.[1]?.method).toBe("POST");
      expect(routes?.[2]?.method).toBe("PUT");
    });
  });
});
