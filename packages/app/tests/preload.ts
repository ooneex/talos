import { mock } from "bun:test";

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
