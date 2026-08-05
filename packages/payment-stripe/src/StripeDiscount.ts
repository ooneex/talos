import { inject, injectable } from "@talosjs/container";
import type Stripe from "stripe";
import { StripeClient } from "./StripeClient";
import type {
  StripeDiscountCreateType,
  StripeDiscountDurationType,
  StripeDiscountListOptionsType,
  StripeDiscountListResultType,
  StripeDiscountType,
  StripeDiscountTypeType,
  StripeDiscountUpdateType,
} from "./types";

@injectable()
export class StripeDiscount {
  constructor(@inject(StripeClient) private readonly client: StripeClient) {}

  public async create(data: StripeDiscountCreateType): Promise<StripeDiscountType> {
    const params: Stripe.CouponCreateParams = {
      name: data.name,
      duration: data.duration,
    };

    if (data.type === "percentage") {
      params.percent_off = data.amount;
    } else {
      params.amount_off = data.amount;
      params.currency = data.currency ?? "usd";
    }

    if (data.duration === "repeating" && data.durationInMonths !== undefined) {
      params.duration_in_months = data.durationInMonths;
    }

    if (data.maxRedemptions) params.max_redemptions = data.maxRedemptions;
    if (data.redeemBy) params.redeem_by = Math.floor(data.redeemBy.getTime() / 1000);
    if (data.metadata) params.metadata = data.metadata;
    if (data.appliesTo) params.applies_to = { products: data.appliesTo };

    const coupon = await this.client.sdk.coupons.create(params);

    if (data.code) {
      const promotionParams: Stripe.PromotionCodeCreateParams = {
        coupon: coupon.id,
        code: data.code,
      };

      if (data.maxRedemptions !== undefined) promotionParams.max_redemptions = data.maxRedemptions;
      if (data.redeemBy) promotionParams.expires_at = Math.floor(data.redeemBy.getTime() / 1000);

      await this.client.sdk.promotionCodes.create(promotionParams);
    }

    return this.mapCoupon(coupon);
  }

  public async update(id: string, data: StripeDiscountUpdateType): Promise<StripeDiscountType> {
    const params: Stripe.CouponUpdateParams = {};

    if (data.name !== undefined) params.name = data.name;
    if (data.metadata !== undefined) params.metadata = data.metadata;

    const coupon = await this.client.sdk.coupons.update(id, params);

    return this.mapCoupon(coupon);
  }

  public async remove(id: string): Promise<void> {
    await this.client.sdk.coupons.del(id);
  }

  public async get(id: string): Promise<StripeDiscountType> {
    const coupon = await this.client.sdk.coupons.retrieve(id);

    return this.mapCoupon(coupon);
  }

  public async list(options?: StripeDiscountListOptionsType): Promise<StripeDiscountListResultType> {
    const params: Stripe.CouponListParams = {
      limit: options?.limit ?? 10,
    };

    if (options?.startingAfter) params.starting_after = options.startingAfter;

    const response = await this.client.sdk.coupons.list(params);

    return {
      items: response.data.map((c) => this.mapCoupon(c)),
      hasMore: response.has_more,
    };
  }

  private mapCoupon(coupon: Stripe.Coupon): StripeDiscountType {
    const result: StripeDiscountType = {
      id: coupon.id,
      name: coupon.name ?? "",
      type: (coupon.percent_off !== null ? "percentage" : "fixed") as StripeDiscountTypeType,
      amount: coupon.percent_off !== null ? (coupon.percent_off ?? 0) : (coupon.amount_off ?? 0),
      duration: coupon.duration as StripeDiscountDurationType,
      timesRedeemed: coupon.times_redeemed,
      isValid: coupon.valid,
    };

    if (coupon.currency) result.currency = coupon.currency;
    if (coupon.duration_in_months) result.durationInMonths = coupon.duration_in_months;
    if (coupon.max_redemptions) result.maxRedemptions = coupon.max_redemptions;
    if (coupon.redeem_by) result.redeemBy = new Date(coupon.redeem_by * 1000);
    if (coupon.metadata) result.metadata = coupon.metadata as Record<string, string>;
    if (coupon.created) result.createdAt = new Date(coupon.created * 1000);

    return result;
  }
}
