import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import type { CurrencyCodeType } from "@talosjs/currencies";
import { Polar } from "@polar-sh/sdk";
import { PaymentException } from "./PaymentException";
import type { DiscountDurationType, DiscountResponseType, DiscountType, IDiscount, IProduct } from "./types";

@injectable()
export class PolarDiscount {
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

  private toDiscountType(type: DiscountType): "percentage" | "fixed" {
    return type === "percentage" ? "percentage" : "fixed";
  }

  private toDiscountDuration(duration: DiscountDurationType): "once" | "repeating" | "forever" {
    switch (duration) {
      case "once":
        return "once";
      case "repeating":
        return "repeating";
      case "forever":
        return "forever";
      default:
        return "once";
    }
  }

  public async create(data: IDiscount): Promise<IDiscount> {
    const discountType = this.toDiscountType(data.type);
    const duration = this.toDiscountDuration(data.duration);

    const basePayload = {
      name: data.name,
      code: data.code ?? null,
      startsAt: data.startAt ?? null,
      endsAt: data.endAt ?? null,
      maxRedemptions: data.maxRedemptions ?? null,
      organizationId: data.organizationId ?? null,
      metadata: data.metadata,
      products: data.applicableProducts?.map((p) => p.id as string) ?? null,
    };

    let response: unknown;

    if (discountType === "percentage") {
      if (duration === "repeating") {
        response = await this.client.discounts.create({
          ...basePayload,
          type: "percentage",
          basisPoints: data.amount * 100,
          duration: "repeating",
          durationInMonths: data.durationInMonths ?? 1,
        });
      } else {
        response = await this.client.discounts.create({
          ...basePayload,
          type: "percentage",
          basisPoints: data.amount * 100,
          duration: duration as "once" | "forever",
        });
      }
    } else {
      if (duration === "repeating") {
        response = await this.client.discounts.create({
          ...basePayload,
          type: "fixed",
          amount: data.amount,
          currency: data.currency ?? "usd",
          duration: "repeating",
          durationInMonths: data.durationInMonths ?? 1,
        });
      } else {
        response = await this.client.discounts.create({
          ...basePayload,
          type: "fixed",
          amount: data.amount,
          currency: data.currency ?? "usd",
          duration: duration as "once" | "forever",
        });
      }
    }

    return this.mapResponse(response as unknown as DiscountResponseType);
  }

  public async update(id: string, data: Partial<IDiscount>): Promise<IDiscount> {
    const response = await this.client.discounts.update({
      id,
      discountUpdate: {
        name: data.name ?? null,
        code: data.code ?? null,
        startsAt: data.startAt ?? null,
        endsAt: data.endAt ?? null,
        maxRedemptions: data.maxRedemptions ?? null,
        metadata: data.metadata,
        products: data.applicableProducts?.map((p) => p.id as string) ?? null,
      },
    });

    return this.mapResponse(response as unknown as DiscountResponseType);
  }

  public async remove(id: string): Promise<void> {
    await this.client.discounts.delete({ id });
  }

  public async get(id: string): Promise<IDiscount> {
    const response = await this.client.discounts.get({ id });

    return this.mapResponse(response as unknown as DiscountResponseType);
  }

  private mapResponse(response: DiscountResponseType): IDiscount {
    const discount: IDiscount = {
      id: response.id,
      name: response.name,
      type: response.type as DiscountType,
      amount: response.type === "percentage" ? (response.basisPoints ?? 0) / 100 : (response.amount ?? 0),
      duration: response.duration as DiscountDurationType,
      redemptionsCount: response.redemptionsCount,
      metadata: response.metadata,
    };

    if (response.createdAt) {
      discount.createdAt = response.createdAt;
    }

    if (response.modifiedAt) {
      discount.updatedAt = response.modifiedAt;
    }

    if (response.code) {
      discount.code = response.code;
    }

    if (response.startsAt) {
      discount.startAt = response.startsAt;
    }

    if (response.endsAt) {
      discount.endAt = response.endsAt;
    }

    if (response.maxRedemptions) {
      discount.maxRedemptions = response.maxRedemptions;
    }

    if (response.durationInMonths) {
      discount.durationInMonths = response.durationInMonths;
    }

    if (response.organizationId) {
      discount.organizationId = response.organizationId;
    }

    if (response.currency) {
      discount.currency = response.currency as CurrencyCodeType;
    }

    if (response.products) {
      discount.applicableProducts = response.products.map(
        (p: { id: string; name: string }) =>
          ({
            id: p.id,
            name: p.name,
          }) as IProduct,
      );
    }

    return discount;
  }
}
