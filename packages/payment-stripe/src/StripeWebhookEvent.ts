import { inject, injectable } from "@talosjs/container";
import { PaymentException } from "@talosjs/payment";
import type Stripe from "stripe";
import { StripeClient } from "./StripeClient";
import {
  type CheckoutSessionCompletedDataType,
  type CheckoutSessionCompletedEventType,
  type CustomerSubscriptionDeletedDataType,
  type CustomerSubscriptionDeletedEventType,
  type CustomerSubscriptionUpdatedDataType,
  type CustomerSubscriptionUpdatedEventType,
  EStripeEvent,
  type InvoicePaidDataType,
  type InvoicePaidEventType,
  type PaymentIntentPaymentFailedDataType,
  type PaymentIntentPaymentFailedEventType,
  type WebhookEventType,
} from "./types";

@injectable()
export class StripeWebhookEvent {
  constructor(@inject(StripeClient) private readonly client: StripeClient) {}

  public async construct(payload: string | Buffer, signature: string, secret: string): Promise<WebhookEventType> {
    let raw: Stripe.Event;

    try {
      raw = await this.client.sdk.webhooks.constructEventAsync(payload, signature, secret);
    } catch (err) {
      throw new PaymentException(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
        "WEBHOOK_SIGNATURE_INVALID",
      );
    }

    const created = new Date(raw.created * 1000);

    switch (raw.type) {
      case EStripeEvent.CheckoutSessionCompleted: {
        const obj = raw.data.object as Stripe.Checkout.Session;
        const data: CheckoutSessionCompletedDataType = {
          id: obj.id,
          customerId: typeof obj.customer === "string" ? obj.customer : (obj.customer?.id ?? null),
          customerEmail: obj.customer_email ?? obj.customer_details?.email ?? null,
          amountTotal: obj.amount_total,
          currency: obj.currency,
          paymentStatus: obj.payment_status,
          subscriptionId: typeof obj.subscription === "string" ? obj.subscription : (obj.subscription?.id ?? null),
          metadata: (obj.metadata as Record<string, string>) ?? {},
        };
        return {
          type: EStripeEvent.CheckoutSessionCompleted,
          id: raw.id,
          created,
          data,
        } satisfies CheckoutSessionCompletedEventType;
      }

      case EStripeEvent.InvoicePaid: {
        const obj = raw.data.object as Stripe.Invoice;
        const data: InvoicePaidDataType = {
          id: obj.id ?? "",
          customerId: typeof obj.customer === "string" ? obj.customer : (obj.customer?.id ?? null),
          subscriptionId: typeof obj.subscription === "string" ? obj.subscription : (obj.subscription?.id ?? null),
          amountPaid: obj.amount_paid,
          currency: obj.currency,
          status: obj.status ?? null,
          hostedInvoiceUrl: obj.hosted_invoice_url ?? null,
        };
        return { type: EStripeEvent.InvoicePaid, id: raw.id, created, data } satisfies InvoicePaidEventType;
      }

      case EStripeEvent.CustomerSubscriptionDeleted: {
        const obj = raw.data.object as Stripe.Subscription;
        const data: CustomerSubscriptionDeletedDataType = {
          id: obj.id,
          customerId: typeof obj.customer === "string" ? obj.customer : (obj.customer?.id ?? null),
          status: obj.status,
          currentPeriodEnd: new Date(obj.current_period_end * 1000),
          canceledAt: obj.canceled_at ? new Date(obj.canceled_at * 1000) : null,
          metadata: (obj.metadata as Record<string, string>) ?? {},
        };
        return {
          type: EStripeEvent.CustomerSubscriptionDeleted,
          id: raw.id,
          created,
          data,
        } satisfies CustomerSubscriptionDeletedEventType;
      }

      case EStripeEvent.CustomerSubscriptionUpdated: {
        const obj = raw.data.object as Stripe.Subscription;
        const data: CustomerSubscriptionUpdatedDataType = {
          id: obj.id,
          customerId: typeof obj.customer === "string" ? obj.customer : (obj.customer?.id ?? null),
          status: obj.status,
          currentPeriodEnd: new Date(obj.current_period_end * 1000),
          cancelAtPeriodEnd: obj.cancel_at_period_end,
          metadata: (obj.metadata as Record<string, string>) ?? {},
        };
        return {
          type: EStripeEvent.CustomerSubscriptionUpdated,
          id: raw.id,
          created,
          data,
        } satisfies CustomerSubscriptionUpdatedEventType;
      }

      case EStripeEvent.PaymentIntentPaymentFailed: {
        const obj = raw.data.object as Stripe.PaymentIntent;
        const data: PaymentIntentPaymentFailedDataType = {
          id: obj.id,
          customerId: typeof obj.customer === "string" ? obj.customer : (obj.customer?.id ?? null),
          amount: obj.amount,
          currency: obj.currency,
          lastPaymentErrorMessage: obj.last_payment_error?.message ?? null,
        };
        return {
          type: EStripeEvent.PaymentIntentPaymentFailed,
          id: raw.id,
          created,
          data,
        } satisfies PaymentIntentPaymentFailedEventType;
      }

      default:
        throw new PaymentException(`Unsupported webhook event type: ${raw.type}`, "UNSUPPORTED_EVENT_TYPE");
    }
  }
}
