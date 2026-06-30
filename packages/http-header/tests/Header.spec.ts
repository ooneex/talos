import { beforeEach, describe, expect, test } from "bun:test";
import type { HttpMethodType } from "@talosjs/types";
import { Header } from "@/index";

describe("Header", () => {
  let header: Header;

  beforeEach(() => {
    header = new Header();
  });

  describe("constructor", () => {
    test("should create instance with empty headers", () => {
      const header = new Header();
      expect(header.native).toBeInstanceOf(Headers);
      expect(header.toJson()).toEqual({});
    });

    test("should create instance with existing Headers object", () => {
      const existingHeaders = new Headers([["Content-Type", "application/json"]]);
      const header = new Header(existingHeaders);
      expect(header.get("Content-Type")).toBe("application/json");
    });
  });

  describe("core methods", () => {
    describe("add", () => {
      test("should add header and return this for chaining", () => {
        const result = header.add("Content-Type", "application/json");
        expect(result).toBe(header);
        expect(header.get("Content-Type")).toBe("application/json");
      });

      test("should append to existing header", () => {
        header.add("Accept", "application/json");
        header.add("Accept", "text/html");
        expect(header.get("Accept")).toBe("application/json, text/html");
      });
    });

    describe("remove", () => {
      test("should remove header and return this for chaining", () => {
        header.add("Content-Type", "application/json");
        const result = header.remove("Content-Type");
        expect(result).toBe(header);
        expect(header.has("Content-Type")).toBe(false);
      });

      test("should not throw when removing non-existent header", () => {
        // @ts-expect-error
        expect(() => header.remove("Non-Existent")).not.toThrow();
      });
    });

    describe("set", () => {
      test("should set header and return this for chaining", () => {
        const result = header.set("Content-Type", "application/json");
        expect(result).toBe(header);
        expect(header.get("Content-Type")).toBe("application/json");
      });

      test("should replace existing header value", () => {
        header.set("Content-Type", "text/html");
        header.set("Content-Type", "application/json");
        expect(header.get("Content-Type")).toBe("application/json");
      });
    });
  });

  describe("content handling", () => {
    describe("contentType", () => {
      test("should set content type without charset", () => {
        header.contentType("application/json");
        expect(header.get("Content-Type")).toBe("application/json");
        expect(header.get("Accept-Charset")).toBe("utf-8");
      });

      test("should set content type with charset", () => {
        header.contentType("text/html", "UTF-8");
        expect(header.get("Content-Type")).toBe("text/html; charset=UTF-8");
        expect(header.get("Accept-Charset")).toBe("UTF-8");
      });

      test("should set Accept-Charset for text types", () => {
        header.contentType("text/plain");
        expect(header.get("Accept-Charset")).toBe("utf-8");
      });

      test("should set Accept-Charset for JSON", () => {
        header.contentType("application/json", "UTF-16");
        expect(header.get("Accept-Charset")).toBe("UTF-16");
      });

      test("should not set Accept-Charset for binary types", () => {
        header.contentType("image/png");
        expect(header.has("Accept-Charset")).toBe(false);
      });

      test("should return this for chaining", () => {
        const result = header.contentType("application/xml");
        expect(result).toBe(header);
      });
    });

    describe("contentLength", () => {
      test("should set content length", () => {
        header.contentLength(1024);
        expect(header.get("Content-Length")).toBe("1024");
      });

      test("should handle zero length", () => {
        header.contentLength(0);
        expect(header.get("Content-Length")).toBe("0");
      });

      test("should return this for chaining", () => {
        const result = header.contentLength(500);
        expect(result).toBe(header);
      });
    });

    describe("contentDisposition", () => {
      test("should set content disposition", () => {
        header.contentDisposition("attachment; filename=test.pdf");
        expect(header.get("Content-Disposition")).toBe("attachment; filename=test.pdf");
      });

      test("should return this for chaining", () => {
        const result = header.contentDisposition("inline");
        expect(result).toBe(header);
      });
    });
  });

  describe("content type convenience methods", () => {
    describe("setJson", () => {
      test("should set JSON headers without charset", () => {
        header.setJson();
        expect(header.get("Accept")).toBe("application/json");
        expect(header.get("Content-Type")).toBe("application/json");
        expect(header.get("Accept-Charset")).toBe("utf-8");
      });

      test("should set JSON headers with charset", () => {
        header.setJson("UTF-16");
        expect(header.get("Accept")).toBe("application/json");
        expect(header.get("Content-Type")).toBe("application/json; charset=UTF-16");
        expect(header.get("Accept-Charset")).toBe("UTF-16");
      });

      test("should return this for chaining", () => {
        const result = header.setJson();
        expect(result).toBe(header);
      });
    });

    describe("setHtml", () => {
      test("should set HTML content type", () => {
        header.setHtml();
        expect(header.get("Content-Type")).toBe("text/html");
        expect(header.get("Accept-Charset")).toBe("utf-8");
      });

      test("should set HTML content type with charset", () => {
        header.setHtml("ISO-8859-1");
        expect(header.get("Content-Type")).toBe("text/html; charset=ISO-8859-1");
        expect(header.get("Accept-Charset")).toBe("ISO-8859-1");
      });

      test("should return this for chaining", () => {
        const result = header.setHtml();
        expect(result).toBe(header);
      });
    });

    describe("setText", () => {
      test("should set plain text content type", () => {
        header.setText();
        expect(header.get("Content-Type")).toBe("text/plain");
        expect(header.get("Accept-Charset")).toBe("utf-8");
      });

      test("should set plain text content type with charset", () => {
        header.setText("US-ASCII");
        expect(header.get("Content-Type")).toBe("text/plain; charset=US-ASCII");
        expect(header.get("Accept-Charset")).toBe("US-ASCII");
      });

      test("should return this for chaining", () => {
        const result = header.setText();
        expect(result).toBe(header);
      });
    });

    describe("setForm", () => {
      test("should set form content type", () => {
        header.setForm();
        expect(header.get("Content-Type")).toBe("application/x-www-form-urlencoded");
      });

      test("should set form content type with charset", () => {
        header.setForm("UTF-8");
        expect(header.get("Content-Type")).toBe("application/x-www-form-urlencoded; charset=UTF-8");
      });

      test("should return this for chaining", () => {
        const result = header.setForm();
        expect(result).toBe(header);
      });
    });

    describe("setFormData", () => {
      test("should set multipart form data content type", () => {
        header.setFormData();
        expect(header.get("Content-Type")).toBe("multipart/form-data");
      });

      test("should set multipart form data content type with charset", () => {
        header.setFormData("UTF-8");
        expect(header.get("Content-Type")).toBe("multipart/form-data; charset=UTF-8");
      });

      test("should return this for chaining", () => {
        const result = header.setFormData();
        expect(result).toBe(header);
      });
    });

    describe("setBlobType", () => {
      test("should set blob content type", () => {
        header.setBlobType();
        expect(header.get("Content-Type")).toBe("application/octet-stream");
      });

      test("should set blob content type with charset", () => {
        header.setBlobType("UTF-8");
        expect(header.get("Content-Type")).toBe("application/octet-stream; charset=UTF-8");
      });

      test("should return this for chaining", () => {
        const result = header.setBlobType();
        expect(result).toBe(header);
      });
    });
  });

  describe("content negotiation", () => {
    describe("setAccept", () => {
      test("should set accept header", () => {
        header.setAccept("application/xml");
        expect(header.get("Accept")).toBe("application/xml");
      });

      test("should return this for chaining", () => {
        const result = header.setAccept("text/plain");
        expect(result).toBe(header);
      });
    });

    describe("setAcceptEncoding", () => {
      test("should set single encoding", () => {
        header.setAcceptEncoding(["gzip"]);
        expect(header.get("Accept-Encoding")).toBe("gzip");
      });

      test("should set multiple encodings", () => {
        header.setAcceptEncoding(["gzip", "deflate", "br"]);
        expect(header.get("Accept-Encoding")).toBe("gzip, deflate, br");
      });

      test("should handle empty array", () => {
        header.setAcceptEncoding([]);
        expect(header.get("Accept-Encoding")).toBe("");
      });

      test("should return this for chaining", () => {
        const result = header.setAcceptEncoding(["identity"]);
        expect(result).toBe(header);
      });
    });

    describe("setLang", () => {
      test("should set single language", () => {
        header.setLang("en-US");
        expect(header.get("Accept-Language")).toBe("en-US");
      });

      test("should set multiple languages as string", () => {
        header.setLang("en-US, fr-FR, de-DE");
        expect(header.get("Accept-Language")).toBe("en-US, fr-FR, de-DE");
      });

      test("should set single language", () => {
        header.setLang("en-US");
        expect(header.get("Accept-Language")).toBe("en-US");
      });

      test("should set multiple languages from string", () => {
        header.setLang("en-US, fr-FR, de-DE");
        expect(header.get("Accept-Language")).toBe("en-US, fr-FR, de-DE");
      });

      test("should handle empty string", () => {
        header.setLang("");
        expect(header.get("Accept-Language")).toBe("");
      });

      test("should handle whitespace string", () => {
        header.setLang("  ");
        expect(header.get("Accept-Language")).toBe("");
      });

      test("should replace existing accept language", () => {
        header.setLang("en-US");
        header.setLang("fr-FR");
        expect(header.get("Accept-Language")).toBe("fr-FR");
      });

      test("should handle language with region codes", () => {
        header.setLang("en-US, en-GB, fr-CA");
        expect(header.get("Accept-Language")).toBe("en-US, en-GB, fr-CA");
      });

      test("should return this for chaining", () => {
        const result = header.setLang("en-US");
        expect(result).toBe(header);
      });

      test("should handle whitespace in language string", () => {
        header.setLang("  en-US  , fr-FR , de-DE  ");
        expect(header.get("Accept-Language")).toBe("en-US  , fr-FR , de-DE");
      });

      test("should handle mixed case language codes", () => {
        header.setLang("EN-us, fr-FR, DE-de");
        expect(header.get("Accept-Language")).toBe("EN-us, fr-FR, DE-de");
      });

      test("should handle single character language codes", () => {
        header.setLang("en, fr, de");
        expect(header.get("Accept-Language")).toBe("en, fr, de");
      });

      test("should handle single language code", () => {
        header.setLang("zh-CN");
        expect(header.get("Accept-Language")).toBe("zh-CN");
      });

      test("should work with method chaining", () => {
        const result = header.setLang("en-US").setJson().setLang("fr-FR, de-DE");

        expect(header.get("Accept-Language")).toBe("fr-FR, de-DE");
        expect(result).toBe(header);
      });

      test("should handle ISO 639 language codes", () => {
        header.setLang("zh-Hans-CN, pt-BR, es-419");
        expect(header.get("Accept-Language")).toBe("zh-Hans-CN, pt-BR, es-419");
      });
    });
  });

  describe("request information", () => {
    describe("setHost", () => {
      test("should set host header", () => {
        header.setHost("example.com");
        expect(header.get("Host")).toBe("example.com");
      });

      test("should set host with port", () => {
        header.setHost("localhost:3000");
        expect(header.get("Host")).toBe("localhost:3000");
      });

      test("should return this for chaining", () => {
        const result = header.setHost("api.example.com");
        expect(result).toBe(header);
      });
    });

    describe("setUserAgent", () => {
      test("should set user agent", () => {
        const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
        header.setUserAgent(userAgent);
        expect(header.get("User-Agent")).toBe(userAgent);
      });

      test("should return this for chaining", () => {
        const result = header.setUserAgent("Custom-Agent/1.0");
        expect(result).toBe(header);
      });
    });

    describe("setReferer", () => {
      test("should set referer header", () => {
        header.setReferer("https://example.com/page");
        expect(header.get("Referer")).toBe("https://example.com/page");
      });

      test("should return this for chaining", () => {
        const result = header.setReferer("https://google.com");
        expect(result).toBe(header);
      });
    });

    describe("setOrigin", () => {
      test("should set origin header", () => {
        header.setOrigin("https://example.com");
        expect(header.get("Origin")).toBe("https://example.com");
      });

      test("should return this for chaining", () => {
        const result = header.setOrigin("http://localhost:3000");
        expect(result).toBe(header);
      });
    });
  });

  describe("authentication", () => {
    describe("setAuthorization", () => {
      test("should set authorization header", () => {
        header.setAuthorization("Custom auth-token");
        expect(header.get("Authorization")).toBe("Custom auth-token");
      });

      test("should return this for chaining", () => {
        const result = header.setAuthorization("Token abc123");
        expect(result).toBe(header);
      });
    });

    describe("setBasicAuth", () => {
      test("should set basic auth header", () => {
        header.setBasicAuth("base64encodedtoken");
        expect(header.get("Authorization")).toBe("Basic base64encodedtoken");
      });

      test("should return this for chaining", () => {
        const result = header.setBasicAuth("token123");
        expect(result).toBe(header);
      });
    });

    describe("setBearerToken", () => {
      test("should set bearer token header", () => {
        header.setBearerToken("jwt-token-here");
        expect(header.get("Authorization")).toBe("Bearer jwt-token-here");
      });

      test("should return this for chaining", () => {
        const result = header.setBearerToken("abc123");
        expect(result).toBe(header);
      });
    });
  });

  describe("cookies", () => {
    describe("setCookie", () => {
      test("should set simple cookie", () => {
        header.setCookie("sessionId", "abc123");
        expect(header.get("Set-Cookie")).toBe("sessionId=abc123");
      });

      test("should set cookie with all options", () => {
        const expires = new Date("2025-12-31T23:59:59Z");
        header.setCookie("test", "value", {
          domain: "example.com",
          path: "/api",
          expires,
          maxAge: 3600,
          secure: true,
          httpOnly: true,
          sameSite: "Strict",
        });

        const cookieValue = header.get("Set-Cookie");
        expect(cookieValue).toContain("test=value");
        expect(cookieValue).toContain("Max-Age=3600");
        expect(cookieValue).toContain(`Expires=${expires.toUTCString()}`);
        expect(cookieValue).toContain("Path=/api");
        expect(cookieValue).toContain("Domain=example.com");
        expect(cookieValue).toContain("Secure");
        expect(cookieValue).toContain("HttpOnly");
        expect(cookieValue).toContain("SameSite=Strict");
      });

      test("should set cookie with partial options", () => {
        header.setCookie("userId", "123", {
          maxAge: 7200,
          secure: true,
        });

        const cookieValue = header.get("Set-Cookie");
        expect(cookieValue).toBe("userId=123; Max-Age=7200; Secure");
      });

      test("should handle different SameSite values", () => {
        header.setCookie("lax", "value1", { sameSite: "Lax" });
        header.setCookie("none", "value2", { sameSite: "None" });

        const cookies = header.native.getSetCookie();
        expect(cookies[0]).toContain("SameSite=Lax");
        expect(cookies[1]).toContain("SameSite=None");
      });

      test("should return this for chaining", () => {
        const result = header.setCookie("test", "value");
        expect(result).toBe(header);
      });
    });

    describe("setCookies", () => {
      test("should set multiple cookies", () => {
        header.setCookies([
          { name: "cookie1", value: "value1" },
          { name: "cookie2", value: "value2", options: { maxAge: 3600 } },
          {
            name: "cookie3",
            value: "value3",
            options: { secure: true, httpOnly: true },
          },
        ]);

        const cookies = header.native.getSetCookie();
        expect(cookies).toHaveLength(3);
        expect(cookies[0]).toBe("cookie1=value1");
        expect(cookies[1]).toBe("cookie2=value2; Max-Age=3600");
        expect(cookies[2]).toBe("cookie3=value3; Secure; HttpOnly");
      });

      test("should handle empty array", () => {
        header.setCookies([]);
        expect(header.has("Set-Cookie")).toBe(false);
      });

      test("should return this for chaining", () => {
        const result = header.setCookies([{ name: "test", value: "value" }]);
        expect(result).toBe(header);
      });
    });

    describe("addCookie", () => {
      test("should be an alias for setCookie", () => {
        header.addCookie("test", "value", { maxAge: 1800 });
        expect(header.get("Set-Cookie")).toBe("test=value; Max-Age=1800");
      });

      test("should return this for chaining", () => {
        const result = header.addCookie("test", "value");
        expect(result).toBe(header);
      });
    });

    describe("removeCookie", () => {
      test("should remove cookie with empty value and past date", () => {
        header.removeCookie("testCookie");
        const cookieHeader = header.get("Set-Cookie");
        expect(cookieHeader).toContain("testCookie=");
        expect(cookieHeader).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
        expect(cookieHeader).toContain("Max-Age=0");
      });

      test("should remove cookie with domain option", () => {
        header.removeCookie("testCookie", { domain: "example.com" });
        const cookieHeader = header.get("Set-Cookie");
        expect(cookieHeader).toContain("testCookie=");
        expect(cookieHeader).toContain("Domain=example.com");
        expect(cookieHeader).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
        expect(cookieHeader).toContain("Max-Age=0");
      });

      test("should remove cookie with path option", () => {
        header.removeCookie("testCookie", { path: "/api" });
        const cookieHeader = header.get("Set-Cookie");
        expect(cookieHeader).toContain("testCookie=");
        expect(cookieHeader).toContain("Path=/api");
        expect(cookieHeader).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
        expect(cookieHeader).toContain("Max-Age=0");
      });

      test("should remove cookie with both domain and path options", () => {
        header.removeCookie("testCookie", {
          domain: "example.com",
          path: "/secure",
        });
        const cookieHeader = header.get("Set-Cookie");
        expect(cookieHeader).toContain("testCookie=");
        expect(cookieHeader).toContain("Domain=example.com");
        expect(cookieHeader).toContain("Path=/secure");
        expect(cookieHeader).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
        expect(cookieHeader).toContain("Max-Age=0");
      });

      test("should create correct past date (January 1, 1970)", () => {
        header.removeCookie("testCookie");
        const cookieHeader = header.get("Set-Cookie");
        // Verify the specific date used is January 1, 1970 (new Date(0))
        expect(cookieHeader).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      });

      test("should return this for chaining", () => {
        const result = header.removeCookie("testCookie");
        expect(result).toBe(header);
      });

      test("should handle cookie names with special characters", () => {
        header.removeCookie("test-cookie_name");
        const cookieHeader = header.get("Set-Cookie");
        expect(cookieHeader).toContain("test-cookie_name=");
        expect(cookieHeader).toContain("Max-Age=0");
      });

      test("should work without options parameter", () => {
        header.removeCookie("simpleCookie");
        const cookieHeader = header.get("Set-Cookie");
        expect(cookieHeader).toBe("simpleCookie=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      });
    });
  });

  describe("caching", () => {
    describe("setCacheControl", () => {
      test("should set cache control header", () => {
        header.setCacheControl("public, max-age=3600");
        expect(header.get("Cache-Control")).toBe("public, max-age=3600");
      });

      test("should return this for chaining", () => {
        const result = header.setCacheControl("no-cache");
        expect(result).toBe(header);
      });
    });

    describe("setEtag", () => {
      test("should set etag header", () => {
        header.setEtag('"abc123"');
        expect(header.get("Etag")).toBe('"abc123"');
      });

      test("should return this for chaining", () => {
        const result = header.setEtag('W/"123456"');
        expect(result).toBe(header);
      });
    });

    describe("setLastModified", () => {
      test("should set last modified header", () => {
        const date = new Date("2024-01-01T12:00:00Z");
        header.setLastModified(date);
        expect(header.get("Last-Modified")).toBe("Mon, 01 Jan 2024 12:00:00 GMT");
      });

      test("should return this for chaining", () => {
        const result = header.setLastModified(new Date());
        expect(result).toBe(header);
      });
    });

    describe("setIfModifiedSince", () => {
      test("should set if-modified-since header", () => {
        const date = new Date("2024-01-01T12:00:00Z");
        header.setIfModifiedSince(date);
        expect(header.get("If-Modified-Since")).toBe("Mon, 01 Jan 2024 12:00:00 GMT");
      });

      test("should return this for chaining", () => {
        const result = header.setIfModifiedSince(new Date());
        expect(result).toBe(header);
      });
    });
  });

  describe("CORS", () => {
    describe("setAccessControlAllowOrigin", () => {
      test("should set CORS origin header", () => {
        header.setAccessControlAllowOrigin("https://example.com");
        expect(header.get("Access-Control-Allow-Origin")).toBe("https://example.com");
      });

      test("should set wildcard origin", () => {
        header.setAccessControlAllowOrigin("*");
        expect(header.get("Access-Control-Allow-Origin")).toBe("*");
      });

      test("should return this for chaining", () => {
        const result = header.setAccessControlAllowOrigin("https://api.example.com");
        expect(result).toBe(header);
      });
    });

    describe("setAccessControlAllowMethods", () => {
      test("should set single method", () => {
        header.setAccessControlAllowMethods(["GET"]);
        expect(header.get("Access-Control-Allow-Methods")).toBe("GET");
      });

      test("should set multiple methods", () => {
        const methods: HttpMethodType[] = ["GET", "POST", "PUT", "DELETE"];
        header.setAccessControlAllowMethods(methods);
        expect(header.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE");
      });

      test("should handle empty array", () => {
        header.setAccessControlAllowMethods([]);
        expect(header.get("Access-Control-Allow-Methods")).toBe("");
      });

      test("should return this for chaining", () => {
        const result = header.setAccessControlAllowMethods(["GET", "POST"]);
        expect(result).toBe(header);
      });
    });

    describe("setAccessControlAllowHeaders", () => {
      test("should set single header", () => {
        header.setAccessControlAllowHeaders(["Authorization"]);
        expect(header.get("Access-Control-Allow-Headers")).toBe("Authorization");
      });

      test("should set multiple headers", () => {
        header.setAccessControlAllowHeaders(["Authorization", "Content-Type", "X-Requested-With"]);
        expect(header.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type, X-Requested-With");
      });

      test("should handle empty array", () => {
        header.setAccessControlAllowHeaders([]);
        expect(header.get("Access-Control-Allow-Headers")).toBe("");
      });

      test("should return this for chaining", () => {
        const result = header.setAccessControlAllowHeaders(["Content-Type"]);
        expect(result).toBe(header);
      });
    });

    describe("setAccessControlAllowCredentials", () => {
      test("should set credentials to true", () => {
        header.setAccessControlAllowCredentials(true);
        expect(header.get("Access-Control-Allow-Credentials")).toBe("true");
      });

      test("should set credentials to false", () => {
        header.setAccessControlAllowCredentials(false);
        expect(header.get("Access-Control-Allow-Credentials")).toBe("false");
      });

      test("should return this for chaining", () => {
        const result = header.setAccessControlAllowCredentials(true);
        expect(result).toBe(header);
      });
    });
  });

  describe("security headers", () => {
    describe("setContentSecurityPolicy", () => {
      test("should set CSP header", () => {
        const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'";
        header.setContentSecurityPolicy(csp);
        expect(header.get("Content-Security-Policy")).toBe(csp);
      });

      test("should return this for chaining", () => {
        const result = header.setContentSecurityPolicy("default-src 'none'");
        expect(result).toBe(header);
      });
    });

    describe("setStrictTransportSecurity", () => {
      test("should set HSTS with max-age only", () => {
        header.setStrictTransportSecurity(31_536_000);
        expect(header.get("Strict-Transport-Security")).toBe("max-age=31536000");
      });

      test("should set HSTS with includeSubDomains", () => {
        header.setStrictTransportSecurity(31_536_000, true);
        expect(header.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
      });

      test("should set HSTS with all options", () => {
        header.setStrictTransportSecurity(31_536_000, true, true);
        expect(header.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains; preload");
      });

      test("should set HSTS with preload but not includeSubDomains", () => {
        header.setStrictTransportSecurity(31_536_000, false, true);
        expect(header.get("Strict-Transport-Security")).toBe("max-age=31536000; preload");
      });

      test("should return this for chaining", () => {
        const result = header.setStrictTransportSecurity(3600);
        expect(result).toBe(header);
      });
    });

    describe("setXContentTypeOptions", () => {
      test("should set default value", () => {
        header.setXContentTypeOptions();
        expect(header.get("X-Content-Type-Options")).toBe("nosniff");
      });

      test("should set custom value", () => {
        header.setXContentTypeOptions("custom-value");
        expect(header.get("X-Content-Type-Options")).toBe("custom-value");
      });

      test("should return this for chaining", () => {
        const result = header.setXContentTypeOptions();
        expect(result).toBe(header);
      });
    });

    describe("setXFrameOptions", () => {
      test("should set DENY value", () => {
        header.setXFrameOptions("DENY");
        expect(header.get("X-Frame-Options")).toBe("DENY");
      });

      test("should set SAMEORIGIN value", () => {
        header.setXFrameOptions("SAMEORIGIN");
        expect(header.get("X-Frame-Options")).toBe("SAMEORIGIN");
      });

      test("should set custom value", () => {
        header.setXFrameOptions("ALLOW-FROM https://example.com");
        expect(header.get("X-Frame-Options")).toBe("ALLOW-FROM https://example.com");
      });

      test("should return this for chaining", () => {
        const result = header.setXFrameOptions("DENY");
        expect(result).toBe(header);
      });
    });

    describe("setXXSSProtection", () => {
      test("should set default enabled", () => {
        header.setXXSSProtection();
        expect(header.get("X-XSS-Protection")).toBe("1");
      });

      test("should set disabled", () => {
        header.setXXSSProtection(false);
        expect(header.get("X-XSS-Protection")).toBe("0");
      });

      test("should set enabled with mode", () => {
        header.setXXSSProtection(true, "block");
        expect(header.get("X-XSS-Protection")).toBe("1; mode=block");
      });

      test("should ignore mode when disabled", () => {
        header.setXXSSProtection(false, "block");
        expect(header.get("X-XSS-Protection")).toBe("0");
      });

      test("should return this for chaining", () => {
        const result = header.setXXSSProtection();
        expect(result).toBe(header);
      });
    });
  });

  describe("redirects", () => {
    describe("setLocation", () => {
      test("should set location header", () => {
        header.setLocation("https://example.com/new-page");
        expect(header.get("Location")).toBe("https://example.com/new-page");
      });

      test("should set relative location", () => {
        header.setLocation("/new-path");
        expect(header.get("Location")).toBe("/new-path");
      });

      test("should return this for chaining", () => {
        const result = header.setLocation("/redirect");
        expect(result).toBe(header);
      });
    });
  });

  describe("utility", () => {
    describe("setCustom", () => {
      test("should set custom header", () => {
        header.setCustom("custom-value");
        expect(header.get("X-Custom")).toBe("custom-value");
      });

      test("should return this for chaining", () => {
        const result = header.setCustom("test");
        expect(result).toBe(header);
      });
    });
  });

  describe("method chaining", () => {
    test("should allow complex chaining", () => {
      const result = header
        .setJson("UTF-8")
        .setHost("api.example.com")
        .setBearerToken("jwt-token")
        .setCacheControl("no-cache")
        .setAccessControlAllowOrigin("*")
        .setCookie("sessionId", "abc123", { httpOnly: true, secure: true });

      expect(result).toBe(header);
      expect(header.get("Content-Type")).toBe("application/json; charset=UTF-8");
      expect(header.get("Host")).toBe("api.example.com");
      expect(header.get("Authorization")).toBe("Bearer jwt-token");
      expect(header.get("Cache-Control")).toBe("no-cache");
      expect(header.get("Access-Control-Allow-Origin")).toBe("*");
      expect(header.get("Set-Cookie")).toContain("sessionId=abc123");
    });
  });

  describe("inheritance from ReadonlyHeader", () => {
    test("should inherit all readonly methods", () => {
      header.setJson();
      header.setHost("example.com");

      expect(header.getContentType()).toBe("application/json");
      expect(header.getHost()).toBe("example.com");
      expect(header.has("Content-Type")).toBe(true);
      expect(typeof header.toJson).toBe("function");
    });

    test("should work with Headers manipulation", () => {
      header.add("Custom-Header", "value1");
      header.add("Custom-Header", "value2");

      // Should append values (native Headers behavior)
      expect(header.get("Custom-Header")).toBe("value1, value2");

      header.set("Custom-Header", "single-value");
      expect(header.get("Custom-Header")).toBe("single-value");

      header.remove("Custom-Header");
      expect(header.has("Custom-Header")).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("should handle empty string values", () => {
      // @ts-expect-error
      header.set("Empty-Header", "");
      // @ts-expect-error
      expect(header.get("Empty-Header")).toBe("");
      // @ts-expect-error
      expect(header.has("Empty-Header")).toBe(true);
    });

    test("should handle special characters in header values", () => {
      header.setUserAgent("Mozilla/5.0 (compatible; Special/1.0; +http://example.com)");
      expect(header.get("User-Agent")).toBe("Mozilla/5.0 (compatible; Special/1.0; +http://example.com)");
    });

    test("should handle numeric values", () => {
      const header1 = new Header();
      header1.contentLength(0);
      expect(header1.get("Content-Length")).toBe("0");

      const header2 = new Header();
      header2.contentLength(9_999_999_999);
      expect(header2.get("Content-Length")).toBe("9999999999");
    });

    test("should handle boolean values", () => {
      const header1 = new Header();
      header1.setAccessControlAllowCredentials(true);
      expect(header1.get("Access-Control-Allow-Credentials")).toBe("true");

      const header2 = new Header();
      header2.setAccessControlAllowCredentials(false);
      expect(header2.get("Access-Control-Allow-Credentials")).toBe("false");
    });

    test("should handle date values", () => {
      const date = new Date("2024-12-25T10:30:00Z");
      header.setLastModified(date);
      expect(header.get("Last-Modified")).toBe("Wed, 25 Dec 2024 10:30:00 GMT");
    });

    test("should handle cookie options edge cases", () => {
      header.setCookie("test", "value", {
        maxAge: 0,
        secure: false,
        httpOnly: false,
      });
      expect(header.get("Set-Cookie")).toBe("test=value; Max-Age=0");
    });

    test("should handle multiple cookies with same name", () => {
      header.setCookie("duplicate", "value1");
      header.setCookie("duplicate", "value2");

      const cookies = header.native.getSetCookie();
      expect(cookies).toHaveLength(2);
      expect(cookies[0]).toBe("duplicate=value1");
      expect(cookies[1]).toBe("duplicate=value2");
    });
  });

  describe("real-world scenarios", () => {
    test("should handle typical API request setup", () => {
      header
        .setJson("UTF-8")
        .setHost("api.example.com")
        .setBearerToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")
        .setUserAgent("MyApp/1.0.0")
        .setOrigin("https://myapp.com")
        .setLang("en-US, en");

      expect(header.get("Content-Type")).toBe("application/json; charset=UTF-8");
      expect(header.get("Host")).toBe("api.example.com");
      expect(header.get("Authorization")).toBe("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(header.get("User-Agent")).toBe("MyApp/1.0.0");
      expect(header.get("Origin")).toBe("https://myapp.com");
      expect(header.get("Accept-Language")).toBe("en-US, en");
    });

    test("should handle CORS preflight response", () => {
      header
        .setAccessControlAllowOrigin("https://example.com")
        .setAccessControlAllowMethods(["GET", "POST", "OPTIONS"])
        .setAccessControlAllowHeaders(["Content-Type", "Authorization"])
        .setAccessControlAllowCredentials(true);

      expect(header.get("Access-Control-Allow-Origin")).toBe("https://example.com");
      expect(header.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
      expect(header.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
      expect(header.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("should handle secure response headers", () => {
      header
        .setContentSecurityPolicy("default-src 'self'; script-src 'self' 'unsafe-inline'")
        .setStrictTransportSecurity(31_536_000, true, true)
        .setXContentTypeOptions()
        .setXFrameOptions("DENY")
        .setXXSSProtection(true, "block");

      expect(header.get("Content-Security-Policy")).toBe("default-src 'self'; script-src 'self' 'unsafe-inline'");
      expect(header.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains; preload");
      expect(header.get("X-Content-Type-Options")).toBe("nosniff");
      expect(header.get("X-Frame-Options")).toBe("DENY");
      expect(header.get("X-XSS-Protection")).toBe("1; mode=block");
    });

    test("should handle file download response", () => {
      header
        .contentType("application/pdf")
        .contentLength(1_048_576)
        .contentDisposition('attachment; filename="document.pdf"')
        .setCacheControl("private, no-cache")
        .setEtag('"abc123"');

      expect(header.get("Content-Type")).toBe("application/pdf");
      expect(header.get("Content-Length")).toBe("1048576");
      expect(header.get("Content-Disposition")).toBe('attachment; filename="document.pdf"');
      expect(header.get("Cache-Control")).toBe("private, no-cache");
      expect(header.get("Etag")).toBe('"abc123"');
    });

    test("should handle session management", () => {
      header
        .setCookie("sessionId", "abc123def456", {
          httpOnly: true,
          secure: true,
          maxAge: 3600,
          sameSite: "Strict",
          path: "/",
        })
        .setCookie("preferences", "theme=dark", {
          maxAge: 86_400,
          sameSite: "Lax",
        });

      const cookies = header.native.getSetCookie();
      expect(cookies[0]).toContain("sessionId=abc123def456");
      expect(cookies[0]).toContain("HttpOnly");
      expect(cookies[0]).toContain("Secure");
      expect(cookies[0]).toContain("Max-Age=3600");
      expect(cookies[0]).toContain("SameSite=Strict");
      expect(cookies[1]).toContain("preferences=theme=dark");
      expect(cookies[1]).toContain("SameSite=Lax");
    });
  });
});
