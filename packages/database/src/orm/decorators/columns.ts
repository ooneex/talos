import type {
  ClassType,
  ColumnModeType,
  ColumnOptionsType,
  ColumnType,
  PrimaryColumnOptionsType,
  PrimaryGeneratedColumnType,
} from "../../types";
import { getMetadataArgsStorage } from "../MetadataArgsStorage";

type PropertyDecoratorType = (target: object, propertyKey: string | symbol) => void;

const declaringClass = (target: object): ClassType => target.constructor as ClassType;

const isColumnType = (value: unknown): value is ColumnType => typeof value === "string" || typeof value === "function";

const resolveColumnArgs = (
  typeOrOptions?: ColumnType | ColumnOptionsType,
  maybeOptions?: ColumnOptionsType,
): ColumnOptionsType => {
  if (isColumnType(typeOrOptions)) {
    return { ...maybeOptions, type: typeOrOptions };
  }

  return { ...typeOrOptions };
};

const registerColumn = (
  target: object,
  propertyKey: string | symbol,
  mode: ColumnModeType,
  options: ColumnOptionsType,
): void => {
  getMetadataArgsStorage().columns.push({
    target: declaringClass(target),
    propertyName: String(propertyKey),
    mode,
    options,
  });
};

/**
 * Maps a property to a table column.
 *
 * @example
 * @Column({ name: "is_locked", type: "boolean", default: false, nullable: true })
 * public isLocked?: boolean | null;
 */
export const Column = (
  typeOrOptions?: ColumnType | ColumnOptionsType,
  maybeOptions?: ColumnOptionsType,
): PropertyDecoratorType => {
  const options = resolveColumnArgs(typeOrOptions, maybeOptions);

  return (target, propertyKey): void => {
    registerColumn(target, propertyKey, "regular", options);
  };
};

/**
 * Maps a property to a primary key column whose value the application provides.
 *
 * @example
 * @PrimaryColumn({ name: "id", type: "varchar", length: 20, nullable: false })
 * public id: string = random.id();
 */
export const PrimaryColumn = (
  typeOrOptions?: ColumnType | PrimaryColumnOptionsType,
  maybeOptions?: PrimaryColumnOptionsType,
): PropertyDecoratorType => {
  const options = resolveColumnArgs(typeOrOptions, maybeOptions);

  return (target, propertyKey): void => {
    registerColumn(target, propertyKey, "regular", { ...options, primary: true, nullable: false });
  };
};

/**
 * Maps a property to a primary key the database (or the ORM, for `uuid`) generates.
 *
 * @example
 * @PrimaryGeneratedColumn("uuid")
 * public id: string = "";
 */
export const PrimaryGeneratedColumn = (
  strategyOrOptions?: PrimaryGeneratedColumnType | PrimaryColumnOptionsType,
  maybeOptions?: PrimaryColumnOptionsType,
): PropertyDecoratorType => {
  const strategy: PrimaryGeneratedColumnType = typeof strategyOrOptions === "string" ? strategyOrOptions : "increment";
  const options = (typeof strategyOrOptions === "object" ? strategyOrOptions : maybeOptions) ?? {};
  const type: ColumnType = options.type ?? (strategy === "uuid" ? "uuid" : "integer");

  return (target, propertyKey): void => {
    registerColumn(target, propertyKey, "regular", { ...options, type, primary: true, nullable: false });
    getMetadataArgsStorage().generations.push({
      target: declaringClass(target),
      propertyName: String(propertyKey),
      strategy,
    });
  };
};

const dateColumn =
  (mode: ColumnModeType, nullable: boolean) =>
  (options: ColumnOptionsType = {}): PropertyDecoratorType =>
  (target, propertyKey): void => {
    registerColumn(target, propertyKey, mode, { nullable, ...options });
  };

/** A timestamp set once, when the row is inserted. */
export const CreateDateColumn = dateColumn("createDate", false);

/** A timestamp refreshed on every write. */
export const UpdateDateColumn = dateColumn("updateDate", false);

/** A nullable timestamp; a non-null value marks the row as soft-deleted and hides it from queries. */
export const DeleteDateColumn = dateColumn("deleteDate", true);

/** An integer starting at 1 and incremented on every update. */
export const VersionColumn = (options: ColumnOptionsType = {}): PropertyDecoratorType => {
  return (target, propertyKey): void => {
    registerColumn(target, propertyKey, "version", { nullable: false, type: "integer", ...options });
  };
};
