import type { LocaleType } from "@talosjs/translation";

export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"] as const;

export type HttpMethodType = (typeof HTTP_METHODS)[number];
export type EncodingType = "deflate" | "gzip" | "compress" | "br" | "identity" | "*";
export type CharsetType = "ISO-8859-1" | "7-BIT" | "UTF-8" | "UTF-16" | "US-ASCII";
export type ScalarType = boolean | number | bigint | string;

export interface IBase {
  id: string;
  isLocked?: boolean;
  lockedAt?: Date;
  isBlocked?: boolean;
  blockedAt?: Date;
  blockReason?: string;
  isPublic?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  language?: LocaleType;
}

export type StatusType =
  | "draft"
  | "pending"
  | "submitted"
  | "in review"
  | "reviewed"
  | "processing"
  | "processed"
  | "queued"
  | "ready"
  | "scheduled"
  | "approved"
  | "rejected"
  | "done"
  | "completed"
  | "success"
  | "failed"
  | "error"
  | "cancelled"
  | "timeout"
  | "archived"
  | "delete"
  | "deleted"
  | "active"
  | "inactive"
  | "disabled"
  | "enabled"
  | "suspended"
  | "paused"
  | "on hold"
  | "sent"
  | "delivered"
  | "read"
  | "valid"
  | "invalid"
  | "expired";

export type FilterResultType<T> = {
  resources: T[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
};
