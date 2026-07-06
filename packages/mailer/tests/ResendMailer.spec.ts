import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockSend = mock(() => Promise.resolve({ data: { id: "test-id" }, error: null }));

mock.module("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

mock.module("@/decorators", () => ({
  decorator: {
    mailer: () => () => {},
  },
}));

const { ResendMailer } = await import("@/ResendMailer");
const { MailerException } = await import("@/MailerException");
const { AppEnv } = await import("@talosjs/app-env");

describe("ResendMailer", () => {
  const originalEnv = { ...Bun.env };

  beforeEach(() => {
    Bun.env.RESEND_API_KEY = "re_test_123";
    Bun.env.MAILER_SENDER_NAME = "Test Sender";
    Bun.env.MAILER_SENDER_ADDRESS = "test@example.com";
    mockSend.mockClear();
  });

  afterEach(() => {
    Bun.env.RESEND_API_KEY = originalEnv.RESEND_API_KEY;
    Bun.env.MAILER_SENDER_NAME = originalEnv.MAILER_SENDER_NAME;
    Bun.env.MAILER_SENDER_ADDRESS = originalEnv.MAILER_SENDER_ADDRESS;
  });

  describe("constructor", () => {
    test("should create instance with environment variables", () => {
      const mailer = new ResendMailer(new AppEnv());
      expect(mailer).toBeInstanceOf(ResendMailer);
    });

    test("should throw MailerException when no API key is provided", () => {
      Bun.env.RESEND_API_KEY = undefined;

      expect(() => new ResendMailer(new AppEnv())).toThrow(MailerException);
      expect(() => new ResendMailer(new AppEnv())).toThrow("Resend API key is required");
    });

    test("should throw MailerException when API key is empty string", () => {
      Bun.env.RESEND_API_KEY = "   ";

      expect(() => new ResendMailer(new AppEnv())).toThrow(MailerException);
    });
  });

  describe("send", () => {
    test("should send email with all required fields", async () => {
      const mailer = new ResendMailer(new AppEnv());

      await mailer.send({
        to: ["recipient@example.com"],
        subject: "Test Subject",
        content: "Hello World",
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith({
        to: ["recipient@example.com"],
        from: "Test Sender <test@example.com>",
        subject: "Test Subject",
        html: expect.any(String),
      });
    });

    test("should send email to multiple recipients", async () => {
      const mailer = new ResendMailer(new AppEnv());

      await mailer.send({
        to: ["a@example.com", "b@example.com"],
        subject: "Multi",
        content: "Hello",
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["a@example.com", "b@example.com"],
        }),
      );
    });

    test("should use per-send from over env from", async () => {
      const mailer = new ResendMailer(new AppEnv());

      await mailer.send({
        to: ["recipient@example.com"],
        subject: "Test",
        content: "Hello",
        from: { name: "Override Sender", address: "override@example.com" },
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "Override Sender <override@example.com>",
        }),
      );
    });

    test("should throw MailerException when sender name is missing", async () => {
      Bun.env.MAILER_SENDER_NAME = undefined;

      const mailer = new ResendMailer(new AppEnv());

      expect(
        mailer.send({
          to: ["recipient@example.com"],
          subject: "Test",
          content: "Hello",
        }),
      ).rejects.toThrow(MailerException);
    });

    test("should throw MailerException when sender address is missing", async () => {
      Bun.env.MAILER_SENDER_ADDRESS = undefined;

      const mailer = new ResendMailer(new AppEnv());

      expect(
        mailer.send({
          to: ["recipient@example.com"],
          subject: "Test",
          content: "Hello",
        }),
      ).rejects.toThrow(MailerException);
    });

    test("should render React content to HTML string", async () => {
      const mailer = new ResendMailer(new AppEnv());

      await mailer.send({
        to: ["recipient@example.com"],
        subject: "Test",
        content: "Plain text content",
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.any(String),
        }),
      );
    });

    test("should send email with attachments", async () => {
      const mailer = new ResendMailer(new AppEnv());

      await mailer.send({
        to: ["recipient@example.com"],
        subject: "Test Subject",
        content: "Hello World",
        attachments: [{ filename: "invoice.pdf", content: "base64content" }],
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [{ filename: "invoice.pdf", content: "base64content" }],
        }),
      );
    });

    test("should send email with multiple attachments", async () => {
      const mailer = new ResendMailer(new AppEnv());

      await mailer.send({
        to: ["recipient@example.com"],
        subject: "Test Subject",
        content: "Hello World",
        attachments: [
          { filename: "invoice.pdf", content: "base64content" },
          { filename: "logo.png", path: "https://example.com/logo.png" },
        ],
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            { filename: "invoice.pdf", content: "base64content" },
            { filename: "logo.png", path: "https://example.com/logo.png" },
          ],
        }),
      );
    });

    test("should not include attachments key when none are provided", async () => {
      const mailer = new ResendMailer(new AppEnv());

      await mailer.send({
        to: ["recipient@example.com"],
        subject: "Test Subject",
        content: "Hello World",
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.not.objectContaining({
          attachments: expect.anything(),
        }),
      );
    });
  });
});
