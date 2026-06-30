import { container, EContainerScope } from "@talosjs/container";
import type { FeatureFlagClassType } from "./types";

export const decorator = {
  featureFlag: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: FeatureFlagClassType): void => {
      container.add(target, scope);
    };
  },
};
