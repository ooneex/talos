import { describe, expect, test } from "bun:test";
import { Youtube, YoutubeException } from "@/index";

describe("Youtube", () => {
  describe("instance creation", () => {
    test("should create Youtube instance with apiKey", () => {
      const instance = new Youtube("test-api-key");
      expect(instance).toBeInstanceOf(Youtube);
    });

    test("should throw YoutubeException when apiKey is not provided", () => {
      expect(() => new Youtube()).toThrow(YoutubeException);
    });
  });
});
