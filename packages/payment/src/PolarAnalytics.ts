import { Polar } from "@polar-sh/sdk";
import type { RFCDate } from "@polar-sh/sdk/types/rfcdate.js";
import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { PaymentException } from "./PaymentException";
import type {
  AnalyticsIntervalsLimitsType,
  AnalyticsLimitsType,
  AnalyticsMetricInfoType,
  AnalyticsMetricsType,
  AnalyticsOptionsType,
  AnalyticsPeriodType,
  AnalyticsResponseType,
  BillingTypeType,
} from "./types";

@injectable()
export class PolarAnalytics {
  private client: Polar;

  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    const accessToken = this.env.POLAR_ACCESS_TOKEN;

    if (!accessToken) {
      throw new PaymentException(
        "Polar access token is required. Please set the POLAR_ACCESS_TOKEN environment variable.",
        "TOKEN_REQUIRED",
      );
    }

    this.client = new Polar({
      accessToken,
      server: (this.env.POLAR_ENVIRONMENT as "sandbox" | "production") || "production",
    });
  }

  public async get(options: AnalyticsOptionsType): Promise<AnalyticsResponseType> {
    const response = await this.client.metrics.get({
      startDate: this.toRFCDate(options.startDate),
      endDate: this.toRFCDate(options.endDate),
      interval: options.interval,
      organizationId: options.organizationId ?? null,
      productId: options.productId ?? null,
      billingType: (options.billingType as BillingTypeType) ?? null,
      customerId: options.customerId ?? null,
    });

    return {
      periods: response.periods.map((period) => this.mapPeriod(period)),
      metrics: this.mapMetrics(response.metrics),
    };
  }

  public async getLimits(): Promise<AnalyticsLimitsType> {
    const response = await this.client.metrics.limits();

    return {
      minDate: new Date(response.minDate.toString()),
      intervals: this.mapIntervalsLimits(response.intervals),
    };
  }

  private toRFCDate(date: Date): RFCDate {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}` as unknown as RFCDate;
  }

  private mapPeriod(period: {
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
  }): AnalyticsPeriodType {
    return {
      timestamp: period.timestamp,
      orders: period.orders,
      revenue: period.revenue,
      cumulativeRevenue: period.cumulativeRevenue,
      averageOrderValue: period.averageOrderValue,
      oneTimeProducts: period.oneTimeProducts,
      oneTimeProductsRevenue: period.oneTimeProductsRevenue,
      newSubscriptions: period.newSubscriptions,
      newSubscriptionsRevenue: period.newSubscriptionsRevenue,
      renewedSubscriptions: period.renewedSubscriptions,
      renewedSubscriptionsRevenue: period.renewedSubscriptionsRevenue,
      activeSubscriptions: period.activeSubscriptions,
      monthlyRecurringRevenue: period.monthlyRecurringRevenue,
    };
  }

  private mapMetricInfo(metric: { slug: string; displayName: string; type: string }): AnalyticsMetricInfoType {
    return {
      slug: metric.slug,
      displayName: metric.displayName,
      type: metric.type,
    };
  }

  private mapMetrics(metrics: {
    orders: { slug: string; displayName: string; type: string };
    revenue: { slug: string; displayName: string; type: string };
    cumulativeRevenue: { slug: string; displayName: string; type: string };
    averageOrderValue: { slug: string; displayName: string; type: string };
    oneTimeProducts: { slug: string; displayName: string; type: string };
    oneTimeProductsRevenue: { slug: string; displayName: string; type: string };
    newSubscriptions: { slug: string; displayName: string; type: string };
    newSubscriptionsRevenue: { slug: string; displayName: string; type: string };
    renewedSubscriptions: { slug: string; displayName: string; type: string };
    renewedSubscriptionsRevenue: { slug: string; displayName: string; type: string };
    activeSubscriptions: { slug: string; displayName: string; type: string };
    monthlyRecurringRevenue: { slug: string; displayName: string; type: string };
  }): AnalyticsMetricsType {
    return {
      orders: this.mapMetricInfo(metrics.orders),
      revenue: this.mapMetricInfo(metrics.revenue),
      cumulativeRevenue: this.mapMetricInfo(metrics.cumulativeRevenue),
      averageOrderValue: this.mapMetricInfo(metrics.averageOrderValue),
      oneTimeProducts: this.mapMetricInfo(metrics.oneTimeProducts),
      oneTimeProductsRevenue: this.mapMetricInfo(metrics.oneTimeProductsRevenue),
      newSubscriptions: this.mapMetricInfo(metrics.newSubscriptions),
      newSubscriptionsRevenue: this.mapMetricInfo(metrics.newSubscriptionsRevenue),
      renewedSubscriptions: this.mapMetricInfo(metrics.renewedSubscriptions),
      renewedSubscriptionsRevenue: this.mapMetricInfo(metrics.renewedSubscriptionsRevenue),
      activeSubscriptions: this.mapMetricInfo(metrics.activeSubscriptions),
      monthlyRecurringRevenue: this.mapMetricInfo(metrics.monthlyRecurringRevenue),
    };
  }

  private mapIntervalsLimits(intervals: {
    hour: { maxDays: number };
    day: { maxDays: number };
    week: { maxDays: number };
    month: { maxDays: number };
    year: { maxDays: number };
  }): AnalyticsIntervalsLimitsType {
    return {
      hour: { maxDays: intervals.hour.maxDays },
      day: { maxDays: intervals.day.maxDays },
      week: { maxDays: intervals.week.maxDays },
      month: { maxDays: intervals.month.maxDays },
      year: { maxDays: intervals.year.maxDays },
    };
  }
}
