import { beforeEach, describe, expect, test } from "bun:test";
import { Container, EContainerScope } from "@talosjs/container";
import { decorator } from "@/decorators";
import type { CronTimeType, ICron } from "@/types";

describe("decorator.cron", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should register class ending with 'Cron' successfully", () => {
    class TestCron implements ICron {
      public getTime(): CronTimeType {
        return "every 1 hours";
      }
      public start(): void {
        // noop
      }
      public stop(): void {
        // noop
      }
      public handler(): void {
        // noop
      }
      public getTimeZone(): null {
        return null;
      }
      public isActive(): boolean {
        return false;
      }
    }

    expect(() => {
      decorator.cron()(TestCron);
    }).not.toThrow();
  });

  test("should register class with default singleton scope", () => {
    class SingletonCron implements ICron {
      public getTime(): CronTimeType {
        return "every 1 hours";
      }
      public start(): void {
        // noop
      }
      public stop(): void {
        // noop
      }
      public handler(): void {
        // noop
      }
      public getTimeZone(): null {
        return null;
      }
      public isActive(): boolean {
        return false;
      }
    }

    decorator.cron()(SingletonCron);

    const instance1 = container.get(SingletonCron);
    const instance2 = container.get(SingletonCron);

    expect(instance1).toBe(instance2);
  });

  test("should register class with explicit singleton scope", () => {
    class ExplicitSingletonCron implements ICron {
      public getTime(): CronTimeType {
        return "every 1 hours";
      }
      public start(): void {
        // noop
      }
      public stop(): void {
        // noop
      }
      public handler(): void {
        // noop
      }
      public getTimeZone(): null {
        return null;
      }
      public isActive(): boolean {
        return false;
      }
    }

    decorator.cron(EContainerScope.Singleton)(ExplicitSingletonCron);

    const instance1 = container.get(ExplicitSingletonCron);
    const instance2 = container.get(ExplicitSingletonCron);

    expect(instance1).toBe(instance2);
  });

  test("should register class with transient scope", () => {
    class TransientCron implements ICron {
      private static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientCron.instanceCount++;
        this.instanceId = TransientCron.instanceCount;
      }

      public getTime(): CronTimeType {
        return "every 1 hours";
      }
      public start(): void {
        // noop
      }
      public stop(): void {
        // noop
      }
      public handler(): void {
        // noop
      }
      public getTimeZone(): null {
        return null;
      }
      public isActive(): boolean {
        return false;
      }
    }

    decorator.cron(EContainerScope.Transient)(TransientCron);

    const instance1 = container.get(TransientCron);
    const instance2 = container.get(TransientCron);

    expect(instance1).not.toBe(instance2);
    expect(instance1.instanceId).not.toBe(instance2.instanceId);
  });

  test("should register class with request scope", () => {
    class RequestScopedCron implements ICron {
      public getTime(): CronTimeType {
        return "every 1 hours";
      }
      public start(): void {
        // noop
      }
      public stop(): void {
        // noop
      }
      public handler(): void {
        // noop
      }
      public getTimeZone(): null {
        return null;
      }
      public isActive(): boolean {
        return false;
      }
    }

    expect(() => {
      decorator.cron(EContainerScope.Request)(RequestScopedCron);
    }).not.toThrow();

    const instance = container.get(RequestScopedCron);
    expect(instance).toBeInstanceOf(RequestScopedCron);
  });

  test("should register class with complex name ending in 'Cron'", () => {
    class DailyEmailNotificationCron implements ICron {
      public getTime(): CronTimeType {
        return "every 1 hours";
      }
      public start(): void {
        // noop
      }
      public stop(): void {
        // noop
      }
      public handler(): void {
        // noop
      }
      public getTimeZone(): null {
        return null;
      }
      public isActive(): boolean {
        return false;
      }
    }

    expect(() => {
      decorator.cron()(DailyEmailNotificationCron);
    }).not.toThrow();
  });

  test("should allow retrieving registered Cron class from container", () => {
    class RetrievableCron implements ICron {
      public readonly name = "retrievable";

      public getTime(): CronTimeType {
        return "every 1 hours";
      }
      public start(): void {
        // noop
      }
      public stop(): void {
        // noop
      }
      public handler(): void {
        // noop
      }
      public getTimeZone(): null {
        return null;
      }
      public isActive(): boolean {
        return false;
      }
    }

    decorator.cron()(RetrievableCron);

    const instance = container.get(RetrievableCron);
    expect(instance).toBeInstanceOf(RetrievableCron);
    expect(instance.name).toBe("retrievable");
  });

  test("should work with Cron class that has async methods", () => {
    class AsyncCron implements ICron {
      public async getTime(): Promise<CronTimeType> {
        return "every 5 minutes";
      }
      public async start(): Promise<void> {
        // noop
      }
      public async stop(): Promise<void> {
        // noop
      }
      public async handler(): Promise<void> {
        // noop
      }
      public getTimeZone(): null {
        return null;
      }
      public async isActive(): Promise<boolean> {
        return true;
      }
    }

    expect(() => {
      decorator.cron()(AsyncCron);
    }).not.toThrow();

    const instance = container.get(AsyncCron);
    expect(instance).toBeInstanceOf(AsyncCron);
  });

  test("should work with Cron class that has timezone", () => {
    class TimezoneCron implements ICron {
      public getTime(): CronTimeType {
        return "every 30 seconds";
      }
      public start(): void {
        // noop
      }
      public stop(): void {
        // noop
      }
      public handler(): void {
        // noop
      }
      public getTimeZone(): "Europe/Paris" {
        return "Europe/Paris";
      }
      public isActive(): boolean {
        return true;
      }
    }

    expect(() => {
      decorator.cron()(TimezoneCron);
    }).not.toThrow();

    const instance = container.get(TimezoneCron);
    expect(instance).toBeInstanceOf(TimezoneCron);
    expect(instance.getTimeZone()).toBe("Europe/Paris");
  });

  test("should return void from the decorator function", () => {
    class VoidReturnCron implements ICron {
      public getTime(): CronTimeType {
        return "every 1 hours";
      }
      public start(): void {
        // noop
      }
      public stop(): void {
        // noop
      }
      public handler(): void {
        // noop
      }
      public getTimeZone(): null {
        return null;
      }
      public isActive(): boolean {
        return false;
      }
    }

    const result = decorator.cron()(VoidReturnCron);
    expect(result).toBeUndefined();
  });
});
