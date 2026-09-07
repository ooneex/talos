import { beforeEach, describe, expect, test } from "bun:test";
import {
  Container,
  ContainerException,
  EContainerScope,
  inject,
  injectable,
  container as sharedContainer,
} from "@/index";

describe("Container - Dependency Injection", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe("Service dependencies", () => {
    test("should resolve simple service without constructor dependencies", () => {
      class DatabaseService {
        public connect(): string {
          return "connected";
        }
      }

      container.add(DatabaseService);
      const service = container.get(DatabaseService);
      expect(service).toBeInstanceOf(DatabaseService);
      expect(service.connect()).toBe("connected");
    });

    test("should handle services with basic properties", () => {
      class ConfigService {
        public readonly environment = "test";
        public readonly version = "1.0.0";

        public getInfo(): string {
          return `${this.environment}-${this.version}`;
        }
      }

      container.add(ConfigService);
      const service = container.get(ConfigService);
      expect(service.getInfo()).toBe("test-1.0.0");
    });

    test("should respect singleton scope for single service", () => {
      class LoggerService {
        private static instanceCount = 0;
        public readonly instanceId: number;

        constructor() {
          LoggerService.instanceCount++;
          this.instanceId = LoggerService.instanceCount;
        }

        public log(message: string): string {
          return `[${this.instanceId}] ${message}`;
        }
      }

      // Register as singleton
      container.add(LoggerService, EContainerScope.Singleton);

      const logger1 = container.get(LoggerService);
      const logger2 = container.get(LoggerService);

      expect(logger1.instanceId).toBe(1);
      expect(logger2.instanceId).toBe(1);
      expect(logger1).toBe(logger2);
    });

    test("should create new instances for transient scope", () => {
      class RequestIdService {
        private static requestCount = 0;
        public readonly requestId: number;

        constructor() {
          RequestIdService.requestCount++;
          this.requestId = RequestIdService.requestCount;
        }

        public getId(): number {
          return this.requestId;
        }
      }

      // RequestIdService should create new instances each time
      container.add(RequestIdService, EContainerScope.Transient);

      const service1 = container.get(RequestIdService);
      const service2 = container.get(RequestIdService);

      // Each service should have a different request ID
      expect(service1.getId()).toBe(1);
      expect(service2.getId()).toBe(2);
      expect(service1).not.toBe(service2);
    });
  });

  describe("Constants with services", () => {
    test("should work with constants and services together", () => {
      const CONFIG_KEY = "app-config";

      interface AppConfig {
        name: string;
        version: string;
      }

      class AppService {
        public getName(): string {
          return "MyApp";
        }
      }

      const config: AppConfig = {
        name: "TestApp",
        version: "2.0.0",
      };

      container.addConstant(CONFIG_KEY, config);
      container.add(AppService);

      const retrievedConfig = container.getConstant<AppConfig>(CONFIG_KEY);
      const appService = container.get(AppService);

      expect(retrievedConfig.name).toBe("TestApp");
      expect(retrievedConfig.version).toBe("2.0.0");
      expect(appService.getName()).toBe("MyApp");
    });
  });

  describe("Error scenarios", () => {
    test("should throw error for unregistered service", () => {
      class UnregisteredService {
        public getValue(): string {
          return "unregistered";
        }
      }

      expect(() => container.get(UnregisteredService)).toThrow(/Failed to resolve dependency: UnregisteredService\./);
    });

    test("should forward original error message for unregistered service", () => {
      class MissingService {
        public getValue(): string {
          return "missing";
        }
      }

      try {
        container.get(MissingService);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("Failed to resolve dependency: MissingService");
        expect(message).toContain("No bindings found");
      }
    });

    test("should handle service registration and retrieval correctly", () => {
      class ValidService {
        public process(): string {
          return "processed";
        }
      }

      container.add(ValidService);
      const service = container.get(ValidService);
      expect(service.process()).toBe("processed");
    });
  });

  describe("Advanced scoping scenarios", () => {
    test("should demonstrate different scoping behavior", () => {
      class CounterService {
        private static count = 0;
        public readonly id: number;

        constructor() {
          CounterService.count++;
          this.id = CounterService.count;
        }

        public getId(): number {
          return this.id;
        }
      }

      // Test singleton behavior
      container.add(CounterService, EContainerScope.Singleton);

      const instance1 = container.get(CounterService);
      const instance2 = container.get(CounterService);

      expect(instance1.getId()).toBe(instance2.getId());
      expect(instance1).toBe(instance2);
    });

    test("should handle transient scoping correctly", () => {
      class TransientService {
        private static instanceCount = 0;
        public readonly instanceId: number;

        constructor() {
          TransientService.instanceCount++;
          this.instanceId = TransientService.instanceCount;
        }

        public getInstanceId(): number {
          return this.instanceId;
        }
      }

      container.add(TransientService, EContainerScope.Transient);

      const instance1 = container.get(TransientService);
      const instance2 = container.get(TransientService);

      expect(instance1.getInstanceId()).toBe(1);
      expect(instance2.getInstanceId()).toBe(2);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Container shared state", () => {
    test("should share bindings across container instances due to shared DI container", () => {
      class SharedService {
        constructor(public value = "shared") {}
      }

      class AnotherSharedService {
        constructor(public value = "another") {}
      }

      const container2 = new Container();

      // Add different services to each container
      container.add(SharedService);
      container2.add(AnotherSharedService);

      // Due to shared DI container, both containers can access both services
      expect(container.has(SharedService)).toBe(true);
      expect(container.has(AnotherSharedService)).toBe(true);
      expect(container2.has(SharedService)).toBe(true);
      expect(container2.has(AnotherSharedService)).toBe(true);

      // Both containers can retrieve both services
      const service1FromContainer1 = container.get(SharedService);
      const service2FromContainer1 = container.get(AnotherSharedService);
      const service1FromContainer2 = container2.get(SharedService);
      const service2FromContainer2 = container2.get(AnotherSharedService);

      expect(service1FromContainer1).toBeInstanceOf(SharedService);
      expect(service2FromContainer1).toBeInstanceOf(AnotherSharedService);
      expect(service1FromContainer2).toBeInstanceOf(SharedService);
      expect(service2FromContainer2).toBeInstanceOf(AnotherSharedService);
    });

    describe("Request scope", () => {
      test("should handle request scope (behaves like singleton in this context)", () => {
        class RequestScopedService {
          private static instanceCount = 0;
          public readonly instanceId: number;

          constructor() {
            RequestScopedService.instanceCount++;
            this.instanceId = RequestScopedService.instanceCount;
          }

          public getId(): number {
            return this.instanceId;
          }
        }

        container.add(RequestScopedService, EContainerScope.Request);

        const instance1 = container.get(RequestScopedService);
        const instance2 = container.get(RequestScopedService);

        // In request scope, instances are created per request (behaves like transient in this simple context)
        expect(instance1.getId()).toBe(1);
        expect(instance2.getId()).toBe(2);
        expect(instance1).not.toBe(instance2);
      });
    });

    describe("Service removal", () => {
      test("should remove registered services", () => {
        class RemovableService {
          public getValue(): string {
            return "removable";
          }
        }

        container.add(RemovableService);
        expect(container.has(RemovableService)).toBe(true);

        container.remove(RemovableService);
        expect(container.has(RemovableService)).toBe(false);

        expect(() => container.get(RemovableService)).toThrow();
      });

      test("should handle removal of non-existent services gracefully", () => {
        class NonExistentService {
          public getValue(): string {
            return "non-existent";
          }
        }

        expect(() => container.remove(NonExistentService)).not.toThrow();
        expect(container.has(NonExistentService)).toBe(false);
      });
    });

    describe("Constant management", () => {
      test("should work with symbol-based constants", () => {
        const API_KEY = Symbol("api-key");
        const DATABASE_URL = Symbol("database-url");

        container.addConstant(API_KEY, "secret-api-key");
        container.addConstant(DATABASE_URL, "postgres://localhost:5432/test");

        expect(container.hasConstant(API_KEY)).toBe(true);
        expect(container.hasConstant(DATABASE_URL)).toBe(true);
        expect(container.getConstant<string>(API_KEY)).toBe("secret-api-key");
        expect(container.getConstant<string>(DATABASE_URL)).toBe("postgres://localhost:5432/test");
      });

      test("should handle constant removal", () => {
        const TEST_CONSTANT = "test-constant";
        const value = { test: "value" };

        container.addConstant(TEST_CONSTANT, value);
        expect(container.hasConstant(TEST_CONSTANT)).toBe(true);

        container.removeConstant(TEST_CONSTANT);
        expect(container.hasConstant(TEST_CONSTANT)).toBe(false);

        expect(() => container.getConstant(TEST_CONSTANT)).toThrow();
      });

      test("should handle removal of non-existent constants gracefully", () => {
        const NON_EXISTENT = "non-existent";

        expect(() => container.removeConstant(NON_EXISTENT)).not.toThrow();
        expect(container.hasConstant(NON_EXISTENT)).toBe(false);
      });

      test("should handle null and undefined constants", () => {
        const NULL_KEY = "null-key";
        const UNDEFINED_KEY = "undefined-key";

        container.addConstant(NULL_KEY, null);
        container.addConstant(UNDEFINED_KEY, undefined);

        expect(container.hasConstant(NULL_KEY)).toBe(true);
        expect(container.hasConstant(UNDEFINED_KEY)).toBe(true);
        expect(container.getConstant(NULL_KEY) as unknown).toBe(null);
        expect(container.getConstant(UNDEFINED_KEY)).toBe(undefined);
      });

      test("should throw error for unregistered constants", () => {
        const UNREGISTERED_KEY = "unregistered-constant";

        expect(container.hasConstant(UNREGISTERED_KEY)).toBe(false);
        expect(() => container.getConstant(UNREGISTERED_KEY)).toThrow();
      });

      test("should throw ContainerException with specific message for unregistered string constants", () => {
        const UNREGISTERED_KEY = "missing-string-constant";

        expect(() => container.getConstant(UNREGISTERED_KEY)).toThrow(
          `Failed to resolve constant: ${UNREGISTERED_KEY}`,
        );
      });

      test("should throw ContainerException with specific message for unregistered symbol constants", () => {
        const UNREGISTERED_SYMBOL = Symbol("missing-symbol");

        expect(() => container.getConstant(UNREGISTERED_SYMBOL)).toThrow(
          `Failed to resolve constant: ${UNREGISTERED_SYMBOL.toString()}`,
        );
      });

      test("should retrieve complex object constants correctly", () => {
        const COMPLEX_OBJECT_KEY = "complex-object";
        const complexObject = {
          nested: {
            array: [1, 2, 3],
            boolean: true,
            nullValue: null,
            undefinedValue: undefined,
          },
          function: () => "test",
          date: new Date("2023-01-01"),
        };

        container.addConstant(COMPLEX_OBJECT_KEY, complexObject);

        const retrieved = container.getConstant<typeof complexObject>(COMPLEX_OBJECT_KEY);
        expect(retrieved).toBe(complexObject);
        expect(retrieved.nested.array).toEqual([1, 2, 3]);
        expect(retrieved.nested.boolean).toBe(true);
        expect(retrieved.nested.nullValue).toBe(null);
        expect(retrieved.nested.undefinedValue).toBe(undefined);
        expect(typeof retrieved.function).toBe("function");
        expect(retrieved.function()).toBe("test");
        expect(retrieved.date).toBeInstanceOf(Date);
      });

      test("should retrieve primitive constants with correct types", () => {
        const STRING_KEY = "string-test";
        const NUMBER_KEY = "number-test";
        const BOOLEAN_KEY = "boolean-test";
        const BIGINT_KEY = "bigint-test";

        container.addConstant(STRING_KEY, "hello world");
        container.addConstant(NUMBER_KEY, 42);
        container.addConstant(BOOLEAN_KEY, true);
        container.addConstant(BIGINT_KEY, BigInt(9_007_199_254_740_991));

        expect(container.getConstant<string>(STRING_KEY)).toBe("hello world");
        expect(container.getConstant<number>(NUMBER_KEY)).toBe(42);
        expect(container.getConstant<boolean>(BOOLEAN_KEY)).toBe(true);
        expect(container.getConstant<bigint>(BIGINT_KEY)).toBe(BigInt(9_007_199_254_740_991));
      });

      test("should handle symbol constants with different symbol types", () => {
        const GLOBAL_SYMBOL = Symbol.for("global-symbol");
        const LOCAL_SYMBOL = Symbol("local-symbol");

        container.addConstant(GLOBAL_SYMBOL, "global-value");
        container.addConstant(LOCAL_SYMBOL, "local-value");

        expect(container.getConstant<string>(GLOBAL_SYMBOL)).toBe("global-value");
        expect(container.getConstant<string>(LOCAL_SYMBOL)).toBe("local-value");
      });

      test("should maintain constant immutability after retrieval", () => {
        const IMMUTABLE_KEY = "immutable-test";
        const originalObject = { count: 1, data: ["a", "b"] };

        container.addConstant(IMMUTABLE_KEY, originalObject);

        const retrieved1 = container.getConstant<typeof originalObject>(IMMUTABLE_KEY);
        const retrieved2 = container.getConstant<typeof originalObject>(IMMUTABLE_KEY);

        // Should be the same reference
        expect(retrieved1).toBe(retrieved2);
        expect(retrieved1).toBe(originalObject);

        // Modifying the retrieved object affects the original (this is expected behavior)
        retrieved1.count = 999;
        expect(container.getConstant<typeof originalObject>(IMMUTABLE_KEY).count).toBe(999);
      });

      test("should handle empty string and numeric zero constants", () => {
        const EMPTY_STRING_KEY = "empty-string";
        const ZERO_KEY = "zero-number";
        const FALSE_KEY = "false-boolean";

        container.addConstant(EMPTY_STRING_KEY, "");
        container.addConstant(ZERO_KEY, 0);
        container.addConstant(FALSE_KEY, false);

        expect(container.getConstant<string>(EMPTY_STRING_KEY)).toBe("");
        expect(container.getConstant<number>(ZERO_KEY)).toBe(0);
        expect(container.getConstant<boolean>(FALSE_KEY)).toBe(false);

        // These should still be considered as valid constants
        expect(container.hasConstant(EMPTY_STRING_KEY)).toBe(true);
        expect(container.hasConstant(ZERO_KEY)).toBe(true);
        expect(container.hasConstant(FALSE_KEY)).toBe(true);
      });

      test("should handle class instances as constants", () => {
        class TestClass {
          constructor(public value: string) {}
          getValue() {
            return this.value;
          }
        }

        const CLASS_INSTANCE_KEY = "class-instance";
        const instance = new TestClass("test-value");

        container.addConstant(CLASS_INSTANCE_KEY, instance);

        const retrieved = container.getConstant<TestClass>(CLASS_INSTANCE_KEY);
        expect(retrieved).toBe(instance);
        expect(retrieved.getValue()).toBe("test-value");
        expect(retrieved).toBeInstanceOf(TestClass);
      });

      test("should handle function constants", () => {
        const FUNCTION_KEY = "function-constant";
        const testFunction = (x: number, y: number) => x + y;

        container.addConstant(FUNCTION_KEY, testFunction);

        const retrieved = container.getConstant<typeof testFunction>(FUNCTION_KEY);
        expect(retrieved).toBe(testFunction);
        expect(typeof retrieved).toBe("function");
        expect(retrieved(2, 3)).toBe(5);
      });

      test("should handle array constants with mixed types", () => {
        const ARRAY_KEY = "mixed-array";
        const mixedArray = [1, "string", true, null, { nested: "object" }, [1, 2, 3]];

        container.addConstant(ARRAY_KEY, mixedArray);

        const retrieved = container.getConstant<typeof mixedArray>(ARRAY_KEY);
        expect(retrieved).toBe(mixedArray);
        expect(Array.isArray(retrieved)).toBe(true);
        expect(retrieved[0]).toBe(1);
        expect(retrieved[1]).toBe("string");
        expect(retrieved[2]).toBe(true);
        expect(retrieved[3]).toBe(null);
        expect(retrieved[4]).toEqual({ nested: "object" });
        expect(retrieved[5]).toEqual([1, 2, 3]);
      });

      test("should throw ContainerException type for unregistered constants", () => {
        const MISSING_KEY = "definitely-missing";

        try {
          container.getConstant(MISSING_KEY);
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect((error as Error & { name: string }).name).toBe("ContainerException");
          expect((error as Error).message).toContain("Failed to resolve constant");
          expect((error as Error).message).toContain(MISSING_KEY);
        }
      });

      test("should handle Map and Set constants", () => {
        const MAP_KEY = "map-constant";
        const SET_KEY = "set-constant";

        const testMap = new Map([
          ["key1", "value1"],
          ["key2", "value2"],
        ]);
        const testSet = new Set([1, 2, 3, 4]);

        container.addConstant(MAP_KEY, testMap);
        container.addConstant(SET_KEY, testSet);

        const retrievedMap = container.getConstant<Map<string, string>>(MAP_KEY);
        const retrievedSet = container.getConstant<Set<number>>(SET_KEY);

        expect(retrievedMap).toBe(testMap);
        expect(retrievedMap.get("key1")).toBe("value1");
        expect(retrievedMap.size).toBe(2);

        expect(retrievedSet).toBe(testSet);
        expect(retrievedSet.has(3)).toBe(true);
        expect(retrievedSet.size).toBe(4);
      });

      test("should handle RegExp constants", () => {
        const REGEX_KEY = "regex-constant";
        const testRegex = /^[a-z]+$/i;

        container.addConstant(REGEX_KEY, testRegex);

        const retrieved = container.getConstant<RegExp>(REGEX_KEY);
        expect(retrieved).toBe(testRegex);
        expect(retrieved.test("hello")).toBe(true);
        expect(retrieved.test("123")).toBe(false);
      });
    });

    describe("Service overriding", () => {
      test("should allow overriding existing services", () => {
        class OriginalService {
          public getValue(): string {
            return "original";
          }
        }

        container.add(OriginalService);
        let service = container.get(OriginalService);
        expect(service.getValue()).toBe("original");

        // Override with same class but different scope
        container.add(OriginalService, EContainerScope.Transient);
        service = container.get(OriginalService);
        expect(service.getValue()).toBe("original");
      });

      test("should allow overriding existing constants", () => {
        const CONFIG_KEY = "config";

        container.addConstant(CONFIG_KEY, { version: "1.0.0" });
        expect(container.getConstant<{ version: string }>(CONFIG_KEY).version).toBe("1.0.0");

        container.addConstant(CONFIG_KEY, { version: "2.0.0" });
        expect(container.getConstant<{ version: string }>(CONFIG_KEY).version).toBe("2.0.0");
      });
    });

    describe("Simple service composition", () => {
      test("should work with services that manually get dependencies", () => {
        class DatabaseService {
          public connect(): string {
            return "connected to database";
          }
        }

        class LoggerService {
          public log(message: string): string {
            return `LOG: ${message}`;
          }
        }

        class UserService {
          private database: DatabaseService;
          private logger: LoggerService;

          constructor() {
            // Manual dependency resolution since auto-injection requires decorators
            this.database = container.get(DatabaseService);
            this.logger = container.get(LoggerService);
          }

          public createUser(name: string): string {
            const dbResult = this.database.connect();
            const logResult = this.logger.log(`Creating user: ${name}`);
            return `${dbResult} - ${logResult}`;
          }
        }

        container.add(DatabaseService);
        container.add(LoggerService);
        container.add(UserService);

        const userService = container.get(UserService);
        const result = userService.createUser("John");

        expect(result).toBe("connected to database - LOG: Creating user: John");
      });

      test("should handle manual dependency chains", () => {
        class ConfigService {
          public getDbUrl(): string {
            return "postgres://localhost:5432";
          }
        }

        class DatabaseService {
          private config: ConfigService;

          constructor() {
            this.config = container.get(ConfigService);
          }

          public connect(): string {
            return `connected to ${this.config.getDbUrl()}`;
          }
        }

        class CacheService {
          public get(key: string): string {
            return `cached_${key}`;
          }
        }

        class UserRepository {
          private database: DatabaseService;
          private cache: CacheService;

          constructor() {
            this.database = container.get(DatabaseService);
            this.cache = container.get(CacheService);
          }

          public findUser(id: string): string {
            const dbConnection = this.database.connect();
            const cachedData = this.cache.get(`user_${id}`);
            return `${dbConnection} - ${cachedData}`;
          }
        }

        class UserService {
          private userRepo: UserRepository;

          constructor() {
            this.userRepo = container.get(UserRepository);
          }

          public getUser(id: string): string {
            return this.userRepo.findUser(id);
          }
        }

        container.add(ConfigService);
        container.add(DatabaseService);
        container.add(CacheService);
        container.add(UserRepository);
        container.add(UserService);

        const userService = container.get(UserService);
        const result = userService.getUser("123");

        expect(result).toBe("connected to postgres://localhost:5432 - cached_user_123");
      });

      test("should handle singleton dependencies correctly with manual resolution", () => {
        class SingletonService {
          private static instanceCount = 0;
          public readonly instanceId: number;

          constructor() {
            SingletonService.instanceCount++;
            this.instanceId = SingletonService.instanceCount;
          }
        }

        class ServiceA {
          public singleton: SingletonService;

          constructor() {
            this.singleton = container.get(SingletonService);
          }
        }

        class ServiceB {
          public singleton: SingletonService;

          constructor() {
            this.singleton = container.get(SingletonService);
          }
        }

        container.add(SingletonService, EContainerScope.Singleton);
        container.add(ServiceA);
        container.add(ServiceB);

        const serviceA = container.get(ServiceA);
        const serviceB = container.get(ServiceB);

        expect(serviceA.singleton.instanceId).toBe(1);
        expect(serviceB.singleton.instanceId).toBe(1);
        expect(serviceA.singleton).toBe(serviceB.singleton);
      });
    });

    describe("Mixed constants and services", () => {
      test("should inject constants into services", () => {
        const DB_CONFIG = Symbol("db-config");
        const API_URL = "api-url";

        interface DbConfig {
          host: string;
          port: number;
        }

        class ApiService {
          public getEndpoint(): string {
            const apiUrl = container.getConstant<string>(API_URL);
            return `${apiUrl}/users`;
          }
        }

        class DatabaseService {
          public connect(): string {
            const config = container.getConstant<DbConfig>(DB_CONFIG);
            return `connected to ${config.host}:${config.port}`;
          }
        }

        const dbConfig: DbConfig = { host: "localhost", port: 5432 };

        container.addConstant(DB_CONFIG, dbConfig);
        container.addConstant(API_URL, "https://api.example.com");
        container.add(ApiService);
        container.add(DatabaseService);

        const apiService = container.get(ApiService);
        const dbService = container.get(DatabaseService);

        expect(apiService.getEndpoint()).toBe("https://api.example.com/users");
        expect(dbService.connect()).toBe("connected to localhost:5432");
      });
    });

    describe("Edge cases and error handling", () => {
      test("should handle services with no constructor", () => {
        class SimpleService {
          getValue = () => "simple";
        }

        container.add(SimpleService);
        const service = container.get(SimpleService);

        expect(service.getValue()).toBe("simple");
      });

      test("should handle empty string constants", () => {
        const EMPTY_KEY = "empty";

        container.addConstant(EMPTY_KEY, "");
        expect(container.getConstant<string>(EMPTY_KEY)).toBe("");
      });

      test("should handle complex object constants", () => {
        const COMPLEX_CONFIG = "complex-config";

        const config = {
          database: {
            host: "localhost",
            port: 5432,
            credentials: {
              username: "admin",
              password: "secret",
            },
          },
          features: ["auth", "logging", "caching"],
          metadata: {
            version: "1.0.0",
            author: "test",
          },
        };

        container.addConstant(COMPLEX_CONFIG, config);
        const retrieved = container.getConstant<typeof config>(COMPLEX_CONFIG);

        expect(retrieved.database.host).toBe("localhost");
        expect(retrieved.features).toEqual(["auth", "logging", "caching"]);
        expect(retrieved.metadata.version).toBe("1.0.0");
      });
    });
  });

  describe("Auto-injectable", () => {
    test("should automatically apply @injectable() to classes without it", () => {
      // Plain class without @injectable() decorator
      class PlainController {
        public handle(): string {
          return "handled";
        }
      }

      container.add(PlainController);
      const instance = container.get(PlainController);
      expect(instance).toBeInstanceOf(PlainController);
      expect(instance.handle()).toBe("handled");
    });

    test("should auto-inject across all scopes", () => {
      class ScopedPlainClass {
        private static count = 0;
        public readonly id: number;

        constructor() {
          ScopedPlainClass.count++;
          this.id = ScopedPlainClass.count;
        }
      }

      // Transient scope with auto-injectable
      container.add(ScopedPlainClass, EContainerScope.Transient);
      const instance1 = container.get(ScopedPlainClass);
      const instance2 = container.get(ScopedPlainClass);
      expect(instance1).not.toBe(instance2);
      expect(instance1.id).not.toBe(instance2.id);
    });
  });

  describe("injectable decorator", () => {
    test("should register class in shared container with default singleton scope", () => {
      @injectable()
      class AutoRegisteredService {
        public run(): string {
          return "auto-registered";
        }
      }

      expect(sharedContainer.has(AutoRegisteredService)).toBe(true);
      const instance1 = sharedContainer.get(AutoRegisteredService);
      const instance2 = sharedContainer.get(AutoRegisteredService);
      expect(instance1).toBeInstanceOf(AutoRegisteredService);
      expect(instance1.run()).toBe("auto-registered");
      expect(instance1).toBe(instance2);
    });

    test("should register class with transient scope", () => {
      @injectable(EContainerScope.Transient)
      class TransientAutoService {
        private static count = 0;
        public readonly id: number;

        constructor() {
          TransientAutoService.count++;
          this.id = TransientAutoService.count;
        }
      }

      expect(sharedContainer.has(TransientAutoService)).toBe(true);
      const instance1 = sharedContainer.get(TransientAutoService);
      const instance2 = sharedContainer.get(TransientAutoService);
      expect(instance1).not.toBe(instance2);
      expect(instance1.id).not.toBe(instance2.id);
    });

    test("should register class with request scope", () => {
      @injectable(EContainerScope.Request)
      class RequestAutoService {
        public process(): string {
          return "request-scoped";
        }
      }

      expect(sharedContainer.has(RequestAutoService)).toBe(true);
      const instance = sharedContainer.get(RequestAutoService);
      expect(instance).toBeInstanceOf(RequestAutoService);
      expect(instance.process()).toBe("request-scoped");
    });
  });

  describe("addConstant with resolved service", () => {
    test("should add and retrieve service as constant", () => {
      class TestService {
        public getValue(): string {
          return "test-value";
        }
      }

      container.add(TestService);
      container.addConstant("testService", container.get(TestService));

      const service = container.getConstant<TestService>("testService");
      expect(service.getValue()).toBe("test-value");
    });

    test("should throw error for non-existent constant", () => {
      expect(() => {
        container.getConstant("nonExistentConstant");
      }).toThrow("Failed to resolve constant: nonExistentConstant");
    });

    test("should check if constant exists using hasConstant", () => {
      class ConstantTestService {
        public process(): string {
          return "processed";
        }
      }

      container.add(ConstantTestService);
      container.addConstant("constantTest", container.get(ConstantTestService));

      expect(container.hasConstant("constantTest")).toBe(true);
      expect(container.hasConstant("nonExistentConstant")).toBe(false);
    });

    test("should remove constant using removeConstant", () => {
      class RemovableConstantService {
        public getData(): string {
          return "data";
        }
      }

      container.add(RemovableConstantService);
      container.addConstant("removableConstant", container.get(RemovableConstantService));

      expect(container.hasConstant("removableConstant")).toBe(true);
      container.removeConstant("removableConstant");
      expect(container.hasConstant("removableConstant")).toBe(false);
    });

    test("should allow multiple constants for the same service", () => {
      class MultiConstantService {
        public performAction(): string {
          return "action-performed";
        }
      }

      container.add(MultiConstantService);
      const instance = container.get(MultiConstantService);
      container.addConstant("firstConstant", instance);
      container.addConstant("secondConstant", instance);

      const service1 = container.getConstant<MultiConstantService>("firstConstant");
      const service2 = container.getConstant<MultiConstantService>("secondConstant");

      expect(service1.performAction()).toBe("action-performed");
      expect(service2.performAction()).toBe("action-performed");

      // Both should be the same instance
      expect(service1).toBe(service2);
    });
  });

  describe("Constructor injection", () => {
    class Env {
      public readonly name = "env";
    }

    test("should resolve class dependencies declared with @inject through a chain", () => {
      class Repository {
        constructor(@inject(Env) public readonly env: Env) {}
      }

      class Service {
        constructor(
          @inject(Repository) public readonly repository: Repository,
          @inject(Env) public readonly env: Env,
        ) {}
      }

      container.add(Env);
      container.add(Repository);
      container.add(Service);

      const service = container.get(Service);

      expect(service.repository).toBeInstanceOf(Repository);
      expect(service.env).toBeInstanceOf(Env);
      expect(service.repository.env).toBe(service.env);
    });

    test("should inject string and symbol constants into constructors", () => {
      const DATABASE = "database";
      const SECRET = Symbol("secret");

      class Repository {
        constructor(
          @inject(DATABASE) public readonly database: { name: string },
          @inject(SECRET) public readonly secret: string,
        ) {}
      }

      container.addConstant(DATABASE, { name: "main" });
      container.addConstant(SECRET, "s3cr3t");
      container.add(Repository);

      const repository = container.get(Repository);

      expect(repository.database).toEqual({ name: "main" });
      expect(repository.secret).toBe("s3cr3t");
    });

    test("should leave an undecorated parameter with a default value to the constructor", () => {
      class Cache {
        constructor(
          @inject(Env) public readonly env: Env,
          public readonly options: { ttl: number } = { ttl: 60 },
        ) {}
      }

      container.add(Env);
      container.add(Cache);

      const cache = container.get(Cache);

      expect(cache.env).toBeInstanceOf(Env);
      expect(cache.options).toEqual({ ttl: 60 });
    });

    test("should resolve a decorated parameter that sits past a defaulted one", () => {
      class Database {
        constructor(
          public readonly options: { pool: number } = { pool: 10 },
          @inject(Env) public readonly env: Env = new Env(),
        ) {}
      }

      container.add(Env);
      container.add(Database);

      const database = container.get(Database);

      expect(database.options).toEqual({ pool: 10 });
      expect(database.env).toBe(container.get(Env));
    });

    test("should share a singleton dependency between consumers and renew a transient one", () => {
      class Shared {}
      class Fresh {}

      class Consumer {
        constructor(
          @inject(Shared) public readonly shared: Shared,
          @inject(Fresh) public readonly fresh: Fresh,
        ) {}
      }

      container.add(Shared, EContainerScope.Singleton);
      container.add(Fresh, EContainerScope.Transient);
      container.add(Consumer, EContainerScope.Transient);

      const first = container.get(Consumer);
      const second = container.get(Consumer);

      expect(first).not.toBe(second);
      expect(first.shared).toBe(second.shared);
      expect(first.fresh).not.toBe(second.fresh);
    });

    test("should share a request-scoped dependency within one resolution only", () => {
      class RequestContext {
        private static count = 0;
        public readonly id: number;

        constructor() {
          RequestContext.count++;
          this.id = RequestContext.count;
        }
      }

      class Repository {
        constructor(@inject(RequestContext) public readonly context: RequestContext) {}
      }

      class Service {
        constructor(
          @inject(RequestContext) public readonly context: RequestContext,
          @inject(Repository) public readonly repository: Repository,
        ) {}
      }

      container.add(RequestContext, EContainerScope.Request);
      container.add(Repository, EContainerScope.Transient);
      container.add(Service, EContainerScope.Transient);

      const first = container.get(Service);
      const second = container.get(Service);

      expect(first.context).toBe(first.repository.context);
      expect(first.context.id).toBe(1);
      expect(second.context).toBe(second.repository.context);
      expect(second.context.id).toBe(2);
    });

    test("should pass constructor parameters in order for every arity", () => {
      class One {
        constructor(@inject("p1") public readonly p1: string) {}
      }

      class Two {
        constructor(
          @inject("p1") public readonly p1: string,
          @inject("p2") public readonly p2: string,
        ) {}
      }

      class Three {
        constructor(
          @inject("p1") public readonly p1: string,
          @inject("p2") public readonly p2: string,
          @inject("p3") public readonly p3: string,
        ) {}
      }

      class Four {
        constructor(
          @inject("p1") public readonly p1: string,
          @inject("p2") public readonly p2: string,
          @inject("p3") public readonly p3: string,
          public readonly p4: string = "default-4",
        ) {}
      }

      class Five {
        constructor(
          @inject("p1") public readonly p1: string,
          @inject("p2") public readonly p2: string,
          @inject("p3") public readonly p3: string,
          @inject("p4") public readonly p4: string,
          public readonly p5: string = "default-5",
        ) {}
      }

      for (const key of ["p1", "p2", "p3", "p4", "p5"]) {
        container.addConstant(key, `value-${key}`);
      }

      for (const target of [One, Two, Three, Four, Five]) {
        container.add(target, EContainerScope.Transient);
      }

      expect(container.get(One)).toEqual({ p1: "value-p1" });
      expect(container.get(Two)).toEqual({ p1: "value-p1", p2: "value-p2" });
      expect(container.get(Three)).toEqual({ p1: "value-p1", p2: "value-p2", p3: "value-p3" });
      expect(container.get(Four)).toEqual({ p1: "value-p1", p2: "value-p2", p3: "value-p3", p4: "default-4" });
      expect(container.get(Five)).toEqual({
        p1: "value-p1",
        p2: "value-p2",
        p3: "value-p3",
        p4: "value-p4",
        p5: "default-5",
      });
    });

    test("should keep a get() issued from inside a constructor as its own request", () => {
      class RequestContext {
        private static count = 0;
        public readonly id: number;

        constructor() {
          RequestContext.count++;
          this.id = RequestContext.count;
        }
      }

      class Nested {
        constructor(@inject(RequestContext) public readonly context: RequestContext) {}
      }

      class Outer {
        public readonly nested: Nested;

        constructor(@inject(RequestContext) public readonly context: RequestContext) {
          this.nested = container.get(Nested);
        }
      }

      class Root {
        constructor(
          @inject(Outer) public readonly outer: Outer,
          @inject(RequestContext) public readonly context: RequestContext,
        ) {}
      }

      container.add(RequestContext, EContainerScope.Request);
      container.add(Nested, EContainerScope.Transient);
      container.add(Outer, EContainerScope.Transient);
      container.add(Root, EContainerScope.Transient);

      const root = container.get(Root);

      // the outer request survives the nested get() and keeps sharing its own instance
      expect(root.context).toBe(root.outer.context);
      expect(root.context.id).toBe(1);
      // the nested get() got a request of its own
      expect(root.outer.nested.context).not.toBe(root.context);
      expect(root.outer.nested.context.id).toBe(2);
    });

    test("should catch a cycle that runs through a get() issued from inside a constructor", () => {
      class Outer {
        public static cyclic = true;

        constructor(@inject(Env) public readonly env: Env) {
          if (Outer.cyclic) {
            container.get(Inner);
          }
        }
      }

      class Inner {
        constructor(@inject(Outer) public readonly outer: Outer) {}
      }

      container.add(Env);
      container.add(Outer);
      container.add(Inner);

      expect(() => container.get(Outer)).toThrow("Circular dependency found: Outer -> Inner -> Outer");

      // the failed resolution left no trace behind: the same class resolves once the cycle is gone
      Outer.cyclic = false;
      expect(container.get(Outer).env).toBeInstanceOf(Env);
      expect(container.get(Inner).outer).toBe(container.get(Outer));
    });

    test("should resolve a subclass through its own decorated constructor", () => {
      abstract class BaseDatabase {
        constructor(public readonly env: Env) {}

        public abstract kind(): string;
      }

      class PgDatabase extends BaseDatabase {
        constructor(@inject(Env) env: Env) {
          super(env);
        }

        public kind(): string {
          return "pg";
        }
      }

      container.add(Env);
      container.add(PgDatabase);

      const database = container.get(PgDatabase);

      expect(database.kind()).toBe("pg");
      expect(database.env).toBe(container.get(Env));
    });

    test("should drop the cached singleton when a service is added again", () => {
      class Counter {}

      container.add(Counter);
      const first = container.get(Counter);

      container.add(Counter);
      const second = container.get(Counter);

      expect(second).toBeInstanceOf(Counter);
      expect(second).not.toBe(first);
    });

    test("should name both services when a nested dependency is not bound", () => {
      class Mailer {}

      class Notifier {
        constructor(@inject(Mailer) public readonly mailer: Mailer) {}
      }

      container.add(Notifier);

      expect(() => container.get(Notifier)).toThrow(
        'Failed to resolve dependency: Notifier. No bindings found for service: "Mailer" (injected into "Notifier")',
      );
    });

    test("should throw when a required constructor parameter has no @inject", () => {
      class NeedsConfig {
        constructor(public readonly config: { url: string }) {}
      }

      container.add(NeedsConfig);

      expect(() => container.get(NeedsConfig)).toThrow(
        'Failed to resolve dependency: NeedsConfig. Missing @inject on constructor parameter 0 of "NeedsConfig": every required constructor parameter must be decorated',
      );
    });

    test("should report a circular dependency with its trace", () => {
      class ServiceA {
        constructor(public readonly b: unknown) {}
      }

      class ServiceB {
        constructor(public readonly a: unknown) {}
      }

      inject(ServiceB)(ServiceA, undefined, 0);
      inject(ServiceA)(ServiceB, undefined, 0);

      container.add(ServiceA);
      container.add(ServiceB);

      try {
        container.get(ServiceA);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        const exception = error as ContainerException;
        expect(exception).toBeInstanceOf(ContainerException);
        expect(exception.key).toBe("SERVICE_RESOLVE_FAILED");
        expect(exception.message).toBe(
          "Failed to resolve dependency: ServiceA. Circular dependency found: ServiceA -> ServiceB -> ServiceA",
        );
      }
    });

    test("should report a service depending on itself", () => {
      class Ouroboros {
        constructor(@inject(Ouroboros) public readonly self: Ouroboros) {}
      }

      container.add(Ouroboros, EContainerScope.Transient);

      expect(() => container.get(Ouroboros)).toThrow("Circular dependency found: Ouroboros -> Ouroboros");
    });

    test("should wrap a constructor failure and retry on the next resolution", () => {
      let attempts = 0;

      class Flaky {
        constructor() {
          attempts++;
          if (attempts === 1) {
            throw new Error("not ready");
          }
        }
      }

      container.add(Flaky);

      expect(() => container.get(Flaky)).toThrow("Failed to resolve dependency: Flaky. not ready");
      expect(container.get(Flaky)).toBeInstanceOf(Flaky);
      expect(attempts).toBe(2);
    });
  });
});
