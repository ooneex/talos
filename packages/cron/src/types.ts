import type { TimeZoneType } from "@talosjs/country";

export enum ECronPrefix {
  IN = "in",
  EVERY = "every",
}

export enum ECronSuffix {
  SECONDS = "seconds",
  MINUTES = "minutes",
  HOURS = "hours",
  DAYS = "days",
  MONTHS = "months",
  YEARS = "years",
}

export type PrefixType = `${ECronPrefix}`;
export type SuffixType = `${ECronSuffix}`;
export type CronTimeType = `${PrefixType} ${number} ${SuffixType}`;

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type CronClassType = new (...args: any[]) => ICron;

/**
 * Contract every cron job class implements — registered via `@decorator.cron()`
 * and scheduled from the `getTime()` sentence it declares.
 */
export interface ICron {
  getTime: () => Promise<CronTimeType> | CronTimeType;
  start: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  handler: () => Promise<void> | void;
  getTimeZone: () => TimeZoneType | null;
  isActive: () => Promise<boolean> | boolean;
}
