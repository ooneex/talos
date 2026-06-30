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

    switch (suffix) {
      case "seconds": {
        const futureSeconds = new Date(now.getTime() + value * 1000);
        return `${futureSeconds.getMinutes()} ${futureSeconds.getHours()} ${futureSeconds.getDate()} ${futureSeconds.getMonth() + 1} *`;
      }

      case "minutes": {
        const futureMinutes = new Date(now.getTime() + value * 60 * 1000);
        return `${futureMinutes.getMinutes()} ${futureMinutes.getHours()} ${futureMinutes.getDate()} ${futureMinutes.getMonth() + 1} *`;
      }

      case "hours": {
        const futureHours = new Date(now.getTime() + value * 60 * 60 * 1000);
        return `${futureHours.getMinutes()} ${futureHours.getHours()} ${futureHours.getDate()} ${futureHours.getMonth() + 1} *`;
      }

      case "days": {
        const futureDays = new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
        return `${futureDays.getMinutes()} ${futureDays.getHours()} ${futureDays.getDate()} ${futureDays.getMonth() + 1} *`;
      }

      case "months": {
        const futureMonths = new Date(now);
        futureMonths.setMonth(futureMonths.getMonth() + value);
        return `${futureMonths.getMinutes()} ${futureMonths.getHours()} ${futureMonths.getDate()} ${futureMonths.getMonth() + 1} *`;
      }

      case "years": {
        const futureYears = new Date(now);
        futureYears.setFullYear(futureYears.getFullYear() + value);
        return `${futureYears.getMinutes()} ${futureYears.getHours()} ${futureYears.getDate()} ${futureYears.getMonth() + 1} *`;
      }
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
