import type { EnvironmentNameType } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import { HttpStatus } from "@talosjs/http-status";
import type { MiddlewareClassType } from "@talosjs/middleware";
import type { IRateLimiter } from "@talosjs/rate-limit";
import type { RouteConfigType } from "@talosjs/routing";
import type { BunRequest, Server } from "bun";
import { applyEnvRoles, checkAllowedUsers } from "./auth";
import { buildHttpContext } from "./context";
import { buildExceptionResponse, httpRouteHandler, toControllerError } from "./controller";
import { logException, logRequest, logSwallowedError } from "./logging";
import { runMiddlewares } from "./middleware";

export const getCacheKey = (prefix: string, method: string, url: string, userId?: string): string => {
  const { pathname, search } = new URL(url);
  const keySource = `${method}:${pathname}:${search}:${userId ?? "anon"}`;
  return `${prefix}:${Bun.CryptoHasher.hash("sha256", keySource, "hex")}`;
};

export type HttpRouteHandlerType = (req: BunRequest, server: Server<unknown>) => Promise<Response>;
export type HttpMethodHandlersType = Partial<Record<string, HttpRouteHandlerType | Response>>;
export type HttpRoutesMapType = Record<string, HttpMethodHandlersType>;

export const formatHttpRoutes = (
  httpRoutes: Map<string, RouteConfigType[]>,
  middlewares: MiddlewareClassType[] = [],
  prefix?: string,
): HttpRoutesMapType => {
  const routes: HttpRoutesMapType = {};

  for (const [path, routeConfigs] of httpRoutes) {
    for (const route of routeConfigs) {
      const versionedPath = `/${prefix ? `${prefix}/` : ""}v${route.version}${path}`;

      routes[versionedPath] ??= {};
      const methodHandlers = routes[versionedPath];

      methodHandlers[route.method] = async (req: BunRequest, server: Server<unknown>) => {
        // Rate limit check before building context
        try {
          const rateLimiter = container.hasConstant("rateLimiter")
            ? container.getConstant<IRateLimiter>("rateLimiter")
            : undefined;

          if (rateLimiter) {
            const address = server.requestIP(req);
            const ip = address?.address ?? "unknown";
            const result = await rateLimiter.check(ip);

            if (result.limited) {
              return new Response(JSON.stringify({ message: "Too Many Requests", key: "RATE_LIMITED" }), {
                status: HttpStatus.Code.TooManyRequests,
                headers: {
                  "Content-Type": "application/json",
                  "Retry-After": String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)),
                  "X-RateLimit-Limit": String(result.total),
                  "X-RateLimit-Remaining": "0",
                  "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
                },
              });
            }
          }
        } catch (error: unknown) {
          // Fail open, but leave a trace so operators can detect a broken rate-limiter backend
          logSwallowedError("Rate limiter check", error);
        }

        let context = await buildHttpContext({ req, server, route });

        // Feature flag gate: a disabled feature behaves as if the route does not exist
        if (route.featureFlag) {
          const featureFlag = container.get(route.featureFlag);
          if (!(await featureFlag.isEnabled())) {
            const httpResponse = buildExceptionResponse(
              context,
              "Not Found",
              HttpStatus.Code.NotFound,
              context.env.APP_ENV,
              "FEATURE_DISABLED",
            );
            logRequest(context);
            return httpResponse;
          }
        }

        try {
          context = await runMiddlewares(context, middlewares);
        } catch (error: unknown) {
          logException(context, error);
          const env: EnvironmentNameType = context.env.APP_ENV;
          const middlewareError = toControllerError(error);
          const httpResponse = buildExceptionResponse(
            context,
            middlewareError.message,
            middlewareError.status,
            env,
            middlewareError.key,
          );
          logRequest(context);
          return httpResponse;
        }

        applyEnvRoles(context);

        // Check allowed users
        const allowedUsersError = checkAllowedUsers(context);
        if (allowedUsersError) {
          const httpResponse = buildExceptionResponse(
            context,
            allowedUsersError.message,
            allowedUsersError.status,
            context.env.APP_ENV,
            allowedUsersError.key,
          );
          logRequest(context);
          return httpResponse;
        }

        if (route.permission) {
          const permission = container.get(route.permission);
          const allowed = await permission.allow();
          const userPermissions = await allowed.setUserPermissions(context);
          context.permission = await userPermissions.build();

          if (!(await context.permission.check(context))) {
            const httpResponse = buildExceptionResponse(
              context,
              "Forbidden",
              HttpStatus.Code.Forbidden,
              context.env.APP_ENV,
              "PERMISSION_DENIED",
            );
            logRequest(context);
            return httpResponse;
          }
        }

        // The key is computed once, after middlewares and access checks, so it reflects
        // the authenticated user; httpRouteHandler reads/writes the cache with it only
        // once route access validation has also passed
        const cacheKey =
          route.cache && context.cache ? getCacheKey(route.cache, route.method, req.url, context.user?.id) : null;

        return httpRouteHandler({ context, route, cacheKey });
      };
    }
  }

  return routes;
};
