import { injectable } from "@talosjs/container";
import { parseString } from "@talosjs/utils/parseString";
import type { EnvironmentNameType, IAppEnv } from "./types";

type MutableAppEnvType = { -readonly [K in keyof IAppEnv]: IAppEnv[K] };

const readString = (key: keyof typeof Bun.env): string | undefined => {
  const value = Bun.env[key]?.trim();

  return value && value !== "undefined" ? value : undefined;
};

const readStringList = (key: keyof typeof Bun.env): string[] => {
  return (Bun.env[key] || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const buildEnvironmentFlags = (
  appEnv: EnvironmentNameType,
): Pick<
  IAppEnv,
  | "isLocal"
  | "isDevelopment"
  | "isStaging"
  | "isTesting"
  | "isTest"
  | "isQa"
  | "isUat"
  | "isIntegration"
  | "isPreview"
  | "isDemo"
  | "isSandbox"
  | "isBeta"
  | "isCanary"
  | "isHotfix"
  | "isProduction"
> => {
  return {
    isLocal: appEnv === "local",
    isDevelopment: appEnv === "development",
    isStaging: appEnv === "staging",
    isTesting: appEnv === "testing",
    isTest: appEnv === "test",
    isQa: appEnv === "qa",
    isUat: appEnv === "uat",
    isIntegration: appEnv === "integration",
    isPreview: appEnv === "preview",
    isDemo: appEnv === "demo",
    isSandbox: appEnv === "sandbox",
    isBeta: appEnv === "beta",
    isCanary: appEnv === "canary",
    isHotfix: appEnv === "hotfix",
    isProduction: appEnv === "production",
  };
};

const buildAllowedUsers = (): Pick<
  IAppEnv,
  | "DEVELOPMENT_ALLOWED_USERS"
  | "STAGING_ALLOWED_USERS"
  | "TESTING_ALLOWED_USERS"
  | "TEST_ALLOWED_USERS"
  | "QA_ALLOWED_USERS"
  | "UAT_ALLOWED_USERS"
  | "INTEGRATION_ALLOWED_USERS"
  | "PREVIEW_ALLOWED_USERS"
  | "DEMO_ALLOWED_USERS"
  | "SANDBOX_ALLOWED_USERS"
  | "BETA_ALLOWED_USERS"
  | "CANARY_ALLOWED_USERS"
  | "HOTFIX_ALLOWED_USERS"
  | "SYSTEM_USERS"
  | "SUPER_ADMIN_USERS"
  | "ADMIN_USERS"
> => {
  return {
    DEVELOPMENT_ALLOWED_USERS: readStringList("DEVELOPMENT_ALLOWED_USERS"),
    STAGING_ALLOWED_USERS: readStringList("STAGING_ALLOWED_USERS"),
    TESTING_ALLOWED_USERS: readStringList("TESTING_ALLOWED_USERS"),
    TEST_ALLOWED_USERS: readStringList("TEST_ALLOWED_USERS"),
    QA_ALLOWED_USERS: readStringList("QA_ALLOWED_USERS"),
    UAT_ALLOWED_USERS: readStringList("UAT_ALLOWED_USERS"),
    INTEGRATION_ALLOWED_USERS: readStringList("INTEGRATION_ALLOWED_USERS"),
    PREVIEW_ALLOWED_USERS: readStringList("PREVIEW_ALLOWED_USERS"),
    DEMO_ALLOWED_USERS: readStringList("DEMO_ALLOWED_USERS"),
    SANDBOX_ALLOWED_USERS: readStringList("SANDBOX_ALLOWED_USERS"),
    BETA_ALLOWED_USERS: readStringList("BETA_ALLOWED_USERS"),
    CANARY_ALLOWED_USERS: readStringList("CANARY_ALLOWED_USERS"),
    HOTFIX_ALLOWED_USERS: readStringList("HOTFIX_ALLOWED_USERS"),
    SYSTEM_USERS: readStringList("SYSTEM_USERS"),
    SUPER_ADMIN_USERS: readStringList("SUPER_ADMIN_USERS"),
    ADMIN_USERS: readStringList("ADMIN_USERS"),
  };
};

const buildScalarEnvValues = (
  appEnv: EnvironmentNameType,
): Omit<IAppEnv, keyof ReturnType<typeof buildEnvironmentFlags> | keyof ReturnType<typeof buildAllowedUsers>> => {
  return {
    APP_ENV: appEnv,
    PORT: readString("PORT") ? parseString<number>(readString("PORT") as string) : 3000,
    HOST_NAME: readString("HOST_NAME") || "0.0.0.0",
    LOGS_DATABASE_URL: readString("LOGS_DATABASE_URL"),
    BETTERSTACK_LOGGER_SOURCE_TOKEN: readString("BETTERSTACK_LOGGER_SOURCE_TOKEN"),
    BETTERSTACK_LOGGER_INGESTING_HOST: readString("BETTERSTACK_LOGGER_INGESTING_HOST"),
    BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN: readString("BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN"),
    BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST: readString("BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST"),
    ANALYTICS_POSTHOG_PROJECT_TOKEN: readString("ANALYTICS_POSTHOG_PROJECT_TOKEN"),
    ANALYTICS_POSTHOG_HOST: readString("ANALYTICS_POSTHOG_HOST"),
    CACHE_REDIS_URL: readString("CACHE_REDIS_URL"),
    CACHE_DRAGONFLY_URL: readString("CACHE_DRAGONFLY_URL"),
    CACHE_UPSTASH_REDIS_REST_URL: readString("CACHE_UPSTASH_REDIS_REST_URL"),
    CACHE_UPSTASH_REDIS_REST_TOKEN: readString("CACHE_UPSTASH_REDIS_REST_TOKEN"),
    PUBSUB_REDIS_URL: readString("PUBSUB_REDIS_URL"),
    RATE_LIMIT_REDIS_URL: readString("RATE_LIMIT_REDIS_URL"),
    RATE_LIMIT_UPSTASH_REDIS_URL: readString("RATE_LIMIT_UPSTASH_REDIS_URL"),
    RATE_LIMIT_UPSTASH_REDIS_TOKEN: readString("RATE_LIMIT_UPSTASH_REDIS_TOKEN"),
    QUEUE_REDIS_URL: readString("QUEUE_REDIS_URL"),
    CORS_ORIGINS: readString("CORS_ORIGINS"),
    CORS_METHODS: readString("CORS_METHODS"),
    CORS_HEADERS: readString("CORS_HEADERS"),
    CORS_EXPOSED_HEADERS: readString("CORS_EXPOSED_HEADERS"),
    CORS_CREDENTIALS: readString("CORS_CREDENTIALS"),
    CORS_MAX_AGE: readString("CORS_MAX_AGE"),
    STORAGE_CLOUDFLARE_ACCESS_KEY: readString("STORAGE_CLOUDFLARE_ACCESS_KEY"),
    STORAGE_CLOUDFLARE_SECRET_KEY: readString("STORAGE_CLOUDFLARE_SECRET_KEY"),
    STORAGE_CLOUDFLARE_ENDPOINT: readString("STORAGE_CLOUDFLARE_ENDPOINT"),
    STORAGE_CLOUDFLARE_REGION: readString("STORAGE_CLOUDFLARE_REGION"),
    STORAGE_BUNNY_ACCESS_KEY: readString("STORAGE_BUNNY_ACCESS_KEY"),
    STORAGE_BUNNY_STORAGE_ZONE: readString("STORAGE_BUNNY_STORAGE_ZONE"),
    STORAGE_BUNNY_REGION: readString("STORAGE_BUNNY_REGION"),
    FILESYSTEM_STORAGE_PATH: readString("FILESYSTEM_STORAGE_PATH"),
    DATABASE_URL: readString("DATABASE_URL"),
    DATABASE_REDIS_URL: readString("DATABASE_REDIS_URL"),
    DATABASE_DRAGONFLY_URL: readString("DATABASE_DRAGONFLY_URL"),
    SQLITE_DATABASE_PATH: readString("SQLITE_DATABASE_PATH"),
    MAILER_SENDER_NAME: readString("MAILER_SENDER_NAME"),
    MAILER_SENDER_ADDRESS: readString("MAILER_SENDER_ADDRESS"),
    RESEND_API_KEY: readString("RESEND_API_KEY"),
    JWT_SECRET: readString("JWT_SECRET"),
    OPENROUTER_API_KEY: readString("OPENROUTER_API_KEY"),
    POLAR_ACCESS_TOKEN: readString("POLAR_ACCESS_TOKEN"),
    POLAR_ENVIRONMENT: readString("POLAR_ENVIRONMENT"),
    STRIPE_SECRET_KEY: readString("STRIPE_SECRET_KEY"),
    STRIPE_API_VERSION: readString("STRIPE_API_VERSION"),
    STRIPE_WEBHOOK_SECRET: readString("STRIPE_WEBHOOK_SECRET"),
    AUTH_TOKEN: readString("AUTH_TOKEN"),
    CLERK_SECRET_KEY: readString("CLERK_SECRET_KEY"),
    LINEAR_API_KEY: readString("LINEAR_API_KEY"),
    LINEAR_TEAM_ID: readString("LINEAR_TEAM_ID"),
    SEARCH_EXA_API_KEY: readString("SEARCH_EXA_API_KEY"),
    SEARCH_FIRECRAWL_API_KEY: readString("SEARCH_FIRECRAWL_API_KEY"),
    SEARCH_PUBMED_API_KEY: readString("SEARCH_PUBMED_API_KEY"),
    SEARCH_BRIGHTDATA_API_KEY: readString("SEARCH_BRIGHTDATA_API_KEY"),
    SEARCH_BRIGHTDATA_SERP_ZONE: readString("SEARCH_BRIGHTDATA_SERP_ZONE"),
  };
};

@injectable()
export class AppEnv implements IAppEnv {
  public readonly isLocal: boolean;
  public readonly isDevelopment: boolean;
  public readonly isStaging: boolean;
  public readonly isTesting: boolean;
  public readonly isTest: boolean;
  public readonly isQa: boolean;
  public readonly isUat: boolean;
  public readonly isIntegration: boolean;
  public readonly isPreview: boolean;
  public readonly isDemo: boolean;
  public readonly isSandbox: boolean;
  public readonly isBeta: boolean;
  public readonly isCanary: boolean;
  public readonly isHotfix: boolean;
  public readonly isProduction: boolean;

  // App
  public readonly APP_ENV: EnvironmentNameType;
  public readonly PORT: number;
  public readonly HOST_NAME: string;

  // Logs
  public readonly LOGS_DATABASE_URL: string | undefined;
  public readonly BETTERSTACK_LOGGER_SOURCE_TOKEN: string | undefined;
  public readonly BETTERSTACK_LOGGER_INGESTING_HOST: string | undefined;
  // Exception
  public readonly BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN: string | undefined;
  public readonly BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST: string | undefined;

  // Analytics
  public readonly ANALYTICS_POSTHOG_PROJECT_TOKEN: string | undefined;
  public readonly ANALYTICS_POSTHOG_HOST: string | undefined;

  // Cache
  public readonly CACHE_REDIS_URL: string | undefined;
  public readonly CACHE_DRAGONFLY_URL: string | undefined;
  public readonly CACHE_UPSTASH_REDIS_REST_URL: string | undefined;
  public readonly CACHE_UPSTASH_REDIS_REST_TOKEN: string | undefined;

  // Pub/Sub
  public readonly PUBSUB_REDIS_URL: string | undefined;

  // Rate limit
  public readonly RATE_LIMIT_REDIS_URL: string | undefined;
  public readonly RATE_LIMIT_UPSTASH_REDIS_URL: string | undefined;
  public readonly RATE_LIMIT_UPSTASH_REDIS_TOKEN: string | undefined;

  // Queue
  public readonly QUEUE_REDIS_URL: string | undefined;

  // CORS
  public readonly CORS_ORIGINS: string | undefined;
  public readonly CORS_METHODS: string | undefined;
  public readonly CORS_HEADERS: string | undefined;
  public readonly CORS_EXPOSED_HEADERS: string | undefined;
  public readonly CORS_CREDENTIALS: string | undefined;
  public readonly CORS_MAX_AGE: string | undefined;

  // Storage
  public readonly STORAGE_CLOUDFLARE_ACCESS_KEY: string | undefined;
  public readonly STORAGE_CLOUDFLARE_SECRET_KEY: string | undefined;
  public readonly STORAGE_CLOUDFLARE_ENDPOINT: string | undefined;
  public readonly STORAGE_CLOUDFLARE_REGION: string | undefined;
  public readonly STORAGE_BUNNY_ACCESS_KEY: string | undefined;
  public readonly STORAGE_BUNNY_STORAGE_ZONE: string | undefined;
  public readonly STORAGE_BUNNY_REGION: string | undefined;
  public readonly FILESYSTEM_STORAGE_PATH: string | undefined;

  // Database
  public readonly DATABASE_URL: string | undefined;
  public readonly DATABASE_REDIS_URL: string | undefined;
  public readonly DATABASE_DRAGONFLY_URL: string | undefined;
  public readonly SQLITE_DATABASE_PATH: string | undefined;

  // Mailer
  public readonly MAILER_SENDER_NAME: string | undefined;
  public readonly MAILER_SENDER_ADDRESS: string | undefined;
  public readonly RESEND_API_KEY: string | undefined;

  // JWT
  public readonly JWT_SECRET: string | undefined;

  // AI
  public readonly OPENROUTER_API_KEY: string | undefined;

  // Payment
  public readonly POLAR_ACCESS_TOKEN: string | undefined;
  public readonly POLAR_ENVIRONMENT: string | undefined;
  public readonly STRIPE_SECRET_KEY: string | undefined;
  public readonly STRIPE_API_VERSION: string | undefined;
  public readonly STRIPE_WEBHOOK_SECRET: string | undefined;

  // Authentication
  public readonly AUTH_TOKEN: string | undefined;
  public readonly CLERK_SECRET_KEY: string | undefined;

  // Linear
  public readonly LINEAR_API_KEY: string | undefined;
  public readonly LINEAR_TEAM_ID: string | undefined;

  // Search
  public readonly SEARCH_EXA_API_KEY: string | undefined;
  public readonly SEARCH_FIRECRAWL_API_KEY: string | undefined;
  public readonly SEARCH_PUBMED_API_KEY: string | undefined;
  public readonly SEARCH_BRIGHTDATA_API_KEY: string | undefined;
  public readonly SEARCH_BRIGHTDATA_SERP_ZONE: string | undefined;

  // Allowed Users
  public readonly DEVELOPMENT_ALLOWED_USERS: string[];
  public readonly STAGING_ALLOWED_USERS: string[];
  public readonly TESTING_ALLOWED_USERS: string[];
  public readonly TEST_ALLOWED_USERS: string[];
  public readonly QA_ALLOWED_USERS: string[];
  public readonly UAT_ALLOWED_USERS: string[];
  public readonly INTEGRATION_ALLOWED_USERS: string[];
  public readonly PREVIEW_ALLOWED_USERS: string[];
  public readonly DEMO_ALLOWED_USERS: string[];
  public readonly SANDBOX_ALLOWED_USERS: string[];
  public readonly BETA_ALLOWED_USERS: string[];
  public readonly CANARY_ALLOWED_USERS: string[];
  public readonly HOTFIX_ALLOWED_USERS: string[];
  public readonly SYSTEM_USERS: string[];
  public readonly SUPER_ADMIN_USERS: string[];
  public readonly ADMIN_USERS: string[];

  public constructor() {
    const appEnv = (readString("APP_ENV") || "production") as EnvironmentNameType;
    const state = this as MutableAppEnvType;

    Object.assign(state, buildScalarEnvValues(appEnv));
    Object.assign(state, buildEnvironmentFlags(appEnv));
    Object.assign(state, buildAllowedUsers());
  }
}
