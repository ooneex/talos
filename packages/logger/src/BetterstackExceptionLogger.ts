import * as Sentry from "@sentry/node";
import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import type { ScalarType } from "@talosjs/types";
import { decorator } from "./decorators";
import { LoggerException } from "./LoggerException";
import type { ILogger } from "./types";

@decorator.logger()
export class BetterstackExceptionLogger implements ILogger {
  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    const applicationToken = this.env.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN;
    if (!applicationToken) {
      throw new LoggerException(
        "Better Stack application token is required. Please set the BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN environment variable.",
        "TOKEN_REQUIRED",
      );
    }

    const ingestingHost = this.env.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST;
    if (!ingestingHost) {
      throw new LoggerException(
        "Better Stack ingesting host is required. Please set the BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST environment variable.",
        "EXCEPTION_LOG_FAILED",
      );
    }

    Sentry.init({
      dsn: `https://${applicationToken}@${ingestingHost}/1`,
      tracesSampleRate: 1.0,
      enableLogs: true,
    });
  }

  public init(): void {}

  public error(message: string | IException, data?: Record<string, ScalarType>): void {
    Sentry.withScope((scope) => {
      if (typeof message === "string") {
        if (data) {
          scope.setExtras(data);
        }
        scope.addBreadcrumb({
          category: "error",
          message,
          level: "error",
        });

        Sentry.captureException(new Error(message));
      } else {
        scope.setTag("exception.name", message.name);
        scope.setTag("exception.status", message.status);

        scope.setContext("exception", {
          name: message.name,
          status: message.status,
          date: message.date.toISOString(),
          stack: message.stackToJson(),
        });

        if (data) {
          scope.setExtras(data);
        }

        scope.addBreadcrumb({
          category: "exception",
          message: message.message ?? "Unknown error",
          level: "error",
          data: {
            name: message.name,
            status: message.status,
          },
        });

        Sentry.captureException(message);
      }
    });
  }

  public warn(message: string, data?: Record<string, ScalarType>): void {
    Sentry.logger.warn(message, data);
  }

  public info(message: string, data?: Record<string, ScalarType>): void {
    Sentry.logger.info(message, data);
  }

  public debug(message: string, data?: Record<string, ScalarType>): void {
    Sentry.logger.debug(message, data);
  }

  public log(message: string, data?: Record<string, ScalarType>): void {
    Sentry.logger.info(message, { ...data, level: "LOG" });
  }

  public success(message: string, data?: Record<string, ScalarType>): void {
    Sentry.logger.info(message, { ...data, level: "SUCCESS" });
  }

  public async flush(): Promise<void> {
    await Sentry.flush(2000);
  }
}
