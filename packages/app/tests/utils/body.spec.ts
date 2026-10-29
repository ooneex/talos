import { describe, expect, test } from "bun:test";
import { RequestBodyTooLargeException } from "@/RequestBodyTooLargeException";
import { limitRequestBody } from "@/utils/body";

const chunkedBody = (chunks: number, chunkSize: number): ReadableStream<Uint8Array> => {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull: (controller) => {
      if (sent === chunks) {
        controller.close();
        return;
      }
      sent++;
      controller.enqueue(new Uint8Array(chunkSize).fill(97));
    },
  });
};

describe("limitRequestBody", () => {
  test("returns the request untouched when its declared length is within the limit", () => {
    const req = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-length": "10" },
      body: "0123456789",
    });

    expect(limitRequestBody(req, 10)).toBe(req);
  });

  test("throws before reading when the declared length is over the limit", () => {
    const req = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-length": "11" },
      body: "0123456789a",
    });

    expect(() => limitRequestBody(req, 10)).toThrow(RequestBodyTooLargeException);
    expect(req.bodyUsed).toBe(false);
  });

  test("returns a body-less request untouched", () => {
    const req = new Request("http://localhost/items");

    expect(limitRequestBody(req, 10)).toBe(req);
  });

  test("passes a chunked body within the limit through whole", async () => {
    const req = new Request("http://localhost/upload", { method: "POST", body: chunkedBody(4, 256) });

    const limited = limitRequestBody(req, 1024);

    expect(limited).not.toBe(req);
    expect(limited.method).toBe("POST");
    expect((await limited.arrayBuffer()).byteLength).toBe(1024);
  });

  test("errors a chunked body once the bytes read pass the limit", async () => {
    const req = new Request("http://localhost/upload", { method: "POST", body: chunkedBody(8, 256) });

    const limited = limitRequestBody(req, 1024);

    await expect(limited.arrayBuffer()).rejects.toBeInstanceOf(RequestBodyTooLargeException);
  });
});
