import { generateImage } from "@tanstack/ai";
import type { IImage, ImageInputType, ImageResultType } from "./types";
import { buildImagePrompt, createImageAdapter } from "./utils";

/**
 * Abstract image driver built on top of TanStack AI's OpenRouter image adapter.
 *
 * Subclasses describe *what* the image is — its model and the standing prompts
 * every picture it paints follows (style, framing, what never to draw) — by
 * implementing the two abstract getters. The base class owns the *how*: it
 * appends the request's prompt, wires the size, resolution and timeout into a
 * {@link generateImage} call, and returns the generated images.
 *
 * @see https://tanstack.com/ai/latest/docs/adapters/openrouter
 *
 * @example
 * ```ts
 * @decorator.image()
 * class CoverImage extends Image {
 *   public getModel = () => "google/gemini-2.5-flash-image";
 *   public getPrompts = () => ["Flat editorial illustration. No text."];
 * }
 *
 * const { images } = await container.get(CoverImage).run({ prompt: "A lighthouse", size: "1024x1024" });
 * ```
 */
export abstract class Image implements IImage {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor is needed for Bun function coverage
  public constructor() {}

  /** OpenRouter model identifier in `provider/model` form (e.g. `google/gemini-2.5-flash-image`). */
  public abstract getModel(): string;

  /** Prompts every generation starts with, before the per-request one. */
  public abstract getPrompts(): string[];

  /**
   * Generate the image(s) described by the request.
   *
   * Each image comes back either as base64 bytes (`b64Json`) or as a hosted
   * `url`, depending on what the provider returns. Rejects when the provider
   * refuses the request or returns no image at all.
   */
  public async run(input?: ImageInputType): Promise<ImageResultType> {
    return await generateImage({
      adapter: createImageAdapter(this.getModel(), input?.timeoutMs),
      prompt: buildImagePrompt(this.getPrompts(), input),
      ...(input?.numberOfImages === undefined ? {} : { numberOfImages: input.numberOfImages }),
      // TanStack types the non-square sizes with `×`, while its adapter looks them up with `x`.
      ...(input?.size === undefined ? {} : { size: input.size as "1024x1024" }),
      ...(input?.resolution === undefined ? {} : { modelOptions: { image_size: input.resolution } }),
      stream: false,
    });
  }
}
