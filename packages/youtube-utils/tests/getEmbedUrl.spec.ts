import { describe, expect, test } from "bun:test";
import { getEmbedUrl } from "@/index";

describe("getEmbedUrl", () => {
  test("should convert watch URL to embed URL", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(getEmbedUrl(url)).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  test("should convert short URL to embed URL", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    expect(getEmbedUrl(url)).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  test("should handle video ID directly", () => {
    const videoId = "dQw4w9WgXcQ";
    expect(getEmbedUrl(videoId)).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  test("should return null for invalid video ID", () => {
    expect(getEmbedUrl("invalid")).toBeNull();
  });

  test("should return null for too short ID", () => {
    expect(getEmbedUrl("abc")).toBeNull();
  });

  test("should return null for too long ID", () => {
    expect(getEmbedUrl("abcdefghijklmnop")).toBeNull();
  });

  test("should handle ID with hyphen", () => {
    const videoId = "abc-def_123";
    expect(getEmbedUrl(videoId)).toBe("https://www.youtube.com/embed/abc-def_123");
  });

  test("should handle ID with underscore", () => {
    const videoId = "abc_def-123";
    expect(getEmbedUrl(videoId)).toBe("https://www.youtube.com/embed/abc_def-123");
  });
});
