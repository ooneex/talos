import { describe, expect, test } from "bun:test";
import { getId } from "@/index";

describe("getId", () => {
  test("should extract video ID from standard watch URL", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(getId(url)).toBe("dQw4w9WgXcQ");
  });

  test("should extract video ID from short URL", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    expect(getId(url)).toBe("dQw4w9WgXcQ");
  });

  test("should extract video ID from embed URL", () => {
    const url = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    expect(getId(url)).toBe("dQw4w9WgXcQ");
  });

  test("should extract video ID from /v/ URL", () => {
    const url = "https://www.youtube.com/v/dQw4w9WgXcQ";
    expect(getId(url)).toBe("dQw4w9WgXcQ");
  });

  test("should extract video ID from shorts URL", () => {
    const url = "https://www.youtube.com/shorts/dQw4w9WgXcQ";
    expect(getId(url)).toBe("dQw4w9WgXcQ");
  });

  test("should extract video ID from URL with additional parameters", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest&index=1";
    expect(getId(url)).toBe("dQw4w9WgXcQ");
  });

  test("should extract video ID when v parameter is not first", () => {
    const url = "https://www.youtube.com/watch?list=PLtest&v=dQw4w9WgXcQ&index=1";
    expect(getId(url)).toBe("dQw4w9WgXcQ");
  });

  test("should return null for invalid URL", () => {
    const url = "https://example.com/video";
    expect(getId(url)).toBeNull();
  });

  test("should return null for empty string", () => {
    expect(getId("")).toBeNull();
  });

  test("should return null for playlist-only URL", () => {
    const url = "https://www.youtube.com/playlist?list=PLtest";
    expect(getId(url)).toBeNull();
  });
});
