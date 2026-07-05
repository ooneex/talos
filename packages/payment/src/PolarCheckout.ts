import { Polar } from "@polar-sh/sdk";
import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import type { CurrencyCodeType } from "@talosjs/currencies";
import { PaymentException } from "./PaymentException";
import type {
  CheckoutAddressType,
  CheckoutCreateType,
  CheckoutCustomerType,
  CheckoutResponseType,
  CheckoutStatusType,
  CheckoutType,
} from "./types";

@injectable()
export class PolarCheckout {
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

  public async create(data: CheckoutCreateType): Promise<CheckoutType> {
    const response = await this.client.checkouts.create({
      products: data.products,
      customerExternalId: data.customerExternalId ?? null,
      customerId: data.customerId ?? null,
      customerEmail: data.customerEmail ?? null,
      customerName: data.customerName ?? null,
      customerBillingAddress: data.customerBillingAddress?.country
        ? {
            country: data.customerBillingAddress.country,
            line1: data.customerBillingAddress.line1 ?? null,
            line2: data.customerBillingAddress.line2 ?? null,
            city: data.customerBillingAddress.city ?? null,
            state: data.customerBillingAddress.state ?? null,
            postalCode: data.customerBillingAddress.postalCode ?? null,
          }
        : null,
      customerTaxId: data.customerTaxId ?? null,
      discountId: data.discountId ?? null,
      allowDiscountCodes: data.allowDiscountCodes ?? true,
      successUrl: data.successUrl ?? null,
      embedOrigin: data.embedOrigin ?? null,
      metadata: data.metadata,
    });

    return this.mapResponse(response as unknown as CheckoutResponseType);
  }

  public async get(id: string): Promise<CheckoutType> {
    const response = await this.client.checkouts.get({ id });

    return this.mapResponse(response as unknown as CheckoutResponseType);
  }

  private mapResponse(response: CheckoutResponseType): CheckoutType {
    const checkout: CheckoutType = {
      id: response.id,
      status: response.status as CheckoutStatusType,
      clientSecret: response.clientSecret,
    };

    if (response.url) {
      checkout.url = response.url;
    }

    if (response.embedId) {
      checkout.embedId = response.embedId;
    }

    if (response.allowDiscountCodes !== undefined) {
      checkout.allowDiscountCodes = response.allowDiscountCodes;
    }

    if (response.isDiscountApplicable !== undefined) {
      checkout.isDiscountApplicable = response.isDiscountApplicable;
    }

    if (response.isPaymentRequired !== undefined) {
      checkout.isPaymentRequired = response.isPaymentRequired;
    }

    if (response.metadata) {
      checkout.metadata = response.metadata;
    }

    if (response.createdAt) {
      checkout.createdAt = response.createdAt;
    }

    if (response.modifiedAt) {
      checkout.updatedAt = response.modifiedAt;
    }

    if (response.expiresAt) {
      checkout.expiresAt = response.expiresAt;
    }

    if (response.successUrl) {
      checkout.successUrl = response.successUrl;
    }

    if (response.embedOrigin) {
      checkout.embedOrigin = response.embedOrigin;
    }

    if (response.amount !== undefined) {
      checkout.amount = response.amount;
    }

    if (response.taxAmount !== undefined) {
      checkout.taxAmount = response.taxAmount;
    }

    if (response.currency) {
      checkout.currency = response.currency as CurrencyCodeType;
    }

    if (response.subtotalAmount !== undefined) {
      checkout.subtotalAmount = response.subtotalAmount;
    }

    if (response.totalAmount !== undefined) {
      checkout.totalAmount = response.totalAmount;
    }

    if (response.productId) {
      checkout.productId = response.productId;
    }

    if (response.productPriceId) {
      checkout.productPriceId = response.productPriceId;
    }

    if (response.discountId) {
      checkout.discountId = response.discountId;
    }

    if (response.customer) {
      checkout.customer = {
        id: response.customer.id,
        email: response.customer.email,
        name: response.customer.name,
        externalId: response.customer.externalId,
        taxId: response.customer.taxId,
      } as CheckoutCustomerType;

      if (response.customer.billingAddress) {
        checkout.customer.billingAddress = response.customer.billingAddress as CheckoutAddressType;
      }
    }

    return checkout;
  }
}
