import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AppEnv } from "@talosjs/app-env";
import type { DragonflyConnectionOptionsType } from "@/index";
import { DatabaseException, DragonflyDatabase } from "@/index";

const setConnected = (client: { connected: boolean }, value: boolean): void => {
  Object.defineProperty(client, "connected", {
    value,
    writable: true,
    configurable: true,
  });
};

describe("DragonflyDatabase", () => {
  let adapter: DragonflyDatabase;
  let env: AppEnv;
  const testConnectionUrl = "redis://localhost:6379";

  const originalEnv = {
    DATABASE_DRAGONFLY_URL: process.env.DATABASE_DRAGONFLY_URL,
  };

  beforeEach(() => {
    delete process.env.DATABASE_DRAGONFLY_URL;
    env = new AppEnv();
  });

  afterEach(() => {
    if (originalEnv.DATABASE_DRAGONFLY_URL !== undefined) {
      process.env.DATABASE_DRAGONFLY_URL = originalEnv.DATABASE_DRAGONFLY_URL;
    }
  });

  describe("Constructor", () => {
    test("should create DragonflyDatabase with provided URL", () => {
      adapter = new DragonflyDatabase(env, { url: testConnectionUrl });

      expect(adapter).toBeInstanceOf(DragonflyDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should create DragonflyDatabase with DATABASE_DRAGONFLY_URL environment variable", () => {
      process.env.DATABASE_DRAGONFLY_URL = testConnectionUrl;
      env = new AppEnv();
      adapter = new DragonflyDatabase(env);

      expect(adapter).toBeInstanceOf(DragonflyDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should prefer provided URL over environment variables", () => {
      process.env.DATABASE_DRAGONFLY_URL = "redis://env:6379";
      env = new AppEnv();

      adapter = new DragonflyDatabase(env, { url: "redis://provided:6379" });

      expect(adapter).toBeInstanceOf(DragonflyDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should throw DatabaseException when no connection URL is provided", () => {
      expect(() => new DragonflyDatabase(env)).toThrow(DatabaseException);
      expect(() => new DragonflyDatabase(env)).toThrow(
        "Dragonfly connection URL is required. Please provide a connection URL either through the constructor options or set the DATABASE_DRAGONFLY_URL environment variable.",
      );
    });

    test("should create the client with custom connection options", () => {
      const options: DragonflyConnectionOptionsType = {
        url: testConnectionUrl,
        connectionTimeout: 5000,
        idleTimeout: 30_000,
        autoReconnect: false,
        maxRetries: 3,
        enableOfflineQueue: false,
        enableAutoPipelining: false,
        tls: true,
      };

      adapter = new DragonflyDatabase(env, options);

      expect(adapter).toBeInstanceOf(DragonflyDatabase);
      expect(adapter.getClient()).toBeDefined();
    });

    test("should handle TLS configuration as object", () => {
      adapter = new DragonflyDatabase(env, {
        url: testConnectionUrl,
        tls: { rejectUnauthorized: false, ca: "ca-cert", cert: "client-cert", key: "client-key" },
      });

      expect(adapter.getClient()).toBeDefined();
    });

    test("should handle zero values in options", () => {
      adapter = new DragonflyDatabase(env, {
        url: testConnectionUrl,
        connectionTimeout: 0,
        idleTimeout: 0,
        maxRetries: 0,
      });

      expect(adapter.getClient()).toBeDefined();
    });
  });

  describe("getClient", () => {
    beforeEach(() => {
      adapter = new DragonflyDatabase(env, { url: testConnectionUrl });
    });

    test("should return the client instance", () => {
      const client = adapter.getClient();

      expect(typeof client.connect).toBe("function");
      expect(typeof client.close).toBe("function");
      expect(typeof client.send).toBe("function");
    });

    test("should return the same client instance on multiple calls", () => {
      expect(adapter.getClient()).toBe(adapter.getClient());
    });
  });

  describe("open", () => {
    beforeEach(() => {
      adapter = new DragonflyDatabase(env, { url: testConnectionUrl });
    });

    test("should connect and return the client", async () => {
      const client = adapter.getClient();
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);

      expect(await adapter.open()).toBe(client);
      expect(connectSpy).toHaveBeenCalled();
    });

    test("should not reconnect when already connected", async () => {
      const client = adapter.getClient();
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);
      setConnected(client, true);

      expect(await adapter.open()).toBe(client);
      expect(connectSpy).not.toHaveBeenCalled();
    });

    test("should throw DatabaseException when the connection fails", async () => {
      const client = adapter.getClient();
      spyOn(client, "connect").mockRejectedValue(new Error("Connection failed"));

      expect(adapter.open()).rejects.toThrow(DatabaseException);
      expect(adapter.open()).rejects.toThrow("Failed to open Dragonfly connection: Connection failed");
    });

    test("should carry the connection details on failure", async () => {
      const client = adapter.getClient();
      const connectionError = new Error("Connection timeout");
      spyOn(client, "connect").mockRejectedValue(connectionError);

      try {
        await adapter.open();
        expect.unreachable();
      } catch (error) {
        expect((error as DatabaseException).data).toEqual({
          connectionUrl: testConnectionUrl,
          options: { url: testConnectionUrl },
          error: connectionError,
        });
      }
    });

    test("should handle non-Error rejections", async () => {
      const client = adapter.getClient();
      spyOn(client, "connect").mockRejectedValue("String error message");

      expect(adapter.open()).rejects.toThrow("Failed to open Dragonfly connection: String error message");
    });
  });

  describe("close", () => {
    beforeEach(() => {
      adapter = new DragonflyDatabase(env, { url: testConnectionUrl });
    });

    test("should close the connection when connected", async () => {
      const client = adapter.getClient();
      const closeSpy = spyOn(client, "close").mockReturnValue(undefined);
      setConnected(client, true);

      await adapter.close();

      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    test("should do nothing when not connected", async () => {
      const client = adapter.getClient();
      const closeSpy = spyOn(client, "close").mockReturnValue(undefined);
      setConnected(client, false);

      await adapter.close();

      expect(closeSpy).not.toHaveBeenCalled();
    });

    test("should throw DatabaseException when closing fails", async () => {
      const client = adapter.getClient();
      const closeError = new Error("Close failed");
      setConnected(client, true);
      spyOn(client, "close").mockImplementation(() => {
        throw closeError;
      });

      expect(adapter.close()).rejects.toThrow(DatabaseException);
      expect(adapter.close()).rejects.toThrow("Failed to close Dragonfly connection: Close failed");
    });
  });

  describe("ping", () => {
    beforeEach(() => {
      adapter = new DragonflyDatabase(env, { url: testConnectionUrl });
    });

    test("should return true when the server answers PONG", async () => {
      const client = adapter.getClient();
      setConnected(client, true);
      const sendSpy = spyOn(client, "send").mockResolvedValue("PONG");

      expect(await adapter.ping()).toBe(true);
      expect(sendSpy).toHaveBeenCalledWith("PING", []);
    });

    test("should open the connection before pinging", async () => {
      const client = adapter.getClient();
      setConnected(client, false);
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);
      spyOn(client, "send").mockResolvedValue("PONG");

      await adapter.ping();

      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    test("should return false on an unexpected reply", async () => {
      const client = adapter.getClient();
      setConnected(client, true);
      spyOn(client, "send").mockResolvedValue("NOPE");

      expect(await adapter.ping()).toBe(false);
    });

    test("should throw DatabaseException when the ping fails", async () => {
      const client = adapter.getClient();
      setConnected(client, true);
      spyOn(client, "send").mockRejectedValue(new Error("Connection reset"));

      expect(adapter.ping()).rejects.toThrow(DatabaseException);
      expect(adapter.ping()).rejects.toThrow("Failed to ping Dragonfly: Connection reset");
    });
  });

  describe("drop", () => {
    beforeEach(() => {
      adapter = new DragonflyDatabase(env, { url: testConnectionUrl });
    });

    test("should flush the database without the ASYNC modifier Dragonfly rejects", async () => {
      const client = adapter.getClient();
      setConnected(client, true);
      const sendSpy = spyOn(client, "send").mockResolvedValue("OK");

      await adapter.drop();

      expect(sendSpy).toHaveBeenCalledWith("FLUSHDB", []);
    });

    test("should connect before flushing when not connected", async () => {
      const client = adapter.getClient();
      setConnected(client, false);
      const connectSpy = spyOn(client, "connect").mockResolvedValue(undefined);
      const sendSpy = spyOn(client, "send").mockResolvedValue("OK");

      await adapter.drop();

      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith("FLUSHDB", []);
    });

    test("should throw DatabaseException when FLUSHDB fails", async () => {
      const client = adapter.getClient();
      setConnected(client, true);
      const flushError = new Error("FLUSHDB failed");
      spyOn(client, "send").mockRejectedValue(flushError);

      expect(adapter.drop()).rejects.toThrow(DatabaseException);
      expect(adapter.drop()).rejects.toThrow("Failed to drop Dragonfly database: FLUSHDB failed");
    });

    test("should carry the connection details on failure", async () => {
      const client = adapter.getClient();
      setConnected(client, true);
      const dropError = new Error("Database drop failed");
      spyOn(client, "send").mockRejectedValue(dropError);

      try {
        await adapter.drop();
        expect.unreachable();
      } catch (error) {
        expect((error as DatabaseException).data).toEqual({
          connectionUrl: testConnectionUrl,
          error: dropError,
        });
      }
    });

    test("should surface a connection failure during drop", async () => {
      const client = adapter.getClient();
      setConnected(client, false);
      spyOn(client, "connect").mockRejectedValue(new Error("Connection failed during drop"));

      expect(adapter.drop()).rejects.toThrow(
        "Failed to drop Dragonfly database: Failed to open Dragonfly connection: Connection failed during drop",
      );
    });
  });
});
