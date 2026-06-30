import { injectable } from "@talosjs/container";
import { parseString } from "@talosjs/utils/parseString";
import type { EnvironmentNameType, IAppEnv } from "./types";

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
  public readonly SQLITE_DATABASE_PATH: string | undefined;

  // Mailer
  public readonly MAILER_SENDER_NAME: string | undefined;
  public readonly MAILER_SENDER_ADDRESS: string | undefined;
  public readonly RESEND_API_KEY: string | undefined;

  // JWT
  public readonly JWT_SECRET: string | undefined;

  // AI
  public readonly OPENROUTER_API_KEY: string | undefined;
  public readonly OPENAI_API_KEY: string | undefined;
  public readonly ANTHROPIC_API_KEY: string | undefined;
  public readonly GEMINI_API_KEY: string | undefined;
  public readonly GROQ_API_KEY: string | undefined;
  public readonly OLLAMA_HOST: string | undefined;

  // Payment
  public readonly POLAR_ACCESS_TOKEN: string | undefined;
  public readonly POLAR_ENVIRONMENT: string | undefined;

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
    // App
    this.APP_ENV = (Bun.env.APP_ENV?.trim() || "production") as EnvironmentNameType;
    this.isLocal = this.APP_ENV === "local";
    this.isDevelopment = this.APP_ENV === "development";
    this.isStaging = this.APP_ENV === "staging";
    this.isTesting = this.APP_ENV === "testing";
    this.isTest = this.APP_ENV === "test";
    this.isQa = this.APP_ENV === "qa";
    this.isUat = this.APP_ENV === "uat";
    this.isIntegration = this.APP_ENV === "integration";
    this.isPreview = this.APP_ENV === "preview";
    this.isDemo = this.APP_ENV === "demo";
    this.isSandbox = this.APP_ENV === "sandbox";
    this.isBeta = this.APP_ENV === "beta";
    this.isCanary = this.APP_ENV === "canary";
    this.isHotfix = this.APP_ENV === "hotfix";
    this.isProduction = this.APP_ENV === "production";
    this.PORT = Bun.env.PORT ? parseString<number>(Bun.env.PORT.trim()) : 3000;
    this.HOST_NAME = Bun.env.HOST_NAME?.trim() || "0.0.0.0";

    // Logs
    this.LOGS_DATABASE_URL = Bun.env.LOGS_DATABASE_URL?.trim();
    this.BETTERSTACK_LOGGER_SOURCE_TOKEN = Bun.env.BETTERSTACK_LOGGER_SOURCE_TOKEN?.trim();
    this.BETTERSTACK_LOGGER_INGESTING_HOST = Bun.env.BETTERSTACK_LOGGER_INGESTING_HOST?.trim();
    this.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN =
      Bun.env.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN?.trim();
    this.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST = Bun.env.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST?.trim();

    // Analytics
    this.ANALYTICS_POSTHOG_PROJECT_TOKEN = Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN?.trim();
    this.ANALYTICS_POSTHOG_HOST = Bun.env.ANALYTICS_POSTHOG_HOST?.trim();

    // Cache
    this.CACHE_REDIS_URL = Bun.env.CACHE_REDIS_URL?.trim();
    this.CACHE_UPSTASH_REDIS_REST_URL = Bun.env.CACHE_UPSTASH_REDIS_REST_URL?.trim();
    this.CACHE_UPSTASH_REDIS_REST_TOKEN = Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN?.trim();

    // Pub/Sub
    this.PUBSUB_REDIS_URL = Bun.env.PUBSUB_REDIS_URL?.trim();

    // Rate limit
    this.RATE_LIMIT_REDIS_URL = Bun.env.RATE_LIMIT_REDIS_URL?.trim();
    this.RATE_LIMIT_UPSTASH_REDIS_URL = Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL?.trim();
    this.RATE_LIMIT_UPSTASH_REDIS_TOKEN = Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN?.trim();

    // Queue
    this.QUEUE_REDIS_URL = Bun.env.QUEUE_REDIS_URL?.trim();

    // CORS
    this.CORS_ORIGINS = Bun.env.CORS_ORIGINS?.trim();
    this.CORS_METHODS = Bun.env.CORS_METHODS?.trim();
    this.CORS_HEADERS = Bun.env.CORS_HEADERS?.trim();
    this.CORS_EXPOSED_HEADERS = Bun.env.CORS_EXPOSED_HEADERS?.trim();
    this.CORS_CREDENTIALS = Bun.env.CORS_CREDENTIALS?.trim();
    this.CORS_MAX_AGE = Bun.env.CORS_MAX_AGE?.trim();

    // Storage
    this.STORAGE_CLOUDFLARE_ACCESS_KEY = Bun.env.STORAGE_CLOUDFLARE_ACCESS_KEY?.trim();
    this.STORAGE_CLOUDFLARE_SECRET_KEY = Bun.env.STORAGE_CLOUDFLARE_SECRET_KEY?.trim();
    this.STORAGE_CLOUDFLARE_ENDPOINT = Bun.env.STORAGE_CLOUDFLARE_ENDPOINT?.trim();
    this.STORAGE_CLOUDFLARE_REGION = Bun.env.STORAGE_CLOUDFLARE_REGION?.trim();
    this.STORAGE_BUNNY_ACCESS_KEY = Bun.env.STORAGE_BUNNY_ACCESS_KEY?.trim();
    this.STORAGE_BUNNY_STORAGE_ZONE = Bun.env.STORAGE_BUNNY_STORAGE_ZONE?.trim();
    this.STORAGE_BUNNY_REGION = Bun.env.STORAGE_BUNNY_REGION?.trim();
    this.FILESYSTEM_STORAGE_PATH = Bun.env.FILESYSTEM_STORAGE_PATH?.trim();

    // Database
    this.DATABASE_URL = Bun.env.DATABASE_URL?.trim();
    this.DATABASE_REDIS_URL = Bun.env.DATABASE_REDIS_URL?.trim();
    this.SQLITE_DATABASE_PATH = Bun.env.SQLITE_DATABASE_PATH?.trim();

    // Mailer
    this.MAILER_SENDER_NAME = Bun.env.MAILER_SENDER_NAME?.trim();
    this.MAILER_SENDER_ADDRESS = Bun.env.MAILER_SENDER_ADDRESS?.trim();
    this.RESEND_API_KEY = Bun.env.RESEND_API_KEY?.trim();

    // JWT
    this.JWT_SECRET = Bun.env.JWT_SECRET?.trim();

    // AI
    this.OPENROUTER_API_KEY = Bun.env.OPENROUTER_API_KEY?.trim();
    this.OPENAI_API_KEY = Bun.env.OPENAI_API_KEY?.trim();
    this.ANTHROPIC_API_KEY = Bun.env.ANTHROPIC_API_KEY?.trim();
    this.GEMINI_API_KEY = Bun.env.GEMINI_API_KEY?.trim();
    this.GROQ_API_KEY = Bun.env.GROQ_API_KEY?.trim();
    this.OLLAMA_HOST = Bun.env.OLLAMA_HOST?.trim();

    // Payment
    this.POLAR_ACCESS_TOKEN = Bun.env.POLAR_ACCESS_TOKEN?.trim();
    this.POLAR_ENVIRONMENT = Bun.env.POLAR_ENVIRONMENT?.trim();

    // Authentication
    this.AUTH_TOKEN = Bun.env.AUTH_TOKEN?.trim();
    this.CLERK_SECRET_KEY = Bun.env.CLERK_SECRET_KEY?.trim();

    // Linear
    this.LINEAR_API_KEY = Bun.env.LINEAR_API_KEY?.trim();
    this.LINEAR_TEAM_ID = Bun.env.LINEAR_TEAM_ID?.trim();

    // Search
    this.SEARCH_EXA_API_KEY = Bun.env.SEARCH_EXA_API_KEY?.trim();
    this.SEARCH_FIRECRAWL_API_KEY = Bun.env.SEARCH_FIRECRAWL_API_KEY?.trim();
    this.SEARCH_PUBMED_API_KEY = Bun.env.SEARCH_PUBMED_API_KEY?.trim();
    this.SEARCH_BRIGHTDATA_API_KEY = Bun.env.SEARCH_BRIGHTDATA_API_KEY?.trim();
    this.SEARCH_BRIGHTDATA_SERP_ZONE = Bun.env.SEARCH_BRIGHTDATA_SERP_ZONE?.trim();

    // Allowed Users
    this.DEVELOPMENT_ALLOWED_USERS = (Bun.env.DEVELOPMENT_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.STAGING_ALLOWED_USERS = (Bun.env.STAGING_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.TESTING_ALLOWED_USERS = (Bun.env.TESTING_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.TEST_ALLOWED_USERS = (Bun.env.TEST_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.QA_ALLOWED_USERS = (Bun.env.QA_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.UAT_ALLOWED_USERS = (Bun.env.UAT_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.INTEGRATION_ALLOWED_USERS = (Bun.env.INTEGRATION_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.PREVIEW_ALLOWED_USERS = (Bun.env.PREVIEW_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.DEMO_ALLOWED_USERS = (Bun.env.DEMO_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.SANDBOX_ALLOWED_USERS = (Bun.env.SANDBOX_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.BETA_ALLOWED_USERS = (Bun.env.BETA_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.CANARY_ALLOWED_USERS = (Bun.env.CANARY_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.HOTFIX_ALLOWED_USERS = (Bun.env.HOTFIX_ALLOWED_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.SYSTEM_USERS = (Bun.env.SYSTEM_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.SUPER_ADMIN_USERS = (Bun.env.SUPER_ADMIN_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.ADMIN_USERS = (Bun.env.ADMIN_USERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
