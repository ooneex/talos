import type { LocaleType } from "@talosjs/translation";
import { locales } from "@talosjs/translation";
import type { ScalarType } from "@talosjs/types";
import { parseString } from "@talosjs/utils/parseString";
import { trim } from "@talosjs/utils/trim";
import type { IReadonlyUrl } from "./types";

export class ReadonlyUrl implements IReadonlyUrl {
  protected native: URL;
  protected protocol: string;
  protected subdomain: string | null;
  protected domain: string;
  protected hostname: string;
  protected port: number;
  protected path: string;
  protected queries: Record<string, ScalarType> = {};
  protected fragment: string;
  protected base: string;
  protected origin: string;

  constructor(url: string | URL) {
    this.native = new URL(url);

    this.protocol = trim(this.native.protocol, ":");
    this.subdomain = null;
    this.hostname = this.native.hostname;
    this.domain = this.hostname;

    // Only parse domain/subdomain for actual domain names, not IP addresses
    const isIpAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(this.hostname);
    if (!isIpAddress && this.hostname !== "localhost") {
      const match = /(?<subdomain>.+)\.(?<domain>[a-z0-9-_]+\.[a-z0-9]+)$/i.exec(this.domain);
      if (match) {
        const { subdomain, domain } = match.groups as {
          subdomain: string;
          domain: string;
        };
        this.subdomain = subdomain;
        this.domain = domain;
      }
    }

    // Handle port parsing - native URL omits default ports, but we need to detect them
    if (this.native.port) {
      this.port = parseString(this.native.port);
    } else {
      // Check if the original URL string had an explicit port
      const urlString = typeof url === "string" ? url : url.toString();
      const portMatch = urlString.match(/:(\d+)/);
      if (portMatch) {
        this.port = parseString(portMatch[1] as string);
      } else {
        this.port = 80; // Default port
      }
    }
    // Handle path - preserve structure but handle trailing slashes correctly
    if (this.native.pathname === "/") {
      this.path = "/";
    } else {
      // Remove all trailing slashes if present, but preserve internal empty segments
      this.path = this.native.pathname.replace(/\/+$/, "");
    }
    this.fragment = trim(this.native.hash, "#");
    this.base = `${this.native.protocol}//${this.native.host}`;
    this.origin = this.native.origin;

    for (const [key, value] of this.native.searchParams) {
      // Only parse as number/boolean if it's clearly intended to be
      if (value === "true") {
        this.queries[key] = true;
      } else if (value === "false") {
        this.queries[key] = false;
      } else if (/^\d+$/.test(value) && !value.startsWith("0")) {
        // Only parse as number if it's all digits and doesn't start with 0 (to preserve "001")
        this.queries[key] = Number.parseInt(value, 10);
      } else if (/^-?\d+(\.\d+)?$/.test(value) && !value.startsWith("0")) {
        // Parse as float if it's a valid number
        this.queries[key] = Number.parseFloat(value);
      } else {
        this.queries[key] = value;
      }
    }
  }

  public getNative(): URL {
    return this.native;
  }

  public getProtocol(): string {
    return this.protocol;
  }

  public getSubdomain(): string | null {
    return this.subdomain;
  }

  public getDomain(): string {
    return this.domain;
  }

  public getHostname(): string {
    return this.hostname;
  }

  public getPort(): number {
    return this.port;
  }

  public getPath(): string {
    return this.path;
  }

  public getQueries(): Record<string, ScalarType> {
    return { ...this.queries };
  }

  public getQuery(name: string): ScalarType | null {
    return this.queries[name] || null;
  }

  public getLang(): LocaleType {
    const lang = this.queries.lang as LocaleType;

    return locales.includes(lang) ? lang : "en";
  }

  public getPage(): number {
    return (this.queries.page as number) ?? 1;
  }

  public getLimit(): number {
    return (this.queries.limit as number) ?? 100;
  }

  public getOrder(): "ASC" | "DESC" {
    const order = this.queries.order;

    return ["ASC", "DESC"].includes(order as string) ? (order as "ASC" | "DESC") : "ASC";
  }

  public getOrderBy(): string | null {
    return (this.queries.orderBy as string) ?? null;
  }

  public getSearch(): string | null {
    return (this.queries.q as string) ?? null;
  }

  public getBearerToken(): string | null {
    const token = this.queries.bearerToken as string | undefined;

    return token ? decodeURIComponent(token) : null;
  }

  public getFragment(): string {
    return this.fragment;
  }

  public getBase(): string {
    return this.base;
  }

  public getOrigin(): string {
    return this.origin;
  }

  public toString(): string {
    return this.native.toString();
  }
}
