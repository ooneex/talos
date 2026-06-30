import { describe, expect, mock, test } from "bun:test";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

// Mock logger to suppress output
mock.module("@talosjs/logger", () => ({
  TerminalLogger: class {
    init() {}
    info() {}
    error() {}
    warn() {}
    debug() {}
    log() {}
    success() {}
  },
  decorator: {
    logger: () => () => {},
  },
}));

const commands = await import("@/commands");

type CommandConstructor = new () => {
  getName: () => string;
  getDescription: () => string;
  run: (...args: unknown[]) => unknown;
};

describe("@talosjs/cli - index", () => {
  const expectedCommands = [
    "AppBuildCommand",
    "AppStartCommand",
    "AppStopCommand",
    "CommandRunCommand",
    "CompletionZshCommand",
    "HelpCommand",
    "IssueCreateCommand",
    "IssuePullCommand",
    "AiChatCreateCommand",
    "AiMiddlewareCreateCommand",
    "AiToolCreateCommand",
    "AnalyticsCreateCommand",
    "AppCreateCommand",
    "AppInitCommand",
    "CacheCreateCommand",
    "ClaudeInitCommand",
    "CodexInitCommand",
    "CommandCreateCommand",
    "ControllerCreateCommand",
    "CronCreateCommand",
    "DatabaseCreateCommand",
    "DesignCreateCommand",
    "DesignRemoveCommand",
    "DockerCreateCommand",
    "EntityCreateCommand",
    "EventCreateCommand",
    "FeatureFlagCreateCommand",
    "LoggerCreateCommand",
    "MailerCreateCommand",
    "MicroserviceCreateCommand",
    "MicroserviceRemoveCommand",
    "MiddlewareCreateCommand",
    "MigrationCreateCommand",
    "MigrationDownCommand",
    "MigrationUpCommand",
    "ModuleCreateCommand",
    "ModuleRemoveCommand",
    "PermissionCreateCommand",
    "QueueCreateCommand",
    "RateLimitCreateCommand",
    "ReleaseCreateCommand",
    "RepositoryCreateCommand",
    "SdkCreateCommand",
    "SeedCreateCommand",
    "SeedRunCommand",
    "ServiceCreateCommand",
    "SpaCreateCommand",
    "SpaFeatureCreateCommand",
    "SpaRemoveCommand",
    "StorageCreateCommand",
    "TranslationCreateCommand",
    "VectorDatabaseCreateCommand",
    "WorkflowCreateCommand",
    "WorkflowTransitionCreateCommand",
    "IssuePushCommand",
  ] as const;

  test("should export all command classes", () => {
    for (const name of expectedCommands) {
      expect(commands[name]).toBeDefined();
      expect(typeof commands[name]).toBe("function");
    }
  });

  test("should export exactly the expected number of commands", () => {
    const exportedKeys = Object.keys(commands);
    expect(exportedKeys).toHaveLength(expectedCommands.length);
  });

  test("each command should be instantiable", () => {
    for (const name of expectedCommands) {
      const CommandClass = commands[name] as unknown as CommandConstructor;
      const instance = new CommandClass();
      expect(instance).toBeDefined();
    }
  });

  test("each command should have getName and getDescription methods", () => {
    for (const name of expectedCommands) {
      const CommandClass = commands[name] as unknown as CommandConstructor;
      const instance = new CommandClass();
      expect(typeof instance.getName).toBe("function");
      expect(typeof instance.getDescription).toBe("function");
      expect(typeof instance.getName()).toBe("string");
      expect(typeof instance.getDescription()).toBe("string");
      expect(instance.getName().length).toBeGreaterThan(0);
      expect(instance.getDescription().length).toBeGreaterThan(0);
    }
  });

  test("each command should have a run method", () => {
    for (const name of expectedCommands) {
      const CommandClass = commands[name] as unknown as CommandConstructor;
      const instance = new CommandClass();
      expect(typeof instance.run).toBe("function");
    }
  });
});
