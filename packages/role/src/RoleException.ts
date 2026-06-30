import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";

export class RoleException extends Exception {
  constructor(message: string, role: string, data: Record<string, unknown> = {}) {
    super(message, {
      key: role,
      status: HttpStatus.Code.Forbidden,
      data,
    });
    this.name = "RoleException";
  }
}
