import { beforeEach, describe, expect, mock, test } from "bun:test";

const generateCalls: Array<Record<string, unknown>> = [];
const adapterCalls: Array<{ model: string; config: unknown }> = [];
let generateResult: unknown = { id: "img-1", model: "m", images: [] };
let generateError: Error | null = null;

mock.module("@tanstack/ai", () => ({
  generateImage: mock((options: Record<string, unknown>) => {
    generateCalls.push(options);
    return generateError ? Promise.reject(generateError) : Promise.resolve(generateResult);
  }),
  toolDefinition: () => ({ server: () => ({}) }),
}));

mock.module("@tanstack/ai-openrouter", () => ({
  openRouterText: (model: string) => ({ __model: model }),
  openRouterImage: (model: string, config?: unknown) => {
    adapterCalls.push({ model, config });
    return { __model: model };
  },
}));

const { Image } = await import("@/Image");

class TestImage extends Image {
  public getModel = (): string => "google/gemini-2.5-flash-image";
  public getPrompts = (): string[] => ["Flat illustration.", "No text."];
}

// biome-ignore lint/suspicious/noExplicitAny: tests read arbitrary option keys off the recorded call
const lastCall = () => generateCalls[generateCalls.length - 1] as Record<string, any>;

beforeEach(() => {
  generateCalls.length = 0;
  adapterCalls.length = 0;
  generateResult = { id: "img-1", model: "m", images: [] };
  generateError = null;
});

describe("Image.run", () => {
  test("should resolve to the generation result", async () => {
    generateResult = { id: "img-2", model: "google/gemini-2.5-flash-image", images: [{ b64Json: "AAAA" }] };

    const result = await new TestImage().run({ prompt: "A lighthouse" });

    expect(result).toEqual(generateResult as never);
  });

  test("should call generateImage() with stream disabled and the adapter built from getModel", async () => {
    await new TestImage().run({ prompt: "A lighthouse" });

    expect(lastCall().stream).toBe(false);
    expect(lastCall().adapter).toEqual({ __model: "google/gemini-2.5-flash-image" });
  });

  test("should put the image's own prompts ahead of the request prompt", async () => {
    await new TestImage().run({ prompt: "A lighthouse" });

    expect(lastCall().prompt).toBe("Flat illustration.\n\nNo text.\n\nA lighthouse");
  });

  test("should forward the size, the number of images and the resolution", async () => {
    await new TestImage().run({ prompt: "A lighthouse", size: "1344x768", numberOfImages: 2, resolution: "2K" });

    const call = lastCall();
    expect(call.size).toBe("1344x768");
    expect(call.numberOfImages).toBe(2);
    expect(call.modelOptions).toEqual({ image_size: "2K" });
  });

  test("should leave unset options out of the call", async () => {
    await new TestImage().run({ prompt: "A lighthouse" });

    const call = lastCall();
    expect("size" in call).toBe(false);
    expect("numberOfImages" in call).toBe(false);
    expect("modelOptions" in call).toBe(false);
  });

  test("should hand the timeout to the adapter", async () => {
    await new TestImage().run({ prompt: "A lighthouse", timeoutMs: 60_000 });

    expect(adapterCalls[0]).toEqual({ model: "google/gemini-2.5-flash-image", config: { timeoutMs: 60_000 } });
  });

  test("should build the adapter without config when no timeout is set", async () => {
    await new TestImage().run({ prompt: "A lighthouse" });

    expect(adapterCalls[0]?.config).toBeUndefined();
  });

  test("should run with the image's own prompts only when no input is given", async () => {
    await new TestImage().run();

    expect(lastCall().prompt).toBe("Flat illustration.\n\nNo text.");
  });

  test("should propagate a provider failure", async () => {
    generateError = new Error("Image generation failed: quota");

    await expect(new TestImage().run({ prompt: "A lighthouse" })).rejects.toThrow("quota");
  });
});
