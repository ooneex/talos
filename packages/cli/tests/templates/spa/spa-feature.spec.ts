import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates/spa");

describe("spa-feature.route.txt", () => {
  const templatePath = join(templatesDir, "spa-feature.route.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{KEBAB}}");
  });

  test("should create a file route", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('createFileRoute("/{{KEBAB}}")');
    expect(content).toContain('from "@tanstack/react-router"');
  });

  test("should wire all route boundaries", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("component: {{NAME}}Layout");
    expect(content).toContain("pendingComponent: {{NAME}}SkeletonLayout");
    expect(content).toContain("errorComponent: {{NAME}}ErrorLayout");
    expect(content).toContain("notFoundComponent: {{NAME}}NotFoundLayout");
  });

  test("should import layouts from the feature folder", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("../features/{{KEBAB}}/layouts/{{NAME}}Layout");
    expect(content).toContain("../features/{{KEBAB}}/layouts/{{NAME}}ErrorLayout");
    expect(content).toContain("../features/{{KEBAB}}/layouts/{{NAME}}NotFoundLayout");
    expect(content).toContain("../features/{{KEBAB}}/layouts/{{NAME}}SkeletonLayout");
  });
});

describe("spa-feature.layout.txt", () => {
  const templatePath = join(templatesDir, "spa-feature.layout.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should export the layout component", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("export const {{NAME}}Layout");
    expect(content).toContain("type {{NAME}}LayoutPropsType");
  });

  test("should render Outlet as a fallback", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { Outlet } from "@tanstack/react-router"');
    expect(content).toContain("{children ?? <Outlet />}");
  });

  test("should type the return as ReactNode", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import type { ReactNode } from "react"');
    expect(content).toContain("): ReactNode");
  });
});

describe("spa-feature.error-layout.txt", () => {
  const templatePath = join(templatesDir, "spa-feature.error-layout.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should export the error layout component", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("export const {{NAME}}ErrorLayout");
  });

  test("should use ErrorComponentProps", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("ErrorComponentProps");
    expect(content).toContain('from "@tanstack/react-router"');
  });

  test("should render error message and a retry control", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('role="alert"');
    expect(content).toContain("{error.message}");
    expect(content).toContain("onClick={reset}");
  });
});

describe("spa-feature.not-found-layout.txt", () => {
  const templatePath = join(templatesDir, "spa-feature.not-found-layout.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{KEBAB}}");
  });

  test("should export the not-found layout component", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("export const {{NAME}}NotFoundLayout");
  });

  test("should render a not-found message", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("<h1>Not found</h1>");
    expect(content).toContain("The {{KEBAB}} you are looking for does not exist.");
  });
});

describe("spa-feature.skeleton-layout.txt", () => {
  const templatePath = join(templatesDir, "spa-feature.skeleton-layout.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should export the skeleton layout component", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("export const {{NAME}}SkeletonLayout");
  });

  test("should expose accessible loading state", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('aria-busy="true"');
    expect(content).toContain('aria-live="polite"');
    expect(content).toContain('className="sr-only"');
  });
});

describe("spa-feature.query.txt", () => {
  const templatePath = join(templatesDir, "spa-feature.query.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{CAMEL}}");
    expect(content).toContain("{{KEBAB}}");
  });

  test("should export the type and query key factory", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("export type {{NAME}}Type");
    expect(content).toContain("export const {{CAMEL}}Keys");
    expect(content).toContain('all: ["{{KEBAB}}"]');
  });

  test("should export a useQuery hook", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { useQuery } from "@tanstack/react-query"');
    expect(content).toContain("export const useGet{{NAME}}");
    expect(content).toContain("queryKey: {{CAMEL}}Keys.detail(id)");
  });

  test("should fetch with an abort signal", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("fetch(`/api/{{KEBAB}}/${id}`, { signal })");
    expect(content).toContain("enabled: Boolean(id)");
  });
});

describe("spa-feature.mutation.txt", () => {
  const templatePath = join(templatesDir, "spa-feature.mutation.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain required placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
    expect(content).toContain("{{CAMEL}}");
    expect(content).toContain("{{KEBAB}}");
  });

  test("should import the type and keys from the query hook", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('import { {{CAMEL}}Keys, type {{NAME}}Type } from "./useGet{{NAME}}"');
  });

  test("should export a useMutation hook", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain('from "@tanstack/react-query"');
    expect(content).toContain("export const useUpdate{{NAME}}");
    expect(content).toContain("useMutation({");
  });

  test("should PATCH the resource", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("fetch(`/api/{{KEBAB}}/${id}`");
    expect(content).toContain('method: "PATCH"');
  });

  test("should seed and invalidate the cache on success", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("queryClient.setQueryData({{CAMEL}}Keys.detail(data.id), data)");
    expect(content).toContain("queryClient.invalidateQueries({ queryKey: {{CAMEL}}Keys.all })");
  });
});
