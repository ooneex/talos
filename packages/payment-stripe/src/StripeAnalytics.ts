import { inject, injectable } from "@talosjs/container";
import { StripeClient } from "./StripeClient";
import type { StripeAnalyticsOptionsType, StripeAnalyticsSummaryType } from "./types";

@injectable()
export class StripeAnalytics {
  constructor(@inject(StripeClient) private readonly client: StripeClient) {}

  public async get(options: StripeAnalyticsOptionsType): Promise<StripeAnalyticsSummaryType> {
    const startTimestamp = Math.floor(options.startDate.getTime() / 1000);
    const endTimestamp = Math.floor(options.endDate.getTime() / 1000);

    const [charges, subscriptions] = await Promise.all([
      this.client.sdk.charges.list({
        created: { gte: startTimestamp, lte: endTimestamp },
        limit: options.limit ?? 100,
      }),
      this.client.sdk.subscriptions.list({
        created: { gte: startTimestamp, lte: endTimestamp },
        limit: 100,
      }),
    ]);

    let totalRevenue = 0;
    let totalTransactions = 0;
    const periodsMap = new Map<string, { revenue: number; count: number; currency: string }>();

    for (const charge of charges.data) {
      if (charge.status !== "succeeded") continue;
      if (options.currency && charge.currency !== options.currency) continue;

      totalRevenue += charge.amount;
      totalTransactions++;

      const date = new Date(charge.created * 1000).toISOString().split("T")[0] as string;
      const existing = periodsMap.get(date);

      if (existing) {
        existing.revenue += charge.amount;
        existing.count++;
      } else {
        periodsMap.set(date, { revenue: charge.amount, count: 1, currency: charge.currency });
      }
    }

    const periods = Array.from(periodsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        currency: data.currency,
        transactionCount: data.count,
      }));

    let activeSubscriptions = 0;
    let newSubscriptions = 0;
    let canceledSubscriptions = 0;

    for (const sub of subscriptions.data) {
      if (sub.status === "active") activeSubscriptions++;
      if (sub.status === "canceled") canceledSubscriptions++;
      if (sub.created >= startTimestamp && sub.created <= endTimestamp) newSubscriptions++;
    }

    const currency = options.currency ?? charges.data[0]?.currency ?? "usd";

    return {
      totalRevenue,
      totalTransactions,
      currency,
      periods,
      activeSubscriptions,
      newSubscriptions,
      canceledSubscriptions,
    };
  }
}
