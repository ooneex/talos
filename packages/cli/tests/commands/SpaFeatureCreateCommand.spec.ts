import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mock enquirer before importing commands
mock.module("enquirer", () => ({
  prompt: mock(() => Promise.resolve({ name: "Test", confirm: false })),
}));

const { SpaFeatureCreateCommand } = await import("@/commands/SpaFeatureCreateCommand");

const read = (path: string) => Bun.file(path).text();

describe("SpaFeatureCreateCommand", () => {
  let command: InstanceType<typeof SpaFeatureCreateCommand>;
  let testDir: string;
  let originalCwd: string;
  let originalSpawn: typeof Bun.spawn;

  beforeEach(() => {
    command = new SpaFeatureCreateCommand();
    originalCwd = process.cwd();
    testDir = join(originalCwd, ".temp", `spa-feature-${Date.now()}-${Math.random().toString(36).slice(2)}`);

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
      expect(command.getName()).toBe("spa:feature:create");
    });

    test("should return correct description", () => {
      expect(command.getDescription()).toBe("Generate a new spa feature (route, layout, hooks and folders)");
    });
  });

  describe("run()", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    const featurePath = (...segments: string[]) =>
      join(testDir, "modules", "spa", "src", "features", "user", ...segments);

    test("should create the route in the routes folder using kebab-case", async () => {
      await command.run({ name: "User", module: "spa" });

      const routePath = join(testDir, "modules", "spa", "src", "routes", "user.tsx");
      expect(existsSync(routePath)).toBe(true);

      const content = await read(routePath);
      expect(content).toContain('createFileRoute("/user")');
      expect(content).toContain('from "../features/user/layouts/UserLayout"');
      expect(content).toContain("component: UserLayout");
      expect(content).toContain("pendingComponent: UserSkeletonLayout");
      expect(content).toContain("errorComponent: UserErrorLayout");
      expect(content).toContain("notFoundComponent: UserNotFoundLayout");
      expect(content).not.toContain("{{NAME}}");
      expect(content).not.toContain("{{KEBAB}}");
    });

    test("should create the not-found, error and skeleton layouts", async () => {
      await command.run({ name: "User", module: "spa" });

      const notFound = await read(featurePath("layouts", "UserNotFoundLayout.tsx"));
      expect(notFound).toContain("export const UserNotFoundLayout");

      const error = await read(featurePath("layouts", "UserErrorLayout.tsx"));
      expect(error).toContain("export const UserErrorLayout");
      expect(error).toContain("ErrorComponentProps");
      expect(error).toContain("{ error, reset }");
      expect(error).toContain("onClick={reset}");

      const skeleton = await read(featurePath("layouts", "UserSkeletonLayout.tsx"));
      expect(skeleton).toContain("export const UserSkeletonLayout");
      expect(skeleton).toContain('aria-busy="true"');
    });

    test("should create the layout in the feature layouts folder using PascalCase", async () => {
      await command.run({ name: "User", module: "spa" });

      const layoutPath = featurePath("layouts", "UserLayout.tsx");
      expect(existsSync(layoutPath)).toBe(true);

      const content = await read(layoutPath);
      expect(content).toContain("export const UserLayout");
      expect(content).toContain("<Outlet />");
    });

    test("should create a query and a mutation tanstack hook", async () => {
      await command.run({ name: "User", module: "spa" });

      const queryPath = featurePath("hooks", "useGetUser.ts");
      const mutationPath = featurePath("hooks", "useUpdateUser.ts");
      expect(existsSync(queryPath)).toBe(true);
      expect(existsSync(mutationPath)).toBe(true);

      const queryContent = await read(queryPath);
      expect(queryContent).toContain("useQuery");
      expect(queryContent).toContain("export const useGetUser");
      expect(queryContent).toContain("export const userKeys");
      expect(queryContent).toContain("queryFn: ({ signal }) => getUser(id, signal)");

      const mutationContent = await read(mutationPath);
      expect(mutationContent).toContain("useMutation");
      expect(mutationContent).toContain("export const useUpdateUser");
      expect(mutationContent).toContain('import { userKeys, type UserType } from "./useGetUser"');
      expect(mutationContent).toContain("queryClient.setQueryData(userKeys.detail(data.id), data)");
      expect(mutationContent).toContain("return queryClient.invalidateQueries({ queryKey: userKeys.all })");
    });

    test("should normalize the name to PascalCase and kebab-case", async () => {
      await command.run({ name: "user-profile", module: "spa" });

      expect(existsSync(join(testDir, "modules", "spa", "src", "routes", "user-profile.tsx"))).toBe(true);
      expect(
        existsSync(
          join(testDir, "modules", "spa", "src", "features", "user-profile", "layouts", "UserProfileLayout.tsx"),
        ),
      ).toBe(true);
    });

    test("should strip a Feature suffix from the provided name", async () => {
      await command.run({ name: "UserFeature", module: "spa" });

      expect(existsSync(featurePath("layouts", "UserLayout.tsx"))).toBe(true);
    });

    test("should normalize the module name to kebab-case", async () => {
      await command.run({ name: "User", module: "AdminPanel" });

      const routePath = join(testDir, "modules", "admin-panel", "src", "routes", "user.tsx");
      expect(existsSync(routePath)).toBe(true);
    });

    test("should install @tanstack/react-query silently without inheriting output", async () => {
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

      await command.run({ name: "User", module: "spa" });

      expect(installCalls.length).toBeGreaterThan(0);
      expect(installCalls[0]?.cmd).toContain("@tanstack/react-query");
      expect(installCalls[0]?.stderr).toBe("ignore");
    });

    test("should not install @tanstack/react-query when already a dependency", async () => {
      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify({ name: "test", dependencies: { "@tanstack/react-query": "^5.0.0" } }, null, 2),
      );

      const installCalls: string[][] = [];
      Bun.spawn = ((...args: unknown[]) => {
        const cmd = Array.isArray(args[0]) ? (args[0] as string[]) : (args[0] as { cmd?: string[] })?.cmd;
        if (Array.isArray(cmd) && cmd[0] === "bun" && cmd[1] === "add") {
          installCalls.push([...cmd]);
        }
        return { exited: Promise.resolve(0) } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      await command.run({ name: "User", module: "spa" });

      expect(installCalls.length).toBe(0);
    });
  });

  describe("override option", () => {
    beforeEach(async () => {
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }, null, 2));
      process.chdir(testDir);
    });

    test("should not override existing feature when prompt is declined", async () => {
      const layoutPath = join(testDir, "modules", "spa", "src", "features", "user", "layouts", "UserLayout.tsx");
      await Bun.write(layoutPath, "// existing content");

      await command.run({ name: "User", module: "spa" });

      expect(await read(layoutPath)).toBe("// existing content");
    });

    test("should override existing feature when override option is passed", async () => {
      const layoutPath = join(testDir, "modules", "spa", "src", "features", "user", "layouts", "UserLayout.tsx");
      await Bun.write(layoutPath, "// existing content");

      await command.run({ name: "User", module: "spa", override: true });

      const content = await read(layoutPath);
      expect(content).not.toContain("// existing content");
      expect(content).toContain("UserLayout");
    });
  });
});
