import { describe, expect, test } from "bun:test";
import { AssertFile } from "@/constraints/AssertFile";

const createFile = (name: string, type: string, content = "hello"): File => new File([content], name, { type });

describe("AssertFile", () => {
  test("validates a native File", () => {
    const result = new AssertFile({ avatar: {} }).validate({ avatar: createFile("photo.png", "image/png") });

    expect(result.isValid).toBe(true);
  });

  test("validates a RequestFile-like object", () => {
    const invoice = {
      id: "abc",
      name: "abc.pdf",
      originalName: "invoice.pdf",
      type: "application/pdf",
      extension: "pdf",
      size: 2048,
    };

    const result = new AssertFile({ invoice: { types: ["application/pdf"], extensions: [".pdf"] } }).validate({
      invoice,
    });

    expect(result.isValid).toBe(true);
  });

  test("validates a Blob against a mime type", () => {
    const report = new Blob(["a,b,c"], { type: "text/csv" });

    expect(new AssertFile({ report: { types: ["text/csv"] } }).validate({ report }).isValid).toBe(true);
    expect(new AssertFile({ report: { types: ["application/pdf"] } }).validate({ report }).isValid).toBe(false);
  });

  test("validates every configured field", () => {
    const assert = new AssertFile({
      avatar: { types: ["image/*"] },
      cv: { extensions: ["pdf"] },
    });

    const files = {
      avatar: createFile("photo.png", "image/png"),
      cv: createFile("resume.pdf", "application/pdf"),
    };

    expect(assert.validate(files).isValid).toBe(true);
    expect(assert.validate({ ...files, cv: createFile("resume.doc", "application/msword") }).message).toBe(
      '"cv": File extension "doc" is not allowed (allowed: pdf)',
    );
  });

  test("ignores files the route does not declare", () => {
    const result = new AssertFile({ avatar: { types: ["image/*"] } }).validate({
      avatar: createFile("photo.png", "image/png"),
      extra: createFile("clip.mp4", "video/mp4"),
    });

    expect(result.isValid).toBe(true);
  });

  test("accepts any files when no field is configured", () => {
    expect(new AssertFile().validate({ avatar: createFile("clip.mp4", "video/mp4") }).isValid).toBe(true);
    expect(new AssertFile().validate({}).isValid).toBe(true);
  });

  test("rejects a non-object value", () => {
    for (const value of [undefined, null, "file.png", 42]) {
      const result = new AssertFile({ avatar: {} }).validate(value);

      expect(result.isValid).toBe(false);
      expect(result.message).toBe("Files must be an object");
    }
  });

  test("rejects a field holding something that is not a file", () => {
    for (const value of ["file.png", 42, { size: "10", type: "image/png" }, { size: 10, type: 1 }]) {
      const result = new AssertFile({ avatar: {} }).validate({ avatar: value });

      expect(result.message).toBe('"avatar": Value must be a file');
    }
  });

  test("rejects a negative or NaN size", () => {
    const assert = new AssertFile({ avatar: {} });

    expect(assert.validate({ avatar: { size: -1, type: "image/png" } }).isValid).toBe(false);
    expect(assert.validate({ avatar: { size: Number.NaN, type: "image/png" } }).isValid).toBe(false);
  });

  test("requires a field by default and allows it to be optional", () => {
    const required = new AssertFile({ avatar: {} });

    expect(required.validate({}).message).toBe('"avatar": File is required');
    expect(required.validate({ avatar: null }).isValid).toBe(false);

    const optional = new AssertFile({ avatar: { required: false } });

    expect(optional.validate({}).isValid).toBe(true);
    expect(optional.validate({ avatar: null }).isValid).toBe(true);
  });

  test("rejects an empty file", () => {
    const result = new AssertFile({ note: {} }).validate({ note: createFile("empty.txt", "text/plain", "") });

    expect(result.message).toBe('"note": File size must be at least 1 bytes');
  });

  test("enforces minSize and maxSize", () => {
    const files = { avatar: createFile("photo.png", "image/png", "0123456789") };

    expect(new AssertFile({ avatar: { minSize: 20 } }).validate(files).message).toBe(
      '"avatar": File size must be at least 20 bytes',
    );
    expect(new AssertFile({ avatar: { maxSize: 5 } }).validate(files).message).toBe(
      '"avatar": File size must not exceed 5 bytes',
    );
    expect(new AssertFile({ avatar: { minSize: 10, maxSize: 10 } }).validate(files).isValid).toBe(true);
  });

  test("matches wildcard mime types", () => {
    const assert = new AssertFile({ avatar: { types: ["image/*"] } });

    expect(assert.validate({ avatar: createFile("photo.png", "image/png") }).isValid).toBe(true);
    expect(assert.validate({ avatar: createFile("clip.mp4", "video/mp4") }).message).toBe(
      '"avatar": File type "video/mp4" is not allowed (allowed: image/*)',
    );
  });

  test("ignores mime parameters and casing", () => {
    const result = new AssertFile({ note: { types: ["text/plain"] } }).validate({
      note: { size: 4, type: "TEXT/PLAIN; charset=utf-8" },
    });

    expect(result.isValid).toBe(true);
  });

  test("reports an unknown type when the file carries none", () => {
    const result = new AssertFile({ avatar: { types: ["image/png"] } }).validate({ avatar: { size: 4, type: "" } });

    expect(result.message).toBe('"avatar": File type "unknown" is not allowed (allowed: image/png)');
  });

  test("enforces extensions with or without a leading dot", () => {
    const assert = new AssertFile({ avatar: { extensions: [".PNG", "jpg"] } });

    expect(assert.validate({ avatar: createFile("photo.png", "image/png") }).isValid).toBe(true);
    expect(assert.validate({ avatar: createFile("photo.JPG", "image/jpeg") }).isValid).toBe(true);
    expect(assert.validate({ avatar: createFile("doc.pdf", "application/pdf") }).message).toBe(
      '"avatar": File extension "pdf" is not allowed (allowed: png, jpg)',
    );
  });

  test("reports an unknown extension for a nameless file", () => {
    const result = new AssertFile({ avatar: { extensions: ["png"] } }).validate({
      avatar: new Blob(["x"], { type: "image/png" }),
    });

    expect(result.message).toBe('"avatar": File extension "unknown" is not allowed (allowed: png)');
  });

  test("exposes its fields as a constraint and no static error message", () => {
    expect(new AssertFile().getErrorMessage()).toBeNull();
    expect(typeof new AssertFile().getConstraint()).toBe("function");

    const constraint = new AssertFile({ avatar: {}, cv: {} }).getConstraint() as Record<string, unknown>;

    expect(Object.keys(constraint)).toEqual(["avatar", "cv"]);
  });
});
