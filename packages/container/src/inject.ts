import { ContainerException } from "./ContainerException";
import type { ClassType, ServiceIdentifierType } from "./types";

/** Tokens by constructor parameter position; a hole is a parameter left to its default value. */
type InjectionsType = (ServiceIdentifierType | undefined)[];

const NO_INJECTIONS: readonly (ServiceIdentifierType | undefined)[] = Object.freeze([]);

// Keyed by the decorated class itself: no `reflect-metadata` polyfill is needed, and a subclass never
// picks up its parent's injections by walking a prototype chain.
const injections = new WeakMap<ClassType, InjectionsType>();

/** The token of each constructor parameter of `target`, indexed by position; shared empty list when none. */
export const getInjections = (target: ClassType): readonly (ServiceIdentifierType | undefined)[] =>
  injections.get(target) ?? NO_INJECTIONS;

/**
 * Marks a constructor parameter to be resolved from the container.
 *
 * @example
 * class UserService {
 *   constructor(@inject(UserRepository) private readonly repository: UserRepository) {}
 * }
 */
export const inject = (identifier: ServiceIdentifierType) => {
  return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number): void => {
    if (typeof target !== "function" || propertyKey !== undefined) {
      const owner = typeof target === "function" ? target.name : target.constructor.name;

      throw new ContainerException(
        `@inject only decorates constructor parameters. Found it on "${String(propertyKey)}" of "${owner}"`,
        "INVALID_INJECT_TARGET",
        { owner, propertyKey: String(propertyKey), parameterIndex },
      );
    }

    let tokens = injections.get(target as ClassType);

    if (tokens === undefined) {
      tokens = [];
      injections.set(target as ClassType, tokens);
    }

    tokens[parameterIndex] = identifier;
  };
};
