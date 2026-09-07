import type {
  ClassType,
  EntityTargetType,
  InverseSideSelectorType,
  JoinColumnOptionsType,
  JoinTableMultipleColumnsOptionsType,
  JoinTableOptionsType,
  ObjectLiteralType,
  RelationOptionsType,
  RelationTypeType,
} from "../../types";
import { getMetadataArgsStorage } from "../MetadataArgsStorage";

type PropertyDecoratorType = (target: object, propertyKey: string | symbol) => void;
type TypeThunkType<T> = (type?: unknown) => EntityTargetType<T>;

const declaringClass = (target: object): ClassType => target.constructor as ClassType;

const relation =
  (relationType: RelationTypeType) =>
  <T>(
    typeFunctionOrName: TypeThunkType<T> | string,
    inverseSideOrOptions?: InverseSideSelectorType<T> | RelationOptionsType,
    maybeOptions?: RelationOptionsType,
  ): PropertyDecoratorType => {
    const hasInverseSide = typeof inverseSideOrOptions === "string" || typeof inverseSideOrOptions === "function";
    const inverseSideProperty = hasInverseSide
      ? (inverseSideOrOptions as InverseSideSelectorType<ObjectLiteralType>)
      : undefined;
    const options = (hasInverseSide ? maybeOptions : (inverseSideOrOptions as RelationOptionsType | undefined)) ?? {};

    return (target, propertyKey): void => {
      getMetadataArgsStorage().relations.push({
        target: declaringClass(target),
        propertyName: String(propertyKey),
        relationType,
        type: typeFunctionOrName as string | (() => EntityTargetType),
        inverseSideProperty,
        options,
      });
    };
  };

/**
 * Many rows of this entity point to one row of the target. The foreign key lives on this table.
 *
 * @example
 * @ManyToOne(() => UserEntity, (user) => user.posts, { onDelete: "CASCADE" })
 * @JoinColumn({ name: "user_id" })
 * public user?: UserEntity | null;
 */
export const ManyToOne = relation("many-to-one");

/**
 * One row of this entity owns many rows of the target, which holds the foreign key.
 *
 * @example
 * @OneToMany(() => PostEntity, (post) => post.user)
 * public posts?: PostEntity[];
 */
export const OneToMany = relation("one-to-many");

/**
 * One row here matches one row there. The side decorated with `@JoinColumn()` holds the foreign key.
 *
 * @example
 * @OneToOne(() => ProfileEntity, { cascade: true })
 * @JoinColumn({ name: "profile_id" })
 * public profile?: ProfileEntity | null;
 */
export const OneToOne = relation("one-to-one");

/**
 * Rows on both sides match freely through a junction table; the side decorated with `@JoinTable()` owns it.
 *
 * @example
 * @ManyToMany(() => RoleEntity, (role) => role.users)
 * @JoinTable({ name: "user_roles" })
 * public roles?: RoleEntity[];
 */
export const ManyToMany = relation("many-to-many");

/**
 * Names the foreign key column of a `@ManyToOne()` or owning `@OneToOne()` relation.
 *
 * @example
 * @JoinColumn({ name: "user_id", referencedColumnName: "id" })
 */
export const JoinColumn = (options: JoinColumnOptionsType | JoinColumnOptionsType[] = {}): PropertyDecoratorType => {
  const list = Array.isArray(options) ? options : [options];

  return (target, propertyKey): void => {
    for (const option of list) {
      getMetadataArgsStorage().joinColumns.push({
        target: declaringClass(target),
        propertyName: String(propertyKey),
        name: option.name,
        referencedColumnName: option.referencedColumnName,
        foreignKeyConstraintName: option.foreignKeyConstraintName,
      });
    }
  };
};

/**
 * Names the junction table of a `@ManyToMany()` relation and marks this side as its owner.
 *
 * @example
 * @JoinTable({ name: "user_roles", joinColumn: { name: "user_id" }, inverseJoinColumn: { name: "role_id" } })
 */
export const JoinTable = (
  options: JoinTableOptionsType | JoinTableMultipleColumnsOptionsType = {},
): PropertyDecoratorType => {
  const single = options as JoinTableOptionsType;
  const multiple = options as JoinTableMultipleColumnsOptionsType;
  const joinColumns = multiple.joinColumns ?? (single.joinColumn ? [single.joinColumn] : undefined);
  const inverseJoinColumns =
    multiple.inverseJoinColumns ?? (single.inverseJoinColumn ? [single.inverseJoinColumn] : undefined);

  return (target, propertyKey): void => {
    getMetadataArgsStorage().joinTables.push({
      target: declaringClass(target),
      propertyName: String(propertyKey),
      name: options.name,
      schema: options.schema,
      joinColumns,
      inverseJoinColumns,
    });
  };
};
