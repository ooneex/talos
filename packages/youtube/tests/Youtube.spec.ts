import { afterEach, describe, expect, test } from "bun:test";
import { Youtube, YoutubeException } from "@/index";

const originalFetch = globalThis.fetch;

// Swap the global fetch for one that records the request and answers with the
// given response, so no call ever leaves the test process.
const stubFetch = (response: Response): { calls: { url: string; init: RequestInit | undefined }[] } => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof fetch;

  return { calls };
};

const transcriptPayload = {
  video_id: "dQw4w9WgXcQ",
  language: "en",
  transcript: [{ text: "hello", start: 0, duration: 1.5 }],
  metadata: {
    title: "A video",
    author_name: "An author",
    author_url: "https://youtube.com/@author",
    thumbnail_url: "https://img.youtube.com/vi/dQw4w9WgXcQ.jpg",
  },
};

describe("Youtube", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("instance creation", () => {
    test("should create Youtube instance with apiKey", () => {
      const instance = new Youtube("test-api-key");
      expect(instance).toBeInstanceOf(Youtube);
    });

    test("should throw YoutubeException when apiKey is not provided", () => {
      expect(() => new Youtube()).toThrow(YoutubeException);
    });

    test("should fall back to the environment api key", () => {
      Bun.env.YOUTUBE_TRANSCRIPT_API_KEY = "env-api-key";

      try {
        expect(new Youtube()).toBeInstanceOf(Youtube);
      } finally {
        Bun.env.YOUTUBE_TRANSCRIPT_API_KEY = undefined;
      }
    });
  });

  describe("transcript", () => {
    test("should call the transcript endpoint with the api key and query", async () => {
      const { calls } = stubFetch(Response.json(transcriptPayload));

      await new Youtube("test-api-key").transcript("dQw4w9WgXcQ");

      expect(calls).toHaveLength(1);
      const url = new URL(calls[0]?.url ?? "");
      expect(url.origin + url.pathname).toBe("https://transcriptapi.com/api/v2/youtube/transcript");
      expect(url.searchParams.get("video_url")).toBe("dQw4w9WgXcQ");
      expect(url.searchParams.get("format")).toBe("json");
      expect(url.searchParams.get("include_timestamp")).toBe("true");
      expect(url.searchParams.get("send_metadata")).toBe("true");
      expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer test-api-key");
    });

    test("should map the api payload onto the transcript shape", async () => {
      stubFetch(Response.json(transcriptPayload));

      const result = await new Youtube("test-api-key").transcript("dQw4w9WgXcQ");

      expect(result).toEqual({
        id: "dQw4w9WgXcQ",
        lang: "en",
        transcript: [{ text: "hello", start: 0, duration: 1.5 }],
        metadata: {
          title: "A video",
          author: { name: "An author", url: "https://youtube.com/@author" },
          thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ.jpg",
        },
      });
    });

    test("should throw a YoutubeException carrying the failing status", async () => {
      stubFetch(new Response("nope", { status: 429, statusText: "Too Many Requests" }));

      const promise = new Youtube("test-api-key").transcript("dQw4w9WgXcQ");

      await expect(promise).rejects.toThrow(YoutubeException);
      await expect(promise).rejects.toMatchObject({
        message: "Transcript API error: 429 Too Many Requests",
        key: "TRANSCRIPT_FAILED",
        data: { videoId: "dQw4w9WgXcQ", status: 429 },
      });
    });
  });
});
