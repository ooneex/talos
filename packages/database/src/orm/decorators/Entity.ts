import type { ClassType, EntityOptionsType, IndexOptionsType, ObjectLiteralType } from "../../types";
import { getMetadataArgsStorage } from "../MetadataArgsStorage";

type ClassDecoratorType = (target: ClassType) => void;
type ClassOrPropertyDecoratorType = (target: object, propertyKey?: string | symbol) => void;
type ColumnSelectorType = string[] | ((object: ObjectLiteralType) => ObjectLiteralType);

const declaringClass = (target: object): ClassType =>
  (typeof target === "function" ? target : target.constructor) as ClassType;

/**
 * Marks a class as a database table.
 *
 * @example
 * @Entity({ name: "users" })
 * export class UserEntity {}
 */
export const Entity = (
  nameOrOptions?: string | EntityOptionsType,
  maybeOptions?: EntityOptionsType,
): ClassDecoratorType => {
  const options = (typeof nameOrOptions === "object" ? nameOrOptions : maybeOptions) ?? {};
  const name = typeof nameOrOptions === "string" ? nameOrOptions : options.name;

  return (target: ClassType): void => {
    getMetadataArgsStorage().tables.push({
      target,
      name,
      schema: options.schema,
      database: options.database,
      synchronize: options.synchronize,
      comment: options.comment,
    });
  };
};

/**
 * Declares an index. On a property it covers that column; on a class it covers the listed properties.
 *
 * @example
 * @Index(["email"], { unique: true })
 * @Entity()
 * export class UserEntity {
 *   @Index()
 *   @Column({ type: "varchar", nullable: false })
 *   public slug: string = "";
 * }
 */
export const Index = (
  nameOrFieldsOrOptions?: string | ColumnSelectorType | IndexOptionsType,
  maybeFieldsOrOptions?: ColumnSelectorType | IndexOptionsType,
  maybeOptions?: IndexOptionsType,
): ClassOrPropertyDecoratorType => {
  const name = typeof nameOrFieldsOrOptions === "string" ? nameOrFieldsOrOptions : undefined;
  const fieldsCandidate = typeof nameOrFieldsOrOptions === "string" ? maybeFieldsOrOptions : nameOrFieldsOrOptions;
  const fields =
    Array.isArray(fieldsCandidate) || typeof fieldsCandidate === "function"
      ? (fieldsCandidate as ColumnSelectorType)
      : undefined;
  const options =
    maybeOptions ??
    (fields === undefined && typeof fieldsCandidate === "object" && !Array.isArray(fieldsCandidate)
      ? (fieldsCandidate as IndexOptionsType)
      : typeof maybeFieldsOrOptions === "object" && !Array.isArray(maybeFieldsOrOptions)
        ? (maybeFieldsOrOptions as IndexOptionsType)
        : {});

  return (target: object, propertyKey?: string | symbol): void => {
    getMetadataArgsStorage().indices.push({
      target: declaringClass(target),
      name,
      columns: propertyKey !== undefined ? [String(propertyKey)] : fields,
      propertyName: propertyKey !== undefined ? String(propertyKey) : undefined,
      unique: options.unique,
      where: options.where,
      synchronize: options.synchronize,
    });
  };
};

/**
 * Declares a unique constraint over one or more properties.
 *
 * @example
 * @Unique(["email"])
 * @Entity()
 * export class UserEntity {}
 */
export const Unique = (
  nameOrFields?: string | ColumnSelectorType,
  maybeFields?: ColumnSelectorType,
): ClassOrPropertyDecoratorType => {
  const name = typeof nameOrFields === "string" ? nameOrFields : undefined;
  const fields = typeof nameOrFields === "string" ? maybeFields : nameOrFields;

  return (target: object, propertyKey?: string | symbol): void => {
    getMetadataArgsStorage().uniques.push({
      target: declaringClass(target),
      name,
      columns: propertyKey !== undefined ? [String(propertyKey)] : fields,
      propertyName: propertyKey !== undefined ? String(propertyKey) : undefined,
    });
  };
};
