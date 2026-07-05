import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import { container } from "@talosjs/container";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { RoleException } from "@talosjs/role";
import { App } from "@/App";
import type { AppConfigType } from "@/types";

// mock.module is hoisted by bun:test before static imports resolve
let generateRolesTypesMock!: ReturnType<typeof mock<(_config: unknown) => string>>;

mock.module("@talosjs/role", () => {
  generateRolesTypesMock = mock((_config: unknown) => "/* mocked role types */");

  class MockRoleException extends Error {
    public readonly key: string;
    constructor(key: string) {
      super(key);
      this.key = key;
    }
  }

  const mockValidateConfig = (config: { roles: Record<string, unknown>; hierarchy: Record<string, unknown> }): void => {
    const required = ["GUEST", "TRIAL_USER", "USER", "PREMIUM_USER", "ADMIN", "SUPER_ADMIN", "SYSTEM"];
    for (const key of required) {
      if (!config.roles[key]) throw new MockRoleException(`roles.${key}`);
    }
    for (const [roleKey, entry] of Object.entries(config.hierarchy)) {
      const e = entry as Record<string, unknown>;
      if (typeof e.level !== "number" || !Number.isFinite(e.level)) throw new MockRoleException(roleKey);
      if (!e.description || !(e.description as string).trim()) throw new MockRoleException(roleKey);
    }
    for (const value of Object.values(config.roles)) {
      if (!config.hierarchy[value as string]) throw new MockRoleException(value as string);
    }
  };

  return {
    generateRolesTypes: generateRolesTypesMock,
    validateConfig: mockValidateConfig,
    RoleException: MockRoleException,
  };
});

class MockLogger {
  init = mock(() => {});
  info = mock(() => {});
  error = mock(() => {});
  warn = mock(() => {});
  debug = mock(() => {});
  log = mock(() => {});
  success = mock(() => {});
}

class MockCache {
  get = mock(() => null);
  set = mock(() => {});
}

class MockRateLimiter {
  check = mock(() => true);
}

class MockOnException {
  init = mock(() => {});
  info = mock(() => {});
  error = mock(() => {});
  warn = mock(() => {});
  debug = mock(() => {});
  log = mock(() => {});
  success = mock(() => {});
}

class MockOnStart {
  handle = mock(() => {});
}

// Register mock classes with the container before tests run
container.add(MockLogger);
container.add(MockCache);
container.add(MockRateLimiter);
container.add(MockOnException);
container.add(MockOnStart);

const createMockConfig = (overrides: Record<string, unknown> = {}): AppConfigType => {
  const base = {
    routing: { prefix: "/api/v1" },
    loggers: [MockLogger as unknown as AppConfigType["loggers"][0]],
  };
  return { ...base, ...overrides } as unknown as AppConfigType;
};

describe("App", () => {
  const originalEnv = { ...Bun.env };

  beforeEach(() => {
    Bun.env.APP_ENV = "development";
    Bun.env.PORT = "3000";
    Bun.env.HOST_NAME = "localhost";
    container.add(AppEnv);
  });

  afterEach(() => {
    Bun.env.APP_ENV = originalEnv.APP_ENV;
    Bun.env.PORT = originalEnv.PORT;
    Bun.env.HOST_NAME = originalEnv.HOST_NAME;
  });

  describe("constructor", () => {
    test("initializes loggers and adds them to container", () => {
      const config = createMockConfig();

      new App(config);

      expect(container.has(MockLogger)).toBe(true);
    });

    test("calls init on each logger", () => {
      const config = createMockConfig();

      new App(config);

      const logger = container.get(MockLogger) as MockLogger;
      expect(logger.init).toHaveBeenCalled();
    });

    test("registers AppEnv in container if not already present", () => {
      container.remove(AppEnv);

      const config = createMockConfig();
      new App(config);

      expect(container.has(AppEnv)).toBe(true);
    });

    test("registers cron jobs in the container when provided", () => {
      class TestCronJob {
        start = mock(() => {});
        stop = mock(() => {});
      }

      // Register TestCronJob with the container before using it
      container.add(TestCronJob);

      const config = createMockConfig({
        cronJobs: [TestCronJob as unknown as AppConfigType["cronJobs"] extends (infer T)[] | undefined ? T : never],
      });

      new App(config);

      expect(container.has(TestCronJob)).toBe(true);
    });

    test("adds cache to container and registers constant when provided", () => {
      const config = createMockConfig({
        cache: MockCache as unknown as AppConfigType["cache"],
      });

      new App(config);

      expect(container.has(MockCache)).toBe(true);
      expect(container.hasConstant("cache")).toBe(true);
    });

    test("adds rateLimiter to container and registers constant when provided", () => {
      const config = createMockConfig({
        rateLimiter: MockRateLimiter as unknown as AppConfigType["rateLimiter"],
      });

      new App(config);

      expect(container.has(MockRateLimiter)).toBe(true);
      expect(container.hasConstant("rateLimiter")).toBe(true);
    });

    test("adds onException to container and registers exception.logger constant when provided", () => {
      const config = createMockConfig({
        onException: MockOnException as unknown as AppConfigType["onException"],
      });

      new App(config);

      expect(container.has(MockOnException)).toBe(true);
      expect(container.hasConstant("exception.logger")).toBe(true);
    });

    test("adds onStart to container and registers app.event.start constant when provided", () => {
      const config = createMockConfig({
        onStart: MockOnStart as unknown as AppConfigType["onStart"],
      });

      new App(config);

      expect(container.has(MockOnStart)).toBe(true);
      expect(container.hasConstant("app.event.start")).toBe(true);
    });

    test("registers logger constant", () => {
      const config = createMockConfig();

      new App(config);

      expect(container.hasConstant("logger")).toBe(true);
    });

    test("handles config without optional dependencies", () => {
      const config = createMockConfig();

      const app = new App(config);

      expect(app).toBeInstanceOf(App);
    });

    test("processes multiple loggers and calls init on each", () => {
      class Logger1 {
        init = mock(() => {});
        info = mock(() => {});
        error = mock(() => {});
        warn = mock(() => {});
        debug = mock(() => {});
        log = mock(() => {});
        success = mock(() => {});
      }
      class Logger2 {
        init = mock(() => {});
        info = mock(() => {});
        error = mock(() => {});
        warn = mock(() => {});
        debug = mock(() => {});
        log = mock(() => {});
        success = mock(() => {});
      }

      // Register loggers with the container before using them
      container.add(Logger1);
      container.add(Logger2);

      const config = createMockConfig({
        loggers: [Logger1 as unknown as AppConfigType["loggers"][0], Logger2 as unknown as AppConfigType["loggers"][0]],
      });

      new App(config);

      expect(container.has(Logger1)).toBe(true);
      expect(container.has(Logger2)).toBe(true);
      const logger1 = container.get(Logger1) as Logger1;
      const logger2 = container.get(Logger2) as Logger2;
      expect(logger1.init).toHaveBeenCalled();
      expect(logger2.init).toHaveBeenCalled();
    });

    test("registers multiple cron jobs in the container", () => {
      class Cron1 {
        start = mock(() => {});
      }
      class Cron2 {
        start = mock(() => {});
      }

      // Register cron jobs with the container before using them
      container.add(Cron1);
      container.add(Cron2);

      const config = createMockConfig({
        cronJobs: [
          Cron1 as unknown as AppConfigType["cronJobs"] extends (infer T)[] | undefined ? T : never,
          Cron2 as unknown as AppConfigType["cronJobs"] extends (infer T)[] | undefined ? T : never,
        ],
      });

      new App(config);

      expect(container.has(Cron1)).toBe(true);
      expect(container.has(Cron2)).toBe(true);
    });
  });

  describe("init", () => {
    test("returns App instance when all validations pass", async () => {
      Bun.env.APP_ENV = "development";
      Bun.env.PORT = "3000";
      Bun.env.HOST_NAME = "localhost";

      const config = createMockConfig();
      const app = new App(config);

      const result = await app.init();

      expect(result).toBeInstanceOf(App);
    });

    test("throws Exception when APP_ENV is invalid", async () => {
      Bun.env.APP_ENV = "invalid_env";

      const config = createMockConfig();
      const app = new App(config);

      expect(app.init()).rejects.toThrow(Exception);
    });

    test("throws Exception with correct status when APP_ENV is invalid", async () => {
      Bun.env.APP_ENV = "invalid_env";

      const config = createMockConfig();
      const app = new App(config);

      try {
        await app.init();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Exception);
        expect((error as Exception).status).toBe(HttpStatus.Code.InternalServerError);
        expect((error as Exception).message).toContain(
          'Invalid APP_ENV "invalid_env": set the APP_ENV environment variable',
        );
        expect((error as Exception).key).toBe("INVALID_APP_ENV");
      }
    });

    test("throws Exception when PORT is invalid", async () => {
      Bun.env.APP_ENV = "development";
      Bun.env.PORT = "-1";

      const config = createMockConfig();
      const app = new App(config);

      try {
        await app.init();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Exception);
        expect((error as Exception).message).toContain('Invalid PORT "-1": set the PORT environment variable');
        expect((error as Exception).key).toBe("INVALID_PORT");
      }
    });

    test("throws Exception when PORT is not a number", async () => {
      Bun.env.APP_ENV = "development";
      Bun.env.PORT = "not_a_port";

      const config = createMockConfig();
      const app = new App(config);

      try {
        await app.init();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Exception);
        expect((error as Exception).message).toContain("Invalid PORT");
        expect((error as Exception).message).toContain(
          "set the PORT environment variable to a number between 1 and 65535",
        );
        expect((error as Exception).key).toBe("INVALID_PORT");
      }
    });

    test("throws Exception when HOST_NAME is invalid", async () => {
      Bun.env.APP_ENV = "development";
      Bun.env.PORT = "3000";
      Bun.env.HOST_NAME = "invalid host name with spaces";

      const config = createMockConfig();
      const app = new App(config);

      try {
        await app.init();
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Exception);
        expect((error as Exception).message).toContain("Invalid HOST_NAME");
        expect((error as Exception).message).toContain(
          "set the HOST_NAME environment variable to a valid hostname or IP address",
        );
        expect((error as Exception).key).toBe("INVALID_HOST_NAME");
      }
    });

    test("uses default port 3000 when PORT is not set", async () => {
      Bun.env.APP_ENV = "development";
      Bun.env.PORT = undefined;
      Bun.env.HOST_NAME = "localhost";

      const config = createMockConfig();
      const app = new App(config);

      const result = await app.init();

      expect(result).toBeInstanceOf(App);
    });

    test("uses empty string for hostname when HOST_NAME is not set", async () => {
      Bun.env.APP_ENV = "development";
      Bun.env.PORT = "3000";
      Bun.env.HOST_NAME = undefined;

      const config = createMockConfig();
      const app = new App(config);

      const result = await app.init();

      expect(result).toBeInstanceOf(App);
    });

    test("validates with production environment", async () => {
      Bun.env.APP_ENV = "production";
      Bun.env.PORT = "8080";
      Bun.env.HOST_NAME = "api.example.com";

      const config = createMockConfig();
      const app = new App(config);

      const result = await app.init();

      expect(result).toBeInstanceOf(App);
    });

    test("validates with testing environment", async () => {
      Bun.env.APP_ENV = "testing";
      Bun.env.PORT = "4000";
      Bun.env.HOST_NAME = "test.localhost";

      const config = createMockConfig();
      const app = new App(config);

      const result = await app.init();

      expect(result).toBeInstanceOf(App);
    });

    test("validates with staging environment", async () => {
      Bun.env.APP_ENV = "staging";
      Bun.env.PORT = "5000";
      Bun.env.HOST_NAME = "staging.example.com";

      const config = createMockConfig();
      const app = new App(config);

      const result = await app.init();

      expect(result).toBeInstanceOf(App);
    });

    test("validates with local environment", async () => {
      Bun.env.APP_ENV = "local";
      Bun.env.PORT = "3000";
      Bun.env.HOST_NAME = "127.0.0.1";

      const config = createMockConfig();
      const app = new App(config);

      const result = await app.init();

      expect(result).toBeInstanceOf(App);
    });

    describe("roles config", () => {
      const validRolesYml = `
roles:
  GUEST: ROLE_GUEST
  TRIAL_USER: ROLE_TRIAL_USER
  USER: ROLE_USER
  PREMIUM_USER: ROLE_PREMIUM_USER
  ADMIN: ROLE_ADMIN
  SUPER_ADMIN: ROLE_SUPER_ADMIN
  SYSTEM: ROLE_SYSTEM
hierarchy:
  ROLE_GUEST:
    level: 10
    description: Guest
  ROLE_TRIAL_USER:
    level: 15
    description: Trial user
  ROLE_USER:
    level: 20
    description: User
  ROLE_PREMIUM_USER:
    level: 35
    description: Premium user
  ROLE_ADMIN:
    level: 120
    description: Admin
  ROLE_SUPER_ADMIN:
    level: 130
    description: Super admin
  ROLE_SYSTEM:
    level: 999
    description: System
`.trim();

      let writeSpy: ReturnType<typeof spyOn>;

      beforeEach(() => {
        writeSpy = spyOn(Bun, "write").mockResolvedValue(0 as unknown as number);
        generateRolesTypesMock.mockClear();
      });

      afterEach(() => {
        writeSpy.mockRestore();
        if (container.hasConstant("app.roles")) {
          container.removeConstant("app.roles");
        }
      });

      test("skips roles registration when roles.yml does not exist", async () => {
        if (container.hasConstant("app.roles")) {
          container.removeConstant("app.roles");
        }

        const spy = spyOn(Bun, "file").mockImplementation(
          () => ({ exists: () => Promise.resolve(false) }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);
        const result = await app.init();

        expect(result).toBeInstanceOf(App);
        expect(container.hasConstant("app.roles")).toBe(false);
        spy.mockRestore();
      });

      test("registers app.roles constant when valid roles.yml exists", async () => {
        const spy = spyOn(Bun, "file").mockImplementation(
          () =>
            ({
              exists: () => Promise.resolve(true),
              text: () => Promise.resolve(validRolesYml),
            }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);
        await app.init();

        expect(container.hasConstant("app.roles")).toBe(true);
        spy.mockRestore();
      });

      test("registered app.roles contains parsed roles and hierarchy", async () => {
        const spy = spyOn(Bun, "file").mockImplementation(
          () =>
            ({
              exists: () => Promise.resolve(true),
              text: () => Promise.resolve(validRolesYml),
            }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);
        await app.init();

        const roles = container.getConstant("app.roles") as { roles: Record<string, string> };
        expect(roles.roles.GUEST).toBe("ROLE_GUEST");
        expect(roles.roles.SYSTEM).toBe("ROLE_SYSTEM");
        spy.mockRestore();
      });

      test("prefers the project root roles.yml over the shared module", async () => {
        const rootYml = validRolesYml.replace("description: Guest", "description: RootGuest");
        const sharedYml = validRolesYml.replace("description: Guest", "description: SharedGuest");

        const spy = spyOn(Bun, "file").mockImplementation(
          ((path: string) =>
            ({
              exists: () => Promise.resolve(true),
              text: () => Promise.resolve(path.includes("modules") ? sharedYml : rootYml),
            }) as unknown as ReturnType<typeof Bun.file>) as unknown as typeof Bun.file,
        );

        const config = createMockConfig();
        const app = new App(config);
        await app.init();

        const roles = container.getConstant("app.roles") as { hierarchy: Record<string, { description: string }> };
        expect(roles.hierarchy.ROLE_GUEST?.description).toBe("RootGuest");
        spy.mockRestore();
      });

      test("falls back to the shared module roles.yml when the root has none", async () => {
        const sharedYml = validRolesYml.replace("description: Guest", "description: SharedGuest");

        const spy = spyOn(Bun, "file").mockImplementation(
          ((path: string) =>
            ({
              exists: () => Promise.resolve(path.includes("modules")),
              text: () => Promise.resolve(sharedYml),
            }) as unknown as ReturnType<typeof Bun.file>) as unknown as typeof Bun.file,
        );

        const config = createMockConfig();
        const app = new App(config);
        await app.init();

        const roles = container.getConstant("app.roles") as { hierarchy: Record<string, { description: string }> };
        expect(roles.hierarchy.ROLE_GUEST?.description).toBe("SharedGuest");
        spy.mockRestore();
      });

      test("throws RoleException when roles.yml is missing required role keys", async () => {
        const invalidYml = `
roles:
  GUEST: ROLE_GUEST
hierarchy:
  ROLE_GUEST:
    level: 10
    description: Guest
`.trim();

        const spy = spyOn(Bun, "file").mockImplementation(
          () =>
            ({
              exists: () => Promise.resolve(true),
              text: () => Promise.resolve(invalidYml),
            }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);

        await expect(app.init()).rejects.toThrow(RoleException);
        spy.mockRestore();
      });

      test("throws RoleException when hierarchy entry is invalid", async () => {
        const invalidYml = `
roles:
  GUEST: ROLE_GUEST
  TRIAL_USER: ROLE_TRIAL_USER
  USER: ROLE_USER
  PREMIUM_USER: ROLE_PREMIUM_USER
  ADMIN: ROLE_ADMIN
  SUPER_ADMIN: ROLE_SUPER_ADMIN
  SYSTEM: ROLE_SYSTEM
hierarchy:
  ROLE_GUEST:
    level: 10
    description: Guest
  ROLE_TRIAL_USER:
    level: 15
    description: Trial user
  ROLE_USER:
    level: 20
    description: User
  ROLE_PREMIUM_USER:
    level: 35
    description: ""
  ROLE_ADMIN:
    level: 120
    description: Admin
  ROLE_SUPER_ADMIN:
    level: 130
    description: Super admin
  ROLE_SYSTEM:
    level: 999
    description: System
`.trim();

        const spy = spyOn(Bun, "file").mockImplementation(
          () =>
            ({
              exists: () => Promise.resolve(true),
              text: () => Promise.resolve(invalidYml),
            }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);

        expect(app.init()).rejects.toThrow(RoleException);
        spy.mockRestore();
      });

      test("calls generateRolesTypes with the parsed config when roles.yml exists in local env", async () => {
        Bun.env.APP_ENV = "local";
        container.add(AppEnv);

        const spy = spyOn(Bun, "file").mockImplementation(
          () =>
            ({
              exists: () => Promise.resolve(true),
              text: () => Promise.resolve(validRolesYml),
            }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);
        await app.init();

        expect(generateRolesTypesMock).toHaveBeenCalledTimes(1);
        const [calledConfig] = generateRolesTypesMock.mock.calls[0] as [{ roles: Record<string, string> }];
        expect(calledConfig.roles.GUEST).toBe("ROLE_GUEST");
        spy.mockRestore();
      });

      test("writes generated types to roles.types.ts when roles.yml exists in local env", async () => {
        Bun.env.APP_ENV = "local";
        container.add(AppEnv);

        const spy = spyOn(Bun, "file").mockImplementation(
          () =>
            ({
              exists: () => Promise.resolve(true),
              text: () => Promise.resolve(validRolesYml),
            }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);
        await app.init();

        expect(writeSpy).toHaveBeenCalledTimes(1);
        const [path, content] = writeSpy.mock.calls[0] as [string, string];
        expect(path).toContain("roles.types.ts");
        expect(content).toBe("/* mocked role types */");
        spy.mockRestore();
      });

      test("does not write roles types in non-local env but still registers app.roles", async () => {
        const spy = spyOn(Bun, "file").mockImplementation(
          () =>
            ({
              exists: () => Promise.resolve(true),
              text: () => Promise.resolve(validRolesYml),
            }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);
        await app.init();

        expect(container.hasConstant("app.roles")).toBe(true);
        expect(generateRolesTypesMock).not.toHaveBeenCalled();
        expect(writeSpy).not.toHaveBeenCalled();
        spy.mockRestore();
      });

      test("does not call generateRolesTypes when roles.yml does not exist", async () => {
        const spy = spyOn(Bun, "file").mockImplementation(
          () => ({ exists: () => Promise.resolve(false) }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);
        await app.init();

        expect(generateRolesTypesMock).not.toHaveBeenCalled();
        expect(writeSpy).not.toHaveBeenCalled();
        spy.mockRestore();
      });

      test("does not call generateRolesTypes when validateConfig throws", async () => {
        const invalidYml = `
roles:
  GUEST: ROLE_GUEST
hierarchy:
  ROLE_GUEST:
    level: 10
    description: Guest
`.trim();

        const spy = spyOn(Bun, "file").mockImplementation(
          () =>
            ({
              exists: () => Promise.resolve(true),
              text: () => Promise.resolve(invalidYml),
            }) as unknown as ReturnType<typeof Bun.file>,
        );

        const config = createMockConfig();
        const app = new App(config);

        await expect(app.init()).rejects.toThrow(RoleException);
        expect(generateRolesTypesMock).not.toHaveBeenCalled();
        expect(writeSpy).not.toHaveBeenCalled();
        spy.mockRestore();
      });
    });
  });
});
