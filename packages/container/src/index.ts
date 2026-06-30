import { container } from "./Container";
import { EContainerScope } from "./types";

export { inject } from "inversify";
export { Container, container } from "./Container";
export { ContainerException } from "./ContainerException";
export * from "./types";

export const injectable = (scope: EContainerScope = EContainerScope.Singleton) => {
  // biome-ignore lint/suspicious/noExplicitAny: trust me
  return (target: any): void => {
    container.add(target, scope);
  };
};
