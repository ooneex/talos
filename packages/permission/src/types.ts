import type { ContextType } from "../../controller/src/types";

export enum EPermissionAction {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
  MANAGE = "manage", // Special action that allows everything
  VIEW = "view",
  EDIT = "edit",
  PUBLISH = "publish",
  ARCHIVE = "archive",
  APPROVE = "approve",
  REJECT = "reject",
  DOWNLOAD = "download",
  UPLOAD = "upload",
  SHARE = "share",
  COPY = "copy",
  MOVE = "move",
  EXPORT = "export",
  IMPORT = "import",
  EXECUTE = "execute",
  ASSIGN = "assign",
  UNASSIGN = "unassign",
  COMMENT = "comment",
  RATE = "rate",
  LIKE = "like",
  DISLIKE = "dislike",
  FOLLOW = "follow",
  UNFOLLOW = "unfollow",
  SUBSCRIBE = "subscribe",
  UNSUBSCRIBE = "unsubscribe",
  INVITE = "invite",
  REVOKE = "revoke",
  GRANT = "grant",
  DENY = "deny",
  BLOCK = "block",
  UNBLOCK = "unblock",
  REPORT = "report",
  MODERATE = "moderate",
  BAN = "ban",
  UNBAN = "unban",
  RESTORE = "restore",
  PURGE = "purge",
  BACKUP = "backup",
  SYNC = "sync",
  CONFIGURE = "configure",
  MONITOR = "monitor",
  AUDIT = "audit",
  SEARCH = "search",
  FILTER = "filter",
  SORT = "sort",
  BOOKMARK = "bookmark",
  TAG = "tag",
  UNTAG = "untag",
  LOCK = "lock",
  UNLOCK = "unlock",
  CLONE = "clone",
  FORK = "fork",
  MERGE = "merge",
  SPLIT = "split",
  VALIDATE = "validate",
  VERIFY = "verify",
  CANCEL = "cancel",
  PAUSE = "pause",
  RESUME = "resume",
  SCHEDULE = "schedule",
  UNSCHEDULE = "unschedule",
  JOIN = "join",
  HIDE = "hide",
}

export enum EPermissionSubject {
  USER_ENTITY = "UserEntity",
  AUTH_USER_ENTITY = "AuthUserEntity",
  AUTH_USER = "AuthUser",
  SYSTEM_ENTITY = "SystemEntity",
  SYSTEM = "System",
  USER = "User",
  ALL = "all",
}

export type PermissionActionType = `${EPermissionAction}`;
export type Subjects = `${EPermissionSubject}`;

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type PermissionClassType = new (...args: any[]) => IPermission;

export interface IPermission<A extends string = string, S extends string = string> {
  allow: () => Promise<IPermission<A, S>> | IPermission<A, S>;
  setUserPermissions: (context: ContextType) => Promise<IPermission<A, S>> | IPermission<A, S>;
  build: () => Promise<IPermission<A, S>> | IPermission<A, S>;
  check: (context: ContextType) => Promise<boolean> | boolean;
  can: (action: PermissionActionType | A, subject: Subjects | S, field?: string) => Promise<boolean> | boolean;
  cannot: (action: PermissionActionType | A, subject: Subjects | S, field?: string) => Promise<boolean> | boolean;
}
