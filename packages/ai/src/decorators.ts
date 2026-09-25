import { container, EContainerScope } from "@talosjs/container";
import type {
  AiChatClassType,
  AiImageClassType,
  AiMiddlewareClassType,
  AiSkillClassType,
  AiToolClassType,
} from "./types";

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
  skill: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: AiSkillClassType): void => {
      container.add(target, scope);
    };
  },
  image: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: AiImageClassType): void => {
      container.add(target, scope);
    };
  },
};
