import { inject, injectable } from "@talosjs/container";
import type Stripe from "stripe";
import { StripeClient } from "./StripeClient";
import type { CheckoutSessionCreateType, CheckoutSessionType } from "./types";

@injectable()
export class StripeCheckoutSession {
  constructor(@inject(StripeClient) private readonly client: StripeClient) {}

  public async create(data: CheckoutSessionCreateType): Promise<CheckoutSessionType> {
    const params: Stripe.Checkout.SessionCreateParams = {
      line_items: data.lineItems.map((item) => ({
        price: item.price,
        quantity: item.quantity ?? 1,
      })),
      mode: data.mode,
      success_url: data.successUrl,
    };

    if (data.cancelUrl) {
      params.cancel_url = data.cancelUrl;
    }

    if (data.customerId) {
      params.customer = data.customerId;
    } else if (data.customerEmail) {
      params.customer_email = data.customerEmail;
    }

    if (data.metadata) {
      params.metadata = data.metadata;
    }

    if (data.allowPromotionCodes !== undefined) {
      params.allow_promotion_codes = data.allowPromotionCodes;
    }

    if (data.invoiceCreation && data.mode === "payment") {
      const invoiceData = data.invoiceCreation === true ? {} : data.invoiceCreation;
      params.invoice_creation = { enabled: true, invoice_data: invoiceData };
    }

    if (data.billingAddressCollection) {
      params.billing_address_collection = data.billingAddressCollection;
    }

    if (data.taxIdCollection) {
      params.tax_id_collection = { enabled: true };
    }

    // An existing customer keeps what they type at checkout — Stripe requires it for tax ID
    // collection, and it is what puts the collected address and company name on the invoice.
    if (data.customerId && (data.billingAddressCollection || data.taxIdCollection)) {
      params.customer_update = { address: "auto", name: "auto" };
    }

    const session = await this.client.sdk.checkout.sessions.create(params);

    return this.mapSession(session);
  }

  public async get(id: string): Promise<CheckoutSessionType> {
    const session = await this.client.sdk.checkout.sessions.retrieve(id);

    return this.mapSession(session);
  }

  private mapSession(session: Stripe.Checkout.Session): CheckoutSessionType {
    return {
      id: session.id,
      url: session.url,
      status: session.status ?? null,
      paymentStatus: session.payment_status,
      customerId: typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null),
      customerEmail: session.customer_email ?? session.customer_details?.email ?? null,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadata: (session.metadata as Record<string, string>) ?? {},
    };
  }
}
