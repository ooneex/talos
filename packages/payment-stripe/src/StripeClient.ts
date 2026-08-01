import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { PaymentException } from "@talosjs/payment";
import Stripe from "stripe";

@injectable()
export class StripeClient {
  private readonly client: Stripe;

  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    const apiKey = this.env.STRIPE_SECRET_KEY;

    if (!apiKey) {
      throw new PaymentException(
        "Stripe secret key is required. Please set the STRIPE_SECRET_KEY environment variable.",
        "TOKEN_REQUIRED",
      );
    }

    this.client = new Stripe(apiKey, {
      apiVersion: (this.env.STRIPE_API_VERSION ?? "2025-06-30.basil") as Stripe.LatestApiVersion,
    });
  }

  public get sdk(): Stripe {
    return this.client;
  }
}
