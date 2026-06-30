import type { LocaleType } from "@talosjs/translation";
import type { TimeZone } from "@vvo/tzdb";
import type { COUNTRIES_EN } from "./en";

export type CountryType = (typeof COUNTRIES_EN)[number]["code"];
export type CountryNameType = (typeof COUNTRIES_EN)[number]["name"];
export type TimeZoneType = TimeZone["name"];

export interface ICountry {
  id: string;
  isLocked?: boolean;
  lockedAt?: Date;
  isBlocked?: boolean;
  blockedAt?: Date;
  blockReason?: string;
  isPublic?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  language?: LocaleType;
  name: string;
  code: string;
}
