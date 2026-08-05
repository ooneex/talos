import { inject, injectable } from "@talosjs/container";
import type Stripe from "stripe";
import { StripeClient } from "./StripeClient";
import type {
  StripePriceCreateType,
  StripePriceListOptionsType,
  StripePriceListResultType,
  StripePriceType,
  StripeProductCreateType,
  StripeProductListOptionsType,
  StripeProductListResultType,
  StripeProductType,
  StripeProductUpdateType,
} from "./types";

@injectable()
export class StripeProducts {
  constructor(@inject(StripeClient) private readonly client: StripeClient) {}

  public async create(data: StripeProductCreateType): Promise<StripeProductType> {
    const params: Stripe.ProductCreateParams = {
      name: data.name,
    };

    if (data.description) params.description = data.description;
    if (data.images) params.images = data.images;
    if (data.metadata) params.metadata = data.metadata;
    if (data.active !== undefined) params.active = data.active;

    const product = await this.client.sdk.products.create(params);

    return this.mapProduct(product);
  }

  public async update(id: string, data: StripeProductUpdateType): Promise<StripeProductType> {
    const params: Stripe.ProductUpdateParams = {};

    if (data.name) params.name = data.name;
    if (data.description !== undefined) params.description = data.description;
    if (data.images) params.images = data.images;
    if (data.metadata) params.metadata = data.metadata;
    if (data.active !== undefined) params.active = data.active;

    const product = await this.client.sdk.products.update(id, params);

    return this.mapProduct(product);
  }

  public async remove(id: string): Promise<void> {
    await this.client.sdk.products.del(id);
  }

  public async get(id: string): Promise<StripeProductType> {
    const product = await this.client.sdk.products.retrieve(id);

    return this.mapProduct(product);
  }

  public async list(options?: StripeProductListOptionsType): Promise<StripeProductListResultType> {
    const params: Stripe.ProductListParams = {
      limit: options?.limit ?? 10,
    };

    if (options?.active !== undefined) params.active = options.active;
    if (options?.startingAfter) params.starting_after = options.startingAfter;

    const response = await this.client.sdk.products.list(params);

    return {
      items: response.data.map((p) => this.mapProduct(p)),
      hasMore: response.has_more,
    };
  }

  public async createPrice(data: StripePriceCreateType): Promise<StripePriceType> {
    const params: Stripe.PriceCreateParams = {
      product: data.productId,
      currency: data.currency,
      unit_amount: data.unitAmount,
    };

    if (data.type === "recurring" && data.interval) {
      params.recurring = {
        interval: data.interval,
        interval_count: data.intervalCount ?? 1,
      };
    }

    if (data.metadata) params.metadata = data.metadata;

    const price = await this.client.sdk.prices.create(params);

    return this.mapPrice(price);
  }

  public async getPrice(id: string): Promise<StripePriceType> {
    const price = await this.client.sdk.prices.retrieve(id);

    return this.mapPrice(price);
  }

  public async listPrices(productId: string, options?: StripePriceListOptionsType): Promise<StripePriceListResultType> {
    const params: Stripe.PriceListParams = {
      product: productId,
      limit: options?.limit ?? 10,
    };

    if (options?.active !== undefined) params.active = options.active;

    const response = await this.client.sdk.prices.list(params);

    return {
      items: response.data.map((p) => this.mapPrice(p)),
      hasMore: response.has_more,
    };
  }

  private mapProduct(product: Stripe.Product): StripeProductType {
    const result: StripeProductType = {
      id: product.id,
      name: product.name,
      active: product.active,
    };

    if (product.description) result.description = product.description;
    if (product.images?.length) result.images = product.images;
    if (product.metadata) result.metadata = product.metadata as Record<string, string>;
    if (product.created) result.createdAt = new Date(product.created * 1000);
    if (product.updated) result.updatedAt = new Date(product.updated * 1000);

    return result;
  }

  private mapPrice(price: Stripe.Price): StripePriceType {
    const result: StripePriceType = {
      id: price.id,
      productId: typeof price.product === "string" ? price.product : price.product.id,
      currency: price.currency,
      unitAmount: price.unit_amount,
      type: price.type,
      active: price.active,
    };

    if (price.recurring) {
      result.interval = price.recurring.interval;
      result.intervalCount = price.recurring.interval_count;
    }

    if (price.metadata) result.metadata = price.metadata as Record<string, string>;
    if (price.created) result.createdAt = new Date(price.created * 1000);

    return result;
  }
}
