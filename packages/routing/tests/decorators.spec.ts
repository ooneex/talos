import { describe, expect, test } from "bun:test";
import type { ContextType as HttpContextType } from "@talosjs/controller";
import type { IResponse } from "@talosjs/http-response";
import { Route } from "@/decorators";
import { router } from "@/Router";

// Minimal inline socket context (mirrors @talosjs/socket ContextType without adding a dep)
type SocketContextType = HttpContextType & {
  channel: {
    send: (response: IResponse) => Promise<void>;
    close(code?: number, reason?: string): void;
    subscribe: () => Promise<void>;
    isSubscribed(): boolean;
    unsubscribe: () => Promise<void>;
    publish: (response: IResponse) => Promise<void>;
  };
};

describe("Route", () => {
  describe("HTTP method decorators", () => {
    test("Route.get registers controller with GET method and isSocket: false", () => {
      class GetController {
        public async index(context: HttpContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.get("/dec-get", {
        name: "dec.get",
        version: 1,
        description: "GET decorator test",
      })(GetController);

      const route = router.findRouteByName("dec.get");
      expect(route).toBeDefined();
      expect(route?.method).toBe("GET");
      expect(route?.isSocket).toBe(false);
      expect(route?.path).toBe("/dec-get");
      expect(route?.controller).toBe(GetController);
    });

    test("Route.post registers controller with POST method and isSocket: false", () => {
      class PostController {
        public async index(context: HttpContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.post("/dec-post", {
        name: "dec.post",
        version: 1,
        description: "POST decorator test",
      })(PostController);

      const route = router.findRouteByName("dec.post");
      expect(route?.method).toBe("POST");
      expect(route?.isSocket).toBe(false);
    });

    test("Route.put registers controller with PUT method and isSocket: false", () => {
      class PutController {
        public async index(context: HttpContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.put("/dec-put", {
        name: "dec.put",
        version: 1,
        description: "PUT decorator test",
      })(PutController);

      const route = router.findRouteByName("dec.put");
      expect(route?.method).toBe("PUT");
      expect(route?.isSocket).toBe(false);
    });

    test("Route.delete registers controller with DELETE method and isSocket: false", () => {
      class DeleteController {
        public async index(context: HttpContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.delete("/dec-delete", {
        name: "dec.delete",
        version: 1,
        description: "DELETE decorator test",
      })(DeleteController);

      const route = router.findRouteByName("dec.delete");
      expect(route?.method).toBe("DELETE");
      expect(route?.isSocket).toBe(false);
    });

    test("Route.patch registers controller with PATCH method and isSocket: false", () => {
      class PatchController {
        public async index(context: HttpContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.patch("/dec-patch", {
        name: "dec.patch",
        version: 1,
        description: "PATCH decorator test",
      })(PatchController);

      const route = router.findRouteByName("dec.patch");
      expect(route?.method).toBe("PATCH");
      expect(route?.isSocket).toBe(false);
    });

    test("Route.options registers controller with OPTIONS method and isSocket: false", () => {
      class OptionsController {
        public async index(context: HttpContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.options("/dec-options", {
        name: "dec.options",
        version: 1,
        description: "OPTIONS decorator test",
      })(OptionsController);

      const route = router.findRouteByName("dec.options");
      expect(route?.method).toBe("OPTIONS");
      expect(route?.isSocket).toBe(false);
    });

    test("Route.head registers controller with HEAD method and isSocket: false", () => {
      class HeadController {
        public async index(context: HttpContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.head("/dec-head", {
        name: "dec.head",
        version: 1,
        description: "HEAD decorator test",
      })(HeadController);

      const route = router.findRouteByName("dec.head");
      expect(route?.method).toBe("HEAD");
      expect(route?.isSocket).toBe(false);
    });

    test("stores version, description, and name from config", () => {
      class ConfigController {
        public async index(context: HttpContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.get("/dec-config", {
        name: "dec.config",
        version: 3,
        description: "Config fields test",
      })(ConfigController);

      const route = router.findRouteByName("dec.config");
      expect(route?.version).toBe(3);
      expect(route?.description).toBe("Config fields test");
      expect(route?.name).toBe("dec.config");
    });
  });

  describe("Route.socket", () => {
    test("registers controller with method GET and isSocket: true", () => {
      class SocketController {
        public async index(context: HttpContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.socket("/dec-socket", {
        name: "dec.socket",
        version: 1,
        description: "Socket decorator test",
      })(SocketController);

      const route = router.findRouteByName("dec.socket");
      expect(route).toBeDefined();
      expect(route?.method).toBe("GET");
      expect(route?.isSocket).toBe(true);
      expect(route?.path).toBe("/dec-socket");
      expect(route?.controller).toBe(SocketController);
    });

    test("accepts controller whose index takes a socket ContextType with channel property", () => {
      // This test verifies the type fix: Route.socket must accept a class whose
      // index method requires a context with `channel` (not just HTTP context).
      class SocketWithChannelController {
        public async index(context: SocketContextType): Promise<IResponse> {
          return context.response;
        }
      }

      expect(() => {
        Route.socket("/dec-socket-channel", {
          name: "dec.socket.channel",
          version: 1,
          description: "Socket channel type test",
        })(SocketWithChannelController);
      }).not.toThrow();

      const route = router.findRouteByName("dec.socket.channel");
      expect(route?.isSocket).toBe(true);
    });

    test("stores version, description, and name from config", () => {
      class SocketConfigController {
        public async index(context: SocketContextType): Promise<IResponse> {
          return context.response;
        }
      }

      Route.socket("/dec-socket-config", {
        name: "dec.socket.config",
        version: 2,
        description: "Socket config test",
      })(SocketConfigController);

      const route = router.findRouteByName("dec.socket.config");
      expect(route?.version).toBe(2);
      expect(route?.description).toBe("Socket config test");
    });

    test("decorator returns void", () => {
      class SocketVoidController {
        public async index(context: SocketContextType): Promise<IResponse> {
          return context.response;
        }
      }

      const result = Route.socket("/dec-socket-void", {
        name: "dec.socket.void",
        version: 1,
        description: "Void return test",
      })(SocketVoidController);

      expect(result).toBeUndefined();
    });
  });

  describe("router segregation after decoration", () => {
    test("getSocketRoutes includes socket-decorated controllers", () => {
      const socketRoutes = router.getSocketRoutes();
      expect(socketRoutes.has("/dec-socket")).toBe(true);
      expect(socketRoutes.get("/dec-socket")?.isSocket).toBe(true);
    });

    test("getSocketRoutes does not include HTTP-decorated controllers", () => {
      const socketRoutes = router.getSocketRoutes();
      expect(socketRoutes.has("/dec-get")).toBe(false);
      expect(socketRoutes.has("/dec-post")).toBe(false);
    });

    test("getHttpRoutes includes HTTP-decorated controllers", () => {
      const httpRoutes = router.getHttpRoutes();
      expect(httpRoutes.has("/dec-get")).toBe(true);
      expect(httpRoutes.has("/dec-post")).toBe(true);
    });

    test("getHttpRoutes does not include socket-decorated controllers", () => {
      const httpRoutes = router.getHttpRoutes();
      expect(httpRoutes.has("/dec-socket")).toBe(false);
    });
  });
});
