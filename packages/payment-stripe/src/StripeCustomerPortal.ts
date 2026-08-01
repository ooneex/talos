import { inject, injectable } from "@talosjs/container";
import { StripeClient } from "./StripeClient";
import type { StripeCustomerPortalCreateType, StripeCustomerPortalType } from "./types";

@injectable()
export class StripeCustomerPortal {
  constructor(@inject(StripeClient) private readonly client: StripeClient) {}

  public async create(data: StripeCustomerPortalCreateType): Promise<StripeCustomerPortalType> {
    const session = await this.client.sdk.billingPortal.sessions.create({
      customer: data.customerId,
      return_url: data.returnUrl,
    });

    return {
      id: session.id,
      url: session.url,
      returnUrl: session.return_url ?? data.returnUrl,
      createdAt: new Date(session.created * 1000),
    };
  }
}
