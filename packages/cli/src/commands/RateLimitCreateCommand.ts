import type { ICommand } from "@talosjs/command";
import { decorator } from "@talosjs/command";
import { type ScaffoldOptionsType, scaffoldResource } from "../scaffold";
import testTemplate from "../templates/rate-limit.test.txt";
import template from "../templates/rate-limit.txt";

@decorator.command()
export class RateLimitCreateCommand<T extends ScaffoldOptionsType = ScaffoldOptionsType> implements ICommand<T> {
  public getName(): string {
    return "rate-limit:create";
  }

  public getDescription(): string {
    return "Generate a new rate limiter class";
  }

  public async run(options: T): Promise<void> {
    await scaffoldResource(
      {
        label: "RateLimiter",
        promptMessage: "Enter rate limiter name",
        suffix: "RateLimiter",
        stripSuffixes: ["RateLimiter", "RateLimit"],
        template,
        testTemplate,
        dir: "rate-limit",
        dependency: "@talosjs/rate-limit",
      },
      options,
    );
  }
}
