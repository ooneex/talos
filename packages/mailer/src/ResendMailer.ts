import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { renderToString } from "react-dom/server";
import { Resend } from "resend";
import { decorator } from "./decorators";
import { MailerException } from "./MailerException";
import type { IMailer, MailerAttachmentType } from "./types";

@decorator.mailer()
export class ResendMailer implements IMailer {
  private readonly client: Resend;
  private from?: { name: string; address: string };

  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    const apiKey = this.env.RESEND_API_KEY as string;

    this.from = {
      name: this.env.MAILER_SENDER_NAME || "",
      address: this.env.MAILER_SENDER_ADDRESS || "",
    };

    if (!apiKey) {
      throw new MailerException(
        "Resend API key is required. Please set the RESEND_API_KEY environment variable.",
        "API_KEY_REQUIRED",
      );
    }

    this.client = new Resend(apiKey);
  }

  public async send(config: {
    to: string[];
    subject: string;
    content: React.ReactNode;
    from?: { name: string; address: string };
    attachments?: MailerAttachmentType[];
  }): Promise<void> {
    const senderName = config.from?.name || this.from?.name || "";
    const senderAddress = config.from?.address || this.from?.address || "";

    if (!senderName) {
      throw new MailerException(
        "Mailer sender name is required. Please provide a sender name either through the send options or set the MAILER_SENDER_NAME environment variable.",
        "EMAIL_SEND_FAILED",
      );
    }

    if (!senderAddress) {
      throw new MailerException(
        "Mailer sender address is required. Please provide a sender address either through the send options or set the MAILER_SENDER_ADDRESS environment variable.",
        "EMAIL_OPERATION_FAILED",
      );
    }

    await this.client.emails.send({
      to: config.to,
      from: `${senderName} <${senderAddress}>`,
      subject: `${config.subject}`,
      html: renderToString(config.content),
      ...(config.attachments && { attachments: config.attachments }),
    });
  }
}
