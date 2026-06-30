import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import type { ContextConfigType, ContextType } from "@talosjs/controller";
import type { HttpMethodType } from "@talosjs/types";
import { decorator } from "./decorators";
import type { IMiddleware } from "./types";

const defaultMethods: HttpMethodType[] = ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"];
const defaultHeaders: string[] = ["Content-Type", "Authorization"];

@decorator.middleware()
export class CorsMiddleware<T extends ContextConfigType = ContextConfigType> implements IMiddleware<T> {
  private readonly origins: string[] | "*";
  private readonly methods: HttpMethodType[];
  private readonly headers: string[];
  private readonly exposedHeaders: string[];
  private readonly credentials: boolean;
  private readonly maxAge: number;

  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    const origins = this.env.CORS_ORIGINS ?? "*";
    this.origins = origins === "*" ? "*" : origins.split(",").map((o) => o.trim());
    this.methods = (this.env.CORS_METHODS?.split(",").map((m) => m.trim()) as HttpMethodType[]) ?? defaultMethods;
    this.headers = this.env.CORS_HEADERS?.split(",").map((h) => h.trim()) ?? defaultHeaders;
    this.exposedHeaders = this.env.CORS_EXPOSED_HEADERS?.split(",").map((h) => h.trim()) ?? [];
    this.credentials = this.env.CORS_CREDENTIALS === "true";
    this.maxAge = Number(this.env.CORS_MAX_AGE ?? 86400);
  }

  public handler = async (context: ContextType<T>): Promise<ContextType<T>> => {
    const origin = context.header.get("Origin");

    if (!origin) {
      return context;
    }

    if (!this.isOriginAllowed(origin)) {
      return context;
    }

    const allowedOrigin = this.origins === "*" ? "*" : origin;

    context.response.header
      .setAccessControlAllowOrigin(allowedOrigin)
      .setAccessControlAllowMethods(this.methods)
      .setAccessControlAllowHeaders(this.headers)
      .setAccessControlAllowCredentials(this.credentials);

    if (this.exposedHeaders.length > 0) {
      context.response.header.set("Access-Control-Expose-Headers", this.exposedHeaders.join(", "));
    }

    if (context.method === "OPTIONS") {
      context.response.header.set("Access-Control-Max-Age", String(this.maxAge));
      context.response.json({}, 204);
    }

    return context;
  };

  private isOriginAllowed(origin: string): boolean {
    if (this.origins === "*") {
      return true;
    }

    return this.origins.includes(origin);
  }
}
