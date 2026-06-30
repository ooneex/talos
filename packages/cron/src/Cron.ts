import type { TimeZoneType } from "@talosjs/country";
import { CronException } from "./CronException";
import { convertToCrontab } from "./helper";
import type { CronTimeType, ICron } from "./types";

interface BunCronJob {
  readonly cron: string;
  stop(): BunCronJob;
  ref(): BunCronJob;
  unref(): BunCronJob;
}

declare namespace Bun {
  function cron(schedule: string, handler: () => unknown): BunCronJob;
}

export abstract class Cron implements ICron {
  private cronJob: BunCronJob | null = null;
  private active = false;

  public abstract getTime(): CronTimeType;
  public abstract handler(): Promise<void>;
  public abstract getTimeZone(): TimeZoneType | null;

  public async start(): Promise<void> {
    if (this.active) {
      return;
    }

    const cronExpression = convertToCrontab(this.getTime());

    try {
      this.cronJob = Bun.cron(cronExpression, async () => {
        await this.handler();
      });
      this.active = true;
    } catch (error) {
      throw new CronException("Failed to start cron job", "START_FAILED", {
        time: this.getTime(),
        cronExpression,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async stop(): Promise<void> {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.active = false;
  }

  public isActive(): boolean {
    return this.active;
  }
}
