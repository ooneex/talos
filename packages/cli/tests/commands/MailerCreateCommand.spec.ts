import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test" })),
}));

const { MailerCreateCommand } = await import("@/commands/MailerCreateCommand");

describe("MailerCreateCommand", () => {
  let command: InstanceType<typeof MailerCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new MailerCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `mailer-${Date.now()}`);

    // Mock Bun.spawn to avoid running bun add in tests
    originalSpawn = Bun.spawn;
    Bun.spawn = ((...args: unknown[]) => {
      const cmd = Array.isArray(args[0]) ? args[0] : (args[0] as { cmd?: string[] })?.cmd;
      if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }
      return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    Bun.spawn = originalSpawn;
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Command Metadata", () => {
    test("should return correct command name", () => {
      expect(command.getName()).toBe("mailer:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new mailer class");
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "mailers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "mailers", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should override existing file when override option is passed", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "mailers", "WelcomeMailer.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Welcome", override: true });

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("// existing content");
      expect(content).toContain("Welcome");
    });

    test("should not override existing file when prompt is declined", async () => {
      const filePath = join(testDir, "modules", "shared", "src", "mailers", "WelcomeMailer.ts");
      await Bun.write(filePath, "// existing content");

      await command.run({ name: "Welcome" });

      const content = await Bun.file(filePath).text();
      expect(content).toBe("// existing content");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "modules", "shared", "src", "mailers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "shared", "tests", "mailers", ".gitkeep"), "");
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should generate mailer file with correct name", async () => {
      await command.run({ name: "Welcome" });

      const filePath = join(testDir, "modules", "shared", "src", "mailers", "WelcomeMailer.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("WelcomeMailer");
    });

    test("should generate mailer template file", async () => {
      await command.run({ name: "Welcome" });

      const filePath = join(testDir, "modules", "shared", "src", "mailers", "WelcomeMailerTemplate.tsx");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).toContain("Welcome");
    });

    test("should install the dependency silently without inheriting output", async () => {
      const installCalls: { cmd: string[]; stderr: unknown }[] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? (args[0] as string[]) : (args[0] as { cmd?: string[] })?.cmd;
        const opts = args[1] as { stderr?: unknown } | undefined;
        if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
          installCalls.push({ cmd: [...cmd], stderr: opts?.stderr });
          return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
        }
        return originalSpawn.apply(Bun, args as Parameters<typeof Bun.spawn>);
      }) as typeof Bun.spawn;

      await command.run({ name: "Welcome" });

      expect(installCalls.length).toBeGreaterThan(0);
      expect(installCalls[0]?.stderr).toBe("ignore");
    });

    test("should generate test file for mailer", async () => {
      await command.run({ name: "Welcome" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "mailers", "WelcomeMailer.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("WelcomeMailer");
    });

    test("should generate test file for mailer template", async () => {
      await command.run({ name: "Welcome" });

      const testFilePath = join(testDir, "modules", "shared", "tests", "mailers", "WelcomeMailerTemplate.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).toContain("WelcomeMailerTemplate");
    });

    test("should normalize name with toPascalCase", async () => {
      await command.run({ name: "password-reset" });

      const filePath = join(testDir, "modules", "shared", "src", "mailers", "PasswordResetMailer.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should remove Mailer suffix if provided", async () => {
      await command.run({ name: "WelcomeMailer" });

      const filePath = join(testDir, "modules", "shared", "src", "mailers", "WelcomeMailer.ts");
      expect(existsSync(filePath)).toBe(true);

      const content = await Bun.file(filePath).text();
      expect(content).not.toContain("WelcomeMailerMailer");
    });

    test("should handle lowercase input", async () => {
      await command.run({ name: "notification" });

      const filePath = join(testDir, "modules", "shared", "src", "mailers", "NotificationMailer.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should handle snake_case input", async () => {
      await command.run({ name: "order_confirmation" });

      const filePath = join(testDir, "modules", "shared", "src", "mailers", "OrderConfirmationMailer.ts");
      expect(existsSync(filePath)).toBe(true);
    });

    test("should replace template placeholders correctly", async () => {
      await command.run({ name: "Invoice" });

      const filePath = join(testDir, "modules", "shared", "src", "mailers", "InvoiceMailer.ts");
      const content = await Bun.file(filePath).text();

      expect(content).not.toContain("{{NAME}}");
      expect(content).toContain("Invoice");
    });

    test("should generate all four files", async () => {
      await command.run({ name: "Verify" });

      expect(existsSync(join(testDir, "modules", "shared", "src", "mailers", "VerifyMailer.ts"))).toBe(true);
      expect(existsSync(join(testDir, "modules", "shared", "src", "mailers", "VerifyMailerTemplate.tsx"))).toBe(true);
      expect(existsSync(join(testDir, "modules", "shared", "tests", "mailers", "VerifyMailer.spec.ts"))).toBe(true);
      expect(existsSync(join(testDir, "modules", "shared", "tests", "mailers", "VerifyMailerTemplate.spec.ts"))).toBe(
        true,
      );
    });

    test("should replace MODULE placeholder in test file", async () => {
      await Bun.write(join(testDir, "modules", "user-profile", "src", "mailers", ".gitkeep"), "");
      await Bun.write(join(testDir, "modules", "user-profile", "tests", "mailers", ".gitkeep"), "");

      await command.run({ name: "Welcome", module: "user-profile" });

      const testFilePath = join(testDir, "modules", "user-profile", "tests", "mailers", "WelcomeMailer.spec.ts");
      expect(existsSync(testFilePath)).toBe(true);

      const content = await Bun.file(testFilePath).text();
      expect(content).not.toContain("{{MODULE}}");
      expect(content).toContain("@module/user-profile/mailers/WelcomeMailer");

      const templateTestFilePath = join(
        testDir,
        "modules",
        "user-profile",
        "tests",
        "mailers",
        "WelcomeMailerTemplate.spec.ts",
      );
      expect(existsSync(templateTestFilePath)).toBe(true);

      const templateContent = await Bun.file(templateTestFilePath).text();
      expect(templateContent).not.toContain("{{MODULE}}");
      expect(templateContent).toContain("@module/user-profile/mailers/WelcomeMailerTemplate");
    });
  });
});
