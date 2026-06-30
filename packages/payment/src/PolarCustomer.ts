import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { Polar } from "@polar-sh/sdk";
import type { Address } from "@polar-sh/sdk/models/components/address.js";
import { PaymentException } from "./PaymentException";
import type {
  CustomerAddressType,
  CustomerCreateType,
  CustomerListOptionsType,
  CustomerListResponseType,
  CustomerListResultType,
  CustomerResponseType,
  CustomerType,
  CustomerUpdateType,
} from "./types";

@injectable()
export class PolarCustomer {
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

  public async create(data: CustomerCreateType): Promise<CustomerType> {
    const response = await this.client.customers.create({
      email: data.email,
      name: data.name ?? null,
      externalId: data.externalId ?? null,
      billingAddress: data.billingAddress ? this.toBillingAddress(data.billingAddress) : null,
      taxId: data.taxId ? [data.taxId, null] : null,
      organizationId: data.organizationId ?? null,
      metadata: data.metadata,
    });

    return this.mapResponse(response as unknown as CustomerResponseType);
  }

  public async update(id: string, data: CustomerUpdateType): Promise<CustomerType> {
    const response = await this.client.customers.update({
      id,
      customerUpdate: {
        email: data.email ?? null,
        name: data.name ?? null,
        billingAddress: data.billingAddress ? this.toBillingAddress(data.billingAddress) : null,
        taxId: data.taxId ? [data.taxId, null] : null,
        metadata: data.metadata,
      },
    });

    return this.mapResponse(response as unknown as CustomerResponseType);
  }

  public async remove(id: string): Promise<void> {
    await this.client.customers.delete({ id });
  }

  public async get(id: string): Promise<CustomerType> {
    const response = await this.client.customers.get({ id });

    return this.mapResponse(response as unknown as CustomerResponseType);
  }

  public async list(options?: CustomerListOptionsType): Promise<CustomerListResultType> {
    const response = await this.client.customers.list({
      organizationId: options?.organizationId,
      email: options?.email,
      query: options?.query,
      page: options?.page ?? 1,
      limit: options?.limit ?? 10,
    });

    const result = response as unknown as CustomerListResponseType;

    return {
      items: result.result.items.map((item) => this.mapResponse(item)),
      pagination: {
        totalCount: result.result.pagination.totalCount,
        maxPage: result.result.pagination.maxPage,
      },
    };
  }

  public async getByExternalId(externalId: string): Promise<CustomerType> {
    const response = await this.client.customers.getExternal({ externalId });

    return this.mapResponse(response as unknown as CustomerResponseType);
  }

  public async updateByExternalId(externalId: string, data: CustomerUpdateType): Promise<CustomerType> {
    const response = await this.client.customers.updateExternal({
      externalId,
      customerUpdate: {
        email: data.email ?? null,
        name: data.name ?? null,
        billingAddress: data.billingAddress ? this.toBillingAddress(data.billingAddress) : null,
        taxId: data.taxId ? [data.taxId, null] : null,
        metadata: data.metadata,
      },
    });

    return this.mapResponse(response as unknown as CustomerResponseType);
  }

  public async removeByExternalId(externalId: string): Promise<void> {
    await this.client.customers.deleteExternal({ externalId });
  }

  private toBillingAddress(address: CustomerAddressType): Address {
    return {
      country: address.country ?? "",
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
    };
  }

  private mapResponse(response: CustomerResponseType): CustomerType {
    const customer: CustomerType = {
      id: response.id,
      email: response.email,
      emailVerified: response.emailVerified ?? false,
    };

    if (response.createdAt) {
      customer.createdAt = response.createdAt;
    }

    if (response.modifiedAt) {
      customer.updatedAt = response.modifiedAt;
    }

    if (response.deletedAt) {
      customer.deletedAt = response.deletedAt;
    }

    if (response.name) {
      customer.name = response.name;
    }

    if (response.externalId) {
      customer.externalId = response.externalId;
    }

    if (response.avatarUrl) {
      customer.avatarUrl = response.avatarUrl;
    }

    if (response.billingAddress) {
      const billingAddress: CustomerAddressType = {};
      if (response.billingAddress.line1) {
        billingAddress.line1 = response.billingAddress.line1;
      }
      if (response.billingAddress.line2) {
        billingAddress.line2 = response.billingAddress.line2;
      }
      if (response.billingAddress.city) {
        billingAddress.city = response.billingAddress.city;
      }
      if (response.billingAddress.state) {
        billingAddress.state = response.billingAddress.state;
      }
      if (response.billingAddress.postalCode) {
        billingAddress.postalCode = response.billingAddress.postalCode;
      }
      if (response.billingAddress.country) {
        billingAddress.country = response.billingAddress.country;
      }
      customer.billingAddress = billingAddress;
    }

    if (response.taxId) {
      const taxIdValue = typeof response.taxId === "string" ? response.taxId : response.taxId[1];
      customer.taxId = taxIdValue;
    }

    if (response.organizationId) {
      customer.organizationId = response.organizationId;
    }

    if (response.metadata) {
      customer.metadata = response.metadata;
    }

    return customer;
  }
}
