import { Exception } from "@talosjs/exception";
import { HttpStatus } from "@talosjs/http-status";

export class RequestBodyTooLargeException extends Exception {
  constructor(maxBodySize: number) {
    super(`Request body exceeds the limit of ${maxBodySize} bytes`, {
      key: "REQUEST_BODY_TOO_LARGE",
      status: HttpStatus.Code.ContentTooLarge,
      data: { maxBodySize },
    });
    this.name = "RequestBodyTooLargeException";
  }
}
