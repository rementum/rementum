import { Resend } from "resend";

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

export interface TransactionalMailer {
  send(message: TransactionalEmail): Promise<{ id: string }>;
}

export class ResendMailer implements TransactionalMailer {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(message: TransactionalEmail): Promise<{ id: string }> {
    const { data, error } = await this.resend.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
      { idempotencyKey: message.idempotencyKey },
    );
    if (error || !data) throw new Error(error?.message ?? "Resend did not return an email id");
    return { id: data.id };
  }
}
