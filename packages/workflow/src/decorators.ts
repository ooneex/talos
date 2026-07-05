import { container, EContainerScope } from "@talosjs/container";
import type { WorkflowClassType, WorkflowTransitionClassType } from "./types";

export const decorator = {
  workflow: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: WorkflowClassType): void => {
      container.add(target, scope);
    };
  },
  transition: (scope: EContainerScope = EContainerScope.Singleton) => {
    return (target: WorkflowTransitionClassType): void => {
      container.add(target, scope);
    };
  },
};
