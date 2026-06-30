import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@/AppEnv";
import { Environment, type EnvironmentNameType } from "@/types";

const setEnv = (value: string | undefined) => {
  if (value === undefined) {
    delete Bun.env.APP_ENV;
  } else {
    Bun.env.APP_ENV = value;
  }
};

afterEach(() => {
  delete Bun.env.APP_ENV;
});

describe("AppEnv", () => {
  describe("Constructor", () => {
    test("should create AppEnv instance with valid environment", () => {
      setEnv("production");
      const appEnv = new AppEnv();

      expect(appEnv).toBeInstanceOf(AppEnv);
      expect(appEnv.APP_ENV).toBe("production");
      expect(appEnv.isProduction).toBe(true);
    });

    test("should default to 'production' when APP_ENV is not set", () => {
      setEnv(undefined);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("production");
      expect(appEnv.APP_ENV).toBe("production");
      expect(appEnv.isProduction).toBe(true);
    });

    test("should default to 'production' when APP_ENV is empty string", () => {
      setEnv("");
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("production");
      expect(appEnv.APP_ENV).toBe("production");
      expect(appEnv.isProduction).toBe(true);
    });

    test("should default PORT to 3000", () => {
      setEnv("production");
      const appEnv = new AppEnv();

      expect(appEnv.PORT).toBe(3000);
    });

    test("should parse PORT from environment variable", () => {
      setEnv("production");
      Bun.env.PORT = "3000";
      const appEnv = new AppEnv();

      expect(appEnv.PORT).toBe(3000);
      delete Bun.env.PORT;
    });

    test("should accept any string as environment type", () => {
      setEnv("custom-environment");
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("custom-environment" as EnvironmentNameType);
      expect(appEnv.isProduction).toBe(false);
      expect(appEnv.isLocal).toBe(false);
    });
  });

  describe("Environment Detection - Local", () => {
    test("should detect local environment correctly", () => {
      setEnv(Environment.LOCAL);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("local");
      expect(appEnv.isLocal).toBe(true);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Development", () => {
    test("should detect development environment correctly", () => {
      setEnv(Environment.DEVELOPMENT);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("development");
      expect(appEnv.isDevelopment).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Staging", () => {
    test("should detect staging environment correctly", () => {
      setEnv(Environment.STAGING);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("staging");
      expect(appEnv.isStaging).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Testing", () => {
    test("should detect testing environment correctly", () => {
      setEnv(Environment.TESTING);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("testing");
      expect(appEnv.isTesting).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Test", () => {
    test("should detect test environment correctly", () => {
      setEnv(Environment.TEST);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("test");
      expect(appEnv.isTest).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - QA", () => {
    test("should detect qa environment correctly", () => {
      setEnv(Environment.QA);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("qa");
      expect(appEnv.isQa).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - UAT", () => {
    test("should detect uat environment correctly", () => {
      setEnv(Environment.UAT);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("uat");
      expect(appEnv.isUat).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Integration", () => {
    test("should detect integration environment correctly", () => {
      setEnv(Environment.INTEGRATION);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("integration");
      expect(appEnv.isIntegration).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Preview", () => {
    test("should detect preview environment correctly", () => {
      setEnv(Environment.PREVIEW);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("preview");
      expect(appEnv.isPreview).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Demo", () => {
    test("should detect demo environment correctly", () => {
      setEnv(Environment.DEMO);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("demo");
      expect(appEnv.isDemo).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Sandbox", () => {
    test("should detect sandbox environment correctly", () => {
      setEnv(Environment.SANDBOX);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("sandbox");
      expect(appEnv.isSandbox).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Beta", () => {
    test("should detect beta environment correctly", () => {
      setEnv(Environment.BETA);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("beta");
      expect(appEnv.isBeta).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Canary", () => {
    test("should detect canary environment correctly", () => {
      setEnv(Environment.CANARY);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("canary");
      expect(appEnv.isCanary).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Hotfix", () => {
    test("should detect hotfix environment correctly", () => {
      setEnv(Environment.HOTFIX);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("hotfix");
      expect(appEnv.isHotfix).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Environment Detection - Production", () => {
    test("should detect production environment correctly", () => {
      setEnv(Environment.PRODUCTION);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("production");
      expect(appEnv.isProduction).toBe(true);
      expect(appEnv.isLocal).toBe(false);
      expect(appEnv.isDevelopment).toBe(false);
      expect(appEnv.isStaging).toBe(false);
      expect(appEnv.isTesting).toBe(false);
      expect(appEnv.isTest).toBe(false);
      expect(appEnv.isQa).toBe(false);
      expect(appEnv.isUat).toBe(false);
      expect(appEnv.isIntegration).toBe(false);
      expect(appEnv.isPreview).toBe(false);
      expect(appEnv.isDemo).toBe(false);
      expect(appEnv.isSandbox).toBe(false);
      expect(appEnv.isBeta).toBe(false);
      expect(appEnv.isCanary).toBe(false);
      expect(appEnv.isHotfix).toBe(false);
    });
  });

  describe("All Environment Types Coverage", () => {
    test("should handle all Environment enum values", () => {
      const environments = [
        Environment.LOCAL,
        Environment.DEVELOPMENT,
        Environment.STAGING,
        Environment.TESTING,
        Environment.TEST,
        Environment.QA,
        Environment.UAT,
        Environment.INTEGRATION,
        Environment.PREVIEW,
        Environment.DEMO,
        Environment.SANDBOX,
        Environment.BETA,
        Environment.CANARY,
        Environment.HOTFIX,
        Environment.PRODUCTION,
      ];

      for (const env of environments) {
        setEnv(env);
        const appEnv = new AppEnv();
        expect(appEnv.APP_ENV).toBe(env);

        // Verify only the correct property is true
        const propertyMap = {
          [Environment.LOCAL]: "isLocal",
          [Environment.DEVELOPMENT]: "isDevelopment",
          [Environment.STAGING]: "isStaging",
          [Environment.TESTING]: "isTesting",
          [Environment.TEST]: "isTest",
          [Environment.QA]: "isQa",
          [Environment.UAT]: "isUat",
          [Environment.INTEGRATION]: "isIntegration",
          [Environment.PREVIEW]: "isPreview",
          [Environment.DEMO]: "isDemo",
          [Environment.SANDBOX]: "isSandbox",
          [Environment.BETA]: "isBeta",
          [Environment.CANARY]: "isCanary",
          [Environment.HOTFIX]: "isHotfix",
          [Environment.PRODUCTION]: "isProduction",
        };

        const correctProperty = propertyMap[env];
        expect(appEnv[correctProperty as keyof AppEnv]).toBe(true);

        // Count how many properties are true (should be exactly 1)
        const booleanProperties = [
          "isLocal",
          "isDevelopment",
          "isStaging",
          "isTesting",
          "isTest",
          "isQa",
          "isUat",
          "isIntegration",
          "isPreview",
          "isDemo",
          "isSandbox",
          "isBeta",
          "isCanary",
          "isHotfix",
          "isProduction",
        ];

        const trueBooleans = booleanProperties.filter((prop) => appEnv[prop as keyof AppEnv] === true);

        expect(trueBooleans).toHaveLength(1);
        expect(trueBooleans[0]).toBe(correctProperty);
      }
    });
  });

  describe("Property Immutability", () => {
    test("should have APP_ENV property defined", () => {
      setEnv("production");
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("production");

      const descriptor = Object.getOwnPropertyDescriptor(appEnv, "APP_ENV");
      expect(descriptor).toBeDefined();
      expect(descriptor?.value).toBe("production");
    });

    test("should have all boolean properties defined and immutable by design", () => {
      setEnv("production");
      const appEnv = new AppEnv();

      const readonlyProperties = [
        "isLocal",
        "isDevelopment",
        "isStaging",
        "isTesting",
        "isTest",
        "isQa",
        "isUat",
        "isIntegration",
        "isPreview",
        "isDemo",
        "isSandbox",
        "isBeta",
        "isCanary",
        "isHotfix",
        "isProduction",
      ];

      for (const property of readonlyProperties) {
        const descriptor = Object.getOwnPropertyDescriptor(appEnv, property);
        expect(descriptor).toBeDefined();
        expect(typeof appEnv[property as keyof AppEnv]).toBe("boolean");
      }
    });
  });

  describe("Interface Compliance", () => {
    test("should implement IAppEnv interface correctly", () => {
      setEnv("production");
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBeDefined();
      expect(typeof appEnv.isLocal).toBe("boolean");
      expect(typeof appEnv.isDevelopment).toBe("boolean");
      expect(typeof appEnv.isStaging).toBe("boolean");
      expect(typeof appEnv.isTesting).toBe("boolean");
      expect(typeof appEnv.isTest).toBe("boolean");
      expect(typeof appEnv.isQa).toBe("boolean");
      expect(typeof appEnv.isUat).toBe("boolean");
      expect(typeof appEnv.isIntegration).toBe("boolean");
      expect(typeof appEnv.isPreview).toBe("boolean");
      expect(typeof appEnv.isDemo).toBe("boolean");
      expect(typeof appEnv.isSandbox).toBe("boolean");
      expect(typeof appEnv.isBeta).toBe("boolean");
      expect(typeof appEnv.isCanary).toBe("boolean");
      expect(typeof appEnv.isHotfix).toBe("boolean");
      expect(typeof appEnv.isProduction).toBe("boolean");
    });
  });

  describe("APP_ENV property", () => {
    test("should have APP_ENV matching env", () => {
      setEnv("production");
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("production");
    });
  });

  describe("Environment Variables", () => {
    afterEach(() => {
      delete Bun.env.PORT;
      delete Bun.env.HOST_NAME;
      delete Bun.env.LOGS_DATABASE_URL;
      delete Bun.env.BETTERSTACK_LOGGER_SOURCE_TOKEN;
      delete Bun.env.BETTERSTACK_LOGGER_INGESTING_HOST;
      delete Bun.env.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN;
      delete Bun.env.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST;
      delete Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN;
      delete Bun.env.ANALYTICS_POSTHOG_HOST;
      delete Bun.env.CACHE_REDIS_URL;
      delete Bun.env.CACHE_UPSTASH_REDIS_REST_URL;
      delete Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN;
      delete Bun.env.PUBSUB_REDIS_URL;
      delete Bun.env.RATE_LIMIT_REDIS_URL;
      delete Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL;
      delete Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN;
      delete Bun.env.CORS_ORIGINS;
      delete Bun.env.CORS_METHODS;
      delete Bun.env.CORS_HEADERS;
      delete Bun.env.CORS_EXPOSED_HEADERS;
      delete Bun.env.CORS_CREDENTIALS;
      delete Bun.env.CORS_MAX_AGE;
      delete Bun.env.STORAGE_CLOUDFLARE_ACCESS_KEY;
      delete Bun.env.STORAGE_CLOUDFLARE_SECRET_KEY;
      delete Bun.env.STORAGE_CLOUDFLARE_ENDPOINT;
      delete Bun.env.STORAGE_CLOUDFLARE_REGION;
      delete Bun.env.STORAGE_BUNNY_ACCESS_KEY;
      delete Bun.env.STORAGE_BUNNY_STORAGE_ZONE;
      delete Bun.env.STORAGE_BUNNY_REGION;
      delete Bun.env.FILESYSTEM_STORAGE_PATH;
      delete Bun.env.DATABASE_URL;
      delete Bun.env.DATABASE_REDIS_URL;
      delete Bun.env.SQLITE_DATABASE_PATH;
      delete Bun.env.MAILER_SENDER_NAME;
      delete Bun.env.MAILER_SENDER_ADDRESS;
      delete Bun.env.RESEND_API_KEY;
      delete Bun.env.JWT_SECRET;
      delete Bun.env.OPENAI_API_KEY;
      delete Bun.env.ANTHROPIC_API_KEY;
      delete Bun.env.GEMINI_API_KEY;
      delete Bun.env.GROQ_API_KEY;
      delete Bun.env.OLLAMA_HOST;
      delete Bun.env.POLAR_ACCESS_TOKEN;
      delete Bun.env.POLAR_ENVIRONMENT;
      delete Bun.env.AUTH_TOKEN;
      delete Bun.env.CLERK_SECRET_KEY;
      delete Bun.env.LINEAR_API_KEY;
      delete Bun.env.LINEAR_TEAM_ID;
      delete Bun.env.SEARCH_EXA_API_KEY;
      delete Bun.env.SEARCH_FIRECRAWL_API_KEY;
      delete Bun.env.SEARCH_PUBMED_API_KEY;
      delete Bun.env.SEARCH_BRIGHTDATA_API_KEY;
      delete Bun.env.SEARCH_BRIGHTDATA_SERP_ZONE;
      delete Bun.env.DEVELOPMENT_ALLOWED_USERS;
      delete Bun.env.STAGING_ALLOWED_USERS;
      delete Bun.env.TESTING_ALLOWED_USERS;
      delete Bun.env.TEST_ALLOWED_USERS;
      delete Bun.env.QA_ALLOWED_USERS;
      delete Bun.env.UAT_ALLOWED_USERS;
      delete Bun.env.INTEGRATION_ALLOWED_USERS;
      delete Bun.env.PREVIEW_ALLOWED_USERS;
      delete Bun.env.DEMO_ALLOWED_USERS;
      delete Bun.env.SANDBOX_ALLOWED_USERS;
      delete Bun.env.BETA_ALLOWED_USERS;
      delete Bun.env.CANARY_ALLOWED_USERS;
      delete Bun.env.HOTFIX_ALLOWED_USERS;
      delete Bun.env.SYSTEM_USERS;
      delete Bun.env.SUPER_ADMIN_USERS;
      delete Bun.env.ADMIN_USERS;
    });

    test("should read HOST_NAME from environment", () => {
      Bun.env.HOST_NAME = "example.com";
      const appEnv = new AppEnv();

      expect(appEnv.HOST_NAME).toBe("example.com");
    });

    test("should have undefined for unset optional env vars", () => {
      const appEnv = new AppEnv();

      expect(appEnv.HOST_NAME).toBe("0.0.0.0");
      expect(appEnv.LOGS_DATABASE_URL).toBeUndefined();
      expect(appEnv.BETTERSTACK_LOGGER_SOURCE_TOKEN).toBeUndefined();
      expect(appEnv.BETTERSTACK_LOGGER_INGESTING_HOST).toBeUndefined();
      expect(appEnv.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN).toBeUndefined();
      expect(appEnv.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST).toBeUndefined();
      expect(appEnv.ANALYTICS_POSTHOG_PROJECT_TOKEN).toBeUndefined();
      expect(appEnv.ANALYTICS_POSTHOG_HOST).toBeUndefined();
      expect(appEnv.CACHE_REDIS_URL).toBeUndefined();
      expect(appEnv.CACHE_UPSTASH_REDIS_REST_URL).toBeUndefined();
      expect(appEnv.CACHE_UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
      expect(appEnv.PUBSUB_REDIS_URL).toBeUndefined();
      expect(appEnv.RATE_LIMIT_REDIS_URL).toBeUndefined();
      expect(appEnv.RATE_LIMIT_UPSTASH_REDIS_URL).toBeUndefined();
      expect(appEnv.RATE_LIMIT_UPSTASH_REDIS_TOKEN).toBeUndefined();
      expect(appEnv.CORS_ORIGINS).toBeUndefined();
      expect(appEnv.CORS_METHODS).toBeUndefined();
      expect(appEnv.CORS_HEADERS).toBeUndefined();
      expect(appEnv.CORS_EXPOSED_HEADERS).toBeUndefined();
      expect(appEnv.CORS_CREDENTIALS).toBeUndefined();
      expect(appEnv.CORS_MAX_AGE).toBeUndefined();
      expect(appEnv.STORAGE_CLOUDFLARE_ACCESS_KEY).toBeUndefined();
      expect(appEnv.STORAGE_CLOUDFLARE_SECRET_KEY).toBeUndefined();
      expect(appEnv.STORAGE_CLOUDFLARE_ENDPOINT).toBeUndefined();
      expect(appEnv.STORAGE_CLOUDFLARE_REGION).toBeUndefined();
      expect(appEnv.STORAGE_BUNNY_ACCESS_KEY).toBeUndefined();
      expect(appEnv.STORAGE_BUNNY_STORAGE_ZONE).toBeUndefined();
      expect(appEnv.STORAGE_BUNNY_REGION).toBeUndefined();
      expect(appEnv.FILESYSTEM_STORAGE_PATH).toBeUndefined();
      expect(appEnv.DATABASE_URL).toBeUndefined();
      expect(appEnv.DATABASE_REDIS_URL).toBeUndefined();
      expect(appEnv.SQLITE_DATABASE_PATH).toBeUndefined();
      expect(appEnv.MAILER_SENDER_NAME).toBeUndefined();
      expect(appEnv.MAILER_SENDER_ADDRESS).toBeUndefined();
      expect(appEnv.RESEND_API_KEY).toBeUndefined();
      expect(appEnv.JWT_SECRET).toBeUndefined();
      expect(appEnv.OPENAI_API_KEY).toBeUndefined();
      expect(appEnv.ANTHROPIC_API_KEY).toBeUndefined();
      expect(appEnv.GEMINI_API_KEY).toBeUndefined();
      expect(appEnv.GROQ_API_KEY).toBeUndefined();
      expect(appEnv.OLLAMA_HOST).toBeUndefined();
      expect(appEnv.POLAR_ACCESS_TOKEN).toBeUndefined();
      expect(appEnv.POLAR_ENVIRONMENT).toBeUndefined();
      expect(appEnv.AUTH_TOKEN).toBeUndefined();
      expect(appEnv.CLERK_SECRET_KEY).toBeUndefined();
      expect(appEnv.LINEAR_API_KEY).toBeUndefined();
      expect(appEnv.LINEAR_TEAM_ID).toBeUndefined();
      expect(appEnv.SEARCH_EXA_API_KEY).toBeUndefined();
      expect(appEnv.SEARCH_FIRECRAWL_API_KEY).toBeUndefined();
      expect(appEnv.SEARCH_PUBMED_API_KEY).toBeUndefined();
      expect(appEnv.SEARCH_BRIGHTDATA_API_KEY).toBeUndefined();
      expect(appEnv.SEARCH_BRIGHTDATA_SERP_ZONE).toBeUndefined();
      expect(appEnv.DEVELOPMENT_ALLOWED_USERS).toEqual([]);
      expect(appEnv.STAGING_ALLOWED_USERS).toEqual([]);
      expect(appEnv.TESTING_ALLOWED_USERS).toEqual([]);
      expect(appEnv.TEST_ALLOWED_USERS).toEqual([]);
      expect(appEnv.QA_ALLOWED_USERS).toEqual([]);
      expect(appEnv.UAT_ALLOWED_USERS).toEqual([]);
      expect(appEnv.INTEGRATION_ALLOWED_USERS).toEqual([]);
      expect(appEnv.PREVIEW_ALLOWED_USERS).toEqual([]);
      expect(appEnv.DEMO_ALLOWED_USERS).toEqual([]);
      expect(appEnv.SANDBOX_ALLOWED_USERS).toEqual([]);
      expect(appEnv.BETA_ALLOWED_USERS).toEqual([]);
      expect(appEnv.CANARY_ALLOWED_USERS).toEqual([]);
      expect(appEnv.HOTFIX_ALLOWED_USERS).toEqual([]);
      expect(appEnv.SYSTEM_USERS).toEqual([]);
      expect(appEnv.SUPER_ADMIN_USERS).toEqual([]);
      expect(appEnv.ADMIN_USERS).toEqual([]);
    });

    test("should read all env vars when set", () => {
      Bun.env.LOGS_DATABASE_URL = "postgres://logs";
      Bun.env.CACHE_REDIS_URL = "redis://cache";
      Bun.env.CACHE_UPSTASH_REDIS_REST_URL = "https://upstash.io";
      Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN = "upstash-token";
      Bun.env.DATABASE_URL = "postgres://db";
      Bun.env.JWT_SECRET = "secret123";
      Bun.env.ANTHROPIC_API_KEY = "sk-ant-123";
      Bun.env.AUTH_TOKEN = "tok_abc123";
      Bun.env.CLERK_SECRET_KEY = "sk_clerk_123";

      const appEnv = new AppEnv();

      expect(appEnv.LOGS_DATABASE_URL).toBe("postgres://logs");
      expect(appEnv.CACHE_REDIS_URL).toBe("redis://cache");
      expect(appEnv.CACHE_UPSTASH_REDIS_REST_URL).toBe("https://upstash.io");
      expect(appEnv.CACHE_UPSTASH_REDIS_REST_TOKEN).toBe("upstash-token");
      expect(appEnv.DATABASE_URL).toBe("postgres://db");
      expect(appEnv.JWT_SECRET).toBe("secret123");
      expect(appEnv.ANTHROPIC_API_KEY).toBe("sk-ant-123");
      expect(appEnv.AUTH_TOKEN).toBe("tok_abc123");
      expect(appEnv.CLERK_SECRET_KEY).toBe("sk_clerk_123");
    });

    test("should read CORS env vars", () => {
      Bun.env.CORS_ORIGINS = "https://example.com";
      Bun.env.CORS_METHODS = "GET,POST";
      Bun.env.CORS_HEADERS = "Content-Type";
      Bun.env.CORS_EXPOSED_HEADERS = "X-Custom";
      Bun.env.CORS_CREDENTIALS = "true";
      Bun.env.CORS_MAX_AGE = "3600";

      const appEnv = new AppEnv();

      expect(appEnv.CORS_ORIGINS).toBe("https://example.com");
      expect(appEnv.CORS_METHODS).toBe("GET,POST");
      expect(appEnv.CORS_HEADERS).toBe("Content-Type");
      expect(appEnv.CORS_EXPOSED_HEADERS).toBe("X-Custom");
      expect(appEnv.CORS_CREDENTIALS).toBe("true");
      expect(appEnv.CORS_MAX_AGE).toBe("3600");
    });

    test("should read storage env vars", () => {
      Bun.env.STORAGE_CLOUDFLARE_ACCESS_KEY = "cf-key";
      Bun.env.STORAGE_CLOUDFLARE_SECRET_KEY = "cf-secret";
      Bun.env.STORAGE_CLOUDFLARE_ENDPOINT = "https://cf.endpoint";
      Bun.env.STORAGE_CLOUDFLARE_REGION = "auto";
      Bun.env.STORAGE_BUNNY_ACCESS_KEY = "bunny-key";
      Bun.env.STORAGE_BUNNY_STORAGE_ZONE = "zone1";
      Bun.env.STORAGE_BUNNY_REGION = "eu";
      Bun.env.FILESYSTEM_STORAGE_PATH = "/tmp/storage";

      const appEnv = new AppEnv();

      expect(appEnv.STORAGE_CLOUDFLARE_ACCESS_KEY).toBe("cf-key");
      expect(appEnv.STORAGE_CLOUDFLARE_SECRET_KEY).toBe("cf-secret");
      expect(appEnv.STORAGE_CLOUDFLARE_ENDPOINT).toBe("https://cf.endpoint");
      expect(appEnv.STORAGE_CLOUDFLARE_REGION).toBe("auto");
      expect(appEnv.STORAGE_BUNNY_ACCESS_KEY).toBe("bunny-key");
      expect(appEnv.STORAGE_BUNNY_STORAGE_ZONE).toBe("zone1");
      expect(appEnv.STORAGE_BUNNY_REGION).toBe("eu");
      expect(appEnv.FILESYSTEM_STORAGE_PATH).toBe("/tmp/storage");
    });

    test("should read database env vars", () => {
      Bun.env.DATABASE_URL = "postgres://localhost/mydb";
      Bun.env.DATABASE_REDIS_URL = "redis://localhost:6379";
      Bun.env.SQLITE_DATABASE_PATH = "/data/app.db";

      const appEnv = new AppEnv();

      expect(appEnv.DATABASE_URL).toBe("postgres://localhost/mydb");
      expect(appEnv.DATABASE_REDIS_URL).toBe("redis://localhost:6379");
      expect(appEnv.SQLITE_DATABASE_PATH).toBe("/data/app.db");
    });

    test("should read mailer env vars", () => {
      Bun.env.MAILER_SENDER_NAME = "Talos";
      Bun.env.MAILER_SENDER_ADDRESS = "noreply@talos.com";
      Bun.env.RESEND_API_KEY = "re_123";

      const appEnv = new AppEnv();

      expect(appEnv.MAILER_SENDER_NAME).toBe("Talos");
      expect(appEnv.MAILER_SENDER_ADDRESS).toBe("noreply@talos.com");
      expect(appEnv.RESEND_API_KEY).toBe("re_123");
    });

    test("should read AI env vars", () => {
      Bun.env.OPENAI_API_KEY = "sk-openai";
      Bun.env.ANTHROPIC_API_KEY = "sk-ant";
      Bun.env.GEMINI_API_KEY = "gemini-key";
      Bun.env.GROQ_API_KEY = "groq-key";
      Bun.env.OLLAMA_HOST = "http://localhost:11434";

      const appEnv = new AppEnv();

      expect(appEnv.OPENAI_API_KEY).toBe("sk-openai");
      expect(appEnv.ANTHROPIC_API_KEY).toBe("sk-ant");
      expect(appEnv.GEMINI_API_KEY).toBe("gemini-key");
      expect(appEnv.GROQ_API_KEY).toBe("groq-key");
      expect(appEnv.OLLAMA_HOST).toBe("http://localhost:11434");
    });

    test("should read payment env vars", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "polar-token";
      Bun.env.POLAR_ENVIRONMENT = "sandbox";

      const appEnv = new AppEnv();

      expect(appEnv.POLAR_ACCESS_TOKEN).toBe("polar-token");
      expect(appEnv.POLAR_ENVIRONMENT).toBe("sandbox");
    });

    test("should read logs env vars", () => {
      Bun.env.BETTERSTACK_LOGGER_SOURCE_TOKEN = "lt-token";
      Bun.env.BETTERSTACK_LOGGER_INGESTING_HOST = "https://logtail.com";
      Bun.env.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN = "bs-token";
      Bun.env.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST = "https://bs.com";

      const appEnv = new AppEnv();

      expect(appEnv.BETTERSTACK_LOGGER_SOURCE_TOKEN).toBe("lt-token");
      expect(appEnv.BETTERSTACK_LOGGER_INGESTING_HOST).toBe("https://logtail.com");
      expect(appEnv.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN).toBe("bs-token");
      expect(appEnv.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST).toBe("https://bs.com");
    });

    test("should read analytics env vars", () => {
      Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = "ph-key";
      Bun.env.ANALYTICS_POSTHOG_HOST = "https://posthog.com";

      const appEnv = new AppEnv();

      expect(appEnv.ANALYTICS_POSTHOG_PROJECT_TOKEN).toBe("ph-key");
      expect(appEnv.ANALYTICS_POSTHOG_HOST).toBe("https://posthog.com");
    });

    test("should read pub/sub and rate limit env vars", () => {
      Bun.env.PUBSUB_REDIS_URL = "redis://pubsub";
      Bun.env.RATE_LIMIT_REDIS_URL = "redis://ratelimit";
      Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL = "https://upstash-ratelimit.io";
      Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN = "upstash-ratelimit-token";

      const appEnv = new AppEnv();

      expect(appEnv.PUBSUB_REDIS_URL).toBe("redis://pubsub");
      expect(appEnv.RATE_LIMIT_REDIS_URL).toBe("redis://ratelimit");
      expect(appEnv.RATE_LIMIT_UPSTASH_REDIS_URL).toBe("https://upstash-ratelimit.io");
      expect(appEnv.RATE_LIMIT_UPSTASH_REDIS_TOKEN).toBe("upstash-ratelimit-token");
    });

    test("should read allowed users env vars and split by comma", () => {
      Bun.env.DEVELOPMENT_ALLOWED_USERS = "user1@test.com, user2@test.com";
      Bun.env.STAGING_ALLOWED_USERS = "user3@test.com";

      const appEnv = new AppEnv();

      expect(appEnv.DEVELOPMENT_ALLOWED_USERS).toEqual(["user1@test.com", "user2@test.com"]);
      expect(appEnv.STAGING_ALLOWED_USERS).toEqual(["user3@test.com"]);
    });

    test("should trim whitespace from allowed users", () => {
      Bun.env.QA_ALLOWED_USERS = "  user1@test.com ,  user2@test.com  , user3@test.com  ";

      const appEnv = new AppEnv();

      expect(appEnv.QA_ALLOWED_USERS).toEqual(["user1@test.com", "user2@test.com", "user3@test.com"]);
    });

    test("should filter empty entries from allowed users", () => {
      Bun.env.BETA_ALLOWED_USERS = "user1@test.com,,, user2@test.com,";

      const appEnv = new AppEnv();

      expect(appEnv.BETA_ALLOWED_USERS).toEqual(["user1@test.com", "user2@test.com"]);
    });

    test("should trim APP_ENV value", () => {
      setEnv("  production  ");
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("production");
      expect(appEnv.isProduction).toBe(true);
    });

    test("should default to production when APP_ENV is whitespace only", () => {
      setEnv("   ");
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("production");
      expect(appEnv.isProduction).toBe(true);
    });

    test("should trim PORT value", () => {
      Bun.env.PORT = "  8080  ";
      const appEnv = new AppEnv();

      expect(appEnv.PORT).toBe(8080);
    });

    test("should trim HOST_NAME value", () => {
      Bun.env.HOST_NAME = "  example.com  ";
      const appEnv = new AppEnv();

      expect(appEnv.HOST_NAME).toBe("example.com");
    });

    test("should default HOST_NAME when value is whitespace only", () => {
      Bun.env.HOST_NAME = "   ";
      const appEnv = new AppEnv();

      expect(appEnv.HOST_NAME).toBe("0.0.0.0");
    });

    test("should trim string env vars", () => {
      Bun.env.LOGS_DATABASE_URL = "  postgres://logs  ";
      Bun.env.BETTERSTACK_LOGGER_SOURCE_TOKEN = "  lt-token  ";
      Bun.env.BETTERSTACK_LOGGER_INGESTING_HOST = "  https://logtail.com  ";
      Bun.env.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN = "  bs-token  ";
      Bun.env.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST = "  https://bs.com  ";
      Bun.env.ANALYTICS_POSTHOG_PROJECT_TOKEN = "  ph-key  ";
      Bun.env.ANALYTICS_POSTHOG_HOST = "  https://posthog.com  ";
      Bun.env.CACHE_REDIS_URL = "  redis://cache  ";
      Bun.env.CACHE_UPSTASH_REDIS_REST_URL = "  https://upstash.io  ";
      Bun.env.CACHE_UPSTASH_REDIS_REST_TOKEN = "  upstash-token  ";
      Bun.env.PUBSUB_REDIS_URL = "  redis://pubsub  ";
      Bun.env.RATE_LIMIT_REDIS_URL = "  redis://ratelimit  ";
      Bun.env.RATE_LIMIT_UPSTASH_REDIS_URL = "  https://upstash-ratelimit.io  ";
      Bun.env.RATE_LIMIT_UPSTASH_REDIS_TOKEN = "  upstash-ratelimit-token  ";

      const appEnv = new AppEnv();

      expect(appEnv.LOGS_DATABASE_URL).toBe("postgres://logs");
      expect(appEnv.BETTERSTACK_LOGGER_SOURCE_TOKEN).toBe("lt-token");
      expect(appEnv.BETTERSTACK_LOGGER_INGESTING_HOST).toBe("https://logtail.com");
      expect(appEnv.BETTERSTACK_EXCEPTION_LOGGER_APPLICATION_TOKEN).toBe("bs-token");
      expect(appEnv.BETTERSTACK_EXCEPTION_LOGGER_INGESTING_HOST).toBe("https://bs.com");
      expect(appEnv.ANALYTICS_POSTHOG_PROJECT_TOKEN).toBe("ph-key");
      expect(appEnv.ANALYTICS_POSTHOG_HOST).toBe("https://posthog.com");
      expect(appEnv.CACHE_REDIS_URL).toBe("redis://cache");
      expect(appEnv.CACHE_UPSTASH_REDIS_REST_URL).toBe("https://upstash.io");
      expect(appEnv.CACHE_UPSTASH_REDIS_REST_TOKEN).toBe("upstash-token");
      expect(appEnv.PUBSUB_REDIS_URL).toBe("redis://pubsub");
      expect(appEnv.RATE_LIMIT_REDIS_URL).toBe("redis://ratelimit");
      expect(appEnv.RATE_LIMIT_UPSTASH_REDIS_URL).toBe("https://upstash-ratelimit.io");
      expect(appEnv.RATE_LIMIT_UPSTASH_REDIS_TOKEN).toBe("upstash-ratelimit-token");
    });

    test("should trim CORS env vars", () => {
      Bun.env.CORS_ORIGINS = "  https://example.com  ";
      Bun.env.CORS_METHODS = "  GET,POST  ";
      Bun.env.CORS_HEADERS = "  Content-Type  ";
      Bun.env.CORS_EXPOSED_HEADERS = "  X-Custom  ";
      Bun.env.CORS_CREDENTIALS = "  true  ";
      Bun.env.CORS_MAX_AGE = "  3600  ";

      const appEnv = new AppEnv();

      expect(appEnv.CORS_ORIGINS).toBe("https://example.com");
      expect(appEnv.CORS_METHODS).toBe("GET,POST");
      expect(appEnv.CORS_HEADERS).toBe("Content-Type");
      expect(appEnv.CORS_EXPOSED_HEADERS).toBe("X-Custom");
      expect(appEnv.CORS_CREDENTIALS).toBe("true");
      expect(appEnv.CORS_MAX_AGE).toBe("3600");
    });

    test("should trim storage env vars", () => {
      Bun.env.STORAGE_CLOUDFLARE_ACCESS_KEY = "  cf-key  ";
      Bun.env.STORAGE_CLOUDFLARE_SECRET_KEY = "  cf-secret  ";
      Bun.env.STORAGE_CLOUDFLARE_ENDPOINT = "  https://cf.endpoint  ";
      Bun.env.STORAGE_CLOUDFLARE_REGION = "  auto  ";
      Bun.env.STORAGE_BUNNY_ACCESS_KEY = "  bunny-key  ";
      Bun.env.STORAGE_BUNNY_STORAGE_ZONE = "  zone1  ";
      Bun.env.STORAGE_BUNNY_REGION = "  eu  ";
      Bun.env.FILESYSTEM_STORAGE_PATH = "  /tmp/storage  ";

      const appEnv = new AppEnv();

      expect(appEnv.STORAGE_CLOUDFLARE_ACCESS_KEY).toBe("cf-key");
      expect(appEnv.STORAGE_CLOUDFLARE_SECRET_KEY).toBe("cf-secret");
      expect(appEnv.STORAGE_CLOUDFLARE_ENDPOINT).toBe("https://cf.endpoint");
      expect(appEnv.STORAGE_CLOUDFLARE_REGION).toBe("auto");
      expect(appEnv.STORAGE_BUNNY_ACCESS_KEY).toBe("bunny-key");
      expect(appEnv.STORAGE_BUNNY_STORAGE_ZONE).toBe("zone1");
      expect(appEnv.STORAGE_BUNNY_REGION).toBe("eu");
      expect(appEnv.FILESYSTEM_STORAGE_PATH).toBe("/tmp/storage");
    });

    test("should trim database env vars", () => {
      Bun.env.DATABASE_URL = "  postgres://localhost/mydb  ";
      Bun.env.DATABASE_REDIS_URL = "  redis://localhost:6379  ";
      Bun.env.SQLITE_DATABASE_PATH = "  /data/app.db  ";

      const appEnv = new AppEnv();

      expect(appEnv.DATABASE_URL).toBe("postgres://localhost/mydb");
      expect(appEnv.DATABASE_REDIS_URL).toBe("redis://localhost:6379");
      expect(appEnv.SQLITE_DATABASE_PATH).toBe("/data/app.db");
    });

    test("should trim mailer env vars", () => {
      Bun.env.MAILER_SENDER_NAME = "  Talos  ";
      Bun.env.MAILER_SENDER_ADDRESS = "  noreply@talos.com  ";
      Bun.env.RESEND_API_KEY = "  re_123  ";

      const appEnv = new AppEnv();

      expect(appEnv.MAILER_SENDER_NAME).toBe("Talos");
      expect(appEnv.MAILER_SENDER_ADDRESS).toBe("noreply@talos.com");
      expect(appEnv.RESEND_API_KEY).toBe("re_123");
    });

    test("should trim JWT env var", () => {
      Bun.env.JWT_SECRET = "  secret123  ";
      const appEnv = new AppEnv();

      expect(appEnv.JWT_SECRET).toBe("secret123");
    });

    test("should trim AI env vars", () => {
      Bun.env.OPENAI_API_KEY = "  sk-openai  ";
      Bun.env.ANTHROPIC_API_KEY = "  sk-ant  ";
      Bun.env.GEMINI_API_KEY = "  gemini-key  ";
      Bun.env.GROQ_API_KEY = "  groq-key  ";
      Bun.env.OLLAMA_HOST = "  http://localhost:11434  ";

      const appEnv = new AppEnv();

      expect(appEnv.OPENAI_API_KEY).toBe("sk-openai");
      expect(appEnv.ANTHROPIC_API_KEY).toBe("sk-ant");
      expect(appEnv.GEMINI_API_KEY).toBe("gemini-key");
      expect(appEnv.GROQ_API_KEY).toBe("groq-key");
      expect(appEnv.OLLAMA_HOST).toBe("http://localhost:11434");
    });

    test("should trim payment env vars", () => {
      Bun.env.POLAR_ACCESS_TOKEN = "  polar-token  ";
      Bun.env.POLAR_ENVIRONMENT = "  sandbox  ";

      const appEnv = new AppEnv();

      expect(appEnv.POLAR_ACCESS_TOKEN).toBe("polar-token");
      expect(appEnv.POLAR_ENVIRONMENT).toBe("sandbox");
    });

    test("should trim authentication env var", () => {
      Bun.env.AUTH_TOKEN = "  tok_abc123  ";
      Bun.env.CLERK_SECRET_KEY = "  sk_clerk_123  ";
      const appEnv = new AppEnv();

      expect(appEnv.AUTH_TOKEN).toBe("tok_abc123");
      expect(appEnv.CLERK_SECRET_KEY).toBe("sk_clerk_123");
    });

    test("should read Linear env vars", () => {
      Bun.env.LINEAR_API_KEY = "lin_api_123";
      Bun.env.LINEAR_TEAM_ID = "team-abc";
      const appEnv = new AppEnv();

      expect(appEnv.LINEAR_API_KEY).toBe("lin_api_123");
      expect(appEnv.LINEAR_TEAM_ID).toBe("team-abc");
    });

    test("should trim Linear env vars", () => {
      Bun.env.LINEAR_API_KEY = "  lin_api_123  ";
      Bun.env.LINEAR_TEAM_ID = "  team-abc  ";
      const appEnv = new AppEnv();

      expect(appEnv.LINEAR_API_KEY).toBe("lin_api_123");
      expect(appEnv.LINEAR_TEAM_ID).toBe("team-abc");
    });

    test("should read Search env vars", () => {
      Bun.env.SEARCH_EXA_API_KEY = "exa_api_123";
      Bun.env.SEARCH_FIRECRAWL_API_KEY = "fc_api_123";
      Bun.env.SEARCH_PUBMED_API_KEY = "pubmed_api_123";
      Bun.env.SEARCH_BRIGHTDATA_API_KEY = "brd_api_123";
      Bun.env.SEARCH_BRIGHTDATA_SERP_ZONE = "serp_zone1";
      const appEnv = new AppEnv();

      expect(appEnv.SEARCH_EXA_API_KEY).toBe("exa_api_123");
      expect(appEnv.SEARCH_FIRECRAWL_API_KEY).toBe("fc_api_123");
      expect(appEnv.SEARCH_PUBMED_API_KEY).toBe("pubmed_api_123");
      expect(appEnv.SEARCH_BRIGHTDATA_API_KEY).toBe("brd_api_123");
      expect(appEnv.SEARCH_BRIGHTDATA_SERP_ZONE).toBe("serp_zone1");
    });

    test("should trim Search env vars", () => {
      Bun.env.SEARCH_EXA_API_KEY = "  exa_api_123  ";
      Bun.env.SEARCH_FIRECRAWL_API_KEY = "  fc_api_123  ";
      Bun.env.SEARCH_PUBMED_API_KEY = "  pubmed_api_123  ";
      Bun.env.SEARCH_BRIGHTDATA_API_KEY = "  brd_api_123  ";
      Bun.env.SEARCH_BRIGHTDATA_SERP_ZONE = "  serp_zone1  ";
      const appEnv = new AppEnv();

      expect(appEnv.SEARCH_EXA_API_KEY).toBe("exa_api_123");
      expect(appEnv.SEARCH_FIRECRAWL_API_KEY).toBe("fc_api_123");
      expect(appEnv.SEARCH_PUBMED_API_KEY).toBe("pubmed_api_123");
      expect(appEnv.SEARCH_BRIGHTDATA_API_KEY).toBe("brd_api_123");
      expect(appEnv.SEARCH_BRIGHTDATA_SERP_ZONE).toBe("serp_zone1");
    });
  });

  describe("Edge Cases", () => {
    test("should handle case-sensitive environment names", () => {
      setEnv("production");
      const appEnvLower = new AppEnv();

      setEnv("PRODUCTION");
      const appEnvUpper = new AppEnv();

      expect(appEnvLower.isProduction).toBe(true);
      expect(appEnvUpper.isProduction).toBe(false);
      expect(appEnvUpper.APP_ENV).toBe("PRODUCTION" as EnvironmentNameType);
    });

    test("should handle environment names with special characters", () => {
      setEnv("test-env-123");
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe("test-env-123" as EnvironmentNameType);
      expect(appEnv.isProduction).toBe(false);
      expect(appEnv.isLocal).toBe(false);
    });

    test("should handle very long environment names", () => {
      const longEnv = "very-long-environment-name-that-exceeds-normal-length-expectations-for-testing-purposes";
      setEnv(longEnv);
      const appEnv = new AppEnv();

      expect(appEnv.APP_ENV).toBe(longEnv as EnvironmentNameType);
      expect(appEnv.isProduction).toBe(false);
    });
  });

  describe("Type Safety", () => {
    test("should work with all valid environment types", () => {
      const validEnvTypes: EnvironmentNameType[] = [
        "local",
        "development",
        "staging",
        "testing",
        "test",
        "qa",
        "uat",
        "integration",
        "preview",
        "demo",
        "sandbox",
        "beta",
        "canary",
        "hotfix",
        "production",
      ];

      for (const envType of validEnvTypes) {
        setEnv(envType);
        expect(() => new AppEnv()).not.toThrow();
        const appEnv = new AppEnv();
        expect(appEnv.APP_ENV).toBe(envType);
      }
    });
  });

  describe("Environment Value Consistency", () => {
    test("should maintain consistency between env property and boolean flags", () => {
      const environments: Array<{ env: EnvironmentNameType; flag: keyof AppEnv }> = [
        { env: "local", flag: "isLocal" },
        { env: "development", flag: "isDevelopment" },
        { env: "staging", flag: "isStaging" },
        { env: "testing", flag: "isTesting" },
        { env: "test", flag: "isTest" },
        { env: "qa", flag: "isQa" },
        { env: "uat", flag: "isUat" },
        { env: "integration", flag: "isIntegration" },
        { env: "preview", flag: "isPreview" },
        { env: "demo", flag: "isDemo" },
        { env: "sandbox", flag: "isSandbox" },
        { env: "beta", flag: "isBeta" },
        { env: "canary", flag: "isCanary" },
        { env: "hotfix", flag: "isHotfix" },
        { env: "production", flag: "isProduction" },
      ];

      for (const { env, flag } of environments) {
        setEnv(env);
        const appEnv = new AppEnv();
        expect(appEnv.APP_ENV).toBe(env);
        expect(appEnv[flag]).toBe(true);

        const otherFlags = environments.filter((e) => e.flag !== flag).map((e) => e.flag);

        for (const otherFlag of otherFlags) {
          expect(appEnv[otherFlag]).toBe(false);
        }
      }
    });
  });
});
