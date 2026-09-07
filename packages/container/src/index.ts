import { container } from "./Container";
import { type ClassType, EContainerScope } from "./types";

export { Container, container } from "./Container";
export { ContainerException } from "./ContainerException";
export { inject } from "./inject";
export * from "./types";

export const injectable = (scope: EContainerScope = EContainerScope.Singleton) => {
  return (target: ClassType): void => {
    container.add(target, scope);
  };
};
