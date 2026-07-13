---
name: mailer-create
description: Generate a new mailer class with its template and test files, then complete the generated code. Use when creating a new email sender with JSX template using @talosjs/mailer.
allowed-tools: Bash(talos mailer:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
disallowed-tools: AskUserQuestion
---

# Make Mailer Class

> **Run autonomously — do not ask the user questions.** When a choice arises, pick the recommended option and proceed.

> **Module location:** a `<module>` usually resolves to `modules/<module>/`, but it can also live under `packages/<module>/` — e.g. once it's been extracted into a shared, publishable package. Check both roots before assuming a path doesn't exist; every `modules/<module>/...` path in this file applies equally under `packages/<module>/...` when that's where the module actually lives.

Generate a mailer class, JSX template, and test files, then complete the implementation. Follow the shared workflow in the `talos-scaffold` skill (run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions); this skill covers only the mailer-specific parts.

## Steps

### 1. Infer the options from the request, then run the generator

Map the user's request to the options below, then run:

```bash
talos mailer:create --name=<name> --module=<module>
```

**Inferring options from the user's request:**

- `--name` — the mailer class name, taken from the email it sends (e.g., "a mailer for welcome emails" → `Welcome`). Pass it in any casing; the CLI normalizes to PascalCase and appends the `Mailer` suffix automatically, so omit the suffix.

Generates: `src/mailers/<Name>Mailer.ts`, `src/mailers/<Name>MailerTemplate.tsx`, `tests/mailers/<Name>Mailer.spec.ts`, `tests/mailers/<Name>MailerTemplate.spec.ts`.

### 2. Complete the mailer class

Read `modules/<module>/src/mailers/<Name>Mailer.ts`, then adjust the `send` method config type if additional parameters are needed:

```typescript
import { inject } from "@talosjs/container";
import type { IMailer } from "@talosjs/mailer";
import { type <Name>MailerPropsType, <Name>MailerTemplate } from "./<Name>MailerTemplate";

export class <Name>Mailer implements IMailer {
  constructor(
    @inject("mailer")
    private readonly mailer: IMailer,
  ) {}

  public async send(config: {
    to: string[];
    subject: string;
    from?: { name: string; address: string };
    data?: <Name>MailerPropsType;
  }): Promise<void> {
    const { data, ...rest } = config;

    await this.mailer.send({
      ...rest,
      content: <Name>MailerTemplate(data),
    });
  }
}
```

### 3. Complete the mailer template

Read `modules/<module>/src/mailers/<Name>MailerTemplate.tsx`, then:

- Update `<Name>MailerPropsType` with actual props for the email
- Build the email body using `MailerLayout` components
- **Sanitize untrusted input.** When a `link`/URL prop can originate from user input, validate it is an absolute `https:` URL before rendering it into an `href` (reject `javascript:`/`data:` schemes). When `to`/`subject`/`from` are user-derived, reject control characters/CRLF to prevent header injection.

```tsx
import { MailerLayout } from "@talosjs/mailer";

export type <Name>MailerPropsType = {
  link: string;
};

export const <Name>MailerTemplate = (props?: <Name>MailerPropsType) => (
  <MailerLayout>
    <MailerLayout.Header />
    <MailerLayout.Body>
      <a href={props?.link}>Login</a>
    </MailerLayout.Body>
    <MailerLayout.Footer />
  </MailerLayout>
);
```

### 4. Complete the test files

Read and replace `modules/<module>/tests/mailers/<Name>Mailer.spec.ts`:

**Coverage:** class identity (`name.endsWith("Mailer")`, is constructor), `send` exists and returns `Promise`, delegates to underlying `IMailer` (mock), forwards `to` and `subject`, passes rendered `content`.

```typescript
import { describe, expect, mock, test } from "bun:test";
import { <Name>Mailer } from "@/mailers/<Name>Mailer";

describe("<Name>Mailer", () => {
  test("should have class name ending with 'Mailer'", () => {
    expect(<Name>Mailer.name.endsWith("Mailer")).toBe(true);
  });

  test("should be a constructor function", () => {
    expect(typeof <Name>Mailer).toBe("function");
  });

  test("should have 'send' method", () => {
    expect(typeof <Name>Mailer.prototype.send).toBe("function");
  });

  test("'send' should return a Promise", () => {
    const mockMailer = { send: mock(() => Promise.resolve()) };
    const mailer = new <Name>Mailer(mockMailer as any);
    const result = mailer.send({ to: ["user@example.com"], subject: "Test" });
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("'send' should delegate to the underlying mailer", async () => {
    const sendMock = mock(() => Promise.resolve());
    const mockMailer = { send: sendMock };
    const mailer = new <Name>Mailer(mockMailer as any);
    await mailer.send({ to: ["user@example.com"], subject: "Hello" });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("'send' should forward 'to' and 'subject' to the underlying mailer", async () => {
    const sendMock = mock((_config: unknown) => Promise.resolve());
    const mockMailer = { send: sendMock };
    const mailer = new <Name>Mailer(mockMailer as any);
    await mailer.send({ to: ["a@b.com"], subject: "Subj" });
    const calledWith = sendMock.mock.calls[0]?.[0] as any;
    expect(calledWith.to).toEqual(["a@b.com"]);
    expect(calledWith.subject).toBe("Subj");
  });

  test("'send' should include rendered 'content' in the delegated call", async () => {
    const sendMock = mock((_config: unknown) => Promise.resolve());
    const mockMailer = { send: sendMock };
    const mailer = new <Name>Mailer(mockMailer as any);
    await mailer.send({ to: ["a@b.com"], subject: "Subj", data: { link: "https://example.com" } });
    const calledWith = sendMock.mock.calls[0]?.[0] as any;
    expect(calledWith.content).toBeDefined();
  });

  test("should produce independent instances", () => {
    const mockMailer = { send: mock(() => Promise.resolve()) };
    const a = new <Name>Mailer(mockMailer as any);
    const b = new <Name>Mailer(mockMailer as any);
    expect(a).not.toBe(b);
  });
});
```

Read and replace `modules/<module>/tests/mailers/<Name>MailerTemplate.spec.ts`:

**Coverage:** `<Name>MailerTemplate` is a function, renders without props without throwing, renders with props without throwing, returns a non-null value.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>MailerTemplate } from "@/mailers/<Name>MailerTemplate";

describe("<Name>MailerTemplate", () => {
  test("should be a function", () => {
    expect(typeof <Name>MailerTemplate).toBe("function");
  });

  test("should render without props without throwing", () => {
    expect(() => <Name>MailerTemplate()).not.toThrow();
  });

  test("should render with props without throwing", () => {
    expect(() => <Name>MailerTemplate({ link: "https://example.com" })).not.toThrow();
  });

  test("should return a non-null value", () => {
    const result = <Name>MailerTemplate({ link: "https://example.com" });
    expect(result).not.toBeNull();
    expect(result).toBeDefined();
  });

  // Add props-specific assertions after updating <Name>MailerPropsType
});
```

### 5. Lint, format, and test

```bash
talos monorepo:check
```

Fix every failure before completing.
