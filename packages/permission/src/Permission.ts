import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";
import type { ContextType } from "../../controller/src/types";
import { PermissionException } from "./PermissionException";
import type { IPermission, PermissionActionType, Subjects } from "./types";

export abstract class Permission<A extends string = string, S extends string = string> implements IPermission<A, S> {
  protected ability: AbilityBuilder<MongoAbility>;
  private builtAbility: MongoAbility | null = null;

  constructor() {
    this.ability = new AbilityBuilder(createMongoAbility);
  }

  public abstract allow(): this;
  public abstract setUserPermissions(context: ContextType): this;
  public abstract check(context: ContextType): Promise<boolean> | boolean;

  public build(): this {
    this.builtAbility = this.ability.build();
    return this;
  }

  public can(action: PermissionActionType | A, subject: Subjects | S, field?: string): boolean {
    if (!this.builtAbility) {
      throw new PermissionException("Permission must be built before checking abilities", "NOT_BUILT");
    }
    return this.builtAbility.can(action as string, subject as string, field);
  }

  public cannot(action: PermissionActionType | A, subject: Subjects | S, field?: string): boolean {
    if (!this.builtAbility) {
      throw new PermissionException("Permission must be built before checking abilities", "NOT_BUILT");
    }
    return this.builtAbility.cannot(action as string, subject as string, field);
  }
}
