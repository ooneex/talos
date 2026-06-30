import { beforeEach, describe, expect, test } from "bun:test";
import { HttpStatus, type StatusCodeType } from "@/index";

describe("Status", () => {
  let status: HttpStatus;

  beforeEach(() => {
    status = new HttpStatus();
  });

  describe("Static properties", () => {
    test("should have Code property with status codes", () => {
      expect(HttpStatus.Code).toBeDefined();
      expect(typeof HttpStatus.Code).toBe("object");
    });

    test("should have Text property with status texts", () => {
      expect(HttpStatus.Text).toBeDefined();
      expect(typeof HttpStatus.Text).toBe("object");
    });
  });

  describe("isInformational", () => {
    test("should return true for 1xx status codes", () => {
      expect(status.isInformational(HttpStatus.Code.Continue)).toBe(true);
      expect(status.isInformational(HttpStatus.Code.SwitchingProtocols)).toBe(true);
      expect(status.isInformational(HttpStatus.Code.Processing)).toBe(true);
      expect(status.isInformational(HttpStatus.Code.EarlyHints)).toBe(true);
    });

    test("should return false for non-1xx status codes", () => {
      expect(status.isInformational(HttpStatus.Code.OK)).toBe(false);
      expect(status.isInformational(HttpStatus.Code.NotFound)).toBe(false);
      expect(status.isInformational(HttpStatus.Code.InternalServerError)).toBe(false);
      expect(status.isInformational(HttpStatus.Code.MultipleChoices)).toBe(false);
    });

    test("should handle edge cases around boundaries", () => {
      expect(status.isInformational(99 as StatusCodeType)).toBe(false);
      expect(status.isInformational(100 as StatusCodeType)).toBe(true);
      expect(status.isInformational(199 as StatusCodeType)).toBe(true);
      expect(status.isInformational(200 as StatusCodeType)).toBe(false);
    });
  });

  describe("isSuccessful", () => {
    test("should return true for 2xx status codes", () => {
      expect(status.isSuccessful(HttpStatus.Code.OK)).toBe(true);
      expect(status.isSuccessful(HttpStatus.Code.Created)).toBe(true);
      expect(status.isSuccessful(HttpStatus.Code.Accepted)).toBe(true);
      expect(status.isSuccessful(HttpStatus.Code.NoContent)).toBe(true);
      expect(status.isSuccessful(HttpStatus.Code.ResetContent)).toBe(true);
      expect(status.isSuccessful(HttpStatus.Code.PartialContent)).toBe(true);
      expect(status.isSuccessful(HttpStatus.Code.MultiStatus)).toBe(true);
      expect(status.isSuccessful(HttpStatus.Code.AlreadyReported)).toBe(true);
      expect(status.isSuccessful(HttpStatus.Code.IMUsed)).toBe(true);
    });

    test("should return false for non-2xx status codes", () => {
      expect(status.isSuccessful(HttpStatus.Code.Continue)).toBe(false);
      expect(status.isSuccessful(HttpStatus.Code.MultipleChoices)).toBe(false);
      expect(status.isSuccessful(HttpStatus.Code.BadRequest)).toBe(false);
      expect(status.isSuccessful(HttpStatus.Code.InternalServerError)).toBe(false);
    });

    test("should handle edge cases around boundaries", () => {
      expect(status.isSuccessful(199 as StatusCodeType)).toBe(false);
      expect(status.isSuccessful(200 as StatusCodeType)).toBe(true);
      expect(status.isSuccessful(299 as StatusCodeType)).toBe(true);
      expect(status.isSuccessful(300 as StatusCodeType)).toBe(false);
    });
  });

  describe("isRedirect", () => {
    test("should return true for 3xx status codes", () => {
      expect(status.isRedirect(HttpStatus.Code.MultipleChoices)).toBe(true);
      expect(status.isRedirect(HttpStatus.Code.MovedPermanently)).toBe(true);
      expect(status.isRedirect(HttpStatus.Code.Found)).toBe(true);
      expect(status.isRedirect(HttpStatus.Code.SeeOther)).toBe(true);
      expect(status.isRedirect(HttpStatus.Code.NotModified)).toBe(true);
      expect(status.isRedirect(HttpStatus.Code.UseProxy)).toBe(true);
      expect(status.isRedirect(HttpStatus.Code.TemporaryRedirect)).toBe(true);
      expect(status.isRedirect(HttpStatus.Code.PermanentRedirect)).toBe(true);
    });

    test("should return false for non-3xx status codes", () => {
      expect(status.isRedirect(HttpStatus.Code.OK)).toBe(false);
      expect(status.isRedirect(HttpStatus.Code.Continue)).toBe(false);
      expect(status.isRedirect(HttpStatus.Code.BadRequest)).toBe(false);
      expect(status.isRedirect(HttpStatus.Code.InternalServerError)).toBe(false);
    });

    test("should handle edge cases around boundaries", () => {
      expect(status.isRedirect(299 as StatusCodeType)).toBe(false);
      expect(status.isRedirect(300 as StatusCodeType)).toBe(true);
      expect(status.isRedirect(399 as StatusCodeType)).toBe(true);
      expect(status.isRedirect(400 as StatusCodeType)).toBe(false);
    });
  });

  describe("isClientError", () => {
    test("should return true for 4xx status codes", () => {
      expect(status.isClientError(HttpStatus.Code.BadRequest)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.Unauthorized)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.PaymentRequired)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.Forbidden)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.NotFound)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.MethodNotAllowed)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.Conflict)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.Gone)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.Teapot)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.UnprocessableEntity)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.TooManyRequests)).toBe(true);
      expect(status.isClientError(HttpStatus.Code.UnavailableForLegalReasons)).toBe(true);
    });

    test("should return false for non-4xx status codes", () => {
      expect(status.isClientError(HttpStatus.Code.OK)).toBe(false);
      expect(status.isClientError(HttpStatus.Code.Continue)).toBe(false);
      expect(status.isClientError(HttpStatus.Code.MultipleChoices)).toBe(false);
      expect(status.isClientError(HttpStatus.Code.InternalServerError)).toBe(false);
    });

    test("should handle edge cases around boundaries", () => {
      expect(status.isClientError(399 as StatusCodeType)).toBe(false);
      expect(status.isClientError(400 as StatusCodeType)).toBe(true);
      expect(status.isClientError(499 as StatusCodeType)).toBe(true);
      expect(status.isClientError(500 as StatusCodeType)).toBe(false);
    });
  });

  describe("isServerError", () => {
    test("should return true for 5xx status codes", () => {
      expect(status.isServerError(HttpStatus.Code.InternalServerError)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.NotImplemented)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.BadGateway)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.ServiceUnavailable)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.GatewayTimeout)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.HTTPVersionNotSupported)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.VariantAlsoNegotiates)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.InsufficientStorage)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.LoopDetected)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.NotExtended)).toBe(true);
      expect(status.isServerError(HttpStatus.Code.NetworkAuthenticationRequired)).toBe(true);
    });

    test("should return false for non-5xx status codes", () => {
      expect(status.isServerError(HttpStatus.Code.OK)).toBe(false);
      expect(status.isServerError(HttpStatus.Code.Continue)).toBe(false);
      expect(status.isServerError(HttpStatus.Code.MultipleChoices)).toBe(false);
      expect(status.isServerError(HttpStatus.Code.BadRequest)).toBe(false);
    });

    test("should handle edge cases around boundaries", () => {
      expect(status.isServerError(499 as StatusCodeType)).toBe(false);
      expect(status.isServerError(500 as StatusCodeType)).toBe(true);
      expect(status.isServerError(599 as StatusCodeType)).toBe(true);
      expect(status.isServerError(600 as StatusCodeType)).toBe(false);
    });
  });

  describe("isError", () => {
    test("should return true for 4xx status codes", () => {
      expect(status.isError(HttpStatus.Code.BadRequest)).toBe(true);
      expect(status.isError(HttpStatus.Code.Unauthorized)).toBe(true);
      expect(status.isError(HttpStatus.Code.NotFound)).toBe(true);
      expect(status.isError(HttpStatus.Code.TooManyRequests)).toBe(true);
    });

    test("should return true for 5xx status codes", () => {
      expect(status.isError(HttpStatus.Code.InternalServerError)).toBe(true);
      expect(status.isError(HttpStatus.Code.NotImplemented)).toBe(true);
      expect(status.isError(HttpStatus.Code.BadGateway)).toBe(true);
      expect(status.isError(HttpStatus.Code.ServiceUnavailable)).toBe(true);
    });

    test("should return false for non-error status codes", () => {
      expect(status.isError(HttpStatus.Code.Continue)).toBe(false);
      expect(status.isError(HttpStatus.Code.OK)).toBe(false);
      expect(status.isError(HttpStatus.Code.Created)).toBe(false);
      expect(status.isError(HttpStatus.Code.MultipleChoices)).toBe(false);
      expect(status.isError(HttpStatus.Code.MovedPermanently)).toBe(false);
    });

    test("should handle edge cases", () => {
      expect(status.isError(399 as StatusCodeType)).toBe(false);
      expect(status.isError(400 as StatusCodeType)).toBe(true);
      expect(status.isError(499 as StatusCodeType)).toBe(true);
      expect(status.isError(500 as StatusCodeType)).toBe(true);
      expect(status.isError(599 as StatusCodeType)).toBe(true);
      expect(status.isError(600 as StatusCodeType)).toBe(false);
    });
  });

  describe("STATUS_CODE constants", () => {
    test("should have correct values for informational codes", () => {
      expect(HttpStatus.Code.Continue).toBe(100);
      expect(HttpStatus.Code.SwitchingProtocols).toBe(101);
      expect(HttpStatus.Code.Processing).toBe(102);
      expect(HttpStatus.Code.EarlyHints).toBe(103);
    });

    test("should have correct values for success codes", () => {
      expect(HttpStatus.Code.OK).toBe(200);
      expect(HttpStatus.Code.Created).toBe(201);
      expect(HttpStatus.Code.Accepted).toBe(202);
      expect(HttpStatus.Code.NoContent).toBe(204);
    });

    test("should have correct values for redirect codes", () => {
      expect(HttpStatus.Code.MultipleChoices).toBe(300);
      expect(HttpStatus.Code.MovedPermanently).toBe(301);
      expect(HttpStatus.Code.Found).toBe(302);
      expect(HttpStatus.Code.NotModified).toBe(304);
    });

    test("should have correct values for client error codes", () => {
      expect(HttpStatus.Code.BadRequest).toBe(400);
      expect(HttpStatus.Code.Unauthorized).toBe(401);
      expect(HttpStatus.Code.Forbidden).toBe(403);
      expect(HttpStatus.Code.NotFound).toBe(404);
      expect(HttpStatus.Code.Teapot).toBe(418);
    });

    test("should have correct values for server error codes", () => {
      expect(HttpStatus.Code.InternalServerError).toBe(500);
      expect(HttpStatus.Code.NotImplemented).toBe(501);
      expect(HttpStatus.Code.BadGateway).toBe(502);
      expect(HttpStatus.Code.ServiceUnavailable).toBe(503);
    });
  });

  describe("STATUS_TEXT constants", () => {
    test("should have correct text for common status codes", () => {
      expect(HttpStatus.Text[HttpStatus.Code.OK]).toBe("OK");
      expect(HttpStatus.Text[HttpStatus.Code.Created]).toBe("Created");
      expect(HttpStatus.Text[HttpStatus.Code.BadRequest]).toBe("Bad Request");
      expect(HttpStatus.Text[HttpStatus.Code.Unauthorized]).toBe("Unauthorized");
      expect(HttpStatus.Text[HttpStatus.Code.Forbidden]).toBe("Forbidden");
      expect(HttpStatus.Text[HttpStatus.Code.NotFound]).toBe("Not Found");
      expect(HttpStatus.Text[HttpStatus.Code.InternalServerError]).toBe("Internal Server Error");
      expect(HttpStatus.Text[HttpStatus.Code.Teapot]).toBe("I'm a teapot");
    });

    test("should have text for all status codes", () => {
      // Test that every status code has corresponding text
      const codes = Object.values(HttpStatus.Code);
      for (const code of codes) {
        expect(HttpStatus.Text[code]).toBeDefined();
        expect(typeof HttpStatus.Text[code]).toBe("string");
        expect(HttpStatus.Text[code].length).toBeGreaterThan(0);
      }
    });

    test("should have correct number of status text entries", () => {
      const codeCount = Object.keys(HttpStatus.Code).length;
      const textCount = Object.keys(HttpStatus.Text).length;
      expect(textCount).toBe(codeCount);
    });
  });

  describe("Type safety", () => {
    test("should work with StatusCodeType", () => {
      const code: StatusCodeType = HttpStatus.Code.OK;
      expect(status.isSuccessful(code)).toBe(true);
      expect(status.isError(code)).toBe(false);
    });

    test("should work with direct numeric values", () => {
      expect(status.isSuccessful(200 as StatusCodeType)).toBe(true);
      expect(status.isError(404 as StatusCodeType)).toBe(true);
      expect(status.isRedirect(301 as StatusCodeType)).toBe(true);
    });
  });

  describe("Method consistency", () => {
    test("status categories should be mutually exclusive", () => {
      const testCodes = [
        HttpStatus.Code.Continue, // 1xx
        HttpStatus.Code.OK, // 2xx
        HttpStatus.Code.MovedPermanently, // 3xx
        HttpStatus.Code.BadRequest, // 4xx
        HttpStatus.Code.InternalServerError, // 5xx
      ];

      for (const code of testCodes) {
        const categories = [
          status.isInformational(code),
          status.isSuccessful(code),
          status.isRedirect(code),
          status.isClientError(code),
          status.isServerError(code),
        ];

        // Exactly one category should be true
        const trueCount = categories.filter(Boolean).length;
        expect(trueCount).toBe(1);
      }
    });

    test("isError should match isClientError || isServerError", () => {
      const testCodes = Object.values(HttpStatus.Code);

      for (const code of testCodes) {
        const isError = status.isError(code);
        const isClientOrServerError = status.isClientError(code) || status.isServerError(code);
        expect(isError).toBe(isClientOrServerError);
      }
    });
  });
});
