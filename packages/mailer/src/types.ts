// biome-ignore lint/suspicious/noExplicitAny: trust me
export type MailerClassType = new (...args: any[]) => IMailer;

export interface IMailer {
  send: (config: {
    to: string[];
    subject: string;
    content: React.ReactNode;
    from?: { name: string; address: string };
  }) => Promise<void>;
}
