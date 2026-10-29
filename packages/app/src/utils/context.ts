import { AppEnv, type IAppEnv } from "@talosjs/app-env";
import type { ICache } from "@talosjs/cache";
import { container } from "@talosjs/container";
import type { ContextType } from "@talosjs/controller";
import { HttpRequest } from "@talosjs/http-request";
import { HttpResponse } from "@talosjs/http-response";
import type { ILogger } from "@talosjs/logger";
import type { IRateLimiter } from "@talosjs/rate-limit";
import type { RouteConfigType } from "@talosjs/routing";
import type { BunRequest, Server } from "bun";
import { RequestBodyTooLargeException } from "../RequestBodyTooLargeException";
import { limitRequestBody } from "./body";

export type RouteInfoType = Pick<RouteConfigType, "name" | "path" | "method" | "version" | "description" | "roles">;

// A parse failure leaves the payload empty, as it always has, but a body over the limit has to reach
// the route handler so it can answer 413
const rethrowTooLarge = (error: unknown): void => {
  if (error instanceof RequestBodyTooLargeException) {
    throw error;
  }
};

/**
 * Throws a `RequestBodyTooLargeException` when the body is over `maxBodySize`. Without it the body is
 * only bounded by Bun's `maxRequestBodySize`. `readBody: false` leaves the body unread, e.g. to answer
 * a request whose body was refused.
 */
export const buildHttpContext = async (ctx: {
  req: BunRequest;
  server: Server<unknown>;
  route?: RouteInfoType;
  maxBodySize?: number | undefined;
  readBody?: boolean;
}): Promise<ContextType> => {
  const { req, server, route, maxBodySize, readBody = true } = ctx;

  const address = server.requestIP(req);
  const ip = address?.address ?? "unknown";

  const response = new HttpResponse();

  const native = maxBodySize === undefined ? req : limitRequestBody(req, maxBodySize);

  let payload = {};
  let form: FormData | null = null;
  const contentType = readBody ? native.headers.get("content-type") : null;
  if (contentType?.includes("application/json")) {
    try {
      payload = await native.json();
    } catch (error: unknown) {
      rethrowTooLarge(error);
    }
  } else if (
    // formData() only ever succeeds for these two content types; skipping the
    // attempt otherwise avoids paying for a thrown exception on every body-less
    // request (GETs in particular)
    contentType &&
    (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded"))
  ) {
    try {
      form = await native.formData();
    } catch (error: unknown) {
      rethrowTooLarge(error);
    }
  }

  const request = new HttpRequest(native, {
    params: req.params,
    payload,
    form,
    ip,
  });

  const tryGetConstant = <T>(key: string): T | undefined => {
    try {
      return container.hasConstant(key) ? container.getConstant<T>(key) : undefined;
    } catch {
      return undefined;
    }
  };

  const exceptionLogger = container.hasConstant("exception.logger")
    ? container.getConstant<ILogger>("exception.logger")
    : undefined;
  const cache = tryGetConstant<ICache>("cache");
  const rateLimiter = tryGetConstant<IRateLimiter>("rateLimiter");

  const context: ContextType = {
    logger: container.getConstant("logger"),
    ...(exceptionLogger && { exceptionLogger }),
    ...(cache && { cache }),
    ...(rateLimiter && { rateLimiter }),
    route: route
      ? {
          name: route.name,
          path: route.path,
          method: route.method,
          version: route.version,
          description: route.description ?? "",
          ...(route.roles && { roles: route.roles }),
        }
      : null,
    env: container.get<IAppEnv>(AppEnv),
    response,
    request,
    params: request.params,
    payload: request.payload,
    queries: request.queries,
    method: request.method,
    header: request.header,
    files: request.files,
    ip: request.ip,
    host: request.host,
    lang: request.lang,
    user: null,
  };

  return context;
};
