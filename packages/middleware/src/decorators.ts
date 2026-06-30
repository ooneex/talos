import { container, EContainerScope } from "@talosjs/container";
import type { MiddlewareClassType, SocketMiddlewareClassType } from "./types";

export const decorator = {
  middleware: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: MiddlewareClassType | SocketMiddlewareClassType): void => {
      container.add(target, scope);
    };
  },
};
