import { Polar } from "@polar-sh/sdk";
import type { ProductPriceCustomCreate } from "@polar-sh/sdk/models/components/productpricecustomcreate.js";
import type { ProductPriceFixedCreate } from "@polar-sh/sdk/models/components/productpricefixedcreate.js";
import type { ProductPriceFreeCreate } from "@polar-sh/sdk/models/components/productpricefreecreate.js";
import type { SubscriptionRecurringInterval } from "@polar-sh/sdk/models/components/subscriptionrecurringinterval.js";
import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { PaymentException } from "./PaymentException";
import type { BenefitType, CustomFieldType, IProduct, PriceType, SubscriptionPeriodType } from "./types";

@injectable()
export class PolarProduct {
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

  private toRecurringInterval(period?: SubscriptionPeriodType): SubscriptionRecurringInterval | null {
    if (!period) return null;

    switch (period) {
      case "monthly":
        return "month";
      case "yearly":
        return "year";
      default:
        return null;
    }
  }

  private toPriceCreate(price: PriceType): ProductPriceFixedCreate | ProductPriceCustomCreate | ProductPriceFreeCreate {
    const priceCurrency = price.priceCurrency ?? "usd";

    switch (price.type) {
      case "fixed":
        if (price.priceAmount === undefined) {
          throw new PaymentException("Fixed prices require a price amount.", "PRICE_AMOUNT_REQUIRED");
        }

        return { amountType: "fixed", priceCurrency, priceAmount: price.priceAmount };
      case "custom":
        return {
          amountType: "custom",
          priceCurrency,
          minimumAmount: price.minimumAmount,
          maximumAmount: price.maximumAmount,
          presetAmount: price.presetAmount,
        };
      case "free":
        return { amountType: "free" };
    }
  }

  public async create(data: IProduct): Promise<Omit<IProduct, "id">> {
    const response = await this.client.products.create({
      name: data.name,
      description: data.description ?? null,
      recurringInterval: this.toRecurringInterval(data.recurringInterval),
      prices: data.prices?.map((price) => this.toPriceCreate(price)) ?? [],
      medias: data.images?.map((image) => image.url) ?? null,
      organizationId: data.organizationId ?? null,
      metadata: data.metadata,
      attachedCustomFields: data.attachedCustomFields?.map((field) => ({
        customFieldId: field.customFieldId,
        required: field.required,
      })),
    });

    return this.mapResponse(response);
  }

  public async update(id: string, data: Partial<IProduct>): Promise<Omit<IProduct, "id">> {
    const response = await this.client.products.update({
      id,
      productUpdate: {
        name: data.name ?? null,
        description: data.description ?? null,
        isArchived: data.isArchived ?? null,
        recurringInterval: this.toRecurringInterval(data.recurringInterval),
        prices: data.prices?.map((price) => this.toPriceCreate(price)) ?? null,
        medias: data.images?.map((image) => image.url) ?? null,
        metadata: data.metadata,
        attachedCustomFields:
          data.attachedCustomFields?.map((field) => ({
            customFieldId: field.customFieldId,
            required: field.required,
          })) ?? null,
      },
    });

    return this.mapResponse(response);
  }

  public async remove(id: string): Promise<void> {
    await this.client.products.update({
      id,
      productUpdate: {
        isArchived: true,
      },
    });
  }

  private mapResponse(response: {
    id: string;
    createdAt: Date;
    modifiedAt: Date | null;
    name: string;
    description: string | null;
    isRecurring: boolean;
    isArchived: boolean;
    organizationId: string;
    metadata: Record<string, string | number | boolean>;
    prices: unknown[];
    benefits: unknown[];
    attachedCustomFields: unknown[];
  }): Omit<IProduct, "id"> {
    const product: Omit<IProduct, "id"> = {
      key: response.id,
      name: response.name,
      isRecurring: response.isRecurring,
      isArchived: response.isArchived,
      organizationId: response.organizationId,
      metadata: response.metadata,
      prices: response.prices as PriceType[],
      benefits: response.benefits as BenefitType[],
      attachedCustomFields: response.attachedCustomFields as CustomFieldType[],
    };

    if (response.createdAt) {
      product.createdAt = response.createdAt;
    }

    if (response.modifiedAt) {
      product.updatedAt = response.modifiedAt;
    }

    if (response.description) {
      product.description = response.description;
    }

    return product;
  }
}
