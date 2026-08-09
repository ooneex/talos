import { dirname, join } from "node:path";
import { AppEnv, type IAppEnv, loadEnv } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import type { ICron } from "@talosjs/cron";
import { Exception, type IException } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { type ILogger, type LogDataType, TerminalLogger } from "@talosjs/logger";
import type { MiddlewareClassType, SocketMiddlewareClassType } from "@talosjs/middleware";
import { generateRolesTypes, type IRolesConfig, validateConfig } from "@talosjs/role";
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
import type { HttpRouteHandlerType } from "./utils";
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

    // Prefer the project root roles.yml, falling back to the running module's own roles.yml.
    // Bun.main is modules/<module-name>/src/index.ts, so the module root is two levels up.
    const moduleRoot = dirname(dirname(Bun.main));
    const rolesDirs = [process.cwd(), moduleRoot];
    for (const rolesDir of rolesDirs) {
      const rolesFile = Bun.file(join(rolesDir, "roles.yml"));
      if (await rolesFile.exists()) {
        const rolesConfig = Bun.YAML.parse(await rolesFile.text()) as IRolesConfig;
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
    await this.loadEnvironment();

    const logger = new TerminalLogger();

    try {
      await this.init();
    } catch (error: unknown) {
      logger.error(error as IException);
      process.exit(1);
    }

    const env = container.get<IAppEnv>(AppEnv);
    const { middlewares = [], routing } = this.config;
    const server = this.createServer(env, middlewares as MiddlewareClassType[], trim(routing.prefix, "/"));

    await this.handleStart(server);

    logServerStart(this.buildServerStartInfo(server, env));
    this.startCronJobs();

    return this;
  }

  private async loadEnvironment(): Promise<void> {
    // Bun.main is modules/<module-name>/src/index.ts, so the module root is two levels up.
    // Load the project root .env.yml as the shared base, then overlay the module's own
    // .env.yml so its specific values (e.g. its distinct PORT) take precedence.
    const moduleRoot = dirname(dirname(Bun.main));
    const cwd = process.cwd();
    await loadEnv([join(cwd, ".env.yml"), join(moduleRoot, ".env.yml")]);
  }

  private buildMiddlewares(middlewares: MiddlewareClassType[]): MiddlewareClassType[] {
    const allMiddlewares = this.config.cors
      ? [...(middlewares as MiddlewareClassType[]), this.config.cors]
      : (middlewares as MiddlewareClassType[]);

    return allMiddlewares;
  }

  private createServer(env: IAppEnv, middlewares: MiddlewareClassType[], prefix: string): Server<unknown> {
    let server!: Server<unknown>;
    server = Bun.serve({
      port: env.PORT,
      hostname: env.HOST_NAME,
      development: env.isLocal,
      routes: this.buildRoutes(prefix, middlewares),
      websocket: this.buildWebsocketHandlers(() => server, middlewares),
    });

    return server;
  }

  private buildRoutes(prefix: string, middlewares: MiddlewareClassType[]) {
    const allMiddlewares = this.buildMiddlewares(middlewares);

    return {
      ...formatHttpRoutes(router.getHttpRoutes(), allMiddlewares, prefix),
      ...formatSocketRoutes(router.getSocketRoutes(), prefix),
      "/*": this.createNotFoundHandler(),
    };
  }

  private createNotFoundHandler(): HttpRouteHandlerType {
    return async (req: BunRequest, server: Server<unknown>) => {
      const context = await this.buildNotFoundContext(req, server);
      logRequest(context);
      return context.response.get(context.env.APP_ENV);
    };
  }

  private async buildNotFoundContext(req: BunRequest, server: Server<unknown>) {
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

    if (!this.config.cors) {
      return context;
    }

    context = await runMiddlewares(context, [this.config.cors]);
    return context;
  }

  private buildWebsocketHandlers(getServer: () => Server<unknown>, middlewares: MiddlewareClassType[]) {
    return {
      perMessageDeflate: true,
      ...this.config.websocket,
      message: async (ws: ServerWebSocket<{ id: string }>, message: string) => {
        await socketRouteHandler({
          message,
          ws,
          server: getServer() as Server<{ id: string }>,
          middlewares: middlewares as unknown as SocketMiddlewareClassType[],
        });
      },
      close: (ws: ServerWebSocket<{ id: string }>) => {
        container.removeConstant(ws.data.id);
      },
    };
  }

  private async handleStart(server: Server<unknown>): Promise<void> {
    if (!this.config.onStart) {
      return;
    }

    const appEventStart = container.getConstant<IAppEventStart>("app.event.start");
    await appEventStart.handle(server);
  }

  private buildServerStartInfo(server: Server<unknown>, env: IAppEnv) {
    const hostname = this.normalizeHostname(server.hostname || env.HOST_NAME);

    return {
      baseUrl: `${server.protocol}://${hostname}:${server.port}`,
      appEnv: env.APP_ENV,
      port: server.port ?? env.PORT,
      isLocal: env.isLocal,
    };
  }

  private normalizeHostname(hostname: string): string {
    if (hostname === "0.0.0.0") {
      return "localhost";
    }

    return hostname;
  }

  private startCronJobs(): void {
    this.config.cronJobs?.forEach((cronJob) => {
      const cron = container.get<ICron>(cronJob);
      cron.start();
    });
  }
}
