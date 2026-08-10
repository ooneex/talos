import type { LocaleType } from "@talosjs/translation";
import type { TimeZone } from "@vvo/tzdb";
import type { countries } from "./countries";

export type CountryEntryType = (typeof countries)[number];
export type CountryType = (typeof countries)[number]["code"];
export type CountryNameType = (typeof countries)[number]["name"];
export type CountryLangType = (typeof countries)[number]["lang"];
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
