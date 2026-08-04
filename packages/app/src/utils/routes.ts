import { Cache } from "@talosjs/cache";
import { container } from "@talosjs/container";
import { HttpStatus, type StatusCodeType } from "@talosjs/http-status";
import type { MiddlewareClassType } from "@talosjs/middleware";
import type { IRateLimiter } from "@talosjs/rate-limit";
import type { RouteConfigType } from "@talosjs/routing";
import type { BunRequest, Server } from "bun";
import { applyEnvRoles, checkAllowedUsers } from "./auth";
import { buildHttpContext } from "./context";
import { buildExceptionResponse, httpRouteHandler, toControllerError } from "./controller";
import { logException, logRequest, logSwallowedError } from "./logging";
import { runMiddlewares } from "./middleware";

export type HttpRouteHandlerType = (req: BunRequest, server: Server<unknown>) => Promise<Response>;
export type HttpMethodHandlersType = Partial<Record<string, HttpRouteHandlerType | Response>>;
export type HttpRoutesMapType = Record<string, HttpMethodHandlersType>;

const buildVersionedPath = (path: string, version: number, prefix?: string): string => {
  return `/${prefix ? `${prefix}/` : ""}v${version}${path}`;
};

const buildRateLimitResponse = (result: Awaited<ReturnType<IRateLimiter["check"]>>): Response => {
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
};

const checkRateLimit = async (req: BunRequest, server: Server<unknown>): Promise<Response | null> => {
  try {
    const rateLimiter = container.hasConstant("rateLimiter")
      ? container.getConstant<IRateLimiter>("rateLimiter")
      : undefined;

    if (!rateLimiter) {
      return null;
    }

    const address = server.requestIP(req);
    const ip = address?.address ?? "unknown";
    const result = await rateLimiter.check(ip);

    if (result.limited) {
      return buildRateLimitResponse(result);
    }
  } catch (error: unknown) {
    // Fail open, but leave a trace so operators can detect a broken rate-limiter backend
    logSwallowedError("Rate limiter check", error);
  }

  return null;
};

const buildHttpErrorResponse = (
  context: Awaited<ReturnType<typeof buildHttpContext>>,
  message: string,
  status: StatusCodeType,
  key?: string | null,
): Response => {
  const httpResponse = buildExceptionResponse(context, message, status, context.env.APP_ENV, key);
  logRequest(context);
  return httpResponse;
};

const checkFeatureFlag = async (
  context: Awaited<ReturnType<typeof buildHttpContext>>,
  route: RouteConfigType,
): Promise<Response | null> => {
  if (!route.featureFlag) {
    return null;
  }

  const featureFlag = container.get(route.featureFlag);
  if (await featureFlag.isEnabled()) {
    return null;
  }

  return buildHttpErrorResponse(context, "Not Found", HttpStatus.Code.NotFound, "FEATURE_DISABLED");
};

const applyHttpMiddlewares = async (
  context: Awaited<ReturnType<typeof buildHttpContext>>,
  middlewares: MiddlewareClassType[],
): Promise<Awaited<ReturnType<typeof buildHttpContext>> | Response> => {
  try {
    return await runMiddlewares(context, middlewares);
  } catch (error: unknown) {
    logException(context, error);
    const middlewareError = toControllerError(error);

    return buildHttpErrorResponse(context, middlewareError.message, middlewareError.status, middlewareError.key);
  }
};

const checkAllowedRouteUsers = (context: Awaited<ReturnType<typeof buildHttpContext>>): Response | null => {
  const allowedUsersError = checkAllowedUsers(context);

  if (!allowedUsersError) {
    return null;
  }

  return buildHttpErrorResponse(context, allowedUsersError.message, allowedUsersError.status, allowedUsersError.key);
};

const checkRoutePermission = async (
  context: Awaited<ReturnType<typeof buildHttpContext>>,
  route: RouteConfigType,
): Promise<Response | null> => {
  if (!route.permission) {
    return null;
  }

  const permission = container.get(route.permission);
  const allowed = await permission.allow();
  const userPermissions = await allowed.setUserPermissions(context);
  context.permission = await userPermissions.build();

  if (await context.permission.check(context)) {
    return null;
  }

  return buildHttpErrorResponse(context, "Forbidden", HttpStatus.Code.Forbidden, "PERMISSION_DENIED");
};

const buildCacheKey = (
  route: RouteConfigType,
  context: Awaited<ReturnType<typeof buildHttpContext>>,
  req: BunRequest,
): string | null => {
  if (!route.cache || !context.cache) {
    return null;
  }

  return Cache.keyFromRoute(route.cache, route.method, req.url, context.user?.id);
};

export const formatHttpRoutes = (
  httpRoutes: Map<string, RouteConfigType[]>,
  middlewares: MiddlewareClassType[] = [],
  prefix?: string,
): HttpRoutesMapType => {
  const routes: HttpRoutesMapType = {};

  for (const [path, routeConfigs] of httpRoutes) {
    for (const route of routeConfigs) {
      const versionedPath = buildVersionedPath(path, route.version, prefix);

      routes[versionedPath] ??= {};
      const methodHandlers = routes[versionedPath];

      methodHandlers[route.method] = async (req: BunRequest, server: Server<unknown>) => {
        const rateLimitResponse = await checkRateLimit(req, server);
        if (rateLimitResponse) {
          return rateLimitResponse;
        }

        let context = await buildHttpContext({ req, server, route });

        const featureFlagResponse = await checkFeatureFlag(context, route);
        if (featureFlagResponse) {
          return featureFlagResponse;
        }

        const middlewareResult = await applyHttpMiddlewares(context, middlewares);
        if (middlewareResult instanceof Response) {
          return middlewareResult;
        }
        context = middlewareResult;

        applyEnvRoles(context);

        const allowedUsersResponse = checkAllowedRouteUsers(context);
        if (allowedUsersResponse) {
          return allowedUsersResponse;
        }

        const permissionResponse = await checkRoutePermission(context, route);
        if (permissionResponse) {
          return permissionResponse;
        }

        // The key is computed once, after middlewares and access checks, so it reflects
        // the authenticated user; httpRouteHandler reads/writes the cache with it only
        // once route access validation has also passed
        const cacheKey = buildCacheKey(route, context, req);

        return httpRouteHandler({ context, route, cacheKey });
      };
    }
  }

  return routes;
};
