import { beforeEach, describe, expect, test } from "bun:test";
import { Permission, PermissionException } from "@/index";
import type { ContextType } from "../../controller/src/types";

class TestPermission<A extends string = string, S extends string = string> extends Permission<A, S> {
  public allow(): this {
    return this;
  }

  public setUserPermissions(_context: ContextType): this {
    return this;
  }

  public check(_context: ContextType): boolean {
    return true;
  }

  public addPermission(
    action: string | string[],
    subject: string | string[],
    conditions?: Record<string, unknown>,
  ): this {
    this.ability.can(action, subject, conditions);
    return this;
  }

  public addRestriction(
    action: string | string[],
    subject: string | string[],
    conditions?: Record<string, unknown>,
  ): this {
    this.ability.cannot(action, subject, conditions);
    return this;
  }
}

describe("Permission", () => {
  let permission: TestPermission;

  beforeEach(() => {
    permission = new TestPermission();
  });

  describe("Constructor", () => {
    test("should create Permission instance", () => {
      expect(permission).toBeInstanceOf(Permission);
      expect(permission).toBeDefined();
    });

    test("should create Permission with generic type", () => {
      const customPermission = new TestPermission<string, "CustomResource">();
      expect(customPermission).toBeInstanceOf(Permission);
    });
  });

  describe("Abstract Methods", () => {
    test("should have allow method", () => {
      const result = permission.allow();
      expect(result).toBe(permission);
    });

    test("should have setUserPermissions method", () => {
      const result = permission.setUserPermissions({} as ContextType);
      expect(result).toBe(permission);
    });

    test("should have check method", () => {
      const result = permission.check({} as ContextType);
      expect(result).toBe(true);
    });
  });

  describe("Build Method", () => {
    test("should build permission and return this", () => {
      const result = permission.addPermission("read", "User").build();

      expect(result).toBe(permission);
    });

    test("should build empty permission", () => {
      const result = permission.build();

      expect(result).toBe(permission);
    });
  });

  describe("Can Method", () => {
    test("should throw error if permission not built", () => {
      permission.addPermission("read", "User");

      expect(() => permission.can("read", "User")).toThrow(PermissionException);
      expect(() => permission.can("read", "User")).toThrow("Permission must be built before checking abilities");
    });

    test("should return true for allowed permission", () => {
      permission.addPermission("read", "User").build();

      expect(permission.can("read", "User")).toBe(true);
    });

    test("should return false for non-allowed permission", () => {
      permission.addPermission("read", "User").build();

      expect(permission.can("update", "User")).toBe(false);
      expect(permission.can("read", "System")).toBe(false);
    });

    test("should work with field parameter", () => {
      permission.addPermission("read", "User").build();

      expect(permission.can("read", "User", "name")).toBe(true);
      expect(permission.can("update", "User", "name")).toBe(false);
    });

    test("should work with custom subject types", () => {
      const customPermission = new TestPermission<string, "BlogPost">();
      customPermission.addPermission("read", "BlogPost").build();

      expect(customPermission.can("read", "BlogPost")).toBe(true);
      expect(customPermission.can("update", "BlogPost")).toBe(false);
    });

    test("should handle complex permission rules", () => {
      permission
        .addPermission("read", "User")
        .addRestriction("read", "User", { private: true })
        .addPermission("manage", "all")
        .addRestriction("delete", "System")
        .build();

      expect(permission.can("read", "User")).toBe(true);
      expect(permission.can("update", "User")).toBe(true);
      expect(permission.can("delete", "User")).toBe(true);
      expect(permission.can("delete", "System")).toBe(false);
    });
  });

  describe("Cannot Method", () => {
    test("should throw error if permission not built", () => {
      permission.addPermission("read", "User");

      expect(() => permission.cannot("read", "User")).toThrow(PermissionException);
      expect(() => permission.cannot("read", "User")).toThrow("Permission must be built before checking abilities");
    });

    test("should return false for allowed permission", () => {
      permission.addPermission("read", "User").build();

      expect(permission.cannot("read", "User")).toBe(false);
    });

    test("should return true for non-allowed permission", () => {
      permission.addPermission("read", "User").build();

      expect(permission.cannot("update", "User")).toBe(true);
      expect(permission.cannot("read", "System")).toBe(true);
    });

    test("should work with field parameter", () => {
      permission.addPermission("read", "User").build();

      expect(permission.cannot("read", "User", "name")).toBe(false);
      expect(permission.cannot("update", "User", "name")).toBe(true);
    });

    test("should be opposite of can method", () => {
      permission.addPermission("read", "User").addRestriction("update", "User").build();

      expect(permission.can("read", "User")).toBe(!permission.cannot("read", "User"));
      expect(permission.can("update", "User")).toBe(!permission.cannot("update", "User"));
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle empty subjects array", () => {
      const result = permission.addPermission("read", []);
      expect(result).toBe(permission);
    });

    test("should handle empty actions array", () => {
      const result = permission.addPermission([], "User");
      expect(result).toBe(permission);
    });

    test("should handle undefined conditions", () => {
      const result = permission.addPermission("read", "User", undefined);
      expect(result).toBe(permission);
    });

    test("should handle complex nested conditions", () => {
      const complexConditions = {
        $and: [
          { active: true },
          {
            $or: [{ createdBy: "user-123" }, { public: true, verified: true }],
          },
          { deletedAt: { $exists: false } },
        ],
      };

      const result = permission.addPermission("read", "User", complexConditions).build();

      expect(result).toBe(permission);
      expect(permission.can("read", "User")).toBe(true);
    });
  });

  describe("Generic Type Support", () => {
    test("should work with custom subject types", () => {
      const blogPermission = new TestPermission<string, "BlogPost" | "Comment" | "Category">();

      blogPermission
        .addPermission("read", "BlogPost")
        .addPermission(["create", "update"], "Comment")
        .addRestriction("delete", "Category")
        .build();

      expect(blogPermission.can("read", "BlogPost")).toBe(true);
      expect(blogPermission.can("create", "Comment")).toBe(true);
      expect(blogPermission.can("update", "Comment")).toBe(true);
      expect(blogPermission.cannot("delete", "Category")).toBe(true);
    });

    test("should combine built-in and custom subject types", () => {
      const mixedPermission = new TestPermission<string, "BlogPost" | "Article">();

      mixedPermission
        .addPermission("read", ["User", "BlogPost", "Article"])
        .addPermission("manage", "all")
        .addRestriction("delete", "BlogPost")
        .build();

      expect(mixedPermission.can("read", "User")).toBe(true);
      expect(mixedPermission.can("read", "BlogPost")).toBe(true);
      expect(mixedPermission.can("read", "Article")).toBe(true);
      expect(mixedPermission.can("create", "User")).toBe(true);
      expect(mixedPermission.cannot("delete", "BlogPost")).toBe(true);
    });
  });

  describe("Method Chaining", () => {
    test("should support extensive method chaining", () => {
      const result = permission
        .addPermission("read", "User")
        .addRestriction("delete", "User")
        .addPermission(["create", "update"], "UserEntity")
        .addRestriction("manage", "System")
        .addPermission("read", "System", { public: true })
        .build();

      expect(result).toBe(permission);
      expect(permission.can("read", "User")).toBe(true);
      expect(permission.can("create", "UserEntity")).toBe(true);
      expect(permission.cannot("delete", "User")).toBe(true);
      expect(permission.cannot("manage", "System")).toBe(true);
      expect(permission.can("read", "System")).toBe(true);
    });
  });

  describe("Performance and State Management", () => {
    test("should handle large numbers of permissions efficiently", () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        permission
          .addPermission("read", "User")
          .addPermission("update", "UserEntity")
          .addRestriction("delete", "System");
      }

      permission.build();

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000);
      expect(permission.can("read", "User")).toBe(true);
    });

    test("should maintain consistent state across multiple operations", () => {
      permission.addPermission("read", "User").build();

      expect(permission.can("read", "User")).toBe(true);

      for (let i = 0; i < 10; i++) {
        expect(permission.can("read", "User")).toBe(true);
        expect(permission.cannot("delete", "User")).toBe(true);
      }
    });
  });
});
