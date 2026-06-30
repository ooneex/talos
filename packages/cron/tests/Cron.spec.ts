import { afterEach, describe, expect, test } from "bun:test";
import { Cron } from "@/Cron";
import type { CronTimeType, ICron } from "@/types";

class TestCronAdapter extends Cron {
  public jobCallCount = 0;
  private time: CronTimeType;
  private readonly timeZone: string | null;

  public constructor(options: { time: CronTimeType; timeZone?: string }) {
    super();
    this.time = options.time;
    this.timeZone = options.timeZone ?? null;
  }

  public override getTime(): CronTimeType {
    return this.time;
  }

  public override getTimeZone(): string | null {
    return this.timeZone;
  }

  public override async handler(): Promise<void> {
    this.jobCallCount++;
  }
}

describe("CronAdapter", () => {
  let adapter: TestCronAdapter;

  afterEach(async () => {
    if (adapter) {
      await adapter.stop();
    }
  });

  describe("Constructor", () => {
    test("should create CronAdapter with required options", () => {
      adapter = new TestCronAdapter({
        time: "every 1 minutes",
      });

      expect(adapter).toBeInstanceOf(TestCronAdapter);
      expect(adapter.getTime()).toBe("every 1 minutes");
    });

    test("should create CronAdapter with all options", () => {
      adapter = new TestCronAdapter({
        time: "every 5 minutes",
        timeZone: "America/New_York",
      });

      expect(adapter).toBeInstanceOf(TestCronAdapter);
      expect(adapter.getTime()).toBe("every 5 minutes");
    });

    test("should create CronAdapter with default timeZone as null", () => {
      adapter = new TestCronAdapter({
        time: "every 1 hours",
      });

      const timeZone = adapter.getTimeZone();
      expect(timeZone).toBeNull();
    });

    test("should create CronAdapter with specified timeZone", () => {
      adapter = new TestCronAdapter({
        time: "every 1 hours",
        timeZone: "Europe/London",
      });

      const timeZone = adapter.getTimeZone();
      expect(timeZone).toBe("Europe/London");
    });
  });

  describe("ICron Implementation", () => {
    test("should implement ICron interface", () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      const cronInstance: ICron = adapter;

      expect(typeof cronInstance.getTime).toBe("function");
      expect(typeof cronInstance.start).toBe("function");
      expect(typeof cronInstance.stop).toBe("function");
      expect(typeof cronInstance.handler).toBe("function");
      expect(typeof cronInstance.getTimeZone).toBe("function");
      expect(typeof cronInstance.isActive).toBe("function");
    });
  });

  describe("getTime", () => {
    test("should return the configured time", () => {
      adapter = new TestCronAdapter({ time: "every 10 minutes" });

      expect(adapter.getTime()).toBe("every 10 minutes");
    });

    test("should return different time configurations", () => {
      const times: CronTimeType[] = [
        "every 5 minutes",
        "every 2 hours",
        "every 1 days",
        "every 1 months",
        "every 1 years",
      ];

      for (const time of times) {
        const testAdapter = new TestCronAdapter({ time });
        expect(testAdapter.getTime()).toBe(time);
      }
    });
  });

  describe("start", () => {
    test("should start the cron job", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });

    test("should start with timeZone option", async () => {
      adapter = new TestCronAdapter({
        time: "every 1 minutes",
        timeZone: "America/Los_Angeles",
      });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });

    test("should allow calling start multiple times without error", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.start();
      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });
  });

  describe("stop", () => {
    test("should stop a running cron job", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.start();
      expect(adapter.isActive()).toBe(true);

      await adapter.stop();
      expect(adapter.isActive()).toBe(false);
    });

    test("should not throw when stopping an already stopped job", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.start();
      await adapter.stop();
      await adapter.stop();

      expect(adapter.isActive()).toBe(false);
    });

    test("should not throw when stopping a job that was never started", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.stop();

      expect(adapter.isActive()).toBe(false);
    });
  });

  describe("handler", () => {
    test("should execute the abstract handler method implementation", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.handler();

      expect(adapter.jobCallCount).toBe(1);
    });

    test("should return a Promise", () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      const result = adapter.handler();

      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("getTimeZone", () => {
    test("should return null when no timeZone is set", () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      const result = adapter.getTimeZone();

      expect(result).toBeNull();
    });

    test("should return the configured timeZone", () => {
      adapter = new TestCronAdapter({
        time: "every 1 minutes",
        timeZone: "Asia/Tokyo",
      });

      const result = adapter.getTimeZone();

      expect(result).toBe("Asia/Tokyo");
    });

    test("should return correct type", () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      const result = adapter.getTimeZone();

      expect(result === null || typeof result === "string").toBe(true);
    });
  });

  describe("isActive", () => {
    test("should return false before start is called", () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      expect(adapter.isActive()).toBe(false);
    });

    test("should return true after start is called", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });

    test("should return false after stop is called", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.start();
      await adapter.stop();

      expect(adapter.isActive()).toBe(false);
    });
  });

  describe("Cron Expressions", () => {
    test("should handle every 1 minutes", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });

    test("should handle every N minutes", async () => {
      adapter = new TestCronAdapter({ time: "every 15 minutes" });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });

    test("should handle every 1 hours", async () => {
      adapter = new TestCronAdapter({ time: "every 1 hours" });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });

    test("should handle every N hours", async () => {
      adapter = new TestCronAdapter({ time: "every 6 hours" });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });

    test("should handle every 1 days", async () => {
      adapter = new TestCronAdapter({ time: "every 1 days" });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });

    test("should handle every 1 months", async () => {
      adapter = new TestCronAdapter({ time: "every 1 months" });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });

    test("should handle every 1 years", async () => {
      adapter = new TestCronAdapter({ time: "every 1 years" });

      await adapter.start();

      expect(adapter.isActive()).toBe(true);
    });
  });

  describe("Start and Stop Lifecycle", () => {
    test("should allow restart after stop", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      await adapter.start();
      expect(adapter.isActive()).toBe(true);

      await adapter.stop();
      expect(adapter.isActive()).toBe(false);

      await adapter.start();
      expect(adapter.isActive()).toBe(true);
    });

    test("should maintain time configuration after restart", async () => {
      adapter = new TestCronAdapter({ time: "every 5 minutes" });

      await adapter.start();
      await adapter.stop();
      await adapter.start();

      expect(adapter.getTime()).toBe("every 5 minutes");
    });
  });

  describe("TimeZone Support", () => {
    test("should accept various timezone formats", async () => {
      const timeZones = ["America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney", "UTC"];

      for (const tz of timeZones) {
        const testAdapter = new TestCronAdapter({
          time: "every 1 minutes",
          timeZone: tz,
        });

        const result = testAdapter.getTimeZone();
        expect(result).toBe(tz);
        await testAdapter.stop();
      }
    });
  });

  describe("CronAdapterOptions Interface", () => {
    test("should accept minimal options", () => {
      adapter = new TestCronAdapter({
        time: "every 1 minutes",
      });

      expect(adapter).toBeInstanceOf(TestCronAdapter);
    });

    test("should accept all optional properties", () => {
      adapter = new TestCronAdapter({
        time: "every 1 minutes",
        timeZone: "America/Chicago",
      });

      expect(adapter).toBeInstanceOf(TestCronAdapter);
    });
  });

  describe("Error Handling", () => {
    test("should throw CronException for invalid cron time during start", async () => {
      adapter = new TestCronAdapter({
        time: "invalid time format" as CronTimeType,
      });

      expect(adapter.start()).rejects.toThrow();
    });
  });

  describe("Abstract Class", () => {
    test("should require handler method implementation in subclass", async () => {
      const customAdapter = new TestCronAdapter({
        time: "every 1 minutes",
      });

      await customAdapter.start();

      expect(customAdapter.isActive()).toBe(true);
      expect(typeof customAdapter.handler).toBe("function");

      await customAdapter.stop();
    });

    test("should track handler executions in custom implementation", async () => {
      adapter = new TestCronAdapter({ time: "every 1 minutes" });

      expect(adapter.jobCallCount).toBe(0);

      await adapter.handler();
      expect(adapter.jobCallCount).toBe(1);

      await adapter.handler();
      expect(adapter.jobCallCount).toBe(2);
    });
  });
});
