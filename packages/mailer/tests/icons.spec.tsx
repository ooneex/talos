import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Facebook } from "@/icons/Facebook";
import { Instagram } from "@/icons/Instagram";
import { Linkedin } from "@/icons/Linkedin";
import { Slack } from "@/icons/Slack";
import { Talos } from "@/icons/Talos";
import { Tiktok } from "@/icons/TikTok";

const socialIcons = [
  { name: "Facebook", Icon: Facebook, viewBox: "0 0 256 256" },
  { name: "Instagram", Icon: Instagram, viewBox: "0 0 256 256" },
  { name: "Linkedin", Icon: Linkedin, viewBox: "0 0 256 256" },
  { name: "Slack", Icon: Slack, viewBox: "0 0 128 128" },
  { name: "Tiktok", Icon: Tiktok, viewBox: "0 0 256 290" },
];

describe("icons", () => {
  describe.each(socialIcons)("$name", ({ Icon, viewBox }) => {
    test("should render an svg with its own viewBox", () => {
      const html = renderToStaticMarkup(<Icon />);

      expect(html).toStartWith("<svg");
      expect(html).toContain(`viewBox="${viewBox}"`);
      expect(html).toContain("<path");
    });

    test("should let props override the intrinsic size", () => {
      const html = renderToStaticMarkup(<Icon width={28} height={28} />);

      expect(html).toContain('width="28"');
      expect(html).toContain('height="28"');
    });

    test("should forward arbitrary svg props", () => {
      const html = renderToStaticMarkup(<Icon aria-label="social link" />);

      expect(html).toContain('aria-label="social link"');
    });
  });

  describe("Talos", () => {
    test("should render the wordmark at its fixed size", () => {
      const html = renderToStaticMarkup(<Talos />);

      expect(html).toStartWith("<svg");
      expect(html).toContain('width="180"');
      expect(html).toContain('height="28"');
      expect(html).toContain('viewBox="0 0 180 28"');
    });
  });
});
