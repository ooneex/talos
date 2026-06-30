import { describe, expect, test } from "bun:test";
import type { EntityClassType, IEntity } from "@/index";

describe("@talosjs/entity - IEntity and EntityClassType", () => {
  class UserEntity implements IEntity {
    id: string;

    constructor(id: string) {
      this.id = id;
    }
  }

  function createEntity(Cls: EntityClassType, id: string): IEntity {
    return new Cls(id);
  }

  test("should construct entity instances via EntityClassType", () => {
    const entity = createEntity(UserEntity, "entity-1");

    expect(entity).toBeInstanceOf(UserEntity);
    expect(entity.id).toBe("entity-1");
  });

  test("should satisfy IEntity contract", () => {
    const entity: IEntity = new UserEntity("42");
    expect(entity.id).toBe("42");
  });
});
