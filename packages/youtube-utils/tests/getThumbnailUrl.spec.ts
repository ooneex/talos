import { describe, expect, test } from "bun:test";
import { getThumbnailUrl } from "@/index";

describe("getThumbnailUrl", () => {
  test("should convert watch URL to thumbnail URL", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(getThumbnailUrl(url)).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  test("should convert short URL to thumbnail URL", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    expect(getThumbnailUrl(url)).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  test("should convert embed URL to thumbnail URL", () => {
    const url = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    expect(getThumbnailUrl(url)).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  test("should handle video ID directly", () => {
    const videoId = "dQw4w9WgXcQ";
    expect(getThumbnailUrl(videoId)).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  test("should return null for invalid video ID", () => {
    expect(getThumbnailUrl("invalid")).toBeNull();
  });

  test("should return null for too short ID", () => {
    expect(getThumbnailUrl("abc")).toBeNull();
  });

  test("should return null for too long ID", () => {
    expect(getThumbnailUrl("abcdefghijklmnop")).toBeNull();
  });

  test("should handle ID with hyphen", () => {
    const videoId = "abc-def_123";
    expect(getThumbnailUrl(videoId)).toBe("https://img.youtube.com/vi/abc-def_123/hqdefault.jpg");
  });

  test("should handle ID with underscore", () => {
    const videoId = "abc_def-123";
    expect(getThumbnailUrl(videoId)).toBe("https://img.youtube.com/vi/abc_def-123/hqdefault.jpg");
  });
});
