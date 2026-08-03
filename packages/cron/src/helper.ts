import { CronException } from "./CronException";
import type { CronTimeType, SuffixType } from "./types";

/**
 * Converts a CronTimeType string to a standard crontab expression
 * @param cronTime - The CronTimeType string (e.g., "every 5 minutes", "in 30 seconds")
 * @returns A crontab expression string
 */
export const convertToCrontab = (cronTime: CronTimeType): string => {
  const parts = cronTime.split(" ");

  if (parts.length !== 3) {
    throw new CronException(`Invalid CronTimeType format: ${cronTime}`, "INVALID_FORMAT");
  }

  const prefix = parts[0] as "in" | "every";
  const value = Number.parseInt(parts[1] || "1", 10);
  const suffix = parts[2] as SuffixType;

  if (Number.isNaN(value) || value <= 0) {
    throw new CronException(`Invalid number value in CronTimeType: ${parts[1]}`, "INVALID_VALUE");
  }

  // Handle "in" prefix (one-time execution)
  if (prefix === "in") {
    const now = new Date();
    const format = (date: Date): string =>
      `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

    switch (suffix) {
      case "months": {
        const futureMonths = new Date(now);
        futureMonths.setMonth(futureMonths.getMonth() + value);
        return format(futureMonths);
      }

      case "years": {
        const futureYears = new Date(now);
        futureYears.setFullYear(futureYears.getFullYear() + value);
        return format(futureYears);
      }

      case "seconds":
        return format(new Date(now.getTime() + value * 1000));

      case "minutes":
        return format(new Date(now.getTime() + value * 60 * 1000));

      case "hours":
        return format(new Date(now.getTime() + value * 60 * 60 * 1000));

      case "days":
        return format(new Date(now.getTime() + value * 24 * 60 * 60 * 1000));
    }
  }

  // Handle "every" prefix (recurring execution)
  if (prefix === "every") {
    switch (suffix) {
      case "seconds":
        if (value === 1) return "* * * * * *";
        return `*/${value} * * * * *`;

      case "minutes":
        if (value === 1) return "* * * * *";
        return `*/${value} * * * *`;

      case "hours":
        if (value === 1) return "0 * * * *";
        return `0 */${value} * * *`;

      case "days":
        if (value === 1) return "0 0 * * *";
        return `0 0 */${value} * *`;

      case "months":
        if (value === 1) return "0 0 1 * *";
        return `0 0 1 */${value} *`;

      case "years":
        if (value === 1) return "0 0 1 1 *";
        return "0 0 1 1 *";
    }
  }

  throw new CronException(`Invalid CronTimeType format: ${cronTime}`, "INVALID_FORMAT");
};
