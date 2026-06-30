import { describe, expect, test } from "bun:test";
import { parseEnvVars } from "@/parseEnvVars";

describe("parseEnvVars", () => {
  describe("basic functionality", () => {
    test("should convert keys to camelCase and parse values", () => {
      const input = {
        DATABASE_URL: "postgres://localhost:5432/db",
        API_PORT: "3000",
        DEBUG_MODE: "true",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        databaseUrl: "postgres://localhost:5432/db",
        apiPort: 3000,
        debugMode: true,
      });
    });

    test("should handle empty object", () => {
      const result = parseEnvVars({});
      expect(result).toEqual({});
    });

    test("should handle single environment variable", () => {
      const input = { PORT: "8080" };
      const result = parseEnvVars(input);
      expect(result as unknown).toEqual({ port: 8080 });
    });
  });

  describe("key transformation", () => {
    test("should convert SCREAMING_SNAKE_CASE to camelCase", () => {
      const input = {
        VERY_LONG_VARIABLE_NAME: "value",
        SIMPLE_VAR: "test",
        A_B_C_D: "abcd",
      };

      const result = parseEnvVars(input);

      expect(result).toEqual({
        veryLongVariableName: "value",
        simpleVar: "test",
        aBCD: "abcd",
      });
    });

    test("should handle keys with numbers", () => {
      const input = {
        API_V2_URL: "https://api.example.com/v2",
        DB_VERSION_1: "1.0.0",
        PORT_3000: "3000",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        apiV2Url: "https://api.example.com/v2",
        dbVersion1: "1.0.0",
        port3000: 3000,
      });
    });

    test("should handle keys with special characters", () => {
      const input = {
        "API-URL": "https://api.example.com",
        "DB.NAME": "mydb",
        "VALUE WITH SPACES": "test",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        apiUrl: "https://api.example.com",
        dbName: "mydb",
        valueWithSpaces: "test",
      });
    });

    test("should handle already camelCase keys", () => {
      const input = {
        apiUrl: "https://api.example.com",
        databasePort: "5432",
        isEnabled: "true",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        apiUrl: "https://api.example.com",
        databasePort: 5432,
        isEnabled: true,
      });
    });
  });

  describe("value parsing", () => {
    test("should parse integer strings to numbers", () => {
      const input = {
        PORT: "3000",
        TIMEOUT: "5000",
        MAX_CONNECTIONS: "100",
        NEGATIVE_NUMBER: "-50",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        port: 3000,
        timeout: 5000,
        maxConnections: 100,
        negativeNumber: -50,
      });
    });

    test("should parse float strings to numbers", () => {
      const input = {
        RATE: "1.5",
        PERCENTAGE: "99.99",
        SMALL_DECIMAL: "0.001",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        rate: 1.5,
        percentage: 99.99,
        smallDecimal: 0.001,
      });
    });

    test("should parse boolean strings", () => {
      const input = {
        ENABLE_FEATURE: "true",
        DEBUG_MODE: "false",
        IS_PRODUCTION: "TRUE",
        SHOW_LOGS: "FALSE",
        CASE_MIXED: "True",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        enableFeature: true,
        debugMode: false,
        isProduction: true,
        showLogs: false,
        caseMixed: true,
      });
    });

    test("should parse null values", () => {
      const input = {
        NULLABLE_FIELD: "null",
        EMPTY_CONFIG: "NULL",
        CASE_MIXED: "Null",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        nullableField: null,
        emptyConfig: null,
        caseMixed: null,
      });
    });

    test("should parse array strings", () => {
      const input = {
        ALLOWED_ORIGINS: "[localhost, 127.0.0.1, example.com]",
        PORTS: "[3000, 4000, 5000]",
        FEATURES: "[true, false, true]",
        MIXED_ARRAY: "[1, test, true, null]",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        allowedOrigins: ["localhost", "127.0.0.1", "example.com"],
        ports: [3000, 4000, 5000],
        features: [true, false, true],
        mixedArray: [1, "test", true, null],
      });
    });

    test("should parse JSON strings", () => {
      const input = {
        CONFIG_OBJECT: '{"host":"localhost","port":3000}',
        USER_DATA: '{"name":"John","age":30,"active":true}',
        NESTED_JSON: '{"db":{"host":"localhost","port":5432}}',
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        configObject: { host: "localhost", port: 3000 },
        userData: { name: "John", age: 30, active: true },
        nestedJson: { db: { host: "localhost", port: 5432 } },
      });
    });

    test("should keep strings as strings when they cannot be parsed", () => {
      const input = {
        API_URL: "https://api.example.com",
        DATABASE_NAME: "my-app-db",
        SECRET_KEY: "abc123xyz",
        COMPLEX_STRING: "user@domain.com:password",
      };

      const result = parseEnvVars(input);

      expect(result).toEqual({
        apiUrl: "https://api.example.com",
        databaseName: "my-app-db",
        secretKey: "abc123xyz",
        complexString: "user@domain.com:password",
      });
    });
  });

  describe("edge cases", () => {
    test("should handle empty string values", () => {
      const input = {
        EMPTY_VALUE: "",
        ANOTHER_EMPTY: "",
      };

      const result = parseEnvVars(input);

      expect(result).toEqual({
        emptyValue: "",
        anotherEmpty: "",
      });
    });

    test("should handle whitespace values", () => {
      const input = {
        SPACES: "   ",
        TABS: "\t\t",
        NEWLINES: "\n\n",
      };

      const result = parseEnvVars(input);

      expect(result).toEqual({
        spaces: "   ",
        tabs: "\t\t",
        newlines: "\n\n",
      });
    });

    test("should handle special string patterns", () => {
      const input = {
        LOOKS_LIKE_BOOL: "truthy",
        LOOKS_LIKE_NULL: "nullable",
        LOOKS_LIKE_NUMBER: "123abc",
        LOOKS_LIKE_ARRAY: "[not, an, array",
      };

      const result = parseEnvVars(input);

      expect(result).toEqual({
        looksLikeBool: "truthy",
        looksLikeNull: "nullable",
        looksLikeNumber: "123abc",
        looksLikeArray: "[not, an, array",
      });
    });

    test("should handle malformed JSON", () => {
      const input = {
        BAD_JSON: '{"incomplete": true',
        INVALID_JSON: "{not: valid}",
        PARTIAL_ARRAY: "[1, 2,",
      };

      const result = parseEnvVars(input);

      expect(result).toEqual({
        badJson: '{"incomplete": true',
        invalidJson: "{not: valid}",
        partialArray: "[1, 2,",
      });
    });

    test("should handle infinity values", () => {
      const input = {
        POSITIVE_INFINITY: "Infinity",
        NEGATIVE_INFINITY: "-Infinity",
      };

      const result = parseEnvVars(input);

      expect(result).toEqual({
        positiveInfinity: "Infinity",
        negativeInfinity: "-Infinity",
      });
    });
  });

  describe("type safety", () => {
    test("should handle non-string values in input", () => {
      const input = {
        STRING_VAL: "test",
        NUMBER_VAL: 123 as unknown,
        BOOLEAN_VAL: true as unknown,
        NULL_VAL: null as unknown,
        UNDEFINED_VAL: undefined as unknown,
      };

      const result = parseEnvVars<{ stringVal: string }>(input as Record<string, string>);

      // Since parseString expects strings, non-string values might behave unexpectedly
      // But the function should still work
      expect(typeof result).toBe("object");
      expect(result.stringVal).toBe("test");
    });

    test("should work with generic type parameter", () => {
      interface Config {
        apiUrl: string;
        port: number;
        debugMode: boolean;
      }

      const input = {
        API_URL: "https://api.example.com",
        PORT: "3000",
        DEBUG_MODE: "true",
      };

      const result = parseEnvVars<Config>(input);

      expect(result as unknown).toEqual({
        apiUrl: "https://api.example.com",
        port: 3000,
        debugMode: true,
      });
    });
  });

  describe("parametrized tests", () => {
    test.each([
      [{ SIMPLE_KEY: "value" }, { simpleKey: "value" }],
      [{ NUMBER_KEY: "42" }, { numberKey: 42 }],
      [{ BOOL_KEY: "true" }, { boolKey: true }],
      [{ NULL_KEY: "null" }, { nullKey: null }],
      [{ ARRAY_KEY: "[1, 2, 3]" }, { arrayKey: [1, 2, 3] }],
    ])("parseEnvVars(%o) should return %o", (input, expected: unknown) => {
      const result = parseEnvVars(input);
      expect(result as unknown).toEqual(expected as unknown);
    });
  });

  describe("real world examples", () => {
    test("should handle typical application environment variables", () => {
      const input = {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://user:pass@localhost:5432/mydb",
        API_PORT: "3000",
        ENABLE_LOGGING: "true",
        MAX_CONNECTIONS: "100",
        ALLOWED_ORIGINS: "[localhost, example.com, api.example.com]",
        JWT_SECRET: "your-secret-key",
        REDIS_TTL: "3600",
        DEBUG_MODE: "false",
        APP_VERSION: "1.2.3",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        nodeEnv: "production",
        databaseUrl: "postgres://user:pass@localhost:5432/mydb",
        apiPort: 3000,
        enableLogging: true,
        maxConnections: 100,
        allowedOrigins: ["localhost", "example.com", "api.example.com"],
        jwtSecret: "your-secret-key",
        redisTtl: 3600,
        debugMode: false,
        appVersion: "1.2.3",
      });
    });

    test("should handle AWS-style environment variables", () => {
      const input = {
        AWS_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
        AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        S3_BUCKET_NAME: "my-app-bucket",
        LAMBDA_TIMEOUT: "30",
        USE_S3: "true",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        awsRegion: "us-east-1",
        awsAccessKeyId: "AKIAIOSFODNN7EXAMPLE",
        awsSecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        s3BucketName: "my-app-bucket",
        lambdaTimeout: 30,
        useS3: true,
      });
    });

    test("should handle Docker environment variables", () => {
      const input = {
        DOCKER_HOST: "unix:///var/run/docker.sock",
        COMPOSE_PROJECT_NAME: "my-app",
        RESTART_POLICY: "unless-stopped",
        EXPOSE_PORT: "8080",
        ENABLE_LOGGING: "true",
        MEMORY_LIMIT: "512",
      };

      const result = parseEnvVars(input);

      expect(result as unknown).toEqual({
        dockerHost: "unix:///var/run/docker.sock",
        composeProjectName: "my-app",
        restartPolicy: "unless-stopped",
        exposePort: 8080,
        enableLogging: true,
        memoryLimit: 512,
      });
    });
  });

  describe("function behavior", () => {
    test("should not mutate the original input object", () => {
      const input = {
        TEST_KEY: "test_value",
        ANOTHER_KEY: "123",
      };
      const originalInput = { ...input };

      parseEnvVars(input);

      expect(input).toEqual(originalInput);
    });

    test("should return a new object", () => {
      const input = { TEST: "value" };
      const result = parseEnvVars(input);

      expect(result).not.toBe(input);
      expect(typeof result).toBe("object");
    });

    test("should handle consecutive calls consistently", () => {
      const input = {
        PORT: "3000",
        DEBUG_MODE: "true",
      };

      const result1 = parseEnvVars(input);
      const result2 = parseEnvVars(input);

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });
  });
});
