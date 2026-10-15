import { AppEnv } from "@talosjs/app-env";
import { inject, injectable } from "@talosjs/container";
import { PaymentException } from "@talosjs/payment";
import Stripe from "stripe";

const PROTOCOLS = ["http", "https"] as const;

type StripeEndpointType = Pick<Stripe.StripeConfig, "host" | "port" | "protocol">;

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
      ...this.endpoint(),
    });
  }

  public get sdk(): Stripe {
    return this.client;
  }

  /** The API the SDK talks to: Stripe's own unless STRIPE_API_* points it elsewhere, at stripe-mock say. */
  private endpoint(): StripeEndpointType {
    const endpoint: StripeEndpointType = {};
    const { STRIPE_API_HOST: host, STRIPE_API_PORT: port, STRIPE_API_PROTOCOL: protocol } = this.env;

    if (host) endpoint.host = host;

    if (port) {
      const value = Number(port);

      if (!Number.isInteger(value) || value < 1 || value > 65_535) {
        throw new PaymentException(`STRIPE_API_PORT must be a port number, got "${port}".`, "INVALID_CONFIGURATION", {
          port,
        });
      }

      endpoint.port = value;
    }

    if (protocol) {
      const value = PROTOCOLS.find((candidate) => candidate === protocol);

      if (!value) {
        throw new PaymentException(
          `STRIPE_API_PROTOCOL must be "http" or "https", got "${protocol}".`,
          "INVALID_CONFIGURATION",
          { protocol },
        );
      }

      endpoint.protocol = value;
    }

    return endpoint;
  }
}
