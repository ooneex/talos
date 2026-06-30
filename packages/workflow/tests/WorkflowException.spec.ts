import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { WorkflowException } from "@/WorkflowException";

describe("WorkflowException", () => {
  test("should have correct exception name", () => {
    const exception = new WorkflowException("Test message", "TEST");
    expect(exception.name).toBe("WorkflowException");
  });

  test("should create WorkflowException with message only", () => {
    const message = "Workflow execution failed";
    const exception = new WorkflowException(message, "EXECUTION_FAILED");

    expect(exception).toBeInstanceOf(WorkflowException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("EXECUTION_FAILED");
  });

  test("should create WorkflowException with message and data", () => {
    const message = "Step processing failed";
    const data = { step: "validate", attempt: 3 };
    const exception = new WorkflowException(message, "STEP_PROCESSING_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("STEP_PROCESSING_FAILED");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new WorkflowException("Test message", "TEST", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Workflow error";
    const data = { workflow: "onboarding" };
    const exception = new WorkflowException(message, "ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwWorkflowException() {
      throw new WorkflowException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwWorkflowException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(WorkflowException);
      expect(error.stack).toContain("throwWorkflowException");
    }
  });
});
