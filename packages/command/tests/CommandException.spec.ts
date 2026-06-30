import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { CommandException } from "@/CommandException";

describe("CommandException", () => {
  test("should have correct exception name", () => {
    const exception = new CommandException("Test message", "TEST");
    expect(exception.name).toBe("CommandException");
  });

  test("should create CommandException with message only", () => {
    const message = "Command execution failed";
    const exception = new CommandException(message, "COMMAND_EXECUTION_FAILED");

    expect(exception).toBeInstanceOf(CommandException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("COMMAND_EXECUTION_FAILED");
  });

  test("should create CommandException with message and data", () => {
    const message = "Command not found";
    const data = { command: "deploy", exitCode: 1 };
    const exception = new CommandException(message, "COMMAND_NOT_FOUND", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("COMMAND_NOT_FOUND");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new CommandException("Test message", "TEST", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Command error";
    const data = { command: "build" };
    const exception = new CommandException(message, "COMMAND_ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwCommandException() {
      throw new CommandException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwCommandException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(CommandException);
      expect(error.stack).toContain("throwCommandException");
    }
  });
});
