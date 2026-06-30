import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";

export class WorkflowException extends Exception {
  constructor(message: string, key: string, data: Record<string, unknown> = {}) {
    super(message, {
      key,
      status: HttpStatus.Code.InternalServerError,
      data,
    });

    this.name = "WorkflowException";
  }
}
