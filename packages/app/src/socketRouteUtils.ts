import type { EnvironmentNameType } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { IResponse } from "@talosjs/http-response";
import { HttpStatus, type StatusCodeType } from "@talosjs/http-status";
import type { SocketMiddlewareClassType } from "@talosjs/middleware";
import type { RouteConfigType } from "@talosjs/routing";
import type { ContextType } from "@talosjs/socket";
import type { RequestDataType } from "@talosjs/socket-client";
import type { LocaleInfoType } from "@talosjs/translation";
import type { ScalarType } from "@talosjs/types";
import { random } from "@talosjs/utils/random";
import type { BunRequest, Server, ServerWebSocket } from "bun";
import { applyEnvRoles, checkAllowedUsers } from "./utils/auth";
import { DEFAULT_CACHE_TTL, safeCacheGet, safeCacheSet } from "./utils/cache";
import { buildHttpContext } from "./utils/context";
import { buildException, toControllerError } from "./utils/controller";
import { logRequest } from "./utils/logging";
import { runMiddlewares } from "./utils/middleware";
import { validateResponse, validateRouteAccess } from "./utils/validation";

export const getSocketCacheKey = (
  prefix: string,
  routeName: string,
  userId?: string,
  params?: Record<string, ScalarType>,
  queries?: Record<string, ScalarType>,
  payload?: Record<string, ScalarType>,
): string => {
  const keySource = `${routeName}:${userId ?? "anon"}:${JSON.stringify(params ?? {})}:${JSON.stringify(queries ?? {})}:${JSON.stringify(payload ?? {})}`;
  return `${prefix}:${Bun.CryptoHasher.hash("sha256", keySource, "hex")}`;
};

type SocketRouteHandlerType = (req: BunRequest, server: Server<unknown>) => Promise<Response | undefined>;
type SocketRoutesMapType = Record<string, SocketRouteHandlerType>;

export const formatSocketRoutes = (
  socketRoutes: Map<string, RouteConfigType>,
  prefix?: string,
): SocketRoutesMapType => {
  const routes: SocketRoutesMapType = {};

  for (const [path, route] of socketRoutes) {
    const versionedPath = `/${prefix ? `${prefix}/` : ""}v${route.version}${path}`;
    routes[versionedPath] = async (req: BunRequest, server: Server<unknown>) => {
      const context = await buildHttpContext({ req, server, route });
      const id = random.nanoid(30);
      container.addConstant(id, { context, route });

      if (!server.upgrade(req, { data: { id } })) {
        // The close handler never fires for a connection that was never established,
        // so the constant must be removed here to avoid leaking it
        container.removeConstant(id);
        return new Response(JSON.stringify({ message: "WebSocket upgrade failed", key: "UPGRADE_FAILED" }), {
          status: HttpStatus.Code.UpgradeRequired,
          headers: { "Content-Type": "application/json" },
        });
      }

      return undefined;
    };
  }

  return routes;
};

const sendException = (
  context: ContextType,
  message: string,
  status: StatusCodeType,
  key?: string | null,
): Promise<void> => {
  buildException(context, message, status, key);
  return context.channel.send(context.response);
};

const logSocketRequest = (context: ContextType, status: StatusCodeType): void => {
  logRequest(context, status, "WS");
};

type SocketRouteHandlerOptionsType = {
  message: string;
  ws: ServerWebSocket<{ id: string }>;
  server: Server<{ id: string }>;
  middlewares?: SocketMiddlewareClassType[];
};

export const socketRouteHandler = async ({
  message,
  ws,
  server,
  middlewares = [],
}: SocketRouteHandlerOptionsType): Promise<void> => {
  if (!container.hasConstant(ws.data.id)) {
    ws.close(1011, "Connection state not found");
    return;
  }

  let { context, route } = container.getConstant<{ context: ContextType; route: RouteConfigType }>(ws.data.id);
  const currentEnv: EnvironmentNameType = context.env.APP_ENV;

  // channel must be set up before any sendException call
  context.channel = {
    ws,
    send: async (response: IResponse): Promise<void> => {
      ws.send(await response.get(currentEnv).text());
    },
    close: (code?: number, reason?: string): void => {
      ws.close(code, reason);
    },
    subscribe: async (): Promise<void> => {
      ws.subscribe(route.name);
    },
    isSubscribed: (): boolean => {
      return ws.isSubscribed(route.name);
    },
    unsubscribe: async (): Promise<void> => {
      ws.unsubscribe(route.name);
    },
    publish: async (response: IResponse): Promise<void> => {
      server.publish(route.name, await response.get(currentEnv).text());
    },
  };

  // Feature flag gate: a disabled feature behaves as if the route does not exist
  if (route.featureFlag) {
    const featureFlag = container.get(route.featureFlag);
    if (!(await featureFlag.isEnabled())) {
      logSocketRequest(context, HttpStatus.Code.NotFound);
      return sendException(context, "Not Found", HttpStatus.Code.NotFound, "FEATURE_DISABLED");
    }
  }

  let requestData: RequestDataType;
  try {
    requestData = JSON.parse(message) as RequestDataType;
  } catch {
    logSocketRequest(context, HttpStatus.Code.BadRequest);
    return sendException(context, "Invalid JSON message", HttpStatus.Code.BadRequest, "INVALID_JSON");
  }

  context.queries = requestData.queries as Record<string, ScalarType>;
  context.payload = requestData.payload as Record<string, ScalarType>;
  context.lang = requestData.lang as LocaleInfoType;

  try {
    context = await runMiddlewares(context, middlewares);
  } catch (error: unknown) {
    const middlewareError = toControllerError(error);
    logSocketRequest(context, middlewareError.status);
    return sendException(context, middlewareError.message, middlewareError.status, middlewareError.key);
  }

  applyEnvRoles(context);

  // Check allowed users
  const allowedUsersError = checkAllowedUsers(context);
  if (allowedUsersError) {
    logSocketRequest(context, allowedUsersError.status);
    return sendException(context, allowedUsersError.message, allowedUsersError.status, allowedUsersError.key);
  }

  const validationError = await validateRouteAccess(context, route, currentEnv);
  if (validationError) {
    logSocketRequest(context, validationError.status);
    return sendException(context, validationError.message, validationError.status, validationError.key);
  }

  if (route.permission) {
    const permission = container.get(route.permission);
    const allowed = await permission.allow();
    const userPermissions = await allowed.setUserPermissions(context);
    context.permission = await userPermissions.build();

    if (!(await context.permission.check(context))) {
      logSocketRequest(context, HttpStatus.Code.Forbidden);
      return sendException(context, "Forbidden", HttpStatus.Code.Forbidden, "PERMISSION_DENIED");
    }
  }

  // Cache lookup runs only after middlewares and all access checks have passed, so the
  // key reflects the authenticated user and a cached response can never bypass the checks
  let cacheKey: string | null = null;
  if (route.cache && context.cache) {
    cacheKey = getSocketCacheKey(
      route.cache,
      route.name,
      context.user?.id,
      context.params as Record<string, ScalarType>,
      context.queries as Record<string, ScalarType>,
      context.payload as Record<string, ScalarType>,
    );

    const cached = await safeCacheGet<string>(context.cache, cacheKey);
    if (cached) {
      logSocketRequest(context, HttpStatus.Code.OK);
      ws.send(cached);
      return;
    }
  }

  const controller = container.get(route.controller);

  try {
    context.response = await controller.index(context);
  } catch (error: unknown) {
    const controllerError = toControllerError(error);
    logSocketRequest(context, controllerError.status);
    return sendException(context, controllerError.message, controllerError.status, controllerError.key);
  }

  const responseValidationError = validateResponse(route, context.response.getData());
  if (responseValidationError) {
    logSocketRequest(context, responseValidationError.status);
    return sendException(
      context,
      responseValidationError.message,
      responseValidationError.status,
      responseValidationError.key,
    );
  }

  // Cache the response if caching is enabled
  if (cacheKey && context.cache && context.response.getStatus() < 300) {
    const serialized = await context.response.get(currentEnv).text();
    await safeCacheSet(context.cache, cacheKey, serialized, DEFAULT_CACHE_TTL);
  }

  logSocketRequest(context, HttpStatus.Code.OK);
  return context.channel.send(context.response);
};
