import { join } from "node:path";

type YamlNode = string | number | boolean | null | { [key: string]: YamlNode };

const ENV_VAR_NAMES: Record<string, string> = {
  "app.env": "APP_ENV",
  "app.host": "HOST_NAME",
  "app.port": "PORT",
  "logs.database_url": "LOGS_DATABASE_URL",
  "logs.betterstack.source_token": "BETTERSTACK_LOGGER_SOURCE_TOKEN",
  "logs.betterstack.ingesting_host": "BETTERSTACK_LOGGER_INGESTING_HOST",
  "exception.betterstack.application_token": "BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN",
  "exception.betterstack.ingesting_host": "BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST",
  "analytics.posthog.project_token": "ANALYTICS_POSTHOG_PROJECT_TOKEN",
  "analytics.posthog.host": "ANALYTICS_POSTHOG_HOST",
  "cache.redis.url": "CACHE_REDIS_URL",
  "cache.upstash.rest_url": "CACHE_UPSTASH_REDIS_REST_URL",
  "cache.upstash.rest_token": "CACHE_UPSTASH_REDIS_REST_TOKEN",
  "pubsub.redis.url": "PUBSUB_REDIS_URL",
  "rate_limit.redis.url": "RATE_LIMIT_REDIS_URL",
  "rate_limit.upstash.url": "RATE_LIMIT_UPSTASH_REDIS_URL",
  "rate_limit.upstash.token": "RATE_LIMIT_UPSTASH_REDIS_TOKEN",
  "cors.origins": "CORS_ORIGINS",
  "cors.methods": "CORS_METHODS",
  "cors.headers": "CORS_HEADERS",
  "cors.exposed_headers": "CORS_EXPOSED_HEADERS",
  "cors.credentials": "CORS_CREDENTIALS",
  "cors.max_age": "CORS_MAX_AGE",
  "storage.cloudflare.access_key": "STORAGE_CLOUDFLARE_ACCESS_KEY",
  "storage.cloudflare.secret_key": "STORAGE_CLOUDFLARE_SECRET_KEY",
  "storage.cloudflare.endpoint": "STORAGE_CLOUDFLARE_ENDPOINT",
  "storage.cloudflare.region": "STORAGE_CLOUDFLARE_REGION",
  "storage.bunny.access_key": "STORAGE_BUNNY_ACCESS_KEY",
  "storage.bunny.storage_zone": "STORAGE_BUNNY_STORAGE_ZONE",
  "storage.bunny.region": "STORAGE_BUNNY_REGION",
  "storage.filesystem.path": "FILESYSTEM_STORAGE_PATH",
  "database.url": "DATABASE_URL",
  "database.redis.url": "DATABASE_REDIS_URL",
  "database.sqlite.path": "SQLITE_DATABASE_PATH",
  "mailer.sender.name": "MAILER_SENDER_NAME",
  "mailer.sender.address": "MAILER_SENDER_ADDRESS",
  "mailer.resend.api_key": "RESEND_API_KEY",
  "jwt.secret": "JWT_SECRET",
  "ai.openrouter.api_key": "OPENROUTER_API_KEY",
  "ai.openai.api_key": "OPENAI_API_KEY",
  "ai.anthropic.api_key": "ANTHROPIC_API_KEY",
  "ai.gemini.api_key": "GEMINI_API_KEY",
  "ai.groq.api_key": "GROQ_API_KEY",
  "ai.ollama.host": "OLLAMA_HOST",
  "payment.polar.access_token": "POLAR_ACCESS_TOKEN",
  "payment.polar.environment": "POLAR_ENVIRONMENT",
  "authentication.auth_token": "AUTH_TOKEN",
  "authentication.clerk.secret_key": "CLERK_SECRET_KEY",
  "linear.api_key": "LINEAR_API_KEY",
  "linear.team_id": "LINEAR_TEAM_ID",
  "search.exa.api_key": "SEARCH_EXA_API_KEY",
  "search.firecrawl.api_key": "SEARCH_FIRECRAWL_API_KEY",
  "search.pubmed.api_key": "SEARCH_PUBMED_API_KEY",
  "search.brightdata.api_key": "SEARCH_BRIGHTDATA_API_KEY",
  "search.brightdata.serp_zone": "SEARCH_BRIGHTDATA_SERP_ZONE",
  "allowed_users.development": "DEVELOPMENT_ALLOWED_USERS",
  "allowed_users.staging": "STAGING_ALLOWED_USERS",
  "allowed_users.testing": "TESTING_ALLOWED_USERS",
  "allowed_users.test": "TEST_ALLOWED_USERS",
  "allowed_users.qa": "QA_ALLOWED_USERS",
  "allowed_users.uat": "UAT_ALLOWED_USERS",
  "allowed_users.integration": "INTEGRATION_ALLOWED_USERS",
  "allowed_users.preview": "PREVIEW_ALLOWED_USERS",
  "allowed_users.demo": "DEMO_ALLOWED_USERS",
  "allowed_users.sandbox": "SANDBOX_ALLOWED_USERS",
  "allowed_users.beta": "BETA_ALLOWED_USERS",
  "allowed_users.canary": "CANARY_ALLOWED_USERS",
  "allowed_users.hotfix": "HOTFIX_ALLOWED_USERS",
  "allowed_users.system": "SYSTEM_USERS",
  "allowed_users.super_admin": "SUPER_ADMIN_USERS",
  "allowed_users.admin": "ADMIN_USERS",
};

const flatten = (node: { [key: string]: YamlNode }, prefix = ""): Record<string, string> => {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flatten(value as { [key: string]: YamlNode }, path));
    } else if (value !== null && value !== undefined && value !== "") {
      const envKey = ENV_VAR_NAMES[path] ?? path.replaceAll(".", "_").toUpperCase();
      result[envKey] = String(value);
    }
  }

  return result;
};

export const loadEnv = async (candidates?: string[]): Promise<void> => {
  const cwd = process.cwd();
  const paths = candidates ?? [join(cwd, ".env.yml")];

  // Layer every existing candidate in order, later files overriding earlier keys.
  // Empty values are skipped by flatten(), so a module's .env.yml overrides only
  // the keys it actually sets (e.g. its own PORT) while inheriting shared config.
  const vars: Record<string, string> = {};

  for (const path of paths) {
    const file = Bun.file(path);
    if (await file.exists()) {
      const parsed = Bun.YAML.parse(await file.text()) as { [key: string]: YamlNode };
      Object.assign(vars, flatten(parsed));
    }
  }

  for (const [key, value] of Object.entries(vars)) {
    Bun.env[key] = value;
  }
};
