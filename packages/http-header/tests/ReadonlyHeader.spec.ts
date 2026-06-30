import { beforeEach, describe, expect, test } from "bun:test";
import { ReadonlyHeader } from "@/index";

describe("ReadonlyHeader", () => {
  let headers: Headers;
  let readonlyHeader: ReadonlyHeader;

  beforeEach(() => {
    headers = new Headers();
    readonlyHeader = new ReadonlyHeader(headers);
  });

  describe("constructor", () => {
    test("should create instance with native Headers object", () => {
      const headers = new Headers();
      const readonlyHeader = new ReadonlyHeader(headers);
      expect(readonlyHeader.native).toBe(headers);
    });
  });

  describe("basic methods", () => {
    describe("get", () => {
      test("should return header value when header exists", () => {
        headers.set("Content-Type", "application/json");
        expect(readonlyHeader.get("Content-Type")).toBe("application/json");
      });

      test("should return null when header does not exist", () => {
        expect(readonlyHeader.get("Content-Type")).toBeNull();
      });

      test("should be case-insensitive", () => {
        headers.set("content-type", "application/json");
        expect(readonlyHeader.get("Content-Type")).toBe("application/json");
      });
    });

    describe("has", () => {
      test("should return true when header exists", () => {
        headers.set("Authorization", "Bearer token123");
        expect(readonlyHeader.has("Authorization")).toBe(true);
      });

      test("should return false when header does not exist", () => {
        expect(readonlyHeader.has("Authorization")).toBe(false);
      });

      test("should be case-insensitive", () => {
        headers.set("authorization", "Bearer token123");
        expect(readonlyHeader.has("Authorization")).toBe(true);
      });
    });

    describe("toJson", () => {
      test("should return empty object when no headers", () => {
        expect(readonlyHeader.toJson()).toEqual({});
      });

      test("should return all headers as object", () => {
        headers.set("Content-Type", "application/json");
        headers.set("Authorization", "Bearer token123");
        headers.set("Accept", "application/json");

        const result = readonlyHeader.toJson();
        expect(result as unknown).toEqual({
          "content-type": "application/json",
          authorization: "Bearer token123",
          accept: "application/json",
        });
      });

      test("should handle multiple headers with same key", () => {
        headers.append("Accept", "application/json");
        headers.append("Accept", "text/html");

        const result = readonlyHeader.toJson();
        expect(result.accept).toBe("application/json, text/html");
      });
    });
  });

  describe("content handling", () => {
    describe("getContentType", () => {
      test("should return content type when present", () => {
        headers.set("Content-Type", "application/json");
        expect(readonlyHeader.getContentType()).toBe("application/json");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getContentType()).toBeNull();
      });

      test("should handle wildcard content type", () => {
        headers.set("Content-Type", "*/*");
        expect(readonlyHeader.getContentType()).toBe("*/*");
      });

      test("should handle content type with charset", () => {
        headers.set("Content-Type", "text/html; charset=UTF-8");
        expect(readonlyHeader.getContentType() as unknown).toBe("text/html; charset=UTF-8");
      });
    });

    describe("getContentLength", () => {
      test("should return content length as number", () => {
        headers.set("Content-Length", "1024");
        expect(readonlyHeader.getContentLength()).toBe(1024);
      });

      test("should return 0 when not present", () => {
        expect(readonlyHeader.getContentLength()).toBe(0);
      });

      test("should return 0 when empty string", () => {
        headers.set("Content-Length", "");
        expect(readonlyHeader.getContentLength()).toBe(0);
      });

      test("should parse large numbers correctly", () => {
        headers.set("Content-Length", "9999999999");
        expect(readonlyHeader.getContentLength()).toBe(9_999_999_999);
      });

      test("should handle malformed content-length", () => {
        headers.set("Content-Length", "not-a-number");
        expect(readonlyHeader.getContentLength()).toBeNaN();
      });

      test("should handle negative content-length", () => {
        headers.set("Content-Length", "-100");
        expect(readonlyHeader.getContentLength()).toBe(-100);
      });
    });

    describe("getCharset", () => {
      test("should return null when no content type", () => {
        expect(readonlyHeader.getCharset()).toBeNull();
      });

      test("should return null when content type has no charset", () => {
        headers.set("Content-Type", "application/json");
        expect(readonlyHeader.getCharset()).toBeNull();
      });

      test("should extract charset from content type", () => {
        headers.set("Content-Type", "text/html; charset=UTF-8");
        expect(readonlyHeader.getCharset()).toBe("UTF-8");
      });

      test("should handle charset with spaces", () => {
        headers.set("Content-Type", "text/html; charset = utf-8");
        expect(readonlyHeader.getCharset()).toBe("UTF-8");
      });

      test("should handle lowercase charset", () => {
        headers.set("Content-Type", "text/html; charset=iso-8859-1");
        expect(readonlyHeader.getCharset()).toBe("ISO-8859-1");
      });

      test("should handle multiple parameters", () => {
        headers.set("Content-Type", "text/html; boundary=something; charset=utf-16");
        expect(readonlyHeader.getCharset()).toBe("UTF-16");
      });
    });

    describe("getContentDisposition", () => {
      test("should return content disposition when present", () => {
        headers.set("Content-Disposition", "attachment; filename=test.pdf");
        expect(readonlyHeader.getContentDisposition()).toBe("attachment; filename=test.pdf");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getContentDisposition()).toBeNull();
      });
    });
  });

  describe("content negotiation", () => {
    describe("getAccept", () => {
      test("should return accept header", () => {
        headers.set("Accept", "application/json");
        expect(readonlyHeader.getAccept()).toBe("application/json");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getAccept()).toBeNull();
      });

      test("should handle wildcard accept", () => {
        headers.set("Accept", "*/*");
        expect(readonlyHeader.getAccept()).toBe("*/*");
      });
    });

    describe("getAcceptEncoding", () => {
      test("should return null when not present", () => {
        expect(readonlyHeader.getAcceptEncoding()).toBeNull();
      });

      test("should parse single encoding", () => {
        headers.set("Accept-Encoding", "gzip");
        expect(readonlyHeader.getAcceptEncoding()).toEqual(["gzip"]);
      });

      test("should parse multiple encodings", () => {
        headers.set("Accept-Encoding", "gzip, deflate, br");
        expect(readonlyHeader.getAcceptEncoding()).toEqual(["gzip", "deflate", "br"]);
      });

      test("should handle spaces correctly", () => {
        headers.set("Accept-Encoding", "gzip , deflate  ,br");
        expect(readonlyHeader.getAcceptEncoding()).toEqual(["gzip", "deflate", "br"]);
      });
    });

    describe("getLang", () => {
      test("should return null when not present", () => {
        expect(readonlyHeader.getLang()).toBeNull();
      });

      test("should return language object for single language", () => {
        headers.set("Accept-Language", "en-US");
        expect(readonlyHeader.getLang()).toEqual({ code: "en", region: "US" });
      });

      test("should return language object for first language in multiple", () => {
        headers.set("Accept-Language", "en-US, fr-FR, de-DE");
        expect(readonlyHeader.getLang()).toEqual({ code: "en", region: "US" });
      });

      test("should handle language without region", () => {
        headers.set("Accept-Language", "fr");
        expect(readonlyHeader.getLang()).toEqual({ code: "fr" });
      });

      test("should handle language without region in multiple", () => {
        headers.set("Accept-Language", "fr, en-US");
        expect(readonlyHeader.getLang()).toEqual({ code: "fr" });
      });

      test("should ignore quality values", () => {
        headers.set("Accept-Language", "en-US;q=0.8, fr-FR;q=0.6");
        expect(readonlyHeader.getLang()).toEqual({ code: "en", region: "US" });
      });

      test("should handle spaces correctly", () => {
        headers.set("Accept-Language", " en-US , fr-FR");
        expect(readonlyHeader.getLang()).toEqual({ code: "en", region: "US" });
      });

      test("should handle empty accept language", () => {
        headers.set("Accept-Language", "");
        expect(readonlyHeader.getLang()).toBeNull();
      });

      test("should handle whitespace-only accept language", () => {
        headers.set("Accept-Language", "   ");
        expect(readonlyHeader.getLang()).toBeNull();
      });

      test("should handle malformed language tags", () => {
        headers.set("Accept-Language", ", , en-US");
        expect(readonlyHeader.getLang()).toEqual({ code: "en", region: "US" });
      });

      test("should handle complex language tags", () => {
        headers.set("Accept-Language", "zh-Hans-CN");
        expect(readonlyHeader.getLang()).toEqual({
          code: "zh",
          region: "Hans",
        });
      });
    });
  });

  describe("request information", () => {
    describe("getHost", () => {
      test("should return host when present", () => {
        headers.set("Host", "example.com");
        expect(readonlyHeader.getHost()).toBe("example.com");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getHost()).toBeNull();
      });

      test("should handle host with port", () => {
        headers.set("Host", "example.com:8080");
        expect(readonlyHeader.getHost()).toBe("example.com:8080");
      });
    });

    describe("getUserAgent", () => {
      test("should return null when not present", () => {
        expect(readonlyHeader.getUserAgent()).toBeNull();
      });

      test("should parse user agent", () => {
        headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        const userAgent = readonlyHeader.getUserAgent();

        expect(userAgent).not.toBeNull();
        expect(userAgent).toHaveProperty("browser");
        expect(userAgent).toHaveProperty("engine");
        expect(userAgent).toHaveProperty("os");
        expect(userAgent).toHaveProperty("device");
        expect(userAgent).toHaveProperty("cpu");
      });

      test("should handle Chrome user agent", () => {
        headers.set(
          "User-Agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        );
        const userAgent = readonlyHeader.getUserAgent();

        expect(userAgent?.browser.name).toBe("Chrome");
        expect(userAgent?.engine.name).toBe("Blink");
        expect(userAgent?.os.name).toBe("Windows");
      });
    });

    describe("getReferer", () => {
      test("should return referer when present", () => {
        headers.set("Referer", "https://example.com/page");
        expect(readonlyHeader.getReferer()).toBe("https://example.com/page");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getReferer()).toBeNull();
      });
    });

    describe("getOrigin", () => {
      test("should return origin when present", () => {
        headers.set("Origin", "https://example.com");
        expect(readonlyHeader.getOrigin()).toBe("https://example.com");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getOrigin()).toBeNull();
      });
    });
  });

  describe("authentication", () => {
    describe("getAuthorization", () => {
      test("should return authorization header", () => {
        headers.set("Authorization", "Bearer token123");
        expect(readonlyHeader.getAuthorization()).toBe("Bearer token123");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getAuthorization()).toBeNull();
      });
    });

    describe("getBasicAuth", () => {
      test("should return null when no authorization header", () => {
        expect(readonlyHeader.getBasicAuth()).toBeNull();
      });

      test("should return null when not basic auth", () => {
        headers.set("Authorization", "Bearer token123");
        expect(readonlyHeader.getBasicAuth()).toBeNull();
      });

      test("should extract basic auth token", () => {
        headers.set("Authorization", "Basic dXNlcjpwYXNz");
        expect(readonlyHeader.getBasicAuth()).toBe("dXNlcjpwYXNz");
      });

      test("should handle basic auth with spaces", () => {
        headers.set("Authorization", "Basic  dXNlcjpwYXNz");
        expect(readonlyHeader.getBasicAuth()).toBe("dXNlcjpwYXNz");
      });

      test("should handle mixed case basic", () => {
        headers.set("Authorization", "basic dXNlcjpwYXNz");
        expect(readonlyHeader.getBasicAuth()).toBeNull(); // Should be case-sensitive based on regex
      });
    });

    describe("getBearerToken", () => {
      test("should return null when no authorization header", () => {
        expect(readonlyHeader.getBearerToken()).toBeNull();
      });

      test("should return null when not bearer token", () => {
        headers.set("Authorization", "Basic dXNlcjpwYXNz");
        expect(readonlyHeader.getBearerToken()).toBeNull();
      });

      test("should extract bearer token", () => {
        headers.set("Authorization", "Bearer token123");
        expect(readonlyHeader.getBearerToken()).toBe("token123");
      });

      test("should handle bearer with spaces", () => {
        headers.set("Authorization", "Bearer  token123");
        expect(readonlyHeader.getBearerToken()).toBe("token123");
      });

      test("should handle complex tokens", () => {
        headers.set(
          "Authorization",
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
        );
        expect(readonlyHeader.getBearerToken()).toBe(
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
        );
      });
    });
  });

  describe("cookies", () => {
    describe("getCookies", () => {
      test("should return null when no cookie header", () => {
        expect(readonlyHeader.getCookies()).toBeNull();
      });

      test("should parse single cookie", () => {
        headers.set("Cookie", "name=value");
        expect(readonlyHeader.getCookies()).toEqual({ name: "value" });
      });

      test("should parse multiple cookies", () => {
        headers.set("Cookie", "name1=value1; name2=value2; name3=value3");
        expect(readonlyHeader.getCookies()).toEqual({
          name1: "value1",
          name2: "value2",
          name3: "value3",
        });
      });

      test("should handle cookies with spaces", () => {
        headers.set("Cookie", "name1=value1 ; name2 = value2;  name3=value3");
        expect(readonlyHeader.getCookies()).toEqual({
          name1: "value1",
          name2: "value2",
          name3: "value3",
        });
      });

      test("should decode cookie values", () => {
        headers.set("Cookie", "name=Hello%20World");
        expect(readonlyHeader.getCookies()).toEqual({ name: "Hello World" });
      });

      test("should handle cookies with equals in value", () => {
        headers.set("Cookie", "name=value=with=equals");
        expect(readonlyHeader.getCookies()).toEqual({
          name: "value=with=equals",
        });
      });

      test("should return null for empty cookies object", () => {
        headers.set("Cookie", "; ; ");
        expect(readonlyHeader.getCookies()).toBeNull();
      });

      test("should handle malformed cookies gracefully", () => {
        headers.set("Cookie", "validName=validValue; invalidCookie; anotherValid=value2");
        const cookies = readonlyHeader.getCookies();
        expect(cookies).toEqual({
          validName: "validValue",
          anotherValid: "value2",
        });
      });
    });

    describe("getCookie", () => {
      test("should return null when no cookies", () => {
        expect(readonlyHeader.getCookie("name")).toBeNull();
      });

      test("should return specific cookie value", () => {
        headers.set("Cookie", "name1=value1; name2=value2; name3=value3");
        expect(readonlyHeader.getCookie("name2")).toBe("value2");
      });

      test("should return null for non-existent cookie", () => {
        headers.set("Cookie", "name1=value1; name2=value2");
        expect(readonlyHeader.getCookie("name3")).toBeNull();
      });
    });
  });

  describe("IP detection", () => {
    describe("getIp", () => {
      test("should return X-Forwarded-For when present", () => {
        headers.set("X-Forwarded-For", "192.168.1.1");
        expect(readonlyHeader.getIp()).toBe("192.168.1.1");
      });

      test("should return X-Real-IP when X-Forwarded-For not present", () => {
        headers.set("X-Real-IP", "192.168.1.2");
        expect(readonlyHeader.getIp()).toBe("192.168.1.2");
      });

      test("should prefer X-Forwarded-For over X-Real-IP", () => {
        headers.set("X-Forwarded-For", "192.168.1.1");
        headers.set("X-Real-IP", "192.168.1.2");
        expect(readonlyHeader.getIp()).toBe("192.168.1.1");
      });

      test("should return null when neither present", () => {
        expect(readonlyHeader.getIp()).toBeNull();
      });
    });

    describe("getXForwardedFor", () => {
      test("should return X-Forwarded-For header", () => {
        headers.set("X-Forwarded-For", "192.168.1.1, 10.0.0.1");
        expect(readonlyHeader.getXForwardedFor()).toBe("192.168.1.1, 10.0.0.1");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getXForwardedFor()).toBeNull();
      });
    });

    describe("getXRealIP", () => {
      test("should return X-Real-IP header", () => {
        headers.set("X-Real-IP", "192.168.1.1");
        expect(readonlyHeader.getXRealIP()).toBe("192.168.1.1");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getXRealIP()).toBeNull();
      });
    });

    describe("getClientIps", () => {
      test("should return empty array when no IP headers", () => {
        expect(readonlyHeader.getClientIps()).toEqual([]);
      });

      test("should return IPs from X-Forwarded-For", () => {
        headers.set("X-Forwarded-For", "192.168.1.1, 10.0.0.1, 172.16.0.1");
        expect(readonlyHeader.getClientIps()).toEqual([
          "192.168.1.1",
          "10.0.0.1",
          "172.16.0.1",
          "192.168.1.1, 10.0.0.1, 172.16.0.1",
        ]);
      });

      test("should include X-Real-IP when different from X-Forwarded-For", () => {
        headers.set("X-Forwarded-For", "192.168.1.1");
        headers.set("X-Real-IP", "10.0.0.1");
        expect(readonlyHeader.getClientIps()).toEqual(["192.168.1.1", "10.0.0.1"]);
      });

      test("should not duplicate IPs", () => {
        headers.set("X-Forwarded-For", "192.168.1.1, 10.0.0.1");
        headers.set("X-Real-IP", "192.168.1.1");
        expect(readonlyHeader.getClientIps()).toEqual(["192.168.1.1", "10.0.0.1", "192.168.1.1, 10.0.0.1"]);
      });

      test("should handle spaces in X-Forwarded-For", () => {
        headers.set("X-Forwarded-For", "192.168.1.1 ,  10.0.0.1  , 172.16.0.1");
        expect(readonlyHeader.getClientIps()).toEqual([
          "192.168.1.1",
          "10.0.0.1",
          "172.16.0.1",
          "192.168.1.1 ,  10.0.0.1  , 172.16.0.1",
        ]);
      });
    });
  });

  describe("caching", () => {
    describe("getCacheControl", () => {
      test("should return cache control header", () => {
        headers.set("Cache-Control", "no-cache, no-store");
        expect(readonlyHeader.getCacheControl()).toBe("no-cache, no-store");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getCacheControl()).toBeNull();
      });
    });

    describe("getEtag", () => {
      test("should return etag header", () => {
        headers.set("Etag", '"abc123"');
        expect(readonlyHeader.getEtag()).toBe('"abc123"');
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getEtag()).toBeNull();
      });
    });

    describe("getLastModified", () => {
      test("should return last modified as Date", () => {
        const dateString = "Wed, 21 Oct 2015 07:28:00 GMT";
        headers.set("Last-Modified", dateString);
        const result = readonlyHeader.getLastModified();
        expect(result).toBeInstanceOf(Date);
        expect(result?.toUTCString()).toBe(dateString);
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getLastModified()).toBeNull();
      });

      test("should handle invalid date", () => {
        headers.set("Last-Modified", "not-a-valid-date-string");
        const result = readonlyHeader.getLastModified();
        expect(result).toBeInstanceOf(Date);
        expect(Number.isNaN(result?.getTime())).toBe(true);
      });
    });

    describe("getIfModifiedSince", () => {
      test("should return if-modified-since as Date", () => {
        const dateString = "Wed, 21 Oct 2015 07:28:00 GMT";
        headers.set("If-Modified-Since", dateString);
        const result = readonlyHeader.getIfModifiedSince();
        expect(result).toBeInstanceOf(Date);
        expect(result?.toUTCString()).toBe(dateString);
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getIfModifiedSince()).toBeNull();
      });
    });

    describe("getIfNoneMatch", () => {
      test("should return if-none-match header", () => {
        headers.set("If-None-Match", '"abc123"');
        expect(readonlyHeader.getIfNoneMatch()).toBe('"abc123"');
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getIfNoneMatch()).toBeNull();
      });
    });
  });

  describe("CORS", () => {
    describe("getAccessControlAllowOrigin", () => {
      test("should return CORS origin header", () => {
        headers.set("Access-Control-Allow-Origin", "*");
        expect(readonlyHeader.getAccessControlAllowOrigin()).toBe("*");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getAccessControlAllowOrigin()).toBeNull();
      });
    });

    describe("getAccessControlAllowMethods", () => {
      test("should return null when not present", () => {
        expect(readonlyHeader.getAccessControlAllowMethods()).toBeNull();
      });

      test("should parse single method", () => {
        headers.set("Access-Control-Allow-Methods", "GET");
        expect(readonlyHeader.getAccessControlAllowMethods()).toEqual(["GET"]);
      });

      test("should parse multiple methods", () => {
        headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
        expect(readonlyHeader.getAccessControlAllowMethods()).toEqual(["GET", "POST", "PUT", "DELETE"]);
      });

      test("should handle spaces correctly", () => {
        headers.set("Access-Control-Allow-Methods", "GET , POST  ,PUT");
        expect(readonlyHeader.getAccessControlAllowMethods()).toEqual(["GET", "POST", "PUT"]);
      });
    });

    describe("getAccessControlAllowHeaders", () => {
      test("should return null when not present", () => {
        expect(readonlyHeader.getAccessControlAllowHeaders()).toBeNull();
      });

      test("should parse single header", () => {
        headers.set("Access-Control-Allow-Headers", "Content-Type");
        expect(readonlyHeader.getAccessControlAllowHeaders()).toEqual(["Content-Type"]);
      });

      test("should parse multiple headers", () => {
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Custom-Header");
        expect(readonlyHeader.getAccessControlAllowHeaders()).toEqual([
          "Content-Type",
          "Authorization",
          "X-Custom-Header",
        ]);
      });

      test("should handle spaces correctly", () => {
        headers.set("Access-Control-Allow-Headers", "Content-Type , Authorization  ,X-Custom-Header");
        expect(readonlyHeader.getAccessControlAllowHeaders()).toEqual([
          "Content-Type",
          "Authorization",
          "X-Custom-Header",
        ]);
      });
    });

    describe("getAccessControlAllowCredentials", () => {
      test("should return null when not present", () => {
        expect(readonlyHeader.getAccessControlAllowCredentials()).toBeNull();
      });

      test("should return true for 'true' value", () => {
        headers.set("Access-Control-Allow-Credentials", "true");
        expect(readonlyHeader.getAccessControlAllowCredentials()).toBe(true);
      });

      test("should return false for 'false' value", () => {
        headers.set("Access-Control-Allow-Credentials", "false");
        expect(readonlyHeader.getAccessControlAllowCredentials()).toBe(false);
      });

      test("should be case-insensitive", () => {
        headers.set("Access-Control-Allow-Credentials", "TRUE");
        expect(readonlyHeader.getAccessControlAllowCredentials()).toBe(true);
      });

      test("should return false for other values", () => {
        headers.set("Access-Control-Allow-Credentials", "yes");
        expect(readonlyHeader.getAccessControlAllowCredentials()).toBe(false);
      });
    });
  });

  describe("security headers", () => {
    describe("getContentSecurityPolicy", () => {
      test("should return CSP header", () => {
        const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'";
        headers.set("Content-Security-Policy", csp);
        expect(readonlyHeader.getContentSecurityPolicy()).toBe(csp);
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getContentSecurityPolicy()).toBeNull();
      });
    });

    describe("getStrictTransportSecurity", () => {
      test("should return HSTS header", () => {
        headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        expect(readonlyHeader.getStrictTransportSecurity()).toBe("max-age=31536000; includeSubDomains");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getStrictTransportSecurity()).toBeNull();
      });
    });

    describe("getXContentTypeOptions", () => {
      test("should return X-Content-Type-Options header", () => {
        headers.set("X-Content-Type-Options", "nosniff");
        expect(readonlyHeader.getXContentTypeOptions()).toBe("nosniff");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getXContentTypeOptions()).toBeNull();
      });
    });

    describe("getXFrameOptions", () => {
      test("should return X-Frame-Options header", () => {
        headers.set("X-Frame-Options", "SAMEORIGIN");
        expect(readonlyHeader.getXFrameOptions()).toBe("SAMEORIGIN");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getXFrameOptions()).toBeNull();
      });
    });

    describe("getXXSSProtection", () => {
      test("should return X-XSS-Protection header", () => {
        headers.set("X-XSS-Protection", "1; mode=block");
        expect(readonlyHeader.getXXSSProtection()).toBe("1; mode=block");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getXXSSProtection()).toBeNull();
      });
    });
  });

  describe("redirects", () => {
    describe("getLocation", () => {
      test("should return location header", () => {
        headers.set("Location", "https://example.com/redirect");
        expect(readonlyHeader.getLocation()).toBe("https://example.com/redirect");
      });

      test("should return null when not present", () => {
        expect(readonlyHeader.getLocation()).toBeNull();
      });
    });
  });

  describe("request type detection", () => {
    describe("isSecure", () => {
      test("should return true when X-Forwarded-Proto is https", () => {
        headers.set("X-Forwarded-Proto", "https");
        expect(readonlyHeader.isSecure()).toBe(true);
      });

      test("should return false when X-Forwarded-Proto is http", () => {
        headers.set("X-Forwarded-Proto", "http");
        expect(readonlyHeader.isSecure()).toBe(false);
      });

      test("should return false when X-Forwarded-Proto is not present", () => {
        expect(readonlyHeader.isSecure()).toBe(false);
      });

      test("should return false for other protocols", () => {
        headers.set("X-Forwarded-Proto", "ws");
        expect(readonlyHeader.isSecure()).toBe(false);
      });
    });

    describe("isAjax", () => {
      test("should return true when X-Requested-With is XMLHttpRequest", () => {
        headers.set("X-Requested-With", "XMLHttpRequest");
        expect(readonlyHeader.isAjax()).toBe(true);
      });

      test("should return true when X-Requested-With is xmlhttprequest (case insensitive)", () => {
        headers.set("X-Requested-With", "xmlhttprequest");
        expect(readonlyHeader.isAjax()).toBe(true);
      });

      test("should return false when X-Requested-With is not XMLHttpRequest", () => {
        headers.set("X-Requested-With", "fetch");
        expect(readonlyHeader.isAjax()).toBe(false);
      });

      test("should return false when X-Requested-With is not present", () => {
        expect(readonlyHeader.isAjax()).toBe(false);
      });
    });

    describe("isCorsRequest", () => {
      test("should return true when Origin header is present", () => {
        headers.set("Origin", "https://example.com");
        expect(readonlyHeader.isCorsRequest()).toBe(true);
      });

      test("should return false when Origin header is not present", () => {
        expect(readonlyHeader.isCorsRequest()).toBe(false);
      });

      test("should return true for any Origin value", () => {
        headers.set("Origin", "null");
        expect(readonlyHeader.isCorsRequest()).toBe(true);
      });
    });
  });

  describe("iterator support", () => {
    describe("Symbol.iterator", () => {
      test("should be iterable", () => {
        headers.set("Content-Type", "application/json");
        headers.set("Authorization", "Bearer token");

        const entries = [...readonlyHeader];
        expect(entries).toHaveLength(2);
        expect(entries as unknown[]).toContainEqual(["content-type", "application/json"]);
        expect(entries as unknown[]).toContainEqual(["authorization", "Bearer token"]);
      });

      test("should return empty array when no headers", () => {
        const entries = [...readonlyHeader];
        expect(entries).toEqual([]);
      });

      test("should work with for...of loop", () => {
        headers.set("Accept", "application/json");
        headers.set("User-Agent", "Test Browser");

        const collected: [string, string][] = [];
        for (const [key, value] of readonlyHeader) {
          collected.push([key, value]);
        }

        expect(collected).toHaveLength(2);
        expect(collected).toContainEqual(["accept", "application/json"]);
        expect(collected).toContainEqual(["user-agent", "Test Browser"]);
      });

      test("should work with Array.from", () => {
        headers.set("Host", "example.com");

        const entries = Array.from(readonlyHeader);
        expect(entries).toHaveLength(1);
        expect(entries as unknown).toContainEqual(["host", "example.com"]);
      });

      test("should handle multiple values for same header", () => {
        headers.append("Accept", "application/json");
        headers.append("Accept", "text/html");

        const entries = [...readonlyHeader];
        expect(entries).toHaveLength(1);
        expect(entries?.[0]?.[0] as unknown).toBe("accept");
        expect(entries?.[0]?.[1]).toBe("application/json, text/html");
      });
    });
  });

  describe("edge cases and error handling", () => {
    test("should handle empty header values", () => {
      headers.set("Empty-Header", "");
      // @ts-expect-error
      expect(readonlyHeader.get("Empty-Header")).toBe("");
      // @ts-expect-error
      expect(readonlyHeader.has("Empty-Header")).toBe(true);
    });

    test("should handle header names with special characters", () => {
      headers.set("X-Custom-Header", "value");
      expect(readonlyHeader.get("X-Custom-Header")).toBe("value");
    });

    test("should handle very long header values", () => {
      const longValue = "a".repeat(10_000);
      headers.set("Long-Header", longValue);
      // @ts-expect-error
      expect(readonlyHeader.get("Long-Header")).toBe(longValue);
    });

    test("should handle unicode in header values", () => {
      headers.set("Unicode-Header", "Hello World");
      // @ts-expect-error
      expect(readonlyHeader.get("Unicode-Header")).toBe("Hello World");
    });

    test("should handle malformed dates gracefully", () => {
      headers.set("Last-Modified", "not-a-date");
      const date = readonlyHeader.getLastModified();
      expect(date).toBeInstanceOf(Date);
      expect(Number.isNaN(date?.getTime())).toBe(true);
    });
  });

  describe("real-world scenarios", () => {
    test("should handle typical browser request headers", () => {
      headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8");
      headers.set("Accept-Language", "en-US,en;q=0.5");
      headers.set("Accept-Encoding", "gzip, deflate, br");
      headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0");
      headers.set("Host", "api.example.com");
      headers.set("Connection", "keep-alive");

      expect(readonlyHeader.getAccept() as unknown).toBe(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      );
      expect(readonlyHeader.getLang()).toEqual({ code: "en", region: "US" });
      expect(readonlyHeader.getAcceptEncoding()).toEqual(["gzip", "deflate", "br"]);
      expect(readonlyHeader.getHost()).toBe("api.example.com");
      expect(readonlyHeader.getUserAgent()).not.toBeNull();
    });

    test("should handle API request with authentication", () => {
      headers.set("Content-Type", "application/json; charset=utf-8");
      headers.set("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      headers.set("Accept", "application/json");
      headers.set("User-Agent", "MyApp/1.0");

      expect(readonlyHeader.getContentType() as unknown).toBe("application/json; charset=utf-8");
      expect(readonlyHeader.getCharset()).toBe("UTF-8");
      expect(readonlyHeader.getBearerToken()).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(readonlyHeader.getAccept()).toBe("application/json");
    });

    test("should handle CORS preflight request", () => {
      headers.set("Origin", "https://example.com");
      headers.set("Access-Control-Request-Method", "POST");
      headers.set("Access-Control-Request-Headers", "Content-Type, Authorization");

      expect(readonlyHeader.getOrigin()).toBe("https://example.com");
      expect(readonlyHeader.isCorsRequest()).toBe(true);
      expect(readonlyHeader.get("Access-Control-Request-Method")).toBe("POST");
      expect(readonlyHeader.get("Access-Control-Request-Headers")).toBe("Content-Type, Authorization");
    });

    test("should handle request behind proxy", () => {
      headers.set("X-Forwarded-For", "203.0.113.195, 70.41.3.18, 150.172.238.178");
      headers.set("X-Real-IP", "203.0.113.195");
      headers.set("X-Forwarded-Proto", "https");
      headers.set("X-Forwarded-Host", "example.com");

      expect(readonlyHeader.getClientIps()).toEqual([
        "203.0.113.195",
        "70.41.3.18",
        "150.172.238.178",
        "203.0.113.195, 70.41.3.18, 150.172.238.178",
      ]);
      expect(readonlyHeader.getXRealIP()).toBe("203.0.113.195");
      expect(readonlyHeader.isSecure()).toBe(true);
    });

    test("should handle conditional request headers", () => {
      const etag = '"abc123"';
      const lastModified = "Wed, 21 Oct 2015 07:28:00 GMT";

      headers.set("If-None-Match", etag);
      headers.set("If-Modified-Since", lastModified);

      expect(readonlyHeader.getIfNoneMatch()).toBe(etag);
      expect(readonlyHeader.getIfModifiedSince()?.toUTCString()).toBe(lastModified);
    });
  });
});
