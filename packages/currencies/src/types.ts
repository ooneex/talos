import type { IBase } from "@talosjs/types";
import type { CURRENCIES } from "./constants";

export type CurrencyCodeType = (typeof CURRENCIES)[number]["code"];
export type CurrencyNameType = (typeof CURRENCIES)[number]["name"];
export type CurrencyIconType = (typeof CURRENCIES)[number]["icon"];
export type CurrencySymbolType = (typeof CURRENCIES)[number]["symbol"];

export interface ICurrency extends IBase {
  code: string;
  name: string;
  icon?: string;
  symbol: string;
}
