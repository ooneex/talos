import { container, EContainerScope } from "@talosjs/container";
import { RouterException } from "./RouterException";
import type { IRouter, RouteConfigType } from "./types";

export class Router implements IRouter {
  private routes: Map<string, RouteConfigType[]> = new Map();
  private routesByName: Map<string, RouteConfigType> = new Map();
  private socketRoutes: Map<string, RouteConfigType> = new Map();
  private httpRoutes: Map<string, RouteConfigType[]> = new Map();

  // biome-ignore lint/complexity/noUselessConstructor: Bun coverage requires an explicit constructor to mark it as hit
  public constructor() {}

  public addRoute(route: RouteConfigType): this {
    const name = route.name;

    if (this.routesByName.has(name)) {
      throw new RouterException(`Route with name '${name}' already exists`, "ROUTE_NAME_EXISTS", route);
    }

    const routes = this.routes.get(route.path) ?? [];

    if (route.isSocket && this.socketRoutes.has(route.path)) {
      throw new RouterException(`Socket route with path '${route.path}' already exists`, "SOCKET_PATH_EXISTS", route);
    }

    const httpRoutes = this.httpRoutes.get(route.path) ?? [];

    if (!route.isSocket && httpRoutes.some((r) => r.method === route.method)) {
      throw new RouterException(
        `Route with path '${route.path}' and method '${route.method}' already exists`,
        "ROUTE_PATH_EXISTS",
        route,
      );
    }

    routes.push(route);
    this.routes.set(route.path, routes);
    this.routesByName.set(name, route);

    if (route.isSocket) {
      this.socketRoutes.set(route.path, route);
    } else {
      httpRoutes.push(route);
      this.httpRoutes.set(route.path, httpRoutes);
    }

    container.add(route.controller, EContainerScope.Singleton);

    return this;
  }

  public findRouteByPath(path: string): RouteConfigType[] | null {
    return this.routes.get(path) ?? null;
  }

  public findRouteByName(name: string): RouteConfigType | null {
    return this.routesByName.get(name) ?? null;
  }

  public getRoutes(): Map<string, RouteConfigType[]> {
    return this.routes;
  }

  public getSocketRoutes(): Map<string, RouteConfigType> {
    return this.socketRoutes;
  }

  public getHttpRoutes(): Map<string, RouteConfigType[]> {
    return this.httpRoutes;
  }

  public generate<P extends Record<string, string | number> = Record<string, string | number>>(
    name: string,
    params?: P,
  ): string {
    const route = this.findRouteByName(name);

    if (!route) {
      throw new RouterException(`Route with name '${name}' not found`, "ROUTE_NOT_FOUND");
    }

    let path: string = route.path;
    const paramMatches = path.match(/:[a-zA-Z0-9_]+/g) || [];

    if (paramMatches.length > 0) {
      if (!params || typeof params !== "object" || params === null) {
        throw new RouterException(
          `Route '${name}' requires parameters, but none were provided`,
          "ROUTE_PARAMS_REQUIRED",
        );
      }

      for (const match of paramMatches) {
        const paramName = match.substring(1);
        if (!(paramName in params)) {
          throw new RouterException(
            `Missing required parameter '${paramName}' for route '${name}'`,
            "ROUTE_PARAM_MISSING",
          );
        }

        path = path.replace(match, String(params[paramName]));
      }
    }

    return path;
  }
}

export const router: Router = new Router();
