import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    readonly emails = { send };
    constructor(readonly apiKey: string) {}
  },
}));

const { ResendMailer } = await import("./mailer.js");

const message = {
  to: "person@example.test",
  subject: "Verify your Rementum account",
  text: "Verify your email",
  html: "<p>Verify your email</p>",
  idempotencyKey: "verify-email/token-id",
};

beforeEach(() => {
  send.mockReset();
});

describe("ResendMailer", () => {
  it("sends from the configured address and passes the idempotency key through", async () => {
    send.mockResolvedValueOnce({ data: { id: "email-id" }, error: null });
    const mailer = new ResendMailer("api-key", "Rementum <rementum@example.test>");
    await expect(mailer.send(message)).resolves.toEqual({ id: "email-id" });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Rementum <rementum@example.test>", to: message.to }),
      { idempotencyKey: message.idempotencyKey },
    );
  });

  it("raises the provider error", async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: "domain is not verified" } });
    const mailer = new ResendMailer("api-key", "Rementum <rementum@example.test>");
    await expect(mailer.send(message)).rejects.toThrow("domain is not verified");
  });

  it("raises when the provider accepts the message without returning an id", async () => {
    send.mockResolvedValueOnce({ data: null, error: null });
    const mailer = new ResendMailer("api-key", "Rementum <rementum@example.test>");
    await expect(mailer.send(message)).rejects.toThrow("Resend did not return an email id");
  });
});
