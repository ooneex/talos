import { dirname, join } from "node:path";
import { AppEnv, type IAppEnv, loadEnv } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { ICron } from "@talosjs/cron";
import { Exception, type IException } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { type ILogger, type LogDataType, TerminalLogger } from "@talosjs/logger";
import type { MiddlewareClassType, SocketMiddlewareClassType } from "@talosjs/middleware";
import { generateRolesTypes, type RolesConfigType, validateConfig } from "@talosjs/role";
import { router } from "@talosjs/routing";
import type { ScalarType } from "@talosjs/types";
import { trim } from "@talosjs/utils/trim";
import { AssertAppEnv } from "@talosjs/validation/constraints/AssertAppEnv";
import { AssertHostname } from "@talosjs/validation/constraints/AssertHostname";
import { AssertPort } from "@talosjs/validation/constraints/AssertPort";
import type { BunRequest, Server, ServerWebSocket } from "bun";
import { logger as loggerFunc } from "./logger";
import { formatSocketRoutes, socketRouteHandler } from "./socketRouteUtils";
import type { AppConfigType, IAppEventStart } from "./types";
import {
  buildHttpContext,
  formatHttpRoutes,
  logRequest,
  logServerStart,
  type RouteInfoType,
  runMiddlewares,
} from "./utils";

export class App {
  constructor(private readonly config: AppConfigType) {
    const { loggers, cronJobs, cache, rateLimiter, onException, onStart } = this.config;

    if (!container.has(AppEnv)) {
      container.add(AppEnv);
    }

    loggers.forEach((log) => {
      if (!container.has(log)) {
        container.add(log);
      }
      const logger = container.get<ILogger<Record<string, ScalarType>> | ILogger<LogDataType>>(log);
      logger.init();
    });
    container.addConstant("logger", loggerFunc(loggers, container));

    if (onException) {
      if (!container.has(onException)) {
        container.add(onException);
      }
      container.addConstant("exception.logger", container.get(onException));
    }

    if (onStart) {
      if (!container.has(onStart)) {
        container.add(onStart);
      }
      container.addConstant("app.event.start", container.get(onStart));
    }

    if (cache) {
      if (!container.has(cache)) {
        container.add(cache);
      }
      container.addConstant("cache", container.get(cache));
    }

    if (rateLimiter) {
      if (!container.has(rateLimiter)) {
        container.add(rateLimiter);
      }
      container.addConstant("rateLimiter", container.get(rateLimiter));
    }

    cronJobs?.forEach((cronJob) => {
      if (!container.has(cronJob)) {
        container.add(cronJob);
      }
    });
  }

  public async init(): Promise<App> {
    const env = container.get<IAppEnv>(AppEnv);

    const appEnvValidator = new AssertAppEnv();
    const appEnvResult = appEnvValidator.validate(env.APP_ENV);
    if (!appEnvResult.isValid) {
      throw new Exception(
        `Invalid APP_ENV "${env.APP_ENV}": set the APP_ENV environment variable to one of local, development, staging, testing, test, qa, uat, integration, preview, demo, sandbox, beta, canary, hotfix, or production`,
        {
          key: "INVALID_APP_ENV",
          status: HttpStatus.Code.InternalServerError,
          data: { appEnv: env.APP_ENV },
        },
      );
    }

    const portValidator = new AssertPort();
    const portResult = portValidator.validate(env.PORT);
    if (!portResult.isValid) {
      throw new Exception(
        `Invalid PORT "${env.PORT}": set the PORT environment variable to a number between 1 and 65535`,
        {
          key: "INVALID_PORT",
          status: HttpStatus.Code.InternalServerError,
          data: { port: env.PORT },
        },
      );
    }

    const hostnameValidator = new AssertHostname();
    const hostnameResult = hostnameValidator.validate(env.HOST_NAME);
    if (!hostnameResult.isValid) {
      throw new Exception(
        `Invalid HOST_NAME "${env.HOST_NAME}": set the HOST_NAME environment variable to a valid hostname or IP address`,
        {
          key: "INVALID_HOST_NAME",
          status: HttpStatus.Code.InternalServerError,
          data: { hostname: env.HOST_NAME },
        },
      );
    }

    // Prefer the project root roles.yml, falling back to the shared module's own roles.yml.
    const rolesDirs = [process.cwd(), join(process.cwd(), "modules", "shared", "src")];
    for (const rolesDir of rolesDirs) {
      const rolesFile = Bun.file(join(rolesDir, "roles.yml"));
      if (await rolesFile.exists()) {
        const rolesConfig = Bun.YAML.parse(await rolesFile.text()) as RolesConfigType;
        validateConfig(rolesConfig);
        container.addConstant("app.roles", rolesConfig);

        // Generated types are only useful at development time, and writing into the
        // source tree at boot fails on read-only filesystems in production containers
        if (env.isLocal) {
          const rolesTypesFile = join(rolesDir, "roles.types.ts");
          await Bun.write(rolesTypesFile, generateRolesTypes(rolesConfig));
        }

        break;
      }
    }

    return this;
  }

  public async run(): Promise<App> {
    // Bun.main is modules/<module-name>/src/index.ts, so the module root is two levels up.
    // Load the project root .env.yml as the shared base, then overlay the module's own
    // .env.yml so its specific values (e.g. its distinct PORT) take precedence.
    const moduleRoot = dirname(dirname(Bun.main));
    const cwd = process.cwd();
    await loadEnv([join(cwd, ".env.yml"), join(moduleRoot, ".env.yml")]);

    const logger = new TerminalLogger();

    try {
      await this.init();
    } catch (error: unknown) {
      logger.error(error as IException);
      process.exit(1);
    }

    const env = container.get<IAppEnv>(AppEnv);
    let hostname = env.HOST_NAME;

    const { middlewares = [], routing } = this.config;
    const prefix = trim(routing.prefix, "/");

    const allMiddlewares = this.config.cors
      ? [...(middlewares as MiddlewareClassType[]), this.config.cors]
      : (middlewares as MiddlewareClassType[]);

    const routes = {
      ...formatHttpRoutes(router.getHttpRoutes(), allMiddlewares, prefix),
      ...formatSocketRoutes(router.getSocketRoutes(), prefix),
    };

    const port = env.PORT;

    const server = Bun.serve({
      port,
      hostname,
      development: env.isLocal,
      routes: {
        ...routes,
        "/*": async (req: BunRequest, server: Server<unknown>) => {
          const url = new URL(req.url);
          const route = {
            name: "",
            path: url.pathname as `/${string}`,
            method: req.method as RouteInfoType["method"],
            version: 0,
            description: "Not Found",
          };
          let context = await buildHttpContext({ req, server, route });
          context.response.notFound("Not Found");

          if (this.config.cors) {
            context = await runMiddlewares(context, [this.config.cors]);
          }

          logRequest(context);

          return context.response.get(context.env.APP_ENV);
        },
      },
      websocket: {
        perMessageDeflate: true,
        async message(ws: ServerWebSocket<{ id: string }>, message: string) {
          await socketRouteHandler({
            message,
            ws,
            server,
            middlewares: middlewares as SocketMiddlewareClassType[],
          });
        },
        async close(ws: ServerWebSocket<{ id: string }>) {
          container.removeConstant(ws.data.id);
        },
      },
    });

    if (this.config.onStart) {
      const appEventStart = container.getConstant<IAppEventStart>("app.event.start");
      await appEventStart.handle(server);
    } else {
      hostname = server.hostname || "0.0.0.0";

      if (hostname === "0.0.0.0") {
        hostname = "localhost";
      }

      const baseUrl = `${server.protocol}://${hostname}:${server.port}`;
      logServerStart({ baseUrl, appEnv: env.APP_ENV, port: server.port ?? port, isLocal: env.isLocal });
    }

    this.config.cronJobs?.forEach((cronJob) => {
      const cron = container.get<ICron>(cronJob);
      cron.start();
    });

    return this;
  }
}
