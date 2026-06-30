import { describe, expect, test } from "bun:test";
import type { IController as HttpController } from "@talosjs/controller";
import type { ICron } from "@talosjs/cron";
import type { IEntity } from "@talosjs/entity";
import type { IEvent } from "@talosjs/event";
import type { IMiddleware } from "@talosjs/middleware";
import type { IController as SocketController } from "@talosjs/socket";
import type { ModuleType } from "@/index";

class TestHttpController implements HttpController {
  public index(): never {
    throw new Error("not implemented");
  }
}

class TestSocketController implements SocketController {
  public index(): never {
    throw new Error("not implemented");
  }
}

class TestEntity implements IEntity {
  public id = "entity-id";
}

class TestMiddleware implements IMiddleware {
  public handler(): never {
    throw new Error("not implemented");
  }
}

class TestCron implements ICron {
  public getTime(): "every 1 seconds" {
    return "every 1 seconds";
  }

  public start(): void {}

  public stop(): void {}

  public handler(): void {}

  public getTimeZone(): null {
    return null;
  }

  public isActive(): boolean {
    return true;
  }
}

class TestEvent implements IEvent {
  public getChannel(): string {
    return "test.channel";
  }

  public handler(): void {}

  public publish(): void {}

  public subscribe(): void {}

  public unsubscribe(): void {}

  public unsubscribeAll(): void {}
}

describe("module public types", () => {
  test("accepts the public module contract", () => {
    const module: ModuleType = {
      controllers: [TestHttpController, TestSocketController],
      entities: [TestEntity],
      middlewares: [TestMiddleware],
      cronJobs: [TestCron],
      events: [TestEvent],
    };

    expect(module.controllers).toHaveLength(2);
  });

  test("requires all module arrays", () => {
    // @ts-expect-error ModuleType requires all registration arrays
    const module: ModuleType = {
      controllers: [],
      entities: [],
      middlewares: [],
      cronJobs: [],
    };

    expect(module.controllers).toHaveLength(0);
  });

  test("rejects incompatible controller classes", () => {
    class InvalidController {
      public index(): string {
        return "invalid";
      }
    }

    const module: ModuleType = {
      // @ts-expect-error controllers must implement an HTTP or WebSocket controller contract
      controllers: [InvalidController],
      entities: [],
      middlewares: [],
      cronJobs: [],
      events: [],
    };

    expect(module.controllers).toHaveLength(1);
  });
});
