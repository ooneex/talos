import { describe, expect, test } from "bun:test";
import { getWatchUrl } from "@/index";

describe("getWatchUrl", () => {
  test("should convert embed URL to watch URL", () => {
    const url = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    expect(getWatchUrl(url)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  test("should convert short URL to watch URL", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    expect(getWatchUrl(url)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  test("should handle video ID directly", () => {
    const videoId = "dQw4w9WgXcQ";
    expect(getWatchUrl(videoId)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  test("should return null for invalid video ID", () => {
    expect(getWatchUrl("invalid")).toBeNull();
  });

  test("should return null for too short ID", () => {
    expect(getWatchUrl("abc")).toBeNull();
  });

  test("should return null for too long ID", () => {
    expect(getWatchUrl("abcdefghijklmnop")).toBeNull();
  });

  test("should handle ID with special characters", () => {
    const videoId = "abc-def_123";
    expect(getWatchUrl(videoId)).toBe("https://www.youtube.com/watch?v=abc-def_123");
  });

  test("should return same URL format when given watch URL", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(getWatchUrl(url)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});
