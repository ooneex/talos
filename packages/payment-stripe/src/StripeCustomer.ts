import { inject, injectable } from "@talosjs/container";
import type Stripe from "stripe";
import { StripeClient } from "./StripeClient";
import type {
  StripeCustomerAddressType,
  StripeCustomerCreateType,
  StripeCustomerListOptionsType,
  StripeCustomerListResultType,
  StripeCustomerType,
  StripeCustomerUpdateType,
} from "./types";

@injectable()
export class StripeCustomer {
  constructor(@inject(StripeClient) private readonly client: StripeClient) {}

  public async create(data: StripeCustomerCreateType): Promise<StripeCustomerType> {
    const params: Stripe.CustomerCreateParams = {
      email: data.email,
    };

    if (data.name) params.name = data.name;
    if (data.phone) params.phone = data.phone;
    if (data.metadata) params.metadata = data.metadata;
    if (data.billingAddress) params.address = this.toStripeAddress(data.billingAddress);

    const customer = await this.client.sdk.customers.create(params);

    return this.mapCustomer(customer);
  }

  public async update(id: string, data: StripeCustomerUpdateType): Promise<StripeCustomerType> {
    const params: Stripe.CustomerUpdateParams = {};

    if (data.email) params.email = data.email;
    if (data.name !== undefined) params.name = data.name ?? "";
    if (data.phone !== undefined) params.phone = data.phone;
    if (data.metadata) params.metadata = data.metadata;
    if (data.billingAddress) params.address = this.toStripeAddress(data.billingAddress);

    const customer = await this.client.sdk.customers.update(id, params);

    return this.mapCustomer(customer);
  }

  public async remove(id: string): Promise<void> {
    await this.client.sdk.customers.del(id);
  }

  public async get(id: string): Promise<StripeCustomerType> {
    const customer = await this.client.sdk.customers.retrieve(id);

    if (customer.deleted) {
      throw new Error(`Customer ${id} has been deleted`);
    }

    return this.mapCustomer(customer);
  }

  public async list(options?: StripeCustomerListOptionsType): Promise<StripeCustomerListResultType> {
    const params: Stripe.CustomerListParams = {
      limit: options?.limit ?? 10,
    };

    if (options?.email) params.email = options.email;
    if (options?.startingAfter) params.starting_after = options.startingAfter;

    const response = await this.client.sdk.customers.list(params);

    return {
      items: response.data.map((c) => this.mapCustomer(c)),
      hasMore: response.has_more,
    };
  }

  private toStripeAddress(address: StripeCustomerAddressType): Stripe.AddressParam {
    const params: Stripe.AddressParam = {
      line1: address.line1 ?? "",
    };

    if (address.line2 !== undefined) params.line2 = address.line2;
    if (address.city !== undefined) params.city = address.city;
    if (address.state !== undefined) params.state = address.state;
    if (address.postalCode !== undefined) params.postal_code = address.postalCode;
    if (address.country !== undefined) params.country = address.country;

    return params;
  }

  private mapCustomer(customer: Stripe.Customer): StripeCustomerType {
    const result: StripeCustomerType = {
      id: customer.id,
      email: customer.email ?? "",
    };

    if (customer.name) result.name = customer.name;
    if (customer.phone) result.phone = customer.phone;
    if (customer.metadata) result.metadata = customer.metadata as Record<string, string>;
    if (customer.created) result.createdAt = new Date(customer.created * 1000);

    if (customer.address) {
      const addr: StripeCustomerAddressType = {};
      if (customer.address.line1) addr.line1 = customer.address.line1;
      if (customer.address.line2) addr.line2 = customer.address.line2;
      if (customer.address.city) addr.city = customer.address.city;
      if (customer.address.state) addr.state = customer.address.state;
      if (customer.address.postal_code) addr.postalCode = customer.address.postal_code;
      if (customer.address.country) addr.country = customer.address.country;
      result.billingAddress = addr;
    }

    return result;
  }
}
