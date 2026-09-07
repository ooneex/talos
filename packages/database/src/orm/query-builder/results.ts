import type { ObjectLiteralType } from "../../types";

/** Outcome of an insert: the primary keys and generated values of every written row. */
export class InsertResult {
  /** One id map per inserted row, in insertion order. */
  public identifiers: ObjectLiteralType[] = [];
  /** Database-generated values per row (ids, defaults, timestamps). */
  public generatedMaps: ObjectLiteralType[] = [];
  /** The rows the driver returned, if any. */
  public raw: unknown;
}

export class UpdateResult {
  public raw: unknown;
  /** Rows changed. */
  public affected: number | undefined;
  /** Values the database generated during the update, per returned row. */
  public generatedMaps: ObjectLiteralType[] = [];
}

export class DeleteResult {
  public raw: unknown;
  public affected: number | undefined;
}
