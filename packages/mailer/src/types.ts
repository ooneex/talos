// biome-ignore lint/suspicious/noExplicitAny: trust me
export type MailerClassType = new (...args: any[]) => IMailer;

export interface MailerAttachmentType {
  /** Name of the attached file. */
  filename: string;
  /** Content of the attached file, as a base64 string or Buffer. */
  content?: string | Buffer;
  /** Remote path the attachment is hosted at, used instead of `content`. */
  path?: string;
  /** Content type of the attachment. Derived from `filename` when omitted. */
  contentType?: string;
  /**
   * Content ID for an inline attachment, referenced in the HTML content
   * using the `cid:` prefix.
   */
  contentId?: string;
}

export interface IMailer {
  send: (config: {
    to: string[];
    subject: string;
    content: React.ReactNode;
    from?: { name: string; address: string };
    attachments?: MailerAttachmentType[];
  }) => Promise<void>;
}
