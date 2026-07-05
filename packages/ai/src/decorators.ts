import { container, EContainerScope } from "@talosjs/container";
import type { AiChatClassType, AiMiddlewareClassType, AiToolClassType } from "./types";

export const decorator = {
  chat: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: AiChatClassType): void => {
      container.add(target, scope);
    };
  },
  tool: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: AiToolClassType): void => {
      container.add(target, scope);
    };
  },
  middleware: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: AiMiddlewareClassType): void => {
      container.add(target, scope);
    };
  },
};
