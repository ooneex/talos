---
name: mailer-create
description: Generate a new mailer class with its template and test files, then complete the generated code.
when_to_use: Use when creating a new email sender with JSX template using @talosjs/mailer.
model: sonnet
effort: medium
allowed-tools: Bash(talos mailer:create *), Bash(talos monorepo:check *), Read, Edit, Write, Grep, Glob
argument-hint: [--name=<Name>] [--module=<module>]
---

# Make Mailer Class

> **Run autonomously — do not ask the user questions.** Pick the recommended option and proceed.

Generate a mailer class, JSX template, and test files, then complete the implementation (mailer-specific parts only). Follow the shared `talos-scaffold` skill for run-from-root, `--name`/`--module` inference, module registration, lint/format, and coding conventions.

**Module location:** `<module>` resolves to `modules/<module>/` or `packages/<module>/` (once extracted into a shared package). Check both roots; every `modules/<module>/...` path applies equally under `packages/<module>/...`.

## Steps

### 1. Infer the options from the request, then run the generator

```bash
talos mailer:create --name=<name> --module=<module>
```

- `--name` — mailer class name, from the email it sends (e.g. "a mailer for welcome emails" → `Welcome`). Any casing; the CLI normalizes to PascalCase and appends the `Mailer` suffix, so omit it.

Generates: `src/mailers/<Name>Mailer.ts`, `src/mailers/<Name>MailerTemplate.tsx`, `tests/mailers/<Name>Mailer.spec.ts`, `tests/mailers/<Name>MailerTemplate.spec.ts`.

### 2. Complete the mailer class

Read `modules/<module>/src/mailers/<Name>Mailer.ts`, then adjust the `send` config type if extra parameters are needed:

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

- Update `<Name>MailerPropsType` with the email's actual props
- Build the body using `MailerLayout` components
- **Sanitize untrusted input.** For any `link`/URL prop from user input, validate it is an absolute `https:` URL before rendering into `href` (reject `javascript:`/`data:`). For user-derived `to`/`subject`/`from`, reject control characters/CRLF to prevent header injection.

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

Read and replace `modules/<module>/tests/mailers/<Name>Mailer.spec.ts`.

**Coverage:** class identity (`name.endsWith("Mailer")`, is constructor); `send` exists, returns `Promise`, delegates to the underlying `IMailer` (mock) forwarding `to`/`subject` and rendered `content`; instance isolation.

```typescript
import { describe, expect, mock, test } from "bun:test";
import { <Name>Mailer } from "@/mailers/<Name>Mailer";

const makeMock = () => mock(() => Promise.resolve());

describe("<Name>Mailer", () => {
  test("class name ends with 'Mailer' and is a constructor", () => {
    expect(<Name>Mailer.name.endsWith("Mailer")).toBe(true);
    expect(typeof <Name>Mailer).toBe("function");
  });

  test("'send' exists and returns a Promise", () => {
    const mailer = new <Name>Mailer({ send: makeMock() } as any);
    expect(typeof <Name>Mailer.prototype.send).toBe("function");
    const result = mailer.send({ to: ["user@example.com"], subject: "Test" });
    expect(result).toBeInstanceOf(Promise);
    return result.catch(() => {});
  });

  test("'send' delegates to the underlying mailer, forwarding 'to', 'subject', and rendered 'content'", async () => {
    const sendMock = mock((_config: unknown) => Promise.resolve());
    const mailer = new <Name>Mailer({ send: sendMock } as any);
    await mailer.send({ to: ["a@b.com"], subject: "Subj", data: { link: "https://example.com" } });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const calledWith = sendMock.mock.calls[0]?.[0] as any;
    expect(calledWith.to).toEqual(["a@b.com"]);
    expect(calledWith.subject).toBe("Subj");
    expect(calledWith.content).toBeDefined();
  });

  test("should produce independent instances", () => {
    const m = { send: makeMock() } as any;
    expect(new <Name>Mailer(m)).not.toBe(new <Name>Mailer(m));
  });
});
```

Read and replace `modules/<module>/tests/mailers/<Name>MailerTemplate.spec.ts`.

**Coverage:** is a function, renders without props and with props without throwing, returns a non-null value.

```typescript
import { describe, expect, test } from "bun:test";
import { <Name>MailerTemplate } from "@/mailers/<Name>MailerTemplate";

describe("<Name>MailerTemplate", () => {
  test("should be a function", () => {
    expect(typeof <Name>MailerTemplate).toBe("function");
  });

  test("should render without props and with props without throwing", () => {
    expect(() => <Name>MailerTemplate()).not.toThrow();
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
