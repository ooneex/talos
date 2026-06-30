import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { PaymentException } from "@/index";

describe("PaymentException", () => {
  test("should have correct exception name", () => {
    const exception = new PaymentException("Test message", "TEST_KEY");
    expect(exception.name).toBe("PaymentException");
  });

  test("should create PaymentException with message only", () => {
    const message = "Payment operation failed";
    const exception = new PaymentException(message, "OPERATION_FAILED");

    expect(exception).toBeInstanceOf(PaymentException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("OPERATION_FAILED");
  });

  test("should create PaymentException with message and data", () => {
    const message = "Payment failed";
    const data = { customerId: "cust_123", productId: "prod_456" };
    const exception = new PaymentException(message, "FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("FAILED");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new PaymentException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Payment error";
    const data = { provider: "polar" };
    const exception = new PaymentException(message, "ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwPaymentException() {
      throw new PaymentException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwPaymentException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(PaymentException);
      expect(error.stack).toContain("throwPaymentException");
    }
  });

  test("should handle complex data objects", () => {
    const data = {
      checkout: {
        id: "chk_123",
        amount: 1999,
        currency: "usd",
      },
      customer: {
        email: "test@example.com",
        name: "John Doe",
      },
    };
    const exception = new PaymentException("Checkout failed", "CHECKOUT_FAILED", data);

    expect(exception.data).toEqual(data);
  });
});
