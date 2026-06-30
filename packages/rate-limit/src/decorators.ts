import { container, EContainerScope } from "@talosjs/container";
import type { RateLimiterClassType } from "./types";

export const decorator = {
  rateLimit: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: RateLimiterClassType): void => {
      container.add(target, scope);
    };
  },
};
