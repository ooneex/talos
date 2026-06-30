import { describe, expect, test } from "bun:test";
import { AssertChatQuery } from "@/constraints";

describe("AssertChatQuery", () => {
  const validator = new AssertChatQuery();

  test("should validate valid chat queries", () => {
    const validQueries = [
      "Hello world!",
      "How are you today?",
      "This is a simple message with numbers 123 and symbols @#$%",
      "A".repeat(1999),
      "A",
      "Multi\nline\ntext\nis\nok",
      "Emojis are fine 😊 🎉",
      "Unicode characters: café, naïve, résumé",
    ];

    for (const query of validQueries) {
      const result = validator.validate(query);
      expect(result.isValid).toBe(true);
    }
  });

  test("should reject empty strings", () => {
    const result = validator.validate("");
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "Chat query must be between 1 and 2000 characters and cannot contain HTML tags, scripts, or unsafe protocols",
    );
  });

  test("should reject queries that are too long", () => {
    const longQuery = "A".repeat(2001);
    const result = validator.validate(longQuery);
    expect(result.isValid).toBe(false);
    expect(result.message).toBe(
      "Chat query must be between 1 and 2000 characters and cannot contain HTML tags, scripts, or unsafe protocols",
    );
  });

  test("should reject queries with script tags", () => {
    const maliciousQueries = [
      "<script>alert('xss')</script>",
      "Hello <script>malicious code</script> world",
      "<SCRIPT>document.cookie</SCRIPT>",
      "Text with <script type='text/javascript'>code</script> inside",
      "<script src='evil.js'></script>",
    ];

    for (const query of maliciousQueries) {
      const result = validator.validate(query);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Chat query must be between 1 and 2000 characters and cannot contain HTML tags, scripts, or unsafe protocols",
      );
    }
  });

  test("should reject queries with HTML tags", () => {
    const htmlQueries = [
      "<div>Hello world</div>",
      "Text with <span>inline</span> elements",
      "<img src='image.jpg' alt='test'>",
      "<a href='link'>Click here</a>",
      "<p>Paragraph text</p>",
      "Self-closing <br/> tag",
      "<input type='text' value='test'>",
    ];

    for (const query of htmlQueries) {
      const result = validator.validate(query);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Chat query must be between 1 and 2000 characters and cannot contain HTML tags, scripts, or unsafe protocols",
      );
    }
  });

  test("should reject queries with javascript protocols", () => {
    const jsQueries = [
      "javascript:alert('xss')",
      "Click here: javascript:void(0)",
      "JAVASCRIPT:document.cookie",
      "Some text javascript:malicious() more text",
    ];

    for (const query of jsQueries) {
      const result = validator.validate(query);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Chat query must be between 1 and 2000 characters and cannot contain HTML tags, scripts, or unsafe protocols",
      );
    }
  });

  test("should reject queries with data protocols", () => {
    const dataQueries = [
      "data:text/html,<script>alert('xss')</script>",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "DATA:text/plain;base64,SGVsbG8=",
      "Check this data:application/javascript link",
    ];

    for (const query of dataQueries) {
      const result = validator.validate(query);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Chat query must be between 1 and 2000 characters and cannot contain HTML tags, scripts, or unsafe protocols",
      );
    }
  });

  test("should reject queries with vbscript protocols", () => {
    const vbQueries = [
      "vbscript:MsgBox('xss')",
      "VBSCRIPT:alert",
      "Click here: vbscript:malicious()",
      "Some text vbscript:code() more text",
    ];

    for (const query of vbQueries) {
      const result = validator.validate(query);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Chat query must be between 1 and 2000 characters and cannot contain HTML tags, scripts, or unsafe protocols",
      );
    }
  });

  test("should reject non-string values", () => {
    const invalidValues = [123, null, undefined, {}, [], true, false];

    for (const value of invalidValues) {
      const result = validator.validate(value);
      expect(result.isValid).toBe(false);
    }
  });

  test("should accept valid queries at boundary lengths", () => {
    const minLengthQuery = "A";
    const maxLengthQuery = "A".repeat(2000);

    const minResult = validator.validate(minLengthQuery);
    expect(minResult.isValid).toBe(true);

    const maxResult = validator.validate(maxLengthQuery);
    expect(maxResult.isValid).toBe(true);
  });

  test("should handle edge cases with mixed forbidden content", () => {
    const mixedBadQueries = [
      "<script>alert()</script> and javascript:void(0)",
      "data:text/html with <div>content</div>",
      "Multiple <tags> and javascript: and data: protocols",
      "UPPERCASE <SCRIPT> and JAVASCRIPT: and DATA: and VBSCRIPT:",
    ];

    for (const query of mixedBadQueries) {
      const result = validator.validate(query);
      expect(result.isValid).toBe(false);
      expect(result.message).toBe(
        "Chat query must be between 1 and 2000 characters and cannot contain HTML tags, scripts, or unsafe protocols",
      );
    }
  });

  test("should accept safe content that might look suspicious", () => {
    const safeQueries = [
      "I love JavaScript programming!",
      "This data is important",
      "Script writing is fun",
      "HTML and CSS are great",
      "The word 'script' appears here",
      "Talk about data structures",
      "Less than < and greater than > symbols",
      "Email@domain.com addresses",
    ];

    for (const query of safeQueries) {
      const result = validator.validate(query);
      expect(result.isValid).toBe(true);
    }
  });
});
