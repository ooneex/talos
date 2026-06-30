import { describe, expect, test } from "bun:test";
import type { IContainer } from "@talosjs/container";
import type { IException } from "@talosjs/exception";
import { logger } from "@/logger";

// Define ILogger interface locally to avoid importing from @talosjs/logger
// which triggers SqliteLogger decorator registration
interface ILogger<Data = Record<string, unknown>> {
  init: () => Promise<void> | void;
  error: (message: string | IException, data?: Data) => Promise<void> | void;
  warn: (message: string, data?: Data) => Promise<void> | void;
  info: (message: string, data?: Data) => Promise<void> | void;
  debug: (message: string, data?: Data) => Promise<void> | void;
  log: (message: string, data?: Data) => Promise<void> | void;
  success: (message: string, data?: Data) => Promise<void> | void;
}

class MockLogger implements ILogger {
  public calls: { method: string; message: string; data?: unknown }[] = [];

  public init = () => {};

  public error = (message: string | IException, data?: unknown) => {
    this.calls.push({ method: "error", message: String(message), data });
  };

  public warn = (message: string, data?: unknown) => {
    this.calls.push({ method: "warn", message, data });
  };

  public info = (message: string, data?: unknown) => {
    this.calls.push({ method: "info", message, data });
  };

  public debug = (message: string, data?: unknown) => {
    this.calls.push({ method: "debug", message, data });
  };

  public log = (message: string, data?: unknown) => {
    this.calls.push({ method: "log", message, data });
  };

  public success = (message: string, data?: unknown) => {
    this.calls.push({ method: "success", message, data });
  };
}

const createMockContainer = (loggerInstances: Map<unknown, ILogger>): IContainer => {
  return {
    get: <T>(key: unknown): T | null => {
      return (loggerInstances.get(key) as T) ?? null;
    },
  } as IContainer;
};

describe("logger", () => {
  test("error method calls error on all loggers", () => {
    const mockLogger1 = new MockLogger();
    const mockLogger2 = new MockLogger();

    class Logger1 implements ILogger {
      public init = () => {};
      public error = (message: string | IException, data?: unknown) => {
        mockLogger1.error(message, data);
      };
      public warn = () => {};
      public info = () => {};
      public debug = () => {};
      public log = () => {};
      public success = () => {};
    }

    class Logger2 implements ILogger {
      public init = () => {};
      public error = (message: string | IException, data?: unknown) => {
        mockLogger2.error(message, data);
      };
      public warn = () => {};
      public info = () => {};
      public debug = () => {};
      public log = () => {};
      public success = () => {};
    }

    const loggerInstances = new Map<unknown, ILogger>([
      [Logger1, new Logger1()],
      [Logger2, new Logger2()],
    ]);

    const container = createMockContainer(loggerInstances);
    const log = logger([Logger1, Logger2], container);

    log.error("Test error message");

    expect(mockLogger1.calls).toHaveLength(1);
    expect(mockLogger1.calls.at(0)?.method).toBe("error");
    expect(mockLogger1.calls.at(0)?.message).toBe("Test error message");

    expect(mockLogger2.calls).toHaveLength(1);
    expect(mockLogger2.calls.at(0)?.method).toBe("error");
    expect(mockLogger2.calls.at(0)?.message).toBe("Test error message");
  });

  test("warn method calls warn on all loggers", () => {
    const mockLogger = new MockLogger();

    const loggerInstances = new Map<unknown, ILogger>([[MockLogger, mockLogger]]);
    const container = createMockContainer(loggerInstances);
    const log = logger([MockLogger], container);

    log.warn("Test warning");

    expect(mockLogger.calls).toHaveLength(1);
    expect(mockLogger.calls.at(0)?.method).toBe("warn");
    expect(mockLogger.calls.at(0)?.message).toBe("Test warning");
  });

  test("info method calls info on all loggers", () => {
    const mockLogger = new MockLogger();

    const loggerInstances = new Map<unknown, ILogger>([[MockLogger, mockLogger]]);
    const container = createMockContainer(loggerInstances);
    const log = logger([MockLogger], container);

    log.info("Test info message");

    expect(mockLogger.calls).toHaveLength(1);
    expect(mockLogger.calls.at(0)?.method).toBe("info");
    expect(mockLogger.calls.at(0)?.message).toBe("Test info message");
  });

  test("debug method calls debug on all loggers", () => {
    const mockLogger = new MockLogger();

    const loggerInstances = new Map<unknown, ILogger>([[MockLogger, mockLogger]]);
    const container = createMockContainer(loggerInstances);
    const log = logger([MockLogger], container);

    log.debug("Debug message");

    expect(mockLogger.calls).toHaveLength(1);
    expect(mockLogger.calls.at(0)?.method).toBe("debug");
    expect(mockLogger.calls.at(0)?.message).toBe("Debug message");
  });

  test("log method calls log on all loggers", () => {
    const mockLogger = new MockLogger();

    const loggerInstances = new Map<unknown, ILogger>([[MockLogger, mockLogger]]);
    const container = createMockContainer(loggerInstances);
    const log = logger([MockLogger], container);

    log.log("Generic log message");

    expect(mockLogger.calls).toHaveLength(1);
    expect(mockLogger.calls.at(0)?.method).toBe("log");
    expect(mockLogger.calls.at(0)?.message).toBe("Generic log message");
  });

  test("success method calls success on all loggers", () => {
    const mockLogger = new MockLogger();

    const loggerInstances = new Map<unknown, ILogger>([[MockLogger, mockLogger]]);
    const container = createMockContainer(loggerInstances);
    const log = logger([MockLogger], container);

    log.success("Operation successful");

    expect(mockLogger.calls).toHaveLength(1);
    expect(mockLogger.calls.at(0)?.method).toBe("success");
    expect(mockLogger.calls.at(0)?.message).toBe("Operation successful");
  });

  test("handles empty logger array", () => {
    const container = createMockContainer(new Map());
    const log = logger([], container);

    expect(() => log.error("Test")).not.toThrow();
    expect(() => log.warn("Test")).not.toThrow();
    expect(() => log.info("Test")).not.toThrow();
    expect(() => log.debug("Test")).not.toThrow();
    expect(() => log.log("Test")).not.toThrow();
    expect(() => log.success("Test")).not.toThrow();
  });

  test("skips logger when container returns null", () => {
    const mockLogger = new MockLogger();

    const loggerInstances = new Map<unknown, ILogger>([[MockLogger, mockLogger]]);
    const container = createMockContainer(loggerInstances);

    class MissingLogger implements ILogger {
      public init = () => {};
      public error = () => {};
      public warn = () => {};
      public info = () => {};
      public debug = () => {};
      public log = () => {};
      public success = () => {};
    }

    const log = logger([MockLogger, MissingLogger], container);

    log.info("Test message");

    expect(mockLogger.calls).toHaveLength(1);
    expect(mockLogger.calls.at(0)?.method).toBe("info");
  });

  test("methods work without data parameter", () => {
    const mockLogger = new MockLogger();

    const loggerInstances = new Map<unknown, ILogger>([[MockLogger, mockLogger]]);
    const container = createMockContainer(loggerInstances);
    const log = logger([MockLogger], container);

    log.error("Error without data");
    log.warn("Warn without data");
    log.info("Info without data");
    log.debug("Debug without data");
    log.log("Log without data");
    log.success("Success without data");

    expect(mockLogger.calls).toHaveLength(6);
    expect(mockLogger.calls.at(0)?.data).toBeUndefined();
    expect(mockLogger.calls.at(1)?.data).toBeUndefined();
    expect(mockLogger.calls.at(2)?.data).toBeUndefined();
    expect(mockLogger.calls.at(3)?.data).toBeUndefined();
    expect(mockLogger.calls.at(4)?.data).toBeUndefined();
    expect(mockLogger.calls.at(5)?.data).toBeUndefined();
  });

  test("error method accepts IException", () => {
    const mockLogger = new MockLogger();

    const loggerInstances = new Map<unknown, ILogger>([[MockLogger, mockLogger]]);
    const container = createMockContainer(loggerInstances);
    const log = logger([MockLogger], container);

    const mockException = {
      message: "Exception message",
      toString: () => "Exception: Something went wrong",
    } as unknown as IException;

    log.error(mockException);

    expect(mockLogger.calls).toHaveLength(1);
    expect(mockLogger.calls.at(0)?.method).toBe("error");
    expect(mockLogger.calls.at(0)?.message).toBe("Exception: Something went wrong");
  });

  test("calls multiple loggers in order", () => {
    const callOrder: string[] = [];

    class OrderedLogger1 implements ILogger {
      public init = () => {};
      public error = () => {
        callOrder.push("logger1");
      };
      public warn = () => {};
      public info = () => {};
      public debug = () => {};
      public log = () => {};
      public success = () => {};
    }

    class OrderedLogger2 implements ILogger {
      public init = () => {};
      public error = () => {
        callOrder.push("logger2");
      };
      public warn = () => {};
      public info = () => {};
      public debug = () => {};
      public log = () => {};
      public success = () => {};
    }

    const loggerInstances = new Map<unknown, ILogger>([
      [OrderedLogger1, new OrderedLogger1()],
      [OrderedLogger2, new OrderedLogger2()],
    ]);

    const container = createMockContainer(loggerInstances);
    const log = logger([OrderedLogger1, OrderedLogger2], container);

    log.error("Test");

    expect(callOrder).toEqual(["logger1", "logger2"]);
  });

  test("resolves logger instances once at creation, not per call", () => {
    let getCallCount = 0;

    const mockLogger = new MockLogger();
    const container = {
      get: <T>(key: unknown): T | null => {
        getCallCount++;
        if (key === MockLogger) {
          return mockLogger as T;
        }
        return null;
      },
    } as IContainer;

    const log = logger([MockLogger], container);

    expect(getCallCount).toBe(1);

    log.info("Message 1");
    log.info("Message 2");
    log.warn("Message 3");

    expect(getCallCount).toBe(1);
    expect(mockLogger.calls).toHaveLength(3);
  });
});
