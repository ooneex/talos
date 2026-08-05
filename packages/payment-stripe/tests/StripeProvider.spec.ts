import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { StripeCheckoutSession } from "@/StripeCheckout";
import { StripeProvider } from "@/StripeProvider";
import type { StripeWebhookEvent } from "@/StripeWebhookEvent";
import { type CheckoutSessionType, EStripeEvent, type WebhookEventType } from "@/types";

const session: CheckoutSessionType = {
  id: "cs_test123",
  url: "https://checkout.stripe.com/c/pay/cs_test123",
  status: "open",
  paymentStatus: "unpaid",
  customerId: "cus_test123",
  customerEmail: "user@example.com",
  amountTotal: 1999,
  currency: "eur",
  metadata: {},
};

const event: WebhookEventType = {
  type: EStripeEvent.InvoicePaid,
  id: "evt_test123",
  created: new Date(1704067200 * 1000),
  data: {
    id: "in_test123",
    customerId: "cus_test123",
    subscriptionId: "sub_test123",
    amountPaid: 4900,
    currency: "eur",
    status: "paid",
    hostedInvoiceUrl: null,
  },
};

const mockCreate = mock(() => Promise.resolve(session));
const mockGet = mock(() => Promise.resolve(session));
const mockConstruct = mock(() => Promise.resolve(event));

const createCheckout = () => ({ create: mockCreate, get: mockGet }) as unknown as StripeCheckoutSession;
const createWebhook = () => ({ construct: mockConstruct }) as unknown as StripeWebhookEvent;

describe("StripeProvider", () => {
  let provider: StripeProvider;

  beforeEach(() => {
    provider = new StripeProvider(createCheckout(), createWebhook());
    mockCreate.mockClear();
    mockGet.mockClear();
    mockConstruct.mockClear();
  });

  test("should delegate createCheckoutSession to the checkout session service", async () => {
    const data = {
      lineItems: [{ price: "price_test123" }],
      mode: "payment" as const,
      successUrl: "https://example.com/success",
    };

    const result = await provider.createCheckoutSession(data);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]).toEqual([data] as never);
    expect(result).toBe(session);
  });

  test("should delegate retrieveSession to the checkout session service", async () => {
    const result = await provider.retrieveSession("cs_test123");

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0]).toEqual(["cs_test123"] as never);
    expect(result).toBe(session);
  });

  test("should delegate constructWebhookEvent to the webhook event service", async () => {
    const result = await provider.constructWebhookEvent("payload", "sig", "whsec");

    expect(mockConstruct).toHaveBeenCalledTimes(1);
    expect(mockConstruct.mock.calls[0]).toEqual(["payload", "sig", "whsec"] as never);
    expect(result).toBe(event);
  });
});
