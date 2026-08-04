import type { MIME } from "./mimeList";

export type MimeType = (typeof MIME)[keyof typeof MIME];

export interface IMime {
  isJson: (mime: string) => boolean;
  isAudio: (mime: string) => boolean;
  isVideo: (mime: string) => boolean;
  isMp4: (mime: string) => boolean;
  isMp3: (mime: string) => boolean;
  isSvg: (mime: string) => boolean;
  isJpeg: (mime: string) => boolean;
  isCsv: (mime: string) => boolean;
  isJpg: (mime: string) => boolean;
  isPng: (mime: string) => boolean;
  isPdf: (mime: string) => boolean;
  isHtml: (mime: string) => boolean;
  isCss: (mime: string) => boolean;
  isJavaScript: (mime: string) => boolean;
  isZip: (mime: string) => boolean;
  isGif: (mime: string) => boolean;
  isWebp: (mime: string) => boolean;
  isXml: (mime: string) => boolean;
  isText: (mime: string) => boolean;
  isOctetStream: (mime: string) => boolean;
  isFont: (mime: string) => boolean;
  isWord: (mime: string) => boolean;
  isExcel: (mime: string) => boolean;
  isPowerPoint: (mime: string) => boolean;
  isImage: (mime: string) => boolean;
  isBlob: (mime: string) => boolean;
  isStream: (mime: string) => boolean;
  isFormData: (mime: string) => boolean;
  isForm: (mime: string) => boolean;
  isMultipart: (mime: string) => boolean;
  isPlainText: (mime: string) => boolean;
  isMarkdown: (mime: string) => boolean;
  isRtf: (mime: string) => boolean;
  isGzip: (mime: string) => boolean;
}

export class Mime implements IMime {
  // biome-ignore lint/complexity/noUselessConstructor: explicit constructor is needed for Bun function coverage
  public constructor() {}

  /**
   * Checks if a given MIME type is JSON-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is JSON-related, false otherwise
   */
  public isJson = (mime: string): boolean =>
    /(application\/(json|json5|jsonml\+json|jsonpath|(?:ld\+)?json)|text\/json)/i.test(mime);

  /**
   * Checks if a given MIME type is audio-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is audio-related, false otherwise
   */
  public isAudio = (mime: string): boolean => {
    mime = this.formatMimeType(mime);

    return mime.startsWith("audio/");
  };

  /**
   * Checks if a given MIME type is video-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is video-related, false otherwise
   */
  public isVideo = (mime: string): boolean => {
    mime = this.formatMimeType(mime);

    return mime.startsWith("video/");
  };

  /**
   * Checks if a given MIME type is MP4-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is MP4-related, false otherwise
   */
  public isMp4 = (mime: string): boolean => /(video|application)\/mp4/i.test(mime);

  /**
   * Checks if a given MIME type is MP3-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is MP3-related, false otherwise
   */
  public isMp3 = (mime: string): boolean => /audio\/(mp3|mpeg)/i.test(mime);

  /**
   * Checks if a given MIME type is SVG-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is SVG-related, false otherwise
   */
  public isSvg = (mime: string): boolean => /image\/svg\+xml/i.test(mime);

  /**
   * Checks if a given MIME type is JPEG-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is JPEG-related, false otherwise
   */
  public isJpeg = (mime: string): boolean => /image\/(jpeg|pjpeg)/i.test(mime);

  /**
   * Checks if a given MIME type is CSV-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is CSV-related, false otherwise
   */
  public isCsv = (mime: string): boolean => /text\/csv/i.test(mime);

  /**
   * Checks if a given MIME type is JPG-related (alias for JPEG)
   * @param mime - The MIME type to check
   * @returns true if the MIME type is JPG-related, false otherwise
   */
  public isJpg = (mime: string): boolean => this.isJpeg(mime);

  /**
   * Checks if a given MIME type is PNG-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is PNG-related, false otherwise
   */
  public isPng = (mime: string): boolean => /image\/png/i.test(mime);

  /**
   * Checks if a given MIME type is PDF-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is PDF-related, false otherwise
   */
  public isPdf = (mime: string): boolean => /application\/pdf/i.test(mime);

  /**
   * Checks if a given MIME type is HTML-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is HTML-related, false otherwise
   */
  public isHtml = (mime: string): boolean => /text\/html/i.test(mime);

  /**
   * Checks if a given MIME type is CSS-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is CSS-related, false otherwise
   */
  public isCss = (mime: string): boolean => /text\/css/i.test(mime);

  /**
   * Checks if a given MIME type is JavaScript-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is JavaScript-related, false otherwise
   */
  public isJavaScript = (mime: string): boolean => {
    mime = this.formatMimeType(mime);

    // Check for JavaScript MIME types
    return /(text|application)\/(javascript|x-javascript)/i.test(mime);
  };

  /**
   * Checks if a given MIME type is ZIP-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is ZIP-related, false otherwise
   */
  public isZip = (mime: string): boolean => {
    return /application\/zip/i.test(mime);
  };

  /**
   * Checks if a given MIME type is GIF-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is GIF-related, false otherwise
   */
  public isGif = (mime: string): boolean => /image\/gif/i.test(mime);

  /**
   * Checks if a given MIME type is WebP-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is WebP-related, false otherwise
   */
  public isWebp = (mime: string): boolean => /image\/webp/i.test(mime);

  /**
   * Checks if a given MIME type is XML-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is XML-related, false otherwise
   */
  public isXml = (mime: string): boolean => /(text|application)\/xml|.*\+xml/i.test(mime);

  /**
   * Checks if a given MIME type is plain text-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is plain text-related, false otherwise
   */
  public isText = (mime: string): boolean => /text\/plain/i.test(mime);

  /**
   * Checks if a given MIME type is octet-stream (binary data)
   * @param mime - The MIME type to check
   * @returns true if the MIME type is octet-stream, false otherwise
   */
  public isOctetStream = (mime: string): boolean => /application\/octet-stream/i.test(mime);

  /**
   * Checks if a given MIME type is font-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is font-related, false otherwise
   */
  public isFont = (mime: string): boolean => /font\/|application\/font-(woff2?|sfnt|tdpfr)/i.test(mime);

  /**
   * Checks if a given MIME type is Microsoft Word-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is Word-related, false otherwise
   */
  public isWord = (mime: string): boolean =>
    /application\/(msword|vnd\.(openxmlformats-officedocument\.wordprocessingml\.(document|template)|ms-word\.(document|template)\.macroenabled\.12))/i.test(
      mime,
    );

  /**
   * Checks if a given MIME type is Microsoft Excel-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is Excel-related, false otherwise
   */
  public isExcel = (mime: string): boolean =>
    /application\/vnd\.(ms-excel(\.(sheet|template|addin)\.macroenabled\.12|\.sheet\.binary\.macroenabled\.12)?|openxmlformats-officedocument\.spreadsheetml\.(sheet|template))/i.test(
      mime,
    );

  /**
   * Checks if a given MIME type is Microsoft PowerPoint-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is PowerPoint-related, false otherwise
   */
  public isPowerPoint = (mime: string): boolean =>
    /application\/vnd\.(ms-powerpoint(\.(addin|presentation|template|slideshow)\.macroenabled\.12)?|openxmlformats-officedocument\.presentationml\.(presentation|template|slideshow))/i.test(
      mime,
    );

  /**
   * Checks if a given MIME type is image-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is image-related, false otherwise
   */
  public isImage = (mime: string): boolean => {
    mime = this.formatMimeType(mime);

    return mime.startsWith("image/");
  };

  /**
   * Checks if a given MIME type is blob-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is blob-related, false otherwise
   */
  public isBlob = (mime: string): boolean => /application\/octet-stream/i.test(mime);

  /**
   * Checks if a given MIME type is stream-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is stream-related, false otherwise
   */
  public isStream = (mime: string): boolean => /application\/(octet-stream|stream)/i.test(mime);

  /**
   * Checks if a given MIME type is form data-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is form data-related, false otherwise
   */
  public isFormData = (mime: string): boolean => /application\/form-data/i.test(mime);

  public isForm = (mime: string): boolean => /application\/x-www-form-urlencoded/i.test(mime);

  /**
   * Checks if a given MIME type is multipart-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is multipart-related, false otherwise
   */
  public isMultipart = (mime: string): boolean => {
    mime = this.formatMimeType(mime);

    return mime.startsWith("multipart/");
  };

  /**
   * Checks if a given MIME type is plain text-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is plain text-related, false otherwise
   */
  public isPlainText = (mime: string): boolean => /text\/plain/i.test(mime);

  /**
   * Checks if a given MIME type is markdown-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is markdown-related, false otherwise
   */
  public isMarkdown = (mime: string): boolean => /text\/(markdown|x-markdown)/i.test(mime);

  /**
   * Checks if a given MIME type is RTF-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is RTF-related, false otherwise
   */
  public isRtf = (mime: string): boolean => /application\/rtf/i.test(mime);

  /**
   * Checks if a given MIME type is gzip-related
   * @param mime - The MIME type to check
   * @returns true if the MIME type is gzip-related, false otherwise
   */
  public isGzip = (mime: string): boolean => /application\/(gzip|x-gzip)/i.test(mime);

  private formatMimeType = (mime: string): string => {
    if (!mime || typeof mime !== "string") {
      return "";
    }
    return mime.toLowerCase().trim();
  };
}
