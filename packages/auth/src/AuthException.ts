import { Exception } from "@talosjs/exception";
import { HttpStatus, type StatusCodeType } from "@talosjs/http-status";

/**
 * Raised by the auth layer. The status defaults to 500 because most failures
 * here are the identity provider letting us down, but a caller that knows the
 * request itself is at fault — an absent or expired token — passes the status
 * it wants reported, and the client sees a 401 instead of a server error.
 */
export class AuthException extends Exception {
  constructor(message: string, key: string, options: { status?: StatusCodeType; data?: Record<string, unknown> } = {}) {
    super(message, {
      key,
      status: options.status ?? HttpStatus.Code.InternalServerError,
      data: options.data ?? {},
    });
    this.name = "AuthException";
  }
}
