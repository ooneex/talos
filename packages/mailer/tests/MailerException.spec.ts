import { describe, expect, test } from "bun:test";
import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";
import { MailerException } from "@/index";

describe("MailerException", () => {
  test("should have correct exception name", () => {
    const exception = new MailerException("Test message", "TEST_KEY");
    expect(exception.name).toBe("MailerException");
  });

  test("should create MailerException with message only", () => {
    const message = "Mail sending failed";
    const exception = new MailerException(message, "MAIL_SENDING_FAILED");

    expect(exception).toBeInstanceOf(MailerException);
    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual({});
    expect(exception.key).toBe("MAIL_SENDING_FAILED");
  });

  test("should create MailerException with message and data", () => {
    const message = "SMTP connection failed";
    const data = { host: "smtp.example.com", port: 587 };
    const exception = new MailerException(message, "SMTP_CONNECTION_FAILED", data);

    expect(exception.message).toBe(message);
    expect(exception.status).toBe(HttpStatus.Code.InternalServerError);
    expect(exception.data).toEqual(data);
    expect(exception.key).toBe("SMTP_CONNECTION_FAILED");
  });

  test("should have immutable data property", () => {
    const data = { key: "value" };
    const exception = new MailerException("Test message", "TEST_KEY", data);

    expect(Object.isFrozen(exception.data)).toBe(true);
    expect(() => {
      exception.data.key = "modified";
    }).toThrow();
  });

  test("should inherit all properties from Exception", () => {
    const message = "Mailer error";
    const data = { provider: "sendgrid" };
    const exception = new MailerException(message, "MAILER_ERROR", data);

    expect(exception.date).toBeInstanceOf(Date);
    expect(exception.status).toBe(500);
    expect(exception.data).toEqual(data);
    expect(exception.stack).toBeDefined();
  });

  test("should maintain proper stack trace", () => {
    function throwMailerException() {
      throw new MailerException("Stack trace test", "STACK_TRACE_TEST");
    }

    try {
      throwMailerException();
      // biome-ignore lint/suspicious/noExplicitAny: trust me
    } catch (error: any) {
      expect(error).toBeInstanceOf(MailerException);
      expect(error.stack).toContain("throwMailerException");
    }
  });
});
