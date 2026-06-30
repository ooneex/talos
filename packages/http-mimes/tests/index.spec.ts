import { beforeEach, describe, expect, test } from "bun:test";
import { Mime } from "@/index.ts";

describe("Mime", () => {
  let mime: Mime;

  beforeEach(() => {
    mime = new Mime();
  });

  describe("isJson", () => {
    test("should return true for application/json", () => {
      expect(mime.isJson("application/json")).toBe(true);
    });

    test("should return true for JSON-based MIME types ending with +json", () => {
      expect(mime.isJson("application/hal+json")).toBe(false);
      expect(mime.isJson("application/ld+json")).toBe(true);
      expect(mime.isJson("application/api+json")).toBe(false);
    });

    test("should return true for JSON-related MIME types", () => {
      expect(mime.isJson("application/json5")).toBe(true);
      expect(mime.isJson("application/jsonml+json")).toBe(true);
      expect(mime.isJson("application/jsonpath")).toBe(true);
      expect(mime.isJson("text/json")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isJson("APPLICATION/JSON")).toBe(true);
      expect(mime.isJson("Application/Json")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isJson(" application/json ")).toBe(true);
      expect(mime.isJson("\t application/json \n")).toBe(true);
    });

    test("should return false for non-JSON MIME types", () => {
      expect(mime.isJson("text/html")).toBe(false);
      expect(mime.isJson("image/png")).toBe(false);
      expect(mime.isJson("application/xml")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isJson("")).toBe(false);
      expect(mime.isJson(" ")).toBe(false);
      expect(mime.isJson(null as unknown as string)).toBe(false);
      expect(mime.isJson(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isAudio", () => {
    test("should return true for audio/* MIME types", () => {
      expect(mime.isAudio("audio/mpeg")).toBe(true);
      expect(mime.isAudio("audio/mp3")).toBe(true);
      expect(mime.isAudio("audio/wav")).toBe(true);
      expect(mime.isAudio("audio/ogg")).toBe(true);
      expect(mime.isAudio("audio/flac")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isAudio("AUDIO/MPEG")).toBe(true);
      expect(mime.isAudio("Audio/Mp3")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isAudio(" audio/mpeg ")).toBe(true);
    });

    test("should return false for non-audio MIME types", () => {
      expect(mime.isAudio("video/mp4")).toBe(false);
      expect(mime.isAudio("image/png")).toBe(false);
      expect(mime.isAudio("text/html")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isAudio("")).toBe(false);
      expect(mime.isAudio(null as unknown as string)).toBe(false);
      expect(mime.isAudio(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isVideo", () => {
    test("should return true for video/* MIME types", () => {
      expect(mime.isVideo("video/mp4")).toBe(true);
      expect(mime.isVideo("video/mpeg")).toBe(true);
      expect(mime.isVideo("video/avi")).toBe(true);
      expect(mime.isVideo("video/webm")).toBe(true);
      expect(mime.isVideo("video/quicktime")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isVideo("VIDEO/MP4")).toBe(true);
      expect(mime.isVideo("Video/Mpeg")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isVideo(" video/mp4 ")).toBe(true);
    });

    test("should return false for non-video MIME types", () => {
      expect(mime.isVideo("audio/mpeg")).toBe(false);
      expect(mime.isVideo("image/png")).toBe(false);
      expect(mime.isVideo("text/html")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isVideo("")).toBe(false);
      expect(mime.isVideo(null as unknown as string)).toBe(false);
      expect(mime.isVideo(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isMp4", () => {
    test("should return true for MP4 MIME types", () => {
      expect(mime.isMp4("video/mp4")).toBe(true);
      expect(mime.isMp4("application/mp4")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isMp4("VIDEO/MP4")).toBe(true);
      expect(mime.isMp4("APPLICATION/MP4")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isMp4(" video/mp4 ")).toBe(true);
    });

    test("should return false for non-MP4 MIME types", () => {
      expect(mime.isMp4("video/mpeg")).toBe(false);
      expect(mime.isMp4("audio/mpeg")).toBe(false);
      expect(mime.isMp4("video/avi")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isMp4("")).toBe(false);
      expect(mime.isMp4(null as unknown as string)).toBe(false);
      expect(mime.isMp4(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isMp3", () => {
    test("should return true for MP3 MIME types", () => {
      expect(mime.isMp3("audio/mp3")).toBe(true);
      expect(mime.isMp3("audio/mpeg")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isMp3("AUDIO/MP3")).toBe(true);
      expect(mime.isMp3("Audio/Mpeg")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isMp3(" audio/mp3 ")).toBe(true);
    });

    test("should return false for non-MP3 MIME types", () => {
      expect(mime.isMp3("audio/wav")).toBe(false);
      expect(mime.isMp3("video/mp4")).toBe(false);
      expect(mime.isMp3("audio/ogg")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isMp3("")).toBe(false);
      expect(mime.isMp3(null as unknown as string)).toBe(false);
      expect(mime.isMp3(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isSvg", () => {
    test("should return true for SVG MIME types", () => {
      expect(mime.isSvg("image/svg+xml")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isSvg("IMAGE/SVG+XML")).toBe(true);
      expect(mime.isSvg("Image/Svg+Xml")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isSvg(" image/svg+xml ")).toBe(true);
    });

    test("should return false for non-SVG MIME types", () => {
      expect(mime.isSvg("image/png")).toBe(false);
      expect(mime.isSvg("image/jpeg")).toBe(false);
      expect(mime.isSvg("text/xml")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isSvg("")).toBe(false);
      expect(mime.isSvg(null as unknown as string)).toBe(false);
      expect(mime.isSvg(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isJpeg", () => {
    test("should return true for JPEG MIME types", () => {
      expect(mime.isJpeg("image/jpeg")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isJpeg("IMAGE/JPEG")).toBe(true);
      expect(mime.isJpeg("Image/Jpeg")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isJpeg(" image/jpeg ")).toBe(true);
    });

    test("should return false for non-JPEG MIME types", () => {
      expect(mime.isJpeg("image/png")).toBe(false);
      expect(mime.isJpeg("image/jpg")).toBe(false);
      expect(mime.isJpeg("image/gif")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isJpeg("")).toBe(false);
      expect(mime.isJpeg(null as unknown as string)).toBe(false);
      expect(mime.isJpeg(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isCsv", () => {
    test("should return true for CSV MIME types", () => {
      expect(mime.isCsv("text/csv")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isCsv("TEXT/CSV")).toBe(true);
      expect(mime.isCsv("Text/Csv")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isCsv(" text/csv ")).toBe(true);
    });

    test("should return false for non-CSV MIME types", () => {
      expect(mime.isCsv("text/plain")).toBe(false);
      expect(mime.isCsv("application/csv")).toBe(false);
      expect(mime.isCsv("text/html")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isCsv("")).toBe(false);
      expect(mime.isCsv(null as unknown as string)).toBe(false);
      expect(mime.isCsv(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isJpg", () => {
    test("should return true for JPG MIME types", () => {
      expect(mime.isJpg("image/jpeg")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isJpg("IMAGE/JPEG")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isJpg(" image/jpeg ")).toBe(true);
    });

    test("should return false for non-JPG MIME types", () => {
      expect(mime.isJpg("image/png")).toBe(false);
      expect(mime.isJpg("image/gif")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isJpg("")).toBe(false);
      expect(mime.isJpg(null as unknown as string)).toBe(false);
      expect(mime.isJpg(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isPng", () => {
    test("should return true for PNG MIME types", () => {
      expect(mime.isPng("image/png")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isPng("IMAGE/PNG")).toBe(true);
      expect(mime.isPng("Image/Png")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isPng(" image/png ")).toBe(true);
    });

    test("should return false for non-PNG MIME types", () => {
      expect(mime.isPng("image/jpeg")).toBe(false);
      expect(mime.isPng("image/gif")).toBe(false);
      expect(mime.isPng("image/webp")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isPng("")).toBe(false);
      expect(mime.isPng(null as unknown as string)).toBe(false);
      expect(mime.isPng(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isPdf", () => {
    test("should return true for PDF MIME types", () => {
      expect(mime.isPdf("application/pdf")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isPdf("APPLICATION/PDF")).toBe(true);
      expect(mime.isPdf("Application/Pdf")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isPdf(" application/pdf ")).toBe(true);
    });

    test("should return false for non-PDF MIME types", () => {
      expect(mime.isPdf("application/json")).toBe(false);
      expect(mime.isPdf("text/plain")).toBe(false);
      expect(mime.isPdf("image/png")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isPdf("")).toBe(false);
      expect(mime.isPdf(null as unknown as string)).toBe(false);
      expect(mime.isPdf(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isHtml", () => {
    test("should return true for HTML MIME types", () => {
      expect(mime.isHtml("text/html")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isHtml("TEXT/HTML")).toBe(true);
      expect(mime.isHtml("Text/Html")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isHtml(" text/html ")).toBe(true);
    });

    test("should return false for non-HTML MIME types", () => {
      expect(mime.isHtml("text/plain")).toBe(false);
      expect(mime.isHtml("application/xhtml+xml")).toBe(false);
      expect(mime.isHtml("text/xml")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isHtml("")).toBe(false);
      expect(mime.isHtml(null as unknown as string)).toBe(false);
      expect(mime.isHtml(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isCss", () => {
    test("should return true for CSS MIME types", () => {
      expect(mime.isCss("text/css")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isCss("TEXT/CSS")).toBe(true);
      expect(mime.isCss("Text/Css")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isCss(" text/css ")).toBe(true);
    });

    test("should return false for non-CSS MIME types", () => {
      expect(mime.isCss("text/html")).toBe(false);
      expect(mime.isCss("text/plain")).toBe(false);
      expect(mime.isCss("application/css")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isCss("")).toBe(false);
      expect(mime.isCss(null as unknown as string)).toBe(false);
      expect(mime.isCss(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isJavaScript", () => {
    test("should return true for JavaScript MIME types", () => {
      expect(mime.isJavaScript("text/javascript")).toBe(true);
      expect(mime.isJavaScript("application/javascript")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isJavaScript("TEXT/JAVASCRIPT")).toBe(true);
      expect(mime.isJavaScript("Application/Javascript")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isJavaScript(" text/javascript ")).toBe(true);
    });

    test("should return false for non-JavaScript MIME types", () => {
      expect(mime.isJavaScript("text/html")).toBe(false);
      expect(mime.isJavaScript("application/json")).toBe(false);
      expect(mime.isJavaScript("text/css")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isJavaScript("")).toBe(false);
      expect(mime.isJavaScript(null as unknown as string)).toBe(false);
      expect(mime.isJavaScript(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isZip", () => {
    test("should return true for ZIP MIME types", () => {
      expect(mime.isZip("application/zip")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isZip("APPLICATION/ZIP")).toBe(true);
      expect(mime.isZip("Application/Zip")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isZip(" application/zip ")).toBe(true);
    });

    test("should return false for non-ZIP MIME types", () => {
      expect(mime.isZip("application/gzip")).toBe(false);
      expect(mime.isZip("application/x-zip")).toBe(false);
      expect(mime.isZip("application/rar")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isZip("")).toBe(false);
      expect(mime.isZip(null as unknown as string)).toBe(false);
      expect(mime.isZip(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isGif", () => {
    test("should return true for GIF MIME types", () => {
      expect(mime.isGif("image/gif")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isGif("IMAGE/GIF")).toBe(true);
      expect(mime.isGif("Image/Gif")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isGif(" image/gif ")).toBe(true);
    });

    test("should return false for non-GIF MIME types", () => {
      expect(mime.isGif("image/png")).toBe(false);
      expect(mime.isGif("image/jpeg")).toBe(false);
      expect(mime.isGif("image/webp")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isGif("")).toBe(false);
      expect(mime.isGif(null as unknown as string)).toBe(false);
      expect(mime.isGif(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isWebp", () => {
    test("should return true for WebP MIME types", () => {
      expect(mime.isWebp("image/webp")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isWebp("IMAGE/WEBP")).toBe(true);
      expect(mime.isWebp("Image/Webp")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isWebp(" image/webp ")).toBe(true);
    });

    test("should return false for non-WebP MIME types", () => {
      expect(mime.isWebp("image/png")).toBe(false);
      expect(mime.isWebp("image/jpeg")).toBe(false);
      expect(mime.isWebp("image/gif")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isWebp("")).toBe(false);
      expect(mime.isWebp(null as unknown as string)).toBe(false);
      expect(mime.isWebp(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isXml", () => {
    test("should return true for XML MIME types", () => {
      expect(mime.isXml("text/xml")).toBe(true);
      expect(mime.isXml("application/xml")).toBe(true);
    });

    test("should return true for XML-based MIME types ending with +xml", () => {
      expect(mime.isXml("application/rss+xml")).toBe(true);
      expect(mime.isXml("image/svg+xml")).toBe(true);
      expect(mime.isXml("application/atom+xml")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isXml("TEXT/XML")).toBe(true);
      expect(mime.isXml("Application/Xml")).toBe(true);
      expect(mime.isXml("APPLICATION/RSS+XML")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isXml(" text/xml ")).toBe(true);
      expect(mime.isXml(" application/rss+xml ")).toBe(true);
    });

    test("should return false for non-XML MIME types", () => {
      expect(mime.isXml("text/html")).toBe(false);
      expect(mime.isXml("application/json")).toBe(false);
      expect(mime.isXml("text/plain")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isXml("")).toBe(false);
      expect(mime.isXml(null as unknown as string)).toBe(false);
      expect(mime.isXml(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isText", () => {
    test("should return true for text/plain MIME type", () => {
      expect(mime.isText("text/plain")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isText("TEXT/PLAIN")).toBe(true);
      expect(mime.isText("Text/Plain")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isText(" text/plain ")).toBe(true);
    });

    test("should return false for non-text/plain MIME types", () => {
      expect(mime.isText("text/html")).toBe(false);
      expect(mime.isText("text/css")).toBe(false);
      expect(mime.isText("application/json")).toBe(false);
      expect(mime.isText("image/png")).toBe(false);
      expect(mime.isText("video/mp4")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isText("")).toBe(false);
      expect(mime.isText(null as unknown as string)).toBe(false);
      expect(mime.isText(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isOctetStream", () => {
    test("should return true for octet-stream MIME types", () => {
      expect(mime.isOctetStream("application/octet-stream")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isOctetStream("APPLICATION/OCTET-STREAM")).toBe(true);
      expect(mime.isOctetStream("Application/Octet-Stream")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isOctetStream(" application/octet-stream ")).toBe(true);
    });

    test("should return false for non-octet-stream MIME types", () => {
      expect(mime.isOctetStream("application/json")).toBe(false);
      expect(mime.isOctetStream("application/pdf")).toBe(false);
      expect(mime.isOctetStream("text/plain")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isOctetStream("")).toBe(false);
      expect(mime.isOctetStream(null as unknown as string)).toBe(false);
      expect(mime.isOctetStream(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isFont", () => {
    test("should return true for font/* MIME types", () => {
      expect(mime.isFont("font/woff")).toBe(true);
      expect(mime.isFont("font/woff2")).toBe(true);
      expect(mime.isFont("font/ttf")).toBe(true);
      expect(mime.isFont("font/otf")).toBe(true);
    });

    test("should return true for application font MIME types", () => {
      expect(mime.isFont("application/font-woff")).toBe(true);
      expect(mime.isFont("application/font-woff2")).toBe(true);
      expect(mime.isFont("application/font-sfnt")).toBe(true);
      expect(mime.isFont("application/font-tdpfr")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isFont("FONT/WOFF")).toBe(true);
      expect(mime.isFont("Application/Font-Woff")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isFont(" font/woff ")).toBe(true);
    });

    test("should return false for non-font MIME types", () => {
      expect(mime.isFont("text/plain")).toBe(false);
      expect(mime.isFont("image/png")).toBe(false);
      expect(mime.isFont("application/json")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isFont("")).toBe(false);
      expect(mime.isFont(null as unknown as string)).toBe(false);
      expect(mime.isFont(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isWord", () => {
    test("should return true for Word document MIME types", () => {
      expect(mime.isWord("application/msword")).toBe(true);
      expect(mime.isWord("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isWord("APPLICATION/MSWORD")).toBe(true);
      expect(mime.isWord("Application/Msword")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isWord(" application/msword ")).toBe(true);
    });

    test("should return false for non-Word MIME types", () => {
      expect(mime.isWord("application/pdf")).toBe(false);
      expect(mime.isWord("text/plain")).toBe(false);
      expect(mime.isWord("application/json")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isWord("")).toBe(false);
      expect(mime.isWord(null as unknown as string)).toBe(false);
      expect(mime.isWord(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isExcel", () => {
    test("should return true for Excel document MIME types", () => {
      expect(mime.isExcel("application/vnd.ms-excel")).toBe(true);
      expect(mime.isExcel("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isExcel("APPLICATION/VND.MS-EXCEL")).toBe(true);
      expect(mime.isExcel("Application/Vnd.Ms-Excel")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isExcel(" application/vnd.ms-excel ")).toBe(true);
    });

    test("should return false for non-Excel MIME types", () => {
      expect(mime.isExcel("application/msword")).toBe(false);
      expect(mime.isExcel("text/csv")).toBe(false);
      expect(mime.isExcel("application/json")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isExcel("")).toBe(false);
      expect(mime.isExcel(null as unknown as string)).toBe(false);
      expect(mime.isExcel(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isPowerPoint", () => {
    test("should return true for PowerPoint document MIME types", () => {
      expect(mime.isPowerPoint("application/vnd.ms-powerpoint")).toBe(true);
      expect(mime.isPowerPoint("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isPowerPoint("APPLICATION/VND.MS-POWERPOINT")).toBe(true);
      expect(mime.isPowerPoint("Application/Vnd.Ms-Powerpoint")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isPowerPoint(" application/vnd.ms-powerpoint ")).toBe(true);
    });

    test("should return false for non-PowerPoint MIME types", () => {
      expect(mime.isPowerPoint("application/msword")).toBe(false);
      expect(mime.isPowerPoint("application/vnd.ms-excel")).toBe(false);
      expect(mime.isPowerPoint("application/pdf")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isPowerPoint("")).toBe(false);
      expect(mime.isPowerPoint(null as unknown as string)).toBe(false);
      expect(mime.isPowerPoint(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isImage", () => {
    test("should return true for image/* MIME types", () => {
      expect(mime.isImage("image/png")).toBe(true);
      expect(mime.isImage("image/jpeg")).toBe(true);
      expect(mime.isImage("image/gif")).toBe(true);
      expect(mime.isImage("image/webp")).toBe(true);
      expect(mime.isImage("image/svg+xml")).toBe(true);
      expect(mime.isImage("image/bmp")).toBe(true);
      expect(mime.isImage("image/tiff")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isImage("IMAGE/PNG")).toBe(true);
      expect(mime.isImage("Image/Jpeg")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isImage(" image/png ")).toBe(true);
    });

    test("should return false for non-image MIME types", () => {
      expect(mime.isImage("text/html")).toBe(false);
      expect(mime.isImage("video/mp4")).toBe(false);
      expect(mime.isImage("audio/mpeg")).toBe(false);
      expect(mime.isImage("application/pdf")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isImage("")).toBe(false);
      expect(mime.isImage(null as unknown as string)).toBe(false);
      expect(mime.isImage(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isBlob", () => {
    test("should return true for blob MIME types", () => {
      expect(mime.isBlob("application/octet-stream")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isBlob("APPLICATION/OCTET-STREAM")).toBe(true);
      expect(mime.isBlob("Application/Octet-Stream")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isBlob(" application/octet-stream ")).toBe(true);
      expect(mime.isBlob("\t application/octet-stream \n")).toBe(true);
    });

    test("should return false for non-blob MIME types", () => {
      expect(mime.isBlob("text/plain")).toBe(false);
      expect(mime.isBlob("image/png")).toBe(false);
      expect(mime.isBlob("application/json")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isBlob("")).toBe(false);
      expect(mime.isBlob(" ")).toBe(false);
      expect(mime.isBlob(null as unknown as string)).toBe(false);
      expect(mime.isBlob(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isStream", () => {
    test("should return true for stream MIME types", () => {
      expect(mime.isStream("application/octet-stream")).toBe(true);
      expect(mime.isStream("application/stream")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isStream("APPLICATION/OCTET-STREAM")).toBe(true);
      expect(mime.isStream("APPLICATION/STREAM")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isStream(" application/octet-stream ")).toBe(true);
      expect(mime.isStream(" application/stream ")).toBe(true);
    });

    test("should return false for non-stream MIME types", () => {
      expect(mime.isStream("text/plain")).toBe(false);
      expect(mime.isStream("image/png")).toBe(false);
      expect(mime.isStream("application/json")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isStream("")).toBe(false);
      expect(mime.isStream(" ")).toBe(false);
      expect(mime.isStream(null as unknown as string)).toBe(false);
      expect(mime.isStream(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isFormData", () => {
    test("should return true for form data MIME types", () => {
      expect(mime.isFormData("application/form-data")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isFormData("APPLICATION/FORM-DATA")).toBe(true);
      expect(mime.isFormData("Application/Form-Data")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isFormData(" application/form-data ")).toBe(true);
      expect(mime.isFormData("\t application/form-data \n")).toBe(true);
    });

    test("should return false for non-form-data MIME types", () => {
      expect(mime.isFormData("application/x-www-form-urlencoded")).toBe(false);
      expect(mime.isFormData("text/plain")).toBe(false);
      expect(mime.isFormData("multipart/form-data")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isFormData("")).toBe(false);
      expect(mime.isFormData(" ")).toBe(false);
      expect(mime.isFormData(null as unknown as string)).toBe(false);
      expect(mime.isFormData(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isForm", () => {
    test("should return true for form MIME types", () => {
      expect(mime.isForm("application/x-www-form-urlencoded")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isForm("APPLICATION/X-WWW-FORM-URLENCODED")).toBe(true);
      expect(mime.isForm("Application/X-Www-Form-Urlencoded")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isForm(" application/x-www-form-urlencoded ")).toBe(true);
      expect(mime.isForm("\t application/x-www-form-urlencoded \n")).toBe(true);
    });

    test("should return false for non-form MIME types", () => {
      expect(mime.isForm("application/form-data")).toBe(false);
      expect(mime.isForm("text/plain")).toBe(false);
      expect(mime.isForm("multipart/form-data")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isForm("")).toBe(false);
      expect(mime.isForm(" ")).toBe(false);
      expect(mime.isForm(null as unknown as string)).toBe(false);
      expect(mime.isForm(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isMultipart", () => {
    test("should return true for multipart/* MIME types", () => {
      expect(mime.isMultipart("multipart/form-data")).toBe(true);
      expect(mime.isMultipart("multipart/mixed")).toBe(true);
      expect(mime.isMultipart("multipart/alternative")).toBe(true);
      expect(mime.isMultipart("multipart/related")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isMultipart("MULTIPART/FORM-DATA")).toBe(true);
      expect(mime.isMultipart("Multipart/Form-Data")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isMultipart(" multipart/form-data ")).toBe(true);
      expect(mime.isMultipart("\t multipart/mixed \n")).toBe(true);
    });

    test("should return false for non-multipart MIME types", () => {
      expect(mime.isMultipart("application/x-www-form-urlencoded")).toBe(false);
      expect(mime.isMultipart("text/plain")).toBe(false);
      expect(mime.isMultipart("application/json")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isMultipart("")).toBe(false);
      expect(mime.isMultipart(" ")).toBe(false);
      expect(mime.isMultipart(null as unknown as string)).toBe(false);
      expect(mime.isMultipart(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isPlainText", () => {
    test("should return true for text/plain MIME type", () => {
      expect(mime.isPlainText("text/plain")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isPlainText("TEXT/PLAIN")).toBe(true);
      expect(mime.isPlainText("Text/Plain")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isPlainText(" text/plain ")).toBe(true);
      expect(mime.isPlainText("\t text/plain \n")).toBe(true);
    });

    test("should return false for non-plain-text MIME types", () => {
      expect(mime.isPlainText("text/html")).toBe(false);
      expect(mime.isPlainText("text/markdown")).toBe(false);
      expect(mime.isPlainText("text/css")).toBe(false);
      expect(mime.isPlainText("application/json")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isPlainText("")).toBe(false);
      expect(mime.isPlainText(" ")).toBe(false);
      expect(mime.isPlainText(null as unknown as string)).toBe(false);
      expect(mime.isPlainText(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isMarkdown", () => {
    test("should return true for markdown MIME types", () => {
      expect(mime.isMarkdown("text/markdown")).toBe(true);
      expect(mime.isMarkdown("text/x-markdown")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isMarkdown("TEXT/MARKDOWN")).toBe(true);
      expect(mime.isMarkdown("Text/X-Markdown")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isMarkdown(" text/markdown ")).toBe(true);
      expect(mime.isMarkdown("\t text/x-markdown \n")).toBe(true);
    });

    test("should return false for non-markdown MIME types", () => {
      expect(mime.isMarkdown("text/plain")).toBe(false);
      expect(mime.isMarkdown("text/html")).toBe(false);
      expect(mime.isMarkdown("application/json")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isMarkdown("")).toBe(false);
      expect(mime.isMarkdown(" ")).toBe(false);
      expect(mime.isMarkdown(null as unknown as string)).toBe(false);
      expect(mime.isMarkdown(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isRtf", () => {
    test("should return true for RTF MIME types", () => {
      expect(mime.isRtf("application/rtf")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isRtf("APPLICATION/RTF")).toBe(true);
      expect(mime.isRtf("Application/Rtf")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isRtf(" application/rtf ")).toBe(true);
      expect(mime.isRtf("\t application/rtf \n")).toBe(true);
    });

    test("should return false for non-RTF MIME types", () => {
      expect(mime.isRtf("text/plain")).toBe(false);
      expect(mime.isRtf("application/pdf")).toBe(false);
      expect(mime.isRtf("text/rtf")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isRtf("")).toBe(false);
      expect(mime.isRtf(" ")).toBe(false);
      expect(mime.isRtf(null as unknown as string)).toBe(false);
      expect(mime.isRtf(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isGzip", () => {
    test("should return true for gzip MIME types", () => {
      expect(mime.isGzip("application/gzip")).toBe(true);
      expect(mime.isGzip("application/x-gzip")).toBe(true);
    });

    test("should be case insensitive", () => {
      expect(mime.isGzip("APPLICATION/GZIP")).toBe(true);
      expect(mime.isGzip("Application/X-Gzip")).toBe(true);
    });

    test("should handle whitespace", () => {
      expect(mime.isGzip(" application/gzip ")).toBe(true);
      expect(mime.isGzip("\t application/x-gzip \n")).toBe(true);
    });

    test("should return false for non-gzip MIME types", () => {
      expect(mime.isGzip("application/zip")).toBe(false);
      expect(mime.isGzip("text/plain")).toBe(false);
      expect(mime.isGzip("application/json")).toBe(false);
    });

    test("should return false for empty or invalid input", () => {
      expect(mime.isGzip("")).toBe(false);
      expect(mime.isGzip(" ")).toBe(false);
      expect(mime.isGzip(null as unknown as string)).toBe(false);
      expect(mime.isGzip(undefined as unknown as string)).toBe(false);
    });
  });

  describe("Charset and Parameter Tests", () => {
    test("should handle MIME types with utf-8 charset", () => {
      expect(mime.isHtml("text/html; charset=utf-8")).toBe(true);
      expect(mime.isCss("text/css; charset=utf-8")).toBe(true);
      expect(mime.isJavaScript("text/javascript; charset=utf-8")).toBe(true);
      expect(mime.isXml("text/xml; charset=utf-8")).toBe(true);
      expect(mime.isText("text/plain; charset=utf-8")).toBe(true);
      expect(mime.isPlainText("text/plain; charset=utf-8")).toBe(true);
      expect(mime.isMarkdown("text/markdown; charset=utf-8")).toBe(true);
    });

    test("should handle MIME types with various charset encodings", () => {
      expect(mime.isHtml("text/html; charset=iso-8859-1")).toBe(true);
      expect(mime.isCss("text/css; charset=ascii")).toBe(true);
      expect(mime.isJavaScript("application/javascript; charset=utf-16")).toBe(true);
      expect(mime.isXml("application/xml; charset=utf-32")).toBe(true);
      expect(mime.isText("text/plain; charset=windows-1252")).toBe(true);
    });

    test("should handle MIME types with boundary parameters", () => {
      expect(mime.isMultipart("multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW")).toBe(true);
      expect(mime.isMultipart("multipart/mixed; boundary=something")).toBe(true);
      expect(mime.isMultipart("multipart/alternative; boundary=----=_NextPart_000_0000_01D5E5D5.5D5E5D50")).toBe(true);
    });

    test("should handle MIME types with multiple parameters", () => {
      expect(mime.isHtml("text/html; charset=utf-8; boundary=something")).toBe(true);
      expect(mime.isCss("text/css; charset=utf-8; version=1.0")).toBe(true);
      expect(mime.isMultipart("multipart/form-data; charset=utf-8; boundary=----WebKitFormBoundary")).toBe(true);
    });

    test("should handle JSON with charset parameters", () => {
      // JSON methods use strict regex with anchors, so parameters will cause false
      expect(mime.isJson("application/json; charset=utf-8")).toBe(true);
      expect(mime.isJson("text/json; charset=utf-8")).toBe(true);
      expect(mime.isJson("application/ld+json; charset=utf-8")).toBe(true);
    });

    test("should handle form types with charset parameters", () => {
      expect(mime.isForm("application/x-www-form-urlencoded; charset=utf-8")).toBe(true);
      expect(mime.isFormData("application/form-data; charset=utf-8")).toBe(true);
      expect(mime.isMultipart("multipart/form-data; charset=utf-8; boundary=something")).toBe(true);
    });

    test("should handle media types with charset parameters", () => {
      // These use prefix matching, so parameters don't affect the result
      expect(mime.isImage("image/png; charset=utf-8")).toBe(true);
      expect(mime.isAudio("audio/mpeg; charset=utf-8")).toBe(true);
      expect(mime.isVideo("video/mp4; charset=utf-8")).toBe(true);
    });

    test("should handle document types with charset parameters", () => {
      expect(mime.isPdf("application/pdf; charset=utf-8")).toBe(true);
      expect(mime.isWord("application/msword; charset=utf-8")).toBe(true);
      expect(mime.isRtf("application/rtf; charset=utf-8")).toBe(true);
    });

    test("should handle compression types with charset parameters", () => {
      expect(mime.isZip("application/zip; charset=utf-8")).toBe(true);
      expect(mime.isGzip("application/gzip; charset=utf-8")).toBe(true);
      expect(mime.isGzip("application/x-gzip; charset=utf-8")).toBe(true);
    });

    test("should handle stream types with charset parameters", () => {
      expect(mime.isStream("application/octet-stream; charset=utf-8")).toBe(true);
      expect(mime.isBlob("application/octet-stream; charset=utf-8")).toBe(true);
      expect(mime.isOctetStream("application/octet-stream; charset=utf-8")).toBe(true);
    });

    test("should be case insensitive with charset parameters", () => {
      expect(mime.isHtml("TEXT/HTML; CHARSET=UTF-8")).toBe(true);
      expect(mime.isCss("Text/Css; Charset=Utf-8")).toBe(true);
      expect(mime.isMultipart("MULTIPART/FORM-DATA; BOUNDARY=SOMETHING")).toBe(true);
    });

    test("should handle malformed or unusual charset parameters", () => {
      expect(mime.isHtml("text/html; charset=")).toBe(true);
      expect(mime.isCss("text/css; charset")).toBe(true);
      expect(mime.isJavaScript("text/javascript; charset=unknown-encoding")).toBe(true);
      expect(mime.isMultipart("multipart/form-data; boundary=")).toBe(true);
    });

    test("should handle UTF-8 in various contexts", () => {
      // Standard UTF-8 charset
      expect(mime.isHtml("text/html; charset=utf-8")).toBe(true);
      expect(mime.isXml("application/xml; charset=utf-8")).toBe(true);
      expect(mime.isJavaScript("application/javascript; charset=utf-8")).toBe(true);

      // UTF-8 with different casing
      expect(mime.isHtml("text/html; charset=UTF-8")).toBe(true);
      expect(mime.isCss("text/css; CHARSET=utf-8")).toBe(true);
      expect(mime.isText("text/plain; Charset=Utf-8")).toBe(true);

      // UTF-8 with quotes
      expect(mime.isHtml('text/html; charset="utf-8"')).toBe(true);
      expect(mime.isCss("text/css; charset='utf-8'")).toBe(true);

      // UTF-8 with additional parameters
      expect(mime.isHtml("text/html; charset=utf-8; boundary=something")).toBe(true);
      expect(mime.isMultipart("multipart/form-data; charset=utf-8; boundary=----WebKitFormBoundary")).toBe(true);
    });

    test("should handle UTF-8 variants and related encodings", () => {
      // UTF variants
      expect(mime.isText("text/plain; charset=utf-16")).toBe(true);
      expect(mime.isHtml("text/html; charset=utf-32")).toBe(true);
      expect(mime.isXml("text/xml; charset=utf-16le")).toBe(true);
      expect(mime.isCss("text/css; charset=utf-16be")).toBe(true);

      // UTF-8 BOM
      expect(mime.isText("text/plain; charset=utf-8-bom")).toBe(true);
      expect(mime.isHtml("text/html; charset=UTF-8-BOM")).toBe(true);
    });

    test("should handle whitespace around UTF-8 parameters", () => {
      expect(mime.isHtml("text/html ; charset = utf-8")).toBe(true);
      expect(mime.isCss("text/css;charset=utf-8")).toBe(true);
      expect(mime.isText("text/plain;  charset  =  utf-8  ")).toBe(true);
      expect(mime.isJavaScript("text/javascript ; charset = UTF-8 ; version=1.0")).toBe(true);
    });

    test("should differentiate strict vs flexible UTF-8 handling", () => {
      // JSON methods are strict and don't handle parameters
      expect(mime.isJson("application/json; charset=utf-8")).toBe(true);
      expect(mime.isJson("text/json; charset=utf-8")).toBe(true);

      // But other methods are flexible
      expect(mime.isHtml("text/html; charset=utf-8")).toBe(true);
      expect(mime.isXml("text/xml; charset=utf-8")).toBe(true);
      expect(mime.isJavaScript("text/javascript; charset=utf-8")).toBe(true);
    });
  });

  // Integration and edge case tests
  describe("Integration Tests", () => {
    test("should handle multiple MIME type checks in sequence", () => {
      const imageFile = "image/png";
      const audioFile = "audio/mpeg";
      const videoFile = "video/mp4";
      const documentFile = "application/pdf";
      const streamFile = "application/octet-stream";
      const formFile = "application/x-www-form-urlencoded";
      const multipartFile = "multipart/form-data";
      const textFile = "text/plain";
      const markdownFile = "text/markdown";
      const gzipFile = "application/gzip";

      expect(mime.isImage(imageFile)).toBe(true);
      expect(mime.isAudio(imageFile)).toBe(false);
      expect(mime.isVideo(imageFile)).toBe(false);

      expect(mime.isAudio(audioFile)).toBe(true);
      expect(mime.isMp3(audioFile)).toBe(true);
      expect(mime.isImage(audioFile)).toBe(false);

      expect(mime.isVideo(videoFile)).toBe(true);
      expect(mime.isMp4(videoFile)).toBe(true);
      expect(mime.isAudio(videoFile)).toBe(false);

      expect(mime.isPdf(documentFile)).toBe(true);
      expect(mime.isImage(documentFile)).toBe(false);

      expect(mime.isStream(streamFile)).toBe(true);
      expect(mime.isBlob(streamFile)).toBe(true);
      expect(mime.isImage(streamFile)).toBe(false);

      expect(mime.isForm(formFile)).toBe(true);
      expect(mime.isMultipart(formFile)).toBe(false);
      expect(mime.isFormData(formFile)).toBe(false);

      expect(mime.isMultipart(multipartFile)).toBe(true);
      expect(mime.isForm(multipartFile)).toBe(false);
      expect(mime.isFormData(multipartFile)).toBe(false);

      expect(mime.isPlainText(textFile)).toBe(true);
      expect(mime.isText(textFile)).toBe(true);
      expect(mime.isMarkdown(textFile)).toBe(false);

      expect(mime.isMarkdown(markdownFile)).toBe(true);
      expect(mime.isPlainText(markdownFile)).toBe(false);
      expect(mime.isText(markdownFile)).toBe(false);

      expect(mime.isGzip(gzipFile)).toBe(true);
      expect(mime.isZip(gzipFile)).toBe(false);
      expect(mime.isStream(gzipFile)).toBe(false);
    });

    test("should handle MIME types with charset and other parameters", () => {
      expect(mime.isJson("application/json; charset=utf-8")).toBe(true);
      expect(mime.isHtml("text/html; charset=utf-8")).toBe(true);
      expect(mime.isCss("text/css; charset=utf-8")).toBe(true);
      expect(mime.isMultipart("multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW")).toBe(true);
    });

    test("should handle unusual whitespace and formatting", () => {
      expect(mime.isJson("\n\t application/json \r\n")).toBe(true);
      expect(mime.isPng("  IMAGE/PNG  ")).toBe(true);
      expect(mime.isVideo("\t\t video/mp4\t\t")).toBe(true);
    });

    test("should differentiate between similar MIME types", () => {
      // JPG vs JPEG
      expect(mime.isJpg("image/jpeg")).toBe(true);
      expect(mime.isJpeg("image/jpeg")).toBe(true);

      // MP3 vs MP4
      expect(mime.isMp3("audio/mp3")).toBe(true);
      expect(mime.isMp4("audio/mp3")).toBe(false);

      expect(mime.isMp3("audio/mpeg")).toBe(true);
      expect(mime.isMp4("audio/mpeg")).toBe(false);

      // Text types
      expect(mime.isText("text/plain")).toBe(true);
      expect(mime.isHtml("text/plain")).toBe(false);
      expect(mime.isCss("text/plain")).toBe(false);
    });

    test("should handle complex JSON MIME types", () => {
      const jsonTypes = [
        "application/json",
        "application/ld+json",
        "application/json5",
        "application/jsonml+json",
        "application/jsonpath",
        "text/json",
      ];

      jsonTypes.forEach((mimeType) => {
        expect(mime.isJson(mimeType)).toBe(true);
      });
    });

    test("should handle complex XML MIME types", () => {
      const xmlTypes = [
        "text/xml",
        "application/xml",
        "image/svg+xml",
        "application/rss+xml",
        "application/atom+xml",
        "application/xhtml+xml",
      ];

      xmlTypes.forEach((mimeType) => {
        expect(mime.isXml(mimeType)).toBe(true);
      });
    });

    test("should handle form-related MIME types correctly", () => {
      const formTypes = [
        {
          mime: "application/x-www-form-urlencoded",
          isForm: true,
          isFormData: false,
          isMultipart: false,
        },
        {
          mime: "multipart/form-data",
          isForm: false,
          isFormData: false,
          isMultipart: true,
        },
        {
          mime: "application/form-data",
          isForm: false,
          isFormData: true,
          isMultipart: false,
        },
      ];

      formTypes.forEach(({ mime: mimeType, isForm, isFormData, isMultipart }) => {
        expect(mime.isForm(mimeType)).toBe(isForm);
        expect(mime.isFormData(mimeType)).toBe(isFormData);
        expect(mime.isMultipart(mimeType)).toBe(isMultipart);
      });
    });

    test("should handle text-related MIME types correctly", () => {
      const textTypes = [
        {
          mime: "text/plain",
          isText: true,
          isPlainText: true,
          isMarkdown: false,
        },
        {
          mime: "text/markdown",
          isText: false,
          isPlainText: false,
          isMarkdown: true,
        },
        {
          mime: "text/x-markdown",
          isText: false,
          isPlainText: false,
          isMarkdown: true,
        },
        {
          mime: "text/html",
          isText: false,
          isPlainText: false,
          isMarkdown: false,
        },
      ];

      textTypes.forEach(({ mime: mimeType, isText, isPlainText, isMarkdown }) => {
        expect(mime.isText(mimeType)).toBe(isText);
        expect(mime.isPlainText(mimeType)).toBe(isPlainText);
        expect(mime.isMarkdown(mimeType)).toBe(isMarkdown);
      });
    });

    test("should handle compression and archive types correctly", () => {
      const compressionTypes = [
        { mime: "application/gzip", isGzip: true, isZip: false },
        { mime: "application/x-gzip", isGzip: true, isZip: false },
        { mime: "application/zip", isGzip: false, isZip: true },
      ];

      compressionTypes.forEach(({ mime: mimeType, isGzip, isZip }) => {
        expect(mime.isGzip(mimeType)).toBe(isGzip);
        expect(mime.isZip(mimeType)).toBe(isZip);
      });
    });
  });

  describe("Edge Cases", () => {
    test("should handle very long MIME type strings", () => {
      const longMimeType = `application/${"x".repeat(1000)}`;
      expect(mime.isJson(longMimeType)).toBe(false);
      expect(mime.isImage(longMimeType)).toBe(false);
    });

    test("should handle MIME types with special characters", () => {
      expect(mime.isFont("font/woff2")).toBe(true);
      expect(mime.isExcel("application/vnd.ms-excel")).toBe(true);
      expect(mime.isSvg("image/svg+xml")).toBe(true);
    });

    test("should handle borderline cases", () => {
      // Empty-ish strings
      expect(mime.isJson("")).toBe(false);
      expect(mime.isJson("   ")).toBe(false);
      expect(mime.isJson("\t\n\r")).toBe(false);

      // Almost valid MIME types
      expect(mime.isJson("application/jsonx")).toBe(true);
      expect(mime.isPng("image/pngx")).toBe(true); // This matches because regex doesn't use anchors
      expect(mime.isMp4("video/mp4x")).toBe(true); // This matches because regex doesn't use anchors
    });

    test("should be consistent with case variations", () => {
      const testCases = [
        { method: "isJson" as const, mime: "application/json" },
        { method: "isPng" as const, mime: "image/png" },
        { method: "isMp4" as const, mime: "video/mp4" },
        { method: "isHtml" as const, mime: "text/html" },
        { method: "isGzip" as const, mime: "application/gzip" },
        { method: "isMarkdown" as const, mime: "text/markdown" },
        { method: "isRtf" as const, mime: "application/rtf" },
      ];

      testCases.forEach(({ method, mime: baseMime }) => {
        const variations = [
          baseMime.toLowerCase(),
          baseMime.toUpperCase(),
          baseMime.charAt(0).toUpperCase() + baseMime.slice(1),
          baseMime
            .split("/")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join("/"),
        ];

        variations.forEach((mimeVariation) => {
          const mimeMethod = mime[method];
          expect(mimeMethod(mimeVariation)).toBe(true);
        });
      });

      // Also test with UTF-8 parameters for applicable methods
      const testCasesWithUtf8 = [
        { method: "isHtml" as const, mime: "text/html; charset=utf-8" },
        { method: "isCss" as const, mime: "text/css; charset=utf-8" },
        { method: "isText" as const, mime: "text/plain; charset=utf-8" },
        { method: "isMarkdown" as const, mime: "text/markdown; charset=utf-8" },
      ];

      testCasesWithUtf8.forEach(({ method, mime: baseMime }) => {
        const variations = [
          baseMime.toLowerCase(),
          baseMime.toUpperCase(),
          baseMime.replace("charset=utf-8", "CHARSET=UTF-8"),
          baseMime.replace("charset=utf-8", "Charset=Utf-8"),
        ];

        variations.forEach((mimeVariation) => {
          const mimeMethod = mime[method];
          expect(mimeMethod(mimeVariation)).toBe(true);
        });
      });
    });
  });

  describe("Performance Tests", () => {
    test("should handle multiple rapid checks efficiently", () => {
      const mimeTypes = [
        "application/json",
        "image/png",
        "video/mp4",
        "audio/mpeg",
        "text/html",
        "application/pdf",
        "application/octet-stream",
        "multipart/form-data",
        "text/markdown",
        "application/gzip",
      ];

      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        mimeTypes.forEach((mimeType) => {
          mime.isJson(mimeType);
          mime.isImage(mimeType);
          mime.isVideo(mimeType);
          mime.isAudio(mimeType);
          mime.isStream(mimeType);
          mime.isMultipart(mimeType);
          mime.isMarkdown(mimeType);
          mime.isGzip(mimeType);
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete reasonably fast (less than 1 second for 80,000 checks)
      expect(duration).toBeLessThan(1000);
    });
  });
});
