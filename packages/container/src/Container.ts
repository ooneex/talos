/** biome-ignore-all lint/suspicious/noExplicitAny: trust me */

import { Container as InversifyContainer, injectable } from "inversify";
import { ContainerException } from "./ContainerException";
import { EContainerScope, type IContainer } from "./types";

// Shared DI container instance across all Container instances
const sharedDI = new InversifyContainer();

export class Container implements IContainer {
  public add(target: new (...args: any[]) => any, scope: EContainerScope = EContainerScope.Singleton): void {
    try {
      sharedDI.unbind(target);
    } catch {}

    try {
      injectable()(target);
    } catch {}

    const binding = sharedDI.bind(target).toSelf();

    switch (scope) {
      case EContainerScope.Request:
        binding.inRequestScope();
        break;
      case EContainerScope.Transient:
        binding.inTransientScope();
        break;
      default:
        binding.inSingletonScope();
    }
  }

  public get<T>(target: new (...args: any[]) => T): T {
    try {
      return sharedDI.get<T>(target);
    } catch (e) {
      throw new ContainerException(
        `Failed to resolve dependency: ${target.name}. ${e instanceof Error ? e.message : String(e)}`,
        "SERVICE_RESOLVE_FAILED",
      );
    }
  }

  public has(target: new (...args: any[]) => unknown): boolean {
    return sharedDI.isBound(target);
  }

  public remove(target: new (...args: any[]) => unknown): void {
    if (sharedDI.isBound(target)) {
      sharedDI.unbind(target);
    }
  }

  public addConstant<T>(identifier: string | symbol, value: T): void {
    try {
      sharedDI.unbind(identifier);
    } catch {}

    sharedDI.bind<T>(identifier).toConstantValue(value);
  }

  public getConstant<T>(identifier: string | symbol): T {
    try {
      return sharedDI.get<T>(identifier);
    } catch (_e) {
      throw new ContainerException(`Failed to resolve constant: ${identifier.toString()}`, "CONSTANT_RESOLVE_FAILED");
    }
  }

  public hasConstant(identifier: string | symbol): boolean {
    return sharedDI.isBound(identifier);
  }

  public removeConstant(identifier: string | symbol): void {
    if (sharedDI.isBound(identifier)) {
      sharedDI.unbind(identifier);
    }
  }
}

export const container: Container = new Container();
