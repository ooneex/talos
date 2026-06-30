import { describe, expect, test } from "bun:test";
import { AssertYoutubeUrl } from "@/constraints";

describe("AssertYoutubeUrl", () => {
  const validator = new AssertYoutubeUrl();

  test("should validate valid YouTube.com URLs with www", () => {
    const validYouTubeUrls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=123456789ab",
      "http://www.youtube.com/watch?v=abcdefghijk",
      "https://www.youtube.com/watch?v=_-_-_-_-_-_",
      "http://www.youtube.com/watch?v=ABC123def456",
      "https://www.youtube.com/watch?v=a1b2c3d4e5f",
      "http://www.youtube.com/watch?v=X_Y-Z123456",
      "https://www.youtube.com/watch?v=longvideoidhere",
      "http://www.youtube.com/watch?v=SHORT",
    ];

    for (const url of validYouTubeUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate valid YouTube.com URLs without www", () => {
    const validYouTubeUrls = [
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
      "http://youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=123456789ab",
      "http://youtube.com/watch?v=abcdefghijk",
      "https://youtube.com/watch?v=_-_-_-_-_-_",
      "http://youtube.com/watch?v=ABC123def456",
      "https://youtube.com/watch?v=a1b2c3d4e5f",
      "http://youtube.com/watch?v=X_Y-Z123456",
      "https://youtube.com/watch?v=longvideoidhere",
      "http://youtube.com/watch?v=SHORT",
    ];

    for (const url of validYouTubeUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should validate valid youtu.be short URLs", () => {
    const validShortUrls = [
      "https://youtu.be/dQw4w9WgXcQ",
      "http://youtu.be/dQw4w9WgXcQ",
      "https://youtu.be/123456789ab",
      "http://youtu.be/abcdefghijk",
      "https://youtu.be/_-_-_-_-_-_",
      "http://youtu.be/ABC123def456",
      "https://youtu.be/a1b2c3d4e5f",
      "http://youtu.be/X_Y-Z123456",
      "https://youtu.be/longvideoidhere",
      "http://youtu.be/SHORT",
    ];

    for (const url of validShortUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject YouTube URLs with additional parameters", () => {
    const urlsWithParameters = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmRdnEQy8VkdPNQkFpXGfW7lPi3Y4",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&index=1",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be",
      "https://youtu.be/dQw4w9WgXcQ?t=30",
      "https://youtu.be/dQw4w9WgXcQ?si=abc123",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&ab_channel=Channel",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&pp=ygUNcmljayByb2xsIHNvbmc%3D",
    ];

    for (const url of urlsWithParameters) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
      );
    }
  });

  test("should reject URLs from other video platforms", () => {
    const otherPlatformUrls = [
      "https://vimeo.com/123456789",
      "https://www.twitch.tv/video/123456789",
      "https://www.dailymotion.com/video/x123456",
      "https://www.tiktok.com/@user/video/123456789",
      "https://www.facebook.com/watch/?v=123456789",
      "https://www.instagram.com/p/ABC123/",
      "https://twitter.com/user/status/123456789",
      "https://streamable.com/abc123",
      "https://www.pornhub.com/view_video.php?viewkey=abc123",
      "https://www.xvideos.com/video123456/title",
    ];

    for (const url of otherPlatformUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
      );
    }
  });

  test("should reject invalid YouTube URL formats", () => {
    const invalidYouTubeUrls = [
      "youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch",
      "https://www.youtube.com/watch?",
      "https://www.youtube.com/watch?v=",
      "https://www.youtube.com/watch?id=dQw4w9WgXcQ",
      "https://www.youtube.com/video/dQw4w9WgXcQ",
      "https://www.youtube.com/v/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "youtu.be/dQw4w9WgXcQ",
      "https://youtu.be/",
      "https://youtu.be",
    ];

    for (const url of invalidYouTubeUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
      );
    }
  });

  test("should reject URLs with invalid video ID characters", () => {
    const invalidVideoIdUrls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXc@",
      "https://www.youtube.com/watch?v=dQw4w9WgXc#",
      "https://youtu.be/dQw4w9WgXc$",
      "https://www.youtube.com/watch?v=dQw4w9WgXc%",
      "https://youtu.be/dQw4w9WgXc^",
      "https://www.youtube.com/watch?v=dQw4w9WgXc&",
      "https://youtu.be/dQw4w9WgXc*",
      "https://www.youtube.com/watch?v=dQw4w9WgXc+",
      "https://youtu.be/dQw4w9WgXc=",
      "https://www.youtube.com/watch?v=dQw4w9WgXc!",
      "https://youtu.be/dQw4w9WgXc?",
      "https://www.youtube.com/watch?v=dQw4w9WgXc.",
      "https://youtu.be/dQw4w9WgXc,",
      "https://www.youtube.com/watch?v=dQw4w9WgXc<",
      "https://youtu.be/dQw4w9WgXc>",
      "https://www.youtube.com/watch?v=dQw4w9WgXc/",
      "https://youtu.be/dQw4w9WgXc\\",
      "https://www.youtube.com/watch?v=dQw4w9WgXc|",
      "https://youtu.be/dQw4w9WgXc~",
      "https://www.youtube.com/watch?v=dQw4w9WgXc`",
    ];

    for (const url of invalidVideoIdUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
      );
    }
  });

  test("should reject non-YouTube domains", () => {
    const nonYouTubeUrls = [
      "https://www.youtub.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.co/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.org/watch?v=dQw4w9WgXcQ",
      "https://youtube.net/watch?v=dQw4w9WgXcQ",
      "https://www.youtubecom/watch?v=dQw4w9WgXcQ",
      "https://fakeyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube-fake.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.fake.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be.fake/dQw4w9WgXcQ",
      "https://fake-youtu.be/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    ];

    for (const url of nonYouTubeUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
      );
    }
  });

  test("should reject non-string values", () => {
    const nonStringValues = [
      123,
      null,
      undefined,
      {},
      [],
      true,
      false,
      0,
      -1,
      3.14,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Symbol("url"),
      new Date(),
      /regex/,
      () => {},
      new Set(),
      new Map(),
      new URL("https://youtube.com/watch?v=dQw4w9WgXcQ"),
    ];

    for (const value of nonStringValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should reject empty and whitespace strings", () => {
    const emptyAndWhitespaceValues = ["", " ", "\t", "\n", "\r", "  ", "\t\n", " \r\n ", "   \t\n\r   "];

    for (const value of emptyAndWhitespaceValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
      );
    }
  });

  test("should reject URLs with whitespace", () => {
    const urlsWithWhitespace = [
      " https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ ",
      " https://www.youtube.com/watch?v=dQw4w9WgXcQ ",
      "https://www. youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com /watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch ?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch? v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v =dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v= dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ\n",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ\t",
      "\nhttps://youtu.be/dQw4w9WgXcQ",
      "\thttps://youtu.be/dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ\r",
    ];

    for (const url of urlsWithWhitespace) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
      );
    }
  });

  test("should handle edge cases with protocol variations", () => {
    const protocolVariations = [
      "ftp://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "//www.youtube.com/watch?v=dQw4w9WgXcQ",
      "www.youtube.com/watch?v=dQw4w9WgXcQ",
      "htps://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "htp://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https:/www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https:///www.youtube.com/watch?v=dQw4w9WgXcQ",
    ];

    const expectedResults = [false, true, true, false, false, false, false, false, false];

    protocolVariations.forEach((url, index) => {
      const result = validator.validate(url);
      if (expectedResults[index]) {
        expect(result.isValid).toBe(true);
      } else {
        expect(result.isValid).toBe(false);
        expect(result.message).toBe(
          "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
        );
      }
    });
  });

  test("should handle video IDs with different lengths and character combinations", () => {
    const videoIdVariations = [
      "https://www.youtube.com/watch?v=a",
      "https://www.youtube.com/watch?v=ab",
      "https://www.youtube.com/watch?v=abc",
      "https://youtu.be/1234567890",
      "https://www.youtube.com/watch?v=abcdefghij",
      "https://youtu.be/ABCDEFGHIJ",
      "https://www.youtube.com/watch?v=ABC123def456",
      "https://youtu.be/---___---___",
      "https://www.youtube.com/watch?v=a-b_c1d2e3f4",
      "https://youtu.be/verylongvideoidthatcouldexist",
    ];

    for (const url of videoIdVariations) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });

  test("should provide correct error message", () => {
    const result = validator.validate("https://vimeo.com/123456789");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
    );
  });

  test("should return constraint correctly", () => {
    const constraint = validator.getConstraint();
    expect(constraint).toBeDefined();
  });

  test("should return error message correctly", () => {
    const errorMessage = validator.getErrorMessage();
    expect(errorMessage).toBe(
      "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
    );
  });

  test("should handle case sensitivity correctly", () => {
    const caseSensitiveUrls = [
      "HTTPS://WWW.YOUTUBE.COM/WATCH?V=dQw4w9WgXcQ",
      "HTTPS://YOUTU.BE/dQw4w9WgXcQ",
      "https://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ",
      "https://YOUTU.BE/dQw4w9WgXcQ",
      "https://www.YOUTUBE.com/WATCH?V=dQw4w9WgXcQ",
      "https://www.youtube.COM/watch?V=dQw4w9WgXcQ",
    ];

    for (const url of caseSensitiveUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Must be a valid YouTube URL (e.g., https://youtube.com/watch?v=dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ)",
      );
    }
  });

  test("should handle real-world YouTube video IDs", () => {
    const realWorldUrls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/9bZkp7q19f0",
      "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
      "https://youtu.be/fJ9rUzIMcZQ",
      "https://www.youtube.com/watch?v=YQHsXMglC9A",
      "https://youtu.be/pRpeEdMmmQ0",
      "https://www.youtube.com/watch?v=hT_nvWreIhg",
      "https://youtu.be/CevxZvSJLk8",
      "https://www.youtube.com/watch?v=nfs8NYg7yQM",
      "https://youtu.be/iGk5fR-t5AU",
    ];

    for (const url of realWorldUrls) {
      const result = validator.validate(url);
      expect(result.isValid).toBe(true);
    }
  });
});
