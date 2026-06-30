import { afterAll, afterEach, mock } from "bun:test";

// Commands report failures through process.exitCode; reset it so failure-path
// tests do not make the test process itself exit non-zero.
afterEach(() => {
  process.exitCode = 0;
});

afterAll(() => {
  process.exitCode = 0;
});

// Mock TerminalLogger class
class MockTerminalLogger {
  init = () => {};
  info = () => {};
  error = () => {};
  warn = () => {};
  debug = () => {};
  log = () => {};
  success = () => {};
}

// Mock @talosjs/logger module before any tests run to prevent SqliteLogger decorator execution
// The SqliteLogger has an optional constructor parameter that is incompatible with InversifyJS
mock.module("@talosjs/logger", () => ({
  TerminalLogger: MockTerminalLogger,
  SqliteLogger: class {
    init = () => {};
    info = () => {};
    error = () => {};
    warn = () => {};
    debug = () => {};
    log = () => {};
    success = () => {};
  },
  decorator: {
    logger: () => () => {},
  },
  ELogLevel: {
    ERROR: "ERROR",
    WARN: "WARN",
    INFO: "INFO",
    DEBUG: "DEBUG",
    LOG: "LOG",
    SUCCESS: "SUCCESS",
  },
}));
