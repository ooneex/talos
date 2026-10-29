import { describe, expect, test } from "bun:test";
import { HttpStatus } from "@talosjs/http-status";
import { RequestBodyTooLargeException } from "@/RequestBodyTooLargeException";

describe("RequestBodyTooLargeException", () => {
  test("carries a 413 status, its key and the limit", () => {
    const exception = new RequestBodyTooLargeException(1024);

    expect(exception.status).toBe(HttpStatus.Code.ContentTooLarge);
    expect(exception.key).toBe("REQUEST_BODY_TOO_LARGE");
    expect(exception.message).toBe("Request body exceeds the limit of 1024 bytes");
    expect(exception.data).toEqual({ maxBodySize: 1024 });
    expect(exception.name).toBe("RequestBodyTooLargeException");
  });
});
