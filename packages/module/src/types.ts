import type { ControllerClassType } from "@talosjs/controller";
import type { CronClassType } from "@talosjs/cron";
import type { EntityClassType } from "@talosjs/entity";
import type { EventClassType } from "@talosjs/event";
import type { MiddlewareClassType } from "@talosjs/middleware";
import type { ControllerClassType as SocketControllerClassType } from "@talosjs/socket";

export type ModuleType = {
  controllers: (ControllerClassType | SocketControllerClassType)[];
  entities: EntityClassType[];
  middlewares: MiddlewareClassType[];
  cronJobs: CronClassType[];
  events: EventClassType[];
};

export type ModuleTypeType = "api" | "microservice" | "design" | "spa" | "sdk" | "module" | "storybook" | "swagger";
