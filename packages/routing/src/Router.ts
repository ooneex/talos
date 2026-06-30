import { container, EContainerScope } from "@talosjs/container";
import { RouterException } from "./RouterException";
import type { IRouter, RouteConfigType } from "./types";

export class Router implements IRouter {
  private routes: Map<string, RouteConfigType[]> = new Map();

  public addRoute(route: RouteConfigType): this {
    const name = route.name;

    for (const item of this.routes[Symbol.iterator]()) {
      const existingRoute = item[1].find((r) => r.name === name);

      if (existingRoute) {
        throw new RouterException(`Route with name '${name}' already exists`, "ROUTE_NAME_EXISTS", route);
      }
    }

    const routes = this.routes.get(route.path) ?? [];

    if (route.isSocket && routes.find((r) => r.isSocket)) {
      throw new RouterException(`Socket route with path '${route.path}' already exists`, "SOCKET_PATH_EXISTS", route);
    }

    if (!route.isSocket && routes.find((r) => !r.isSocket && r.method === route.method)) {
      throw new RouterException(
        `Route with path '${route.path}' and method '${route.method}' already exists`,
        "ROUTE_PATH_EXISTS",
        route,
      );
    }

    routes.push(route);
    this.routes.set(route.path, routes);
    container.add(route.controller, EContainerScope.Singleton);

    return this;
  }

  public findRouteByPath(path: string): RouteConfigType[] | null {
    return this.routes.get(path) ?? null;
  }

  public findRouteByName(name: string): RouteConfigType | null {
    for (const item of this.routes[Symbol.iterator]()) {
      const existingRoute = item[1].find((r) => r.name === name);

      if (existingRoute) {
        return existingRoute;
      }
    }

    return null;
  }

  public getRoutes(): Map<string, RouteConfigType[]> {
    return this.routes;
  }

  public getSocketRoutes(): Map<string, RouteConfigType> {
    const socketRoutes = new Map<string, RouteConfigType>();

    for (const [path, routes] of this.routes) {
      const socketRoute = routes.find((route): route is RouteConfigType => route.isSocket);
      if (socketRoute) {
        socketRoutes.set(path, socketRoute);
      }
    }

    return socketRoutes;
  }

  public getHttpRoutes(): Map<string, RouteConfigType[]> {
    const httpRoutes = new Map<string, RouteConfigType[]>();

    for (const [path, routes] of this.routes) {
      const filteredRoutes = routes.filter((route): route is RouteConfigType => !route.isSocket);
      if (filteredRoutes.length > 0) {
        httpRoutes.set(path, filteredRoutes);
      }
    }

    return httpRoutes;
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
