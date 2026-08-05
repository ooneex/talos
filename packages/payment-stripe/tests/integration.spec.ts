/**
 * Integration tests — call the real Stripe test API.
 *
 * Prerequisites:
 *   - STRIPE_SECRET_KEY=sk_test_xxx  (Dashboard → Developers → API keys)
 *
 * Run:
 *   bun test tests/integration.spec.ts --env-file ../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import type { AppEnv } from "@talosjs/app-env";
import { StripeClient } from "@/StripeClient";
import { StripeCustomer } from "@/StripeCustomer";
import { StripeProducts } from "@/StripeProducts";
import { StripeWebhookEvent } from "@/StripeWebhookEvent";
import { EStripeEvent } from "@/types";

const apiKey = Bun.env.STRIPE_SECRET_KEY;
const isTestKey = typeof apiKey === "string" && apiKey.startsWith("sk_test_");
const run = isTestKey ? test : test.skip;

const createEnv = (): AppEnv =>
  ({
    STRIPE_SECRET_KEY: Bun.env.STRIPE_SECRET_KEY,
    STRIPE_API_VERSION: Bun.env.STRIPE_API_VERSION,
    STRIPE_WEBHOOK_SECRET: Bun.env.STRIPE_WEBHOOK_SECRET,
  }) as unknown as AppEnv;

if (!isTestKey) {
  // biome-ignore lint/suspicious/noConsole: intentional test-skip notice
  console.warn("⚠ Skipping integration tests — set STRIPE_SECRET_KEY=sk_test_xxx to enable them.");
}

// Stripe v17 uses SubtleCryptoProvider (async-only) in Bun — sign manually instead.
function stripeWebhookSignature(payload: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${ts}.${payload}`, "utf8").digest("hex");
  return `t=${ts},v1=${sig}`;
}

// ─── Shared state ──────────────────────────────────────────────────────────

let client: StripeClient;

// Scenario 1 — one-shot
let oneshotProductId: string;
let oneshotPriceId: string;
let oneshotCustomerId: string;

// Scenario 2 — subscription
let subProductId: string;
let subPriceId: string;
let subCustomerId: string;
let subscriptionId: string;

beforeAll(() => {
  if (!isTestKey) return;
  client = new StripeClient(createEnv());
});

// ─── Scenario 1 : Achat one-shot ──────────────────────────────────────────

describe("Scenario 1 — one-shot purchase", () => {
  run("should create a one-time product and price", async () => {
    const svc = new StripeProducts(client);

    const product = await svc.create({
      name: "[TEST] One-shot Product",
      description: "Achat unique",
      metadata: { source: "integration-test" },
    });

    expect(product.id).toMatch(/^prod_/);
    oneshotProductId = product.id;

    const price = await svc.createPrice({
      productId: oneshotProductId,
      currency: "eur",
      unitAmount: 1999,
      type: "one_time",
    });

    expect(price.id).toMatch(/^price_/);
    expect(price.type).toBe("one_time");
    expect(price.unitAmount).toBe(1999);
    oneshotPriceId = price.id;
  });

  run("should create a buyer customer", async () => {
    const svc = new StripeCustomer(client);

    const customer = await svc.create({
      email: "buyer-test@example.com",
      name: "Buyer Test",
      metadata: { source: "integration-test" },
    });

    expect(customer.id).toMatch(/^cus_/);
    oneshotCustomerId = customer.id;
  });

  run("should create and confirm a PaymentIntent (pm_card_visa)", async () => {
    const intent = await client.sdk.paymentIntents.create({
      amount: 1999,
      currency: "eur",
      customer: oneshotCustomerId,
      payment_method: "pm_card_visa",
      confirm: true,
      return_url: "https://example.com/return",
      metadata: { price_id: oneshotPriceId },
    });

    expect(intent.id).toMatch(/^pi_/);
    expect(intent.status).toBe("succeeded");
    expect(intent.amount).toBe(1999);
    expect(intent.currency).toBe("eur");
    expect(intent.customer).toBe(oneshotCustomerId);
  });

  run("should find the payment in charges list", async () => {
    const charges = await client.sdk.charges.list({
      customer: oneshotCustomerId,
      limit: 5,
    });

    expect(charges.data.length).toBeGreaterThan(0);
    const charge = charges.data[0];
    expect(charge?.status).toBe("succeeded");
    expect(charge?.amount).toBe(1999);
  });
});

// ─── Scenario 2 : Abonnement mensuel ──────────────────────────────────────

describe("Scenario 2 — monthly subscription", () => {
  run("should create a subscription product and recurring price", async () => {
    const svc = new StripeProducts(client);

    const product = await svc.create({
      name: "[TEST] Subscription Product",
      description: "Abonnement mensuel",
      metadata: { source: "integration-test" },
    });

    expect(product.id).toMatch(/^prod_/);
    subProductId = product.id;

    const price = await svc.createPrice({
      productId: subProductId,
      currency: "eur",
      unitAmount: 999,
      type: "recurring",
      interval: "month",
      intervalCount: 1,
    });

    expect(price.id).toMatch(/^price_/);
    expect(price.type).toBe("recurring");
    expect(price.interval).toBe("month");
    expect(price.unitAmount).toBe(999);
    subPriceId = price.id;
  });

  run("should create a subscriber customer", async () => {
    const svc = new StripeCustomer(client);

    const customer = await svc.create({
      email: "subscriber-test@example.com",
      name: "Subscriber Test",
      metadata: { source: "integration-test" },
    });

    expect(customer.id).toMatch(/^cus_/);
    subCustomerId = customer.id;
  });

  run("should create a PaymentMethod from tok_visa and set it as default", async () => {
    // pm_card_visa is a shared token — must be created as a real PM before attaching
    const pm = await client.sdk.paymentMethods.create({
      type: "card",
      card: { token: "tok_visa" },
    });

    expect(pm.id).toMatch(/^pm_/);

    await client.sdk.paymentMethods.attach(pm.id, { customer: subCustomerId });

    await client.sdk.customers.update(subCustomerId, {
      invoice_settings: { default_payment_method: pm.id },
    });
  });

  run("should create an active subscription", async () => {
    const sub = await client.sdk.subscriptions.create({
      customer: subCustomerId,
      items: [{ price: subPriceId }],
    });

    expect(sub.id).toMatch(/^sub_/);
    expect(sub.status).toBe("active");
    expect(sub.customer).toBe(subCustomerId);
    expect(sub.items.data[0]?.price.id).toBe(subPriceId);
    subscriptionId = sub.id;
  });

  run("should find the subscription invoice (paid on creation)", async () => {
    const invoices = await client.sdk.invoices.list({
      customer: subCustomerId,
      limit: 5,
    });

    expect(invoices.data.length).toBeGreaterThan(0);
    const invoice = invoices.data[0];
    expect(invoice?.status).toBe("paid");
    expect(invoice?.amount_paid).toBe(999);
  });
});

// ─── Scenario 3 : Webhook ─────────────────────────────────────────────────

describe("Scenario 3 — webhook signature verification", () => {
  const WEBHOOK_SECRET = "whsec_test_integration_secret_1234567890abcdef";

  run("should verify and parse a checkout.session.completed webhook", async () => {
    const webhookEvent = new StripeWebhookEvent(client);

    const payload = JSON.stringify({
      id: "evt_integration_test",
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "cs_integration_test",
          object: "checkout.session",
          customer: oneshotCustomerId ?? "cus_test",
          customer_email: "buyer-test@example.com",
          customer_details: { email: "buyer-test@example.com" },
          amount_total: 1999,
          currency: "eur",
          payment_status: "paid",
          subscription: null,
          metadata: { price_id: oneshotPriceId ?? "" },
        },
      },
      livemode: false,
    });

    const signature = stripeWebhookSignature(payload, WEBHOOK_SECRET);
    const event = await webhookEvent.construct(payload, signature, WEBHOOK_SECRET);

    expect(event.type).toBe(EStripeEvent.CheckoutSessionCompleted);
    expect(event.id).toBe("evt_integration_test");

    if (event.type === EStripeEvent.CheckoutSessionCompleted) {
      expect(event.data.id).toBe("cs_integration_test");
      expect(event.data.amountTotal).toBe(1999);
      expect(event.data.currency).toBe("eur");
      expect(event.data.paymentStatus).toBe("paid");
      expect(event.data.subscriptionId).toBeNull();
    }
  });

  run("should verify and parse an invoice.paid webhook", async () => {
    const webhookEvent = new StripeWebhookEvent(client);

    const payload = JSON.stringify({
      id: "evt_invoice_test",
      object: "event",
      type: "invoice.paid",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "in_integration_test",
          object: "invoice",
          customer: subCustomerId ?? "cus_test",
          subscription: subscriptionId ?? "sub_test",
          amount_paid: 999,
          currency: "eur",
          status: "paid",
          hosted_invoice_url: "https://invoice.stripe.com/test",
        },
      },
      livemode: false,
    });

    const signature = stripeWebhookSignature(payload, WEBHOOK_SECRET);
    const event = await webhookEvent.construct(payload, signature, WEBHOOK_SECRET);

    expect(event.type).toBe(EStripeEvent.InvoicePaid);

    if (event.type === EStripeEvent.InvoicePaid) {
      expect(event.data.amountPaid).toBe(999);
      expect(event.data.currency).toBe("eur");
      expect(event.data.status).toBe("paid");
      expect(event.data.hostedInvoiceUrl).toBe("https://invoice.stripe.com/test");
    }
  });

  run("should reject a webhook with an invalid signature", async () => {
    const webhookEvent = new StripeWebhookEvent(client);
    const payload = JSON.stringify({ id: "evt_fake", type: "checkout.session.completed" });

    await expect(webhookEvent.construct(payload, "t=123,v1=invalidsignature", WEBHOOK_SECRET)).rejects.toThrow(
      "Webhook signature verification failed",
    );
  });

  run("should verify and parse a customer.subscription.deleted webhook", async () => {
    const webhookEvent = new StripeWebhookEvent(client);

    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_sub_deleted_test",
      object: "event",
      type: "customer.subscription.deleted",
      created: now,
      data: {
        object: {
          id: subscriptionId ?? "sub_test",
          object: "subscription",
          customer: subCustomerId ?? "cus_test",
          status: "canceled",
          current_period_end: now + 86400,
          canceled_at: now,
          cancel_at_period_end: false,
          metadata: {},
        },
      },
      livemode: false,
    });

    const signature = stripeWebhookSignature(payload, WEBHOOK_SECRET);
    const event = await webhookEvent.construct(payload, signature, WEBHOOK_SECRET);

    expect(event.type).toBe(EStripeEvent.CustomerSubscriptionDeleted);

    if (event.type === EStripeEvent.CustomerSubscriptionDeleted) {
      expect(event.data.status).toBe("canceled");
      expect(event.data.canceledAt).toBeInstanceOf(Date);
    }
  });
});

// ─── Cleanup ───────────────────────────────────────────────────────────────

afterAll(async () => {
  if (!isTestKey) return;

  const errors: string[] = [];

  if (subscriptionId) {
    await client.sdk.subscriptions.cancel(subscriptionId).catch(() => errors.push(`subscription ${subscriptionId}`));
  }

  for (const [label, id] of [
    ["buyer customer", oneshotCustomerId],
    ["subscriber customer", subCustomerId],
  ] as [string, string][]) {
    if (id) {
      await client.sdk.customers.del(id).catch(() => errors.push(`${label} ${id}`));
    }
  }

  const svc = new StripeProducts(client);
  for (const [label, id] of [
    ["one-shot product", oneshotProductId],
    ["subscription product", subProductId],
  ] as [string, string][]) {
    if (id) {
      await svc.update(id, { active: false }).catch(() => errors.push(`${label} ${id}`));
    }
  }

  if (errors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional cleanup-failure notice
    console.warn(`⚠ Cleanup failed for: ${errors.join(", ")}`);
  }
});
