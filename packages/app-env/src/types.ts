export type AppEnvClassType = new () => IAppEnv;

export enum Environment {
  LOCAL = "local",
  DEVELOPMENT = "development",
  STAGING = "staging",
  TESTING = "testing",
  TEST = "test",
  QA = "qa",
  UAT = "uat",
  INTEGRATION = "integration",
  PREVIEW = "preview",
  DEMO = "demo",
  SANDBOX = "sandbox",
  BETA = "beta",
  CANARY = "canary",
  HOTFIX = "hotfix",
  PRODUCTION = "production",
}

export type EnvironmentNameType = `${Environment}`;

export interface IAppEnv {
  readonly isLocal: boolean;
  readonly isDevelopment: boolean;
  readonly isStaging: boolean;
  readonly isTesting: boolean;
  readonly isTest: boolean;
  readonly isQa: boolean;
  readonly isUat: boolean;
  readonly isIntegration: boolean;
  readonly isPreview: boolean;
  readonly isDemo: boolean;
  readonly isSandbox: boolean;
  readonly isBeta: boolean;
  readonly isCanary: boolean;
  readonly isHotfix: boolean;
  readonly isProduction: boolean;

  // App
  readonly APP_ENV: EnvironmentNameType;
  readonly PORT: number;
  readonly HOST_NAME: string;

  // Logs
  readonly LOGS_DATABASE_URL: string | undefined;
  readonly BETTERSTACK_LOGGER_SOURCE_TOKEN: string | undefined;
  readonly BETTERSTACK_LOGGER_INGESTING_HOST: string | undefined;
  readonly BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN: string | undefined;
  readonly BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST: string | undefined;

  // Analytics
  readonly ANALYTICS_POSTHOG_PROJECT_TOKEN: string | undefined;
  readonly ANALYTICS_POSTHOG_HOST: string | undefined;

  // Cache
  readonly CACHE_REDIS_URL: string | undefined;
  readonly CACHE_UPSTASH_REDIS_REST_URL: string | undefined;
  readonly CACHE_UPSTASH_REDIS_REST_TOKEN: string | undefined;

  // Pub/Sub
  readonly PUBSUB_REDIS_URL: string | undefined;

  // Rate limit
  readonly RATE_LIMIT_REDIS_URL: string | undefined;
  readonly RATE_LIMIT_UPSTASH_REDIS_URL: string | undefined;
  readonly RATE_LIMIT_UPSTASH_REDIS_TOKEN: string | undefined;

  // Queue
  readonly QUEUE_REDIS_URL: string | undefined;

  // CORS
  readonly CORS_ORIGINS: string | undefined;
  readonly CORS_METHODS: string | undefined;
  readonly CORS_HEADERS: string | undefined;
  readonly CORS_EXPOSED_HEADERS: string | undefined;
  readonly CORS_CREDENTIALS: string | undefined;
  readonly CORS_MAX_AGE: string | undefined;

  // Storage
  readonly STORAGE_CLOUDFLARE_ACCESS_KEY: string | undefined;
  readonly STORAGE_CLOUDFLARE_SECRET_KEY: string | undefined;
  readonly STORAGE_CLOUDFLARE_ENDPOINT: string | undefined;
  readonly STORAGE_CLOUDFLARE_REGION: string | undefined;
  readonly STORAGE_BUNNY_ACCESS_KEY: string | undefined;
  readonly STORAGE_BUNNY_STORAGE_ZONE: string | undefined;
  readonly STORAGE_BUNNY_REGION: string | undefined;
  readonly FILESYSTEM_STORAGE_PATH: string | undefined;

  // Database
  readonly DATABASE_URL: string | undefined;
  readonly DATABASE_REDIS_URL: string | undefined;
  readonly SQLITE_DATABASE_PATH: string | undefined;

  // Mailer
  readonly MAILER_SENDER_NAME: string | undefined;
  readonly MAILER_SENDER_ADDRESS: string | undefined;
  readonly RESEND_API_KEY: string | undefined;

  // JWT
  readonly JWT_SECRET: string | undefined;

  // AI
  readonly OPENROUTER_API_KEY: string | undefined;
  readonly OPENAI_API_KEY: string | undefined;
  readonly ANTHROPIC_API_KEY: string | undefined;
  readonly GEMINI_API_KEY: string | undefined;
  readonly GROQ_API_KEY: string | undefined;
  readonly OLLAMA_HOST: string | undefined;

  // Payment
  readonly POLAR_ACCESS_TOKEN: string | undefined;
  readonly POLAR_ENVIRONMENT: string | undefined;

  // Authentication
  readonly AUTH_TOKEN: string | undefined;
  readonly CLERK_SECRET_KEY: string | undefined;

  // Linear
  readonly LINEAR_API_KEY: string | undefined;
  readonly LINEAR_TEAM_ID: string | undefined;

  // Search
  readonly SEARCH_EXA_API_KEY: string | undefined;
  readonly SEARCH_FIRECRAWL_API_KEY: string | undefined;
  readonly SEARCH_PUBMED_API_KEY: string | undefined;
  readonly SEARCH_BRIGHTDATA_API_KEY: string | undefined;
  readonly SEARCH_BRIGHTDATA_SERP_ZONE: string | undefined;

  // Allowed Users
  readonly DEVELOPMENT_ALLOWED_USERS: string[];
  readonly STAGING_ALLOWED_USERS: string[];
  readonly TESTING_ALLOWED_USERS: string[];
  readonly TEST_ALLOWED_USERS: string[];
  readonly QA_ALLOWED_USERS: string[];
  readonly UAT_ALLOWED_USERS: string[];
  readonly INTEGRATION_ALLOWED_USERS: string[];
  readonly PREVIEW_ALLOWED_USERS: string[];
  readonly DEMO_ALLOWED_USERS: string[];
  readonly SANDBOX_ALLOWED_USERS: string[];
  readonly BETA_ALLOWED_USERS: string[];
  readonly CANARY_ALLOWED_USERS: string[];
  readonly HOTFIX_ALLOWED_USERS: string[];

  // Users
  readonly SYSTEM_USERS: string[];
  readonly SUPER_ADMIN_USERS: string[];
  readonly ADMIN_USERS: string[];
}
