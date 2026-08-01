export enum EStripeEvent {
  CheckoutSessionCompleted = "checkout.session.completed",
  InvoicePaid = "invoice.paid",
  CustomerSubscriptionDeleted = "customer.subscription.deleted",
  CustomerSubscriptionUpdated = "customer.subscription.updated",
  PaymentIntentPaymentFailed = "payment_intent.payment_failed",
}

export type StripeEventType = `${EStripeEvent}`;

// ─── Checkout Session ──────────────────────────────────────────────────────

export type LineItemType = {
  price: string;
  quantity?: number;
};

export type CheckoutSessionCreateType = {
  lineItems: LineItemType[];
  mode: "payment" | "subscription" | "setup";
  successUrl: string;
  cancelUrl?: string;
  customerId?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
};

export type CheckoutSessionType = {
  id: string;
  url: string | null;
  status: string | null;
  paymentStatus: string;
  customerId: string | null;
  customerEmail: string | null;
  amountTotal: number | null;
  currency: string | null;
  metadata: Record<string, string>;
};

// ─── Webhook Event Data ────────────────────────────────────────────────────

export type CheckoutSessionCompletedDataType = {
  id: string;
  customerId: string | null;
  customerEmail: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentStatus: string;
  subscriptionId: string | null;
  metadata: Record<string, string>;
};

export type InvoicePaidDataType = {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  amountPaid: number;
  currency: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
};

export type CustomerSubscriptionDeletedDataType = {
  id: string;
  customerId: string | null;
  status: string;
  currentPeriodEnd: Date;
  canceledAt: Date | null;
  metadata: Record<string, string>;
};

export type CustomerSubscriptionUpdatedDataType = {
  id: string;
  customerId: string | null;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, string>;
};

export type PaymentIntentPaymentFailedDataType = {
  id: string;
  customerId: string | null;
  amount: number;
  currency: string;
  lastPaymentErrorMessage: string | null;
};

// ─── Webhook Event Union ───────────────────────────────────────────────────

export type CheckoutSessionCompletedEventType = {
  type: EStripeEvent.CheckoutSessionCompleted;
  id: string;
  created: Date;
  data: CheckoutSessionCompletedDataType;
};

export type InvoicePaidEventType = {
  type: EStripeEvent.InvoicePaid;
  id: string;
  created: Date;
  data: InvoicePaidDataType;
};

export type CustomerSubscriptionDeletedEventType = {
  type: EStripeEvent.CustomerSubscriptionDeleted;
  id: string;
  created: Date;
  data: CustomerSubscriptionDeletedDataType;
};

export type CustomerSubscriptionUpdatedEventType = {
  type: EStripeEvent.CustomerSubscriptionUpdated;
  id: string;
  created: Date;
  data: CustomerSubscriptionUpdatedDataType;
};

export type PaymentIntentPaymentFailedEventType = {
  type: EStripeEvent.PaymentIntentPaymentFailed;
  id: string;
  created: Date;
  data: PaymentIntentPaymentFailedDataType;
};

export type WebhookEventType =
  | CheckoutSessionCompletedEventType
  | InvoicePaidEventType
  | CustomerSubscriptionDeletedEventType
  | CustomerSubscriptionUpdatedEventType
  | PaymentIntentPaymentFailedEventType;

// ─── Provider Interface ────────────────────────────────────────────────────

export interface IPaymentProvider {
  createCheckoutSession(data: CheckoutSessionCreateType): Promise<CheckoutSessionType>;
  retrieveSession(id: string): Promise<CheckoutSessionType>;
  constructWebhookEvent(payload: string | Buffer, signature: string, secret: string): Promise<WebhookEventType>;
}

// ─── Customer ─────────────────────────────────────────────────────────────

export type StripeCustomerAddressType = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type StripeCustomerCreateType = {
  email: string;
  name?: string;
  phone?: string;
  billingAddress?: StripeCustomerAddressType;
  metadata?: Record<string, string>;
};

export type StripeCustomerUpdateType = {
  email?: string;
  name?: string;
  phone?: string;
  billingAddress?: StripeCustomerAddressType;
  metadata?: Record<string, string>;
};

export type StripeCustomerType = {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  billingAddress?: StripeCustomerAddressType;
  metadata?: Record<string, string>;
  createdAt?: Date;
};

export type StripeCustomerListOptionsType = {
  email?: string;
  limit?: number;
  startingAfter?: string;
};

export type StripeCustomerListResultType = {
  items: StripeCustomerType[];
  hasMore: boolean;
};

// ─── Customer Portal ───────────────────────────────────────────────────────

export type StripeCustomerPortalCreateType = {
  customerId: string;
  returnUrl: string;
};

export type StripeCustomerPortalType = {
  id: string;
  url: string;
  returnUrl: string;
  createdAt?: Date;
};

// ─── Discount / Coupon ────────────────────────────────────────────────────

export enum EStripeDiscountType {
  PERCENTAGE = "percentage",
  FIXED = "fixed",
}

export type StripeDiscountTypeType = `${EStripeDiscountType}`;

export enum EStripeDiscountDuration {
  ONCE = "once",
  REPEATING = "repeating",
  FOREVER = "forever",
}

export type StripeDiscountDurationType = `${EStripeDiscountDuration}`;

export type StripeDiscountCreateType = {
  name: string;
  type: StripeDiscountTypeType;
  amount: number;
  currency?: string;
  duration: StripeDiscountDurationType;
  durationInMonths?: number;
  code?: string;
  maxRedemptions?: number;
  redeemBy?: Date;
  metadata?: Record<string, string>;
  appliesTo?: string[];
};

export type StripeDiscountUpdateType = {
  name?: string;
  metadata?: Record<string, string>;
};

export type StripeDiscountType = {
  id: string;
  name: string;
  type: StripeDiscountTypeType;
  amount: number;
  currency?: string;
  duration: StripeDiscountDurationType;
  durationInMonths?: number;
  code?: string;
  maxRedemptions?: number;
  timesRedeemed?: number;
  redeemBy?: Date;
  isValid?: boolean;
  metadata?: Record<string, string>;
  createdAt?: Date;
};

export type StripeDiscountListOptionsType = {
  limit?: number;
  startingAfter?: string;
};

export type StripeDiscountListResultType = {
  items: StripeDiscountType[];
  hasMore: boolean;
};

// ─── Products ─────────────────────────────────────────────────────────────

export type StripeProductCreateType = {
  name: string;
  description?: string;
  images?: string[];
  metadata?: Record<string, string>;
  active?: boolean;
};

export type StripeProductUpdateType = {
  name?: string;
  description?: string;
  images?: string[];
  metadata?: Record<string, string>;
  active?: boolean;
};

export type StripeProductType = {
  id: string;
  name: string;
  description?: string;
  images?: string[];
  active?: boolean;
  metadata?: Record<string, string>;
  createdAt?: Date;
  updatedAt?: Date;
};

export type StripeProductListOptionsType = {
  limit?: number;
  active?: boolean;
  startingAfter?: string;
};

export type StripeProductListResultType = {
  items: StripeProductType[];
  hasMore: boolean;
};

export enum EStripePriceType {
  ONE_TIME = "one_time",
  RECURRING = "recurring",
}

export type StripePriceTypeType = `${EStripePriceType}`;

export enum EStripePriceInterval {
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
  YEAR = "year",
}

export type StripePriceIntervalType = `${EStripePriceInterval}`;

export type StripePriceCreateType = {
  productId: string;
  currency: string;
  unitAmount: number;
  type?: StripePriceTypeType;
  interval?: StripePriceIntervalType;
  intervalCount?: number;
  metadata?: Record<string, string>;
};

export type StripePriceType = {
  id: string;
  productId: string;
  currency: string;
  unitAmount: number | null;
  type: StripePriceTypeType;
  interval?: StripePriceIntervalType;
  intervalCount?: number;
  active?: boolean;
  metadata?: Record<string, string>;
  createdAt?: Date;
};

export type StripePriceListOptionsType = {
  limit?: number;
  active?: boolean;
};

export type StripePriceListResultType = {
  items: StripePriceType[];
  hasMore: boolean;
};

// ─── Analytics ────────────────────────────────────────────────────────────

export type StripeAnalyticsOptionsType = {
  startDate: Date;
  endDate: Date;
  limit?: number;
  currency?: string;
};

export type StripeAnalyticsPeriodType = {
  date: string;
  revenue: number;
  currency: string;
  transactionCount: number;
};

export type StripeAnalyticsSummaryType = {
  totalRevenue: number;
  totalTransactions: number;
  currency: string;
  periods: StripeAnalyticsPeriodType[];
  activeSubscriptions?: number;
  newSubscriptions?: number;
  canceledSubscriptions?: number;
};
