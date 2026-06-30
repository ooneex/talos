import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { Polar } from "@polar-sh/sdk";
import { PaymentException } from "./PaymentException";
import type { CustomerSessionCreateType, CustomerSessionResponseType, CustomerSessionType } from "./types";

@injectable()
export class PolarCustomerPortal {
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

  public async create(data: CustomerSessionCreateType): Promise<CustomerSessionType> {
    const response = await this.client.customerSessions.create({
      customerId: data.customerId,
    });

    return this.mapResponse(response as unknown as CustomerSessionResponseType);
  }

  public getPortalUrl(organizationSlug: string): string {
    const baseUrl = this.env.POLAR_ENVIRONMENT === "sandbox" ? "https://sandbox.polar.sh" : "https://polar.sh";

    return `${baseUrl}/${organizationSlug}/portal`;
  }

  private mapResponse(response: CustomerSessionResponseType): CustomerSessionType {
    const session: CustomerSessionType = {
      id: response.id,
      token: response.token,
      customerPortalUrl: response.customerPortalUrl,
    };

    if (response.createdAt) {
      session.createdAt = response.createdAt;
    }

    if (response.expiresAt) {
      session.expiresAt = response.expiresAt;
    }

    if (response.customerId) {
      session.customerId = response.customerId;
    }

    return session;
  }
}
