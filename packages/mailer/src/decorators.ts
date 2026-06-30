import { container, EContainerScope } from "@talosjs/container";
import type { MailerClassType } from "./types";

export const decorator = {
  mailer: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: MailerClassType): void => {
      container.add(target, scope);
    };
  },
};
