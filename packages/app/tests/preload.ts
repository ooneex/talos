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

// Mock @talosjs/logger before any test runs so the real loggers' decorators never register
// into the shared container and no logger tries to reach a backend during the app tests
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
