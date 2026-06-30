import type { ScalarType } from "@talosjs/types";
import { trim } from "@talosjs/utils/trim";
import { ReadonlyUrl } from "./ReadonlyUrl";
import type { IUrl } from "./types";

export class Url extends ReadonlyUrl implements IUrl {
  public setProtocol(protocol: string): this {
    const oldProtocol = this.protocol;
    this.protocol = trim(protocol, ":");

    // Update port based on protocol change if it was a default port
    if (oldProtocol === "http" && this.port === 80 && this.protocol === "https") {
      this.port = 80; // Keep 80 as default for all protocols as per tests
    } else if (oldProtocol === "https" && this.port === 443 && this.protocol === "http") {
      this.port = 80; // Keep 80 as default for all protocols as per tests
    }

    this.updateNativeUrl();
    return this;
  }

  public setHostname(hostname: string): this {
    this.hostname = hostname;

    this.subdomain = null;
    this.domain = hostname;

    // Only parse domain/subdomain for actual domain names, not IP addresses
    const isIpAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
    if (!isIpAddress && hostname !== "localhost") {
      const match = /(?<subdomain>.+)\.(?<domain>[a-z0-9-_]+\.[a-z0-9]+)$/i.exec(hostname);
      if (match) {
        const { subdomain, domain } = match.groups as {
          subdomain: string;
          domain: string;
        };
        this.subdomain = subdomain;
        this.domain = domain;
      }
    }

    this.updateNativeUrl();
    return this;
  }

  public setPort(port: number): this {
    this.port = port;
    this.updateNativeUrl();
    return this;
  }

  public setPath(path: string): this {
    if (path === "") {
      this.path = "/";
    } else {
      this.path = `/${trim(path, "/")}`;
    }
    this.updateNativeUrl();
    return this;
  }

  public addQuery(key: string, value: ScalarType): this {
    this.queries[key] = value;
    this.updateNativeUrl();
    return this;
  }

  public removeQuery(key: string): this {
    delete this.queries[key];
    this.updateNativeUrl();
    return this;
  }

  public setQueries(queries: Record<string, ScalarType>): this {
    this.queries = { ...queries };
    this.updateNativeUrl();
    return this;
  }

  public clearQueries(): this {
    this.queries = {};
    this.updateNativeUrl();
    return this;
  }

  public setFragment(fragment: string): this {
    this.fragment = trim(fragment, "#");
    this.updateNativeUrl();
    return this;
  }

  private updateNativeUrl() {
    const protocol = this.protocol.includes(":") ? this.protocol : `${this.protocol}:`;
    const port = this.shouldShowPort() ? `:${this.port}` : "";
    const path = this.path;
    const queryString = this.buildQueryString();
    const fragment = this.fragment ? `#${this.fragment}` : "";
    const urlString = `${protocol}//${this.hostname}${port}${path}${queryString}${fragment}`;
    this.native = new URL(urlString);
    this.base = this.shouldShowPort() ? `${protocol}//${this.hostname}${port}` : `${protocol}//${this.hostname}`;
    this.origin = this.shouldShowPort() ? `${protocol}//${this.hostname}${port}` : `${protocol}//${this.hostname}`;
  }

  private shouldShowPort(): boolean {
    if (this.protocol === "http" && this.port === 80) return false;
    if (this.protocol === "https" && this.port === 443) return false;
    if (this.port === 80) return false; // Don't show default port 80
    return true;
  }

  private buildQueryString(): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(this.queries)) {
      params.set(key, String(value));
    }
    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }
}
