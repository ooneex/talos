import { container, EContainerScope } from "@talosjs/container";
import type { TranslationClassType } from "./types";

export const decorator = {
  translation: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: TranslationClassType): void => {
      container.add(target, scope);
    };
  },
};
