import { describe, expect, test } from "bun:test";
import { Cache } from "@/index";

describe("Cache", () => {
  describe("keyFromRoute", () => {
    test("should build a prefixed sha256 key from the request", () => {
      const expected = Bun.CryptoHasher.hash("sha256", "GET:/users:?page=2:42", "hex");
      expect(Cache.keyFromRoute("users", "GET", "https://api.test/users?page=2", "42")).toBe(`users:${expected}`);
    });

    test("should fall back to an anonymous key when there is no user", () => {
      const expected = Bun.CryptoHasher.hash("sha256", "GET:/users::anon", "hex");
      expect(Cache.keyFromRoute("users", "GET", "https://api.test/users")).toBe(`users:${expected}`);
    });

    test("should separate users sharing the same request", () => {
      const url = "https://api.test/users";
      expect(Cache.keyFromRoute("users", "GET", url, "1")).not.toBe(Cache.keyFromRoute("users", "GET", url, "2"));
    });

    test("should separate methods, paths and queries", () => {
      const key = Cache.keyFromRoute("users", "GET", "https://api.test/users");
      expect(Cache.keyFromRoute("users", "POST", "https://api.test/users")).not.toBe(key);
      expect(Cache.keyFromRoute("users", "GET", "https://api.test/users/1")).not.toBe(key);
      expect(Cache.keyFromRoute("users", "GET", "https://api.test/users?page=2")).not.toBe(key);
    });

    test("should ignore the host so the same request caches once", () => {
      expect(Cache.keyFromRoute("users", "GET", "https://api.test/users")).toBe(
        Cache.keyFromRoute("users", "GET", "https://other.test/users"),
      );
    });

    test("should throw on a malformed url", () => {
      expect(() => Cache.keyFromRoute("users", "GET", "/users")).toThrow();
    });
  });

  describe("keyFromSocketRoute", () => {
    test("should build a prefixed sha256 key from the message", () => {
      const keySource = 'chat.message.send:42:{"room":"1"}:{"page":2}:{"text":"hi"}';
      const expected = Bun.CryptoHasher.hash("sha256", keySource, "hex");
      expect(
        Cache.keyFromSocketRoute("chat", "chat.message.send", "42", { room: "1" }, { page: 2 }, { text: "hi" }),
      ).toBe(`chat:${expected}`);
    });

    test("should fall back to an anonymous key and empty inputs", () => {
      const expected = Bun.CryptoHasher.hash("sha256", "chat.message.send:anon:{}:{}:{}", "hex");
      expect(Cache.keyFromSocketRoute("chat", "chat.message.send")).toBe(`chat:${expected}`);
    });

    test("should separate users sharing the same message", () => {
      expect(Cache.keyFromSocketRoute("chat", "chat.message.send", "1")).not.toBe(
        Cache.keyFromSocketRoute("chat", "chat.message.send", "2"),
      );
    });

    test("should separate route names, params, queries and payloads", () => {
      const key = Cache.keyFromSocketRoute("chat", "chat.message.send", "42", {}, {}, {});
      expect(Cache.keyFromSocketRoute("chat", "chat.message.read", "42", {}, {}, {})).not.toBe(key);
      expect(Cache.keyFromSocketRoute("chat", "chat.message.send", "42", { room: "1" }, {}, {})).not.toBe(key);
      expect(Cache.keyFromSocketRoute("chat", "chat.message.send", "42", {}, { page: 2 }, {})).not.toBe(key);
      expect(Cache.keyFromSocketRoute("chat", "chat.message.send", "42", {}, {}, { text: "hi" })).not.toBe(key);
    });
  });
});
