import { RequestBodyTooLargeException } from "../RequestBodyTooLargeException";

const countBytes = (body: ReadableStream<Uint8Array>, maxBodySize: number): ReadableStream<Uint8Array> => {
  let received = 0;

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        received += chunk.byteLength;
        if (received > maxBodySize) {
          controller.error(new RequestBodyTooLargeException(maxBodySize));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
};

/**
 * Bounds the body of a request to `maxBodySize` bytes without reading it.
 *
 * A declared `Content-Length` above the limit is refused straight away. A
 * declared length within it needs nothing more: Bun never reads past it. A
 * body without one (chunked) is wrapped in a stream that counts the bytes as
 * they are read and errors with a 413 once over, so the parsers and a
 * controller reading `request.native.body` itself are both stopped there.
 */
export const limitRequestBody = (req: Request, maxBodySize: number): Request => {
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    if (Number(contentLength) > maxBodySize) {
      throw new RequestBodyTooLargeException(maxBodySize);
    }
    return req;
  }

  if (!req.body) {
    return req;
  }

  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: countBytes(req.body, maxBodySize),
    signal: req.signal,
  });
};
