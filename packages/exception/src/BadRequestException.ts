import { HttpStatus } from "@talosjs/http-status";
import { Exception } from "./Exception";

export class BadRequestException extends Exception {
  constructor(message: string, key: string, data: Record<string, unknown> = {}) {
    super(message, {
      key,
      status: HttpStatus.Code.BadRequest,
      data,
    });
    this.name = "BadRequestException";
  }
}
