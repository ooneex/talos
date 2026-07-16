import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(import.meta.dir, "../../../src/templates");

describe("README.md.txt", () => {
  const templatePath = join(templatesDir, "app", "README.md.txt");

  test("should exist", () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  test("should contain {{NAME}} placeholders", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("{{NAME}}");
  });

  test("should use {{NAME}} in title", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("# {{NAME}}");
  });

  test("should contain required sections", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("## Prerequisites");
    expect(content).toContain("## Getting Started");
    expect(content).toContain("## Modules");
    expect(content).toContain("## Microservices");
    expect(content).toContain("## SPA");
    expect(content).toContain("## Design");
    expect(content).toContain("## SDK");
    expect(content).toContain("## Migrations");
    expect(content).toContain("## Seeds");
    expect(content).toContain("## Issues");
    expect(content).toContain("## Generators");
    expect(content).toContain("## Custom Commands");
    expect(content).toContain("## Claude");
    expect(content).toContain("## Other Assistants");
    expect(content).toContain("## Shell Completion");
    expect(content).toContain("## Release");
    expect(content).toContain("## Credentials");
    expect(content).toContain("## Commands");
    expect(content).toContain("## Learn More");
  });

  test("should link to the documentation site", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("https://docs.talos.com");
  });

  test("should document commands", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("bunx biome check --write");
    expect(content).toContain("talos monorepo:run --commands=lint");
    expect(content).toContain("talos monorepo:run --commands=test");
    expect(content).toContain("talos monorepo:check");
  });

  test("should list prerequisites", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("Bun");
    expect(content).toContain("Docker");
  });

  test("should contain CLI scaffolding examples", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("oo module:create");
    expect(content).toContain("oo controller:create");
    expect(content).toContain("oo service:create");
    expect(content).toContain("oo entity:create");
    expect(content).toContain("oo event:create");
  });

  test("should contain environment configuration", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("Environment Configuration");
    expect(content).toContain("`.env.yml` in the project root");
  });

  test("should document starting and stopping the app with module filters", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Start the App");
    expect(content).toContain("oo app:start");
    expect(content).toContain("oo app:start --modules=api,dashboard");
    expect(content).toContain("oo app:start --packages=api,dashboard");
    expect(content).toContain("### Stop the App");
    expect(content).toContain("oo app:stop");
    expect(content).toContain("oo app:stop --modules=api,dashboard");
  });

  test("should contain Modules why/benefits/good practices explanation", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Why Modules?");
    expect(content).toContain("**Benefits:**");
    expect(content).toContain("**Good practices:**");
  });

  test("should contain Microservices why/benefits/good practices explanation", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Why Microservices?");
    expect(content).toContain("### Create a Microservice");
    expect(content).toContain("oo microservice:create");
    expect(content).toContain("### Delete a Microservice");
    expect(content).toContain("oo microservice:remove");
  });

  test("should document Microservices between Modules and Migrations", async () => {
    const content = await Bun.file(templatePath).text();
    const modulesIdx = content.indexOf("## Modules");
    const microservicesIdx = content.indexOf("## Microservices");
    const migrationsIdx = content.indexOf("## Migrations");
    expect(microservicesIdx).toBeGreaterThan(modulesIdx);
    expect(microservicesIdx).toBeLessThan(migrationsIdx);
  });

  test("should contain SPA why/benefits/good practices explanation", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Why SPA?");
    expect(content).toContain("### Create a SPA");
    expect(content).toContain("oo spa:create");
    expect(content).toContain("oo spa:create --name dashboard --design ui");
    expect(content).toContain("### Delete a SPA");
    expect(content).toContain("oo spa:remove");
  });

  test("should document SPA between Microservices and Migrations", async () => {
    const content = await Bun.file(templatePath).text();
    const microservicesIdx = content.indexOf("## Microservices");
    const spaIdx = content.indexOf("## SPA");
    const migrationsIdx = content.indexOf("## Migrations");
    expect(spaIdx).toBeGreaterThan(microservicesIdx);
    expect(spaIdx).toBeLessThan(migrationsIdx);
  });

  test("should document the spa:feature:create command", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Create a SPA Feature");
    expect(content).toContain("oo spa:feature:create");
  });

  test("should contain Design why/create/delete explanation", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Why Design?");
    expect(content).toContain("### Create a Design Module");
    expect(content).toContain("oo design:create");
    expect(content).toContain("### Delete a Design Module");
    expect(content).toContain("oo design:remove");
  });

  test("should contain SDK why/create explanation", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Why SDK?");
    expect(content).toContain("### Create a SDK");
    expect(content).toContain("oo sdk:create");
  });

  test("should document Design and SDK between SPA and Migrations", async () => {
    const content = await Bun.file(templatePath).text();
    const spaIdx = content.indexOf("## SPA");
    const designIdx = content.indexOf("## Design");
    const sdkIdx = content.indexOf("## SDK");
    const migrationsIdx = content.indexOf("## Migrations");
    expect(designIdx).toBeGreaterThan(spaIdx);
    expect(sdkIdx).toBeGreaterThan(designIdx);
    expect(sdkIdx).toBeLessThan(migrationsIdx);
  });

  test("should contain Migrations why/benefits/good practices explanation", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Why Migrations?");
  });

  test("should contain Seeds why/benefits/good practices explanation", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Why Seeds?");
  });

  test("should contain generator explanations", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("**Why:**");
    expect(content).toContain("**Benefits:**");
    expect(content).toContain("**Good practices:**");
  });

  test("should document the queue generator", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Queue");
    expect(content).toContain("oo queue:create");
  });

  test("should document the workflow generators", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Workflow");
    expect(content).toContain("oo workflow:create");
    expect(content).toContain("oo workflow:transition:create");
  });

  test("should document custom commands", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Create a Command");
    expect(content).toContain("oo command:create");
    expect(content).toContain("### Run a Command");
    expect(content).toContain("oo command:run");
  });

  test("should document the other assistants section", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("## Other Assistants");
    expect(content).toContain("oo agent:skills:create");
  });

  test("should document Zsh shell completion", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("oo completion:zsh");
  });

  test("should contain Claude skills section with setup, why and how to use", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Setup");
    expect(content).toContain("oo agent:skills:create");
    expect(content).toContain("### Why Skills?");
    expect(content).toContain("### How to Use");
    expect(content).toContain("### Available Skills");
  });

  test("should list key Claude skills", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("/commit");
    expect(content).toContain("/optimize");
    expect(content).toContain("/controller-create");
    expect(content).toContain("/service-create");
    expect(content).toContain("/migration-create");
    expect(content).toContain("/seed-create");
    expect(content).toContain("/issue-plan");
  });

  test("should list the new generator skills in the skills table", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("/queue-create");
    expect(content).toContain("/sdk-create");
    expect(content).toContain("/spa-feature-create");
    expect(content).toContain("/workflow-create");
    expect(content).toContain("/workflow-transition-create");
  });

  test("should document issue:create command", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("oo issue:create");
  });

  test("should document issue:pull command", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("oo issue:pull");
    expect(content).toContain("linear.api_key");
  });

  test("should document issue:plan skill after issue:pull and before issue:push", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Create and Plan an Issue");
    expect(content).toContain("/issue-plan");
    const pullIdx = content.indexOf("### Pull an Issue");
    const planIdx = content.indexOf("### Create and Plan an Issue");
    const pushIdx = content.indexOf("### Push an Issue");
    expect(planIdx).toBeGreaterThan(pullIdx);
    expect(planIdx).toBeLessThan(pushIdx);
  });

  test("should document Claude coding conventions", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("### Coding Conventions Enforced by Skills");
  });

  test("should document issue:push command", async () => {
    const content = await Bun.file(templatePath).text();
    expect(content).toContain("oo issue:push");
  });
});
