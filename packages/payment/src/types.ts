import type { CurrencyCodeType } from "@talosjs/currencies";
import type { IBase, ScalarType } from "@talosjs/types";

export enum EPriceType {
  FIXED = "fixed",
  CUSTOM = "custom",
  FREE = "free",
}

export type PriceTypeType = `${EPriceType}`;

export type ProductImageType = {
  id: string;
  url: string;
};

export type PriceType = {
  type: PriceTypeType;
  priceCurrency?: string;
  priceAmount?: number;
  minimumAmount?: number;
  maximumAmount?: number;
  presetAmount?: number;
};

export type CustomFieldType = {
  customFieldId: string;
  required: boolean;
};

export enum EDiscountType {
  PERCENTAGE = "percentage",
  FIXED = "fixed",
}

export enum EDiscountDuration {
  ONCE = "once",
  REPEATING = "repeating",
  FOREVER = "forever",
}

export type DiscountDurationType = `${EDiscountDuration}`;

export enum ESubscriptionPeriod {
  MONTHLY = "monthly",
  YEARLY = "yearly",
  WEEKLY = "weekly",
  DAILY = "daily",
}

export type DiscountType = `${EDiscountType}`;
export type SubscriptionPeriodType = `${ESubscriptionPeriod}`;

export enum EBenefitType {
  CREDITS = "credits",
  LICENSE_KEYS = "license_keys",
  FILE_DOWNLOADS = "file_downloads",
  GITHUB_REPOSITORY_ACCESS = "github_repository_access",
  DISCORD_ACCESS = "discord_access",
  CUSTOM = "custom",
}

export type BenefitTypeType = `${EBenefitType}`;

export enum EGitHubPermission {
  READ = "read",
  TRIAGE = "triage",
  WRITE = "write",
  MAINTAIN = "maintain",
  ADMIN = "admin",
}

export type GitHubPermissionType = `${EGitHubPermission}`;

export type BenefitBaseType = {
  type: BenefitTypeType;
  name: string;
  description?: string;
  isSelectable?: boolean;
  isDeletable?: boolean;
  organizationId?: string;
};

export type CreditsBenefitType = BenefitBaseType & {
  type: typeof EBenefitType.CREDITS;
  amount: number;
  rollover?: boolean;
};

export type LicenseKeysBenefitType = BenefitBaseType & {
  type: typeof EBenefitType.LICENSE_KEYS;
  prefix?: string;
  expiresInDays?: number;
  expiresInMonths?: number;
  expiresInYears?: number;
  activationLimit?: number;
  usageLimit?: number;
};

export type FileDownloadsBenefitType = BenefitBaseType & {
  type: typeof EBenefitType.FILE_DOWNLOADS;
  files?: BenefitFileType[];
};

export type BenefitFileType = {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  checksum?: string;
  isEnabled?: boolean;
};

export type GitHubRepositoryAccessBenefitType = BenefitBaseType & {
  type: typeof EBenefitType.GITHUB_REPOSITORY_ACCESS;
  repositoryOwner: string;
  repositoryName: string;
  permission?: GitHubPermissionType;
};

export type DiscordAccessBenefitType = BenefitBaseType & {
  type: typeof EBenefitType.DISCORD_ACCESS;
  guildId: string;
  roleId: string;
};

export type CustomBenefitType = BenefitBaseType & {
  type: typeof EBenefitType.CUSTOM;
  note?: string;
};

export type BenefitType =
  | CreditsBenefitType
  | LicenseKeysBenefitType
  | FileDownloadsBenefitType
  | GitHubRepositoryAccessBenefitType
  | DiscordAccessBenefitType
  | CustomBenefitType;

export interface IProduct extends IBase {
  key?: string;
  name: string;
  description?: string;
  categories?: string[];
  currency?: CurrencyCodeType;
  price?: number;
  barcode?: string;
  images?: ProductImageType[];
  attributes?: Record<string, ScalarType>;
  tags?: string[];
  isRecurring?: boolean;
  isArchived?: boolean;
  organizationId?: string;
  recurringInterval?: SubscriptionPeriodType;
  metadata?: Record<string, string | number | boolean>;
  prices?: PriceType[];
  benefits?: BenefitType[];
  attachedCustomFields?: CustomFieldType[];
}

export interface IFeature extends IBase {
  name: string;
  description?: string;
  isEnabled?: boolean;
  limit?: number;
}

export interface IPlan extends IBase {
  name: string;
  description?: string;
  currency: CurrencyCodeType;
  price: number;
  period: ESubscriptionPeriod;
  periodCount?: number;
  features?: IFeature[];
  isActive?: boolean;
  trialDays?: number;
}

export interface ICredit extends IBase {
  balance: number;
  currency?: CurrencyCodeType;
  expiresAt?: Date;
  description?: string;
}

export interface ISubscription extends IBase {
  discounts?: IDiscount[];
  plans?: IPlan[];
  credits?: ICredit[];
  startAt: Date;
  endAt?: Date;
  isTrial?: boolean;
  isActive?: boolean;
}

export interface IDiscount extends IBase {
  key?: string;
  name: string;
  description?: string;
  code?: string;
  type: DiscountType;
  amount: number;
  currency?: CurrencyCodeType;
  duration: DiscountDurationType;
  durationInMonths?: number;
  startAt?: Date;
  endAt?: Date;
  maxUses?: number;
  usedCount?: number;
  maxRedemptions?: number;
  redemptionsCount?: number;
  isActive?: boolean;
  minimumAmount?: number;
  applicableProducts?: IProduct[];
  applicablePlans?: IPlan[];
  organizationId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export enum ECheckoutStatus {
  OPEN = "open",
  EXPIRED = "expired",
  CONFIRMED = "confirmed",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
}

export type CheckoutStatusType = `${ECheckoutStatus}`;

export type CheckoutCustomerType = {
  id?: string;
  email?: string;
  name?: string;
  externalId?: string;
  billingAddress?: CheckoutAddressType;
  taxId?: string;
};

export type CheckoutAddressType = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type CheckoutCreateType = {
  products: string[];
  customerExternalId?: string;
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  customerBillingAddress?: CheckoutAddressType;
  customerTaxId?: string;
  discountId?: string;
  allowDiscountCodes?: boolean;
  successUrl?: string;
  embedOrigin?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type CheckoutType = {
  id: string;
  url?: string;
  embedId?: string;
  status: CheckoutStatusType;
  clientSecret: string;
  createdAt?: Date;
  updatedAt?: Date;
  expiresAt?: Date;
  successUrl?: string;
  embedOrigin?: string;
  amount?: number;
  taxAmount?: number;
  currency?: CurrencyCodeType;
  subtotalAmount?: number;
  totalAmount?: number;
  productId?: string;
  productPriceId?: string;
  discountId?: string;
  allowDiscountCodes?: boolean;
  isDiscountApplicable?: boolean;
  isPaymentRequired?: boolean;
  customer?: CheckoutCustomerType;
  metadata?: Record<string, string | number | boolean>;
};

export type CustomerSessionCreateType = {
  customerId: string;
};

export type CustomerSessionType = {
  id: string;
  token: string;
  customerPortalUrl: string;
  createdAt?: Date;
  expiresAt?: Date;
  customerId?: string;
};

export type CustomerAddressType = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type CustomerCreateType = {
  email: string;
  name?: string;
  externalId?: string;
  billingAddress?: CustomerAddressType;
  taxId?: string;
  organizationId?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type CustomerUpdateType = {
  email?: string;
  name?: string;
  billingAddress?: CustomerAddressType;
  taxId?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type CustomerType = {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  externalId?: string;
  avatarUrl?: string;
  billingAddress?: CustomerAddressType;
  taxId?: string;
  organizationId?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
};

export type CustomerListOptionsType = {
  organizationId?: string;
  email?: string;
  query?: string;
  page?: number;
  limit?: number;
};

export type CustomerListResultType = {
  items: CustomerType[];
  pagination: {
    totalCount: number;
    maxPage: number;
  };
};

export enum EAnalyticsInterval {
  YEAR = "year",
  MONTH = "month",
  WEEK = "week",
  DAY = "day",
  HOUR = "hour",
}

export type AnalyticsIntervalType = `${EAnalyticsInterval}`;

export enum EBillingType {
  ONE_TIME = "one_time",
  RECURRING = "recurring",
}

export type BillingTypeType = `${EBillingType}`;

export type AnalyticsOptionsType = {
  startDate: Date;
  endDate: Date;
  interval: AnalyticsIntervalType;
  organizationId?: string | string[];
  productId?: string | string[];
  billingType?: BillingTypeType | BillingTypeType[];
  customerId?: string | string[];
};

export type AnalyticsPeriodType = {
  timestamp: Date;
  orders: number;
  revenue: number;
  cumulativeRevenue: number;
  averageOrderValue: number;
  oneTimeProducts: number;
  oneTimeProductsRevenue: number;
  newSubscriptions: number;
  newSubscriptionsRevenue: number;
  renewedSubscriptions: number;
  renewedSubscriptionsRevenue: number;
  activeSubscriptions: number;
  monthlyRecurringRevenue: number;
};

export type AnalyticsMetricInfoType = {
  slug: string;
  displayName: string;
  type: string;
};

export type AnalyticsMetricsType = {
  orders: AnalyticsMetricInfoType;
  revenue: AnalyticsMetricInfoType;
  cumulativeRevenue: AnalyticsMetricInfoType;
  averageOrderValue: AnalyticsMetricInfoType;
  oneTimeProducts: AnalyticsMetricInfoType;
  oneTimeProductsRevenue: AnalyticsMetricInfoType;
  newSubscriptions: AnalyticsMetricInfoType;
  newSubscriptionsRevenue: AnalyticsMetricInfoType;
  renewedSubscriptions: AnalyticsMetricInfoType;
  renewedSubscriptionsRevenue: AnalyticsMetricInfoType;
  activeSubscriptions: AnalyticsMetricInfoType;
  monthlyRecurringRevenue: AnalyticsMetricInfoType;
};

export type AnalyticsResponseType = {
  periods: AnalyticsPeriodType[];
  metrics: AnalyticsMetricsType;
};

export type AnalyticsIntervalLimitType = {
  maxDays: number;
};

export type AnalyticsIntervalsLimitsType = {
  hour: AnalyticsIntervalLimitType;
  day: AnalyticsIntervalLimitType;
  week: AnalyticsIntervalLimitType;
  month: AnalyticsIntervalLimitType;
  year: AnalyticsIntervalLimitType;
};

export type AnalyticsLimitsType = {
  minDate: Date;
  intervals: AnalyticsIntervalsLimitsType;
};

export type CustomerSessionResponseType = {
  id: string;
  token: string;
  customerPortalUrl: string;
  createdAt?: Date;
  expiresAt?: Date;
  customerId?: string;
};

export type DiscountResponseType = {
  id: string;
  createdAt?: Date;
  modifiedAt?: Date;
  name: string;
  code?: string;
  type: string;
  basisPoints?: number;
  amount?: number;
  currency?: string;
  duration: string;
  durationInMonths?: number;
  startsAt?: Date;
  endsAt?: Date;
  maxRedemptions?: number;
  redemptionsCount: number;
  organizationId?: string;
  metadata: Record<string, string | number | boolean>;
  products?: { id: string; name: string }[];
};

export type CheckoutResponseType = {
  id: string;
  createdAt?: Date;
  modifiedAt?: Date;
  url?: string;
  embedId?: string;
  status: string;
  clientSecret: string;
  expiresAt?: Date;
  successUrl?: string;
  embedOrigin?: string;
  amount?: number;
  taxAmount?: number;
  currency?: string;
  subtotalAmount?: number;
  totalAmount?: number;
  productId?: string;
  productPriceId?: string;
  discountId?: string;
  allowDiscountCodes?: boolean;
  isDiscountApplicable?: boolean;
  isPaymentRequired?: boolean;
  customer?: {
    id?: string;
    email?: string;
    name?: string;
    externalId?: string;
    billingAddress?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
    taxId?: string;
  };
  metadata: Record<string, string | number | boolean>;
};

export type CustomerResponseType = {
  id: string;
  createdAt?: Date;
  modifiedAt?: Date;
  deletedAt?: Date;
  email: string;
  emailVerified?: boolean;
  name?: string;
  externalId?: string;
  avatarUrl?: string;
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  taxId?: string | [string, string];
  organizationId?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type CustomerListResponseType = {
  result: {
    items: CustomerResponseType[];
    pagination: {
      totalCount: number;
      maxPage: number;
    };
  };
};
