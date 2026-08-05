import { beforeEach, describe, expect, mock, test } from "bun:test";
import { PaymentException } from "@talosjs/payment";
import type { StripeClient } from "@/StripeClient";
import { StripeWebhookEvent } from "@/StripeWebhookEvent";
import {
  type CheckoutSessionCompletedEventType,
  type CustomerSubscriptionDeletedEventType,
  type CustomerSubscriptionUpdatedEventType,
  EStripeEvent,
  type InvoicePaidEventType,
  type PaymentIntentPaymentFailedEventType,
} from "@/types";

const CREATED_TS = 1704067200;

const mockConstructEvent = mock(() => Promise.resolve(createMockEvent()));

function createMockClient() {
  return {
    sdk: {
      webhooks: {
        constructEventAsync: mockConstructEvent,
      },
    },
  } as unknown as StripeClient;
}

// biome-ignore lint/suspicious/noExplicitAny: Stripe event fixtures need flexible typing
function createMockEvent(type: string = EStripeEvent.CheckoutSessionCompleted, object: any = {}): any {
  return {
    id: "evt_test123",
    object: "event",
    type,
    created: CREATED_TS,
    data: { object },
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Stripe object fixtures need flexible typing
const respondWith = (type: string, object: any): void => {
  mockConstructEvent.mockImplementation(() => Promise.resolve(createMockEvent(type, object)));
};

const captureError = async (promise: Promise<unknown>): Promise<PaymentException> => {
  try {
    await promise;
  } catch (error) {
    return error as PaymentException;
  }

  throw new Error("Expected the promise to reject");
};

describe("StripeWebhookEvent", () => {
  let webhook: StripeWebhookEvent;

  beforeEach(() => {
    webhook = new StripeWebhookEvent(createMockClient());
    mockConstructEvent.mockClear();
    mockConstructEvent.mockImplementation(() => Promise.resolve(createMockEvent()));
  });

  describe("signature verification", () => {
    test("should forward payload, signature and secret to the SDK", async () => {
      respondWith(EStripeEvent.CheckoutSessionCompleted, { id: "cs_test123", payment_status: "paid" });

      await webhook.construct("raw-payload", "sig_test", "whsec_test");

      expect(mockConstructEvent).toHaveBeenCalledTimes(1);
      expect(mockConstructEvent.mock.calls[0]).toEqual(["raw-payload", "sig_test", "whsec_test"] as never);
    });

    test("should accept a Buffer payload", async () => {
      respondWith(EStripeEvent.CheckoutSessionCompleted, { id: "cs_test123", payment_status: "paid" });

      const event = await webhook.construct(Buffer.from("raw-payload"), "sig_test", "whsec_test");

      expect(event.id).toBe("evt_test123");
    });

    test("should throw PaymentException with WEBHOOK_SIGNATURE_INVALID when verification fails", async () => {
      mockConstructEvent.mockImplementation(() => Promise.reject(new Error("No signatures found")));

      const error = await captureError(webhook.construct("raw-payload", "bad-sig", "whsec_test"));

      expect(error).toBeInstanceOf(PaymentException);
      expect(error.key).toBe("WEBHOOK_SIGNATURE_INVALID");
      expect(error.message).toContain("No signatures found");
    });

    test("should stringify non-Error verification failures", async () => {
      mockConstructEvent.mockImplementation(() => Promise.reject("boom"));

      const error = await captureError(webhook.construct("raw-payload", "bad-sig", "whsec_test"));

      expect(error.message).toContain("boom");
    });
  });

  describe("checkout.session.completed", () => {
    test("should map a fully populated session", async () => {
      respondWith(EStripeEvent.CheckoutSessionCompleted, {
        id: "cs_test123",
        customer: "cus_test123",
        customer_email: "user@example.com",
        amount_total: 1999,
        currency: "eur",
        payment_status: "paid",
        subscription: "sub_test123",
        metadata: { plan: "pro" },
      });

      const event = (await webhook.construct("p", "s", "w")) as CheckoutSessionCompletedEventType;

      expect(event.type).toBe(EStripeEvent.CheckoutSessionCompleted);
      expect(event.id).toBe("evt_test123");
      expect(event.created).toEqual(new Date(CREATED_TS * 1000));
      expect(event.data).toEqual({
        id: "cs_test123",
        customerId: "cus_test123",
        customerEmail: "user@example.com",
        amountTotal: 1999,
        currency: "eur",
        paymentStatus: "paid",
        subscriptionId: "sub_test123",
        metadata: { plan: "pro" },
      });
    });

    test("should unwrap expanded customer and subscription objects", async () => {
      respondWith(EStripeEvent.CheckoutSessionCompleted, {
        id: "cs_test123",
        customer: { id: "cus_expanded" },
        customer_email: null,
        customer_details: { email: "details@example.com" },
        amount_total: 500,
        currency: "usd",
        payment_status: "paid",
        subscription: { id: "sub_expanded" },
        metadata: null,
      });

      const event = (await webhook.construct("p", "s", "w")) as CheckoutSessionCompletedEventType;

      expect(event.data.customerId).toBe("cus_expanded");
      expect(event.data.customerEmail).toBe("details@example.com");
      expect(event.data.subscriptionId).toBe("sub_expanded");
      expect(event.data.metadata).toEqual({});
    });

    test("should null out missing customer, email and subscription", async () => {
      respondWith(EStripeEvent.CheckoutSessionCompleted, {
        id: "cs_test123",
        customer: null,
        customer_email: null,
        amount_total: null,
        currency: null,
        payment_status: "unpaid",
        subscription: null,
      });

      const event = (await webhook.construct("p", "s", "w")) as CheckoutSessionCompletedEventType;

      expect(event.data.customerId).toBeNull();
      expect(event.data.customerEmail).toBeNull();
      expect(event.data.subscriptionId).toBeNull();
      expect(event.data.amountTotal).toBeNull();
    });
  });

  describe("invoice.paid", () => {
    test("should map a fully populated invoice", async () => {
      respondWith(EStripeEvent.InvoicePaid, {
        id: "in_test123",
        customer: "cus_test123",
        subscription: "sub_test123",
        amount_paid: 4900,
        currency: "eur",
        status: "paid",
        hosted_invoice_url: "https://invoice.stripe.com/test123",
      });

      const event = (await webhook.construct("p", "s", "w")) as InvoicePaidEventType;

      expect(event.type).toBe(EStripeEvent.InvoicePaid);
      expect(event.data).toEqual({
        id: "in_test123",
        customerId: "cus_test123",
        subscriptionId: "sub_test123",
        amountPaid: 4900,
        currency: "eur",
        status: "paid",
        hostedInvoiceUrl: "https://invoice.stripe.com/test123",
      });
    });

    test("should unwrap expanded customer and subscription objects", async () => {
      respondWith(EStripeEvent.InvoicePaid, {
        id: "in_test123",
        customer: { id: "cus_expanded" },
        subscription: { id: "sub_expanded" },
        amount_paid: 100,
        currency: "usd",
        status: "open",
        hosted_invoice_url: null,
      });

      const event = (await webhook.construct("p", "s", "w")) as InvoicePaidEventType;

      expect(event.data.customerId).toBe("cus_expanded");
      expect(event.data.subscriptionId).toBe("sub_expanded");
      expect(event.data.hostedInvoiceUrl).toBeNull();
    });

    test("should fall back to empty id and null status", async () => {
      respondWith(EStripeEvent.InvoicePaid, {
        customer: null,
        subscription: null,
        amount_paid: 0,
        currency: "usd",
        status: null,
      });

      const event = (await webhook.construct("p", "s", "w")) as InvoicePaidEventType;

      expect(event.data.id).toBe("");
      expect(event.data.customerId).toBeNull();
      expect(event.data.subscriptionId).toBeNull();
      expect(event.data.status).toBeNull();
    });
  });

  describe("customer.subscription.deleted", () => {
    test("should map a canceled subscription", async () => {
      respondWith(EStripeEvent.CustomerSubscriptionDeleted, {
        id: "sub_test123",
        customer: "cus_test123",
        status: "canceled",
        current_period_end: CREATED_TS,
        canceled_at: CREATED_TS,
        metadata: { plan: "pro" },
      });

      const event = (await webhook.construct("p", "s", "w")) as CustomerSubscriptionDeletedEventType;

      expect(event.type).toBe(EStripeEvent.CustomerSubscriptionDeleted);
      expect(event.data).toEqual({
        id: "sub_test123",
        customerId: "cus_test123",
        status: "canceled",
        currentPeriodEnd: new Date(CREATED_TS * 1000),
        canceledAt: new Date(CREATED_TS * 1000),
        metadata: { plan: "pro" },
      });
    });

    test("should handle an expanded customer, no cancel date and no metadata", async () => {
      respondWith(EStripeEvent.CustomerSubscriptionDeleted, {
        id: "sub_test123",
        customer: { id: "cus_expanded" },
        status: "canceled",
        current_period_end: CREATED_TS,
        canceled_at: null,
        metadata: null,
      });

      const event = (await webhook.construct("p", "s", "w")) as CustomerSubscriptionDeletedEventType;

      expect(event.data.customerId).toBe("cus_expanded");
      expect(event.data.canceledAt).toBeNull();
      expect(event.data.metadata).toEqual({});
    });

    test("should null the customer id when absent", async () => {
      respondWith(EStripeEvent.CustomerSubscriptionDeleted, {
        id: "sub_test123",
        customer: null,
        status: "canceled",
        current_period_end: CREATED_TS,
        canceled_at: null,
      });

      const event = (await webhook.construct("p", "s", "w")) as CustomerSubscriptionDeletedEventType;

      expect(event.data.customerId).toBeNull();
    });
  });

  describe("customer.subscription.updated", () => {
    test("should map an updated subscription", async () => {
      respondWith(EStripeEvent.CustomerSubscriptionUpdated, {
        id: "sub_test123",
        customer: "cus_test123",
        status: "active",
        current_period_end: CREATED_TS,
        cancel_at_period_end: true,
        metadata: { plan: "pro" },
      });

      const event = (await webhook.construct("p", "s", "w")) as CustomerSubscriptionUpdatedEventType;

      expect(event.type).toBe(EStripeEvent.CustomerSubscriptionUpdated);
      expect(event.data).toEqual({
        id: "sub_test123",
        customerId: "cus_test123",
        status: "active",
        currentPeriodEnd: new Date(CREATED_TS * 1000),
        cancelAtPeriodEnd: true,
        metadata: { plan: "pro" },
      });
    });

    test("should handle an expanded customer and no metadata", async () => {
      respondWith(EStripeEvent.CustomerSubscriptionUpdated, {
        id: "sub_test123",
        customer: { id: "cus_expanded" },
        status: "past_due",
        current_period_end: CREATED_TS,
        cancel_at_period_end: false,
        metadata: null,
      });

      const event = (await webhook.construct("p", "s", "w")) as CustomerSubscriptionUpdatedEventType;

      expect(event.data.customerId).toBe("cus_expanded");
      expect(event.data.cancelAtPeriodEnd).toBe(false);
      expect(event.data.metadata).toEqual({});
    });

    test("should null the customer id when absent", async () => {
      respondWith(EStripeEvent.CustomerSubscriptionUpdated, {
        id: "sub_test123",
        customer: null,
        status: "active",
        current_period_end: CREATED_TS,
        cancel_at_period_end: false,
      });

      const event = (await webhook.construct("p", "s", "w")) as CustomerSubscriptionUpdatedEventType;

      expect(event.data.customerId).toBeNull();
    });
  });

  describe("payment_intent.payment_failed", () => {
    test("should map a failed payment intent", async () => {
      respondWith(EStripeEvent.PaymentIntentPaymentFailed, {
        id: "pi_test123",
        customer: "cus_test123",
        amount: 2500,
        currency: "eur",
        last_payment_error: { message: "Your card was declined." },
      });

      const event = (await webhook.construct("p", "s", "w")) as PaymentIntentPaymentFailedEventType;

      expect(event.type).toBe(EStripeEvent.PaymentIntentPaymentFailed);
      expect(event.data).toEqual({
        id: "pi_test123",
        customerId: "cus_test123",
        amount: 2500,
        currency: "eur",
        lastPaymentErrorMessage: "Your card was declined.",
      });
    });

    test("should handle an expanded customer and a missing error message", async () => {
      respondWith(EStripeEvent.PaymentIntentPaymentFailed, {
        id: "pi_test123",
        customer: { id: "cus_expanded" },
        amount: 100,
        currency: "usd",
      });

      const event = (await webhook.construct("p", "s", "w")) as PaymentIntentPaymentFailedEventType;

      expect(event.data.customerId).toBe("cus_expanded");
      expect(event.data.lastPaymentErrorMessage).toBeNull();
    });

    test("should null the customer id when absent", async () => {
      respondWith(EStripeEvent.PaymentIntentPaymentFailed, {
        id: "pi_test123",
        customer: null,
        amount: 100,
        currency: "usd",
        last_payment_error: {},
      });

      const event = (await webhook.construct("p", "s", "w")) as PaymentIntentPaymentFailedEventType;

      expect(event.data.customerId).toBeNull();
      expect(event.data.lastPaymentErrorMessage).toBeNull();
    });
  });

  describe("unsupported events", () => {
    test("should throw PaymentException with UNSUPPORTED_EVENT_TYPE", async () => {
      respondWith("customer.created", { id: "cus_test123" });

      const error = await captureError(webhook.construct("p", "s", "w"));

      expect(error).toBeInstanceOf(PaymentException);
      expect(error.key).toBe("UNSUPPORTED_EVENT_TYPE");
      expect(error.message).toContain("customer.created");
    });
  });
});
