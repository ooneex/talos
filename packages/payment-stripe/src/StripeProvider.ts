import { inject, injectable } from "@talosjs/container";
import { StripeCheckoutSession } from "./StripeCheckout";
import { StripeWebhookEvent } from "./StripeWebhookEvent";
import type { CheckoutSessionCreateType, CheckoutSessionType, IPaymentProvider, WebhookEventType } from "./types";

@injectable()
export class StripeProvider implements IPaymentProvider {
  constructor(
    @inject(StripeCheckoutSession) private readonly checkoutSession: StripeCheckoutSession,
    @inject(StripeWebhookEvent) private readonly webhookEvent: StripeWebhookEvent,
  ) {}

  public createCheckoutSession(data: CheckoutSessionCreateType): Promise<CheckoutSessionType> {
    return this.checkoutSession.create(data);
  }

  public retrieveSession(id: string): Promise<CheckoutSessionType> {
    return this.checkoutSession.get(id);
  }

  public constructWebhookEvent(payload: string | Buffer, signature: string, secret: string): Promise<WebhookEventType> {
    return this.webhookEvent.construct(payload, signature, secret);
  }
}
