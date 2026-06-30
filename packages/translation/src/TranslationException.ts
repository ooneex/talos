import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";

export class TranslationException extends Exception {
  constructor(message: string, key: string, data: Record<string, unknown> = {}) {
    super(message, {
      key,
      status: HttpStatus.Code.NotFound,
      data,
    });
    this.name = "TranslationException";
  }
}
