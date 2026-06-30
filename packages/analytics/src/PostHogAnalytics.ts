import { AppEnv } from "@talosjs/app-env";
import { inject } from "@talosjs/container";
import { PostHog } from "posthog-node";
import { AnalyticsException } from "./AnalyticsException";
import { decorator } from "./decorators";
import type { IAnalytics, PostHogCaptureOptionsType } from "./types";

@decorator.analytics()
export class PostHogAnalytics<T extends PostHogCaptureOptionsType = PostHogCaptureOptionsType>
  implements IAnalytics<T>
{
  private client: PostHog | null = null;

  constructor(@inject(AppEnv) private readonly env: AppEnv) {
    const apiKey = this.env.ANALYTICS_POSTHOG_PROJECT_TOKEN;

    if (!apiKey) {
      throw new AnalyticsException(
        "PostHog API key is required. Please set the ANALYTICS_POSTHOG_PROJECT_TOKEN environment variable.",
        "API_KEY_REQUIRED",
      );
    }

    this.client = new PostHog(apiKey, {
      host: this.env.ANALYTICS_POSTHOG_HOST || "https://eu.i.posthog.com",
    });
  }

  public capture(options: T): void {
    this.client?.capture({
      distinctId: options.id,
      event: options.event,
      properties: {
        $set: options.properties,
      },
      timestamp: new Date(),
      ...(options.groups && { groups: options.groups }),
    });
  }

  public async shutdown(): Promise<void> {
    await this.client?.shutdown();
  }
}
