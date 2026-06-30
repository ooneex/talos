import { join } from "node:path";
import { Glob } from "bun";
import { generateMigrationVersion } from "./generateMigrationVersion";
import template from "./migration.txt";

export const migrationCreate = async (config?: {
  migrationsDir?: string;
}): Promise<{ migrationPath: string }> => {
  const version = generateMigrationVersion();
  const name = `Migration${version}`;
  const migrationsDir = config?.migrationsDir || "migrations";

  await Bun.write(
    join(process.cwd(), migrationsDir, `${name}.ts`),
    template.replaceAll("{{ name }}", name).replaceAll("{{ version }}", version),
  );

  const imports: string[] = [];
  const glob = new Glob("**/Migration*.ts");
  for await (const file of glob.scan(join(process.cwd(), migrationsDir))) {
    const migrationClassName = file.replace(/\.ts$/, "");
    imports.push(`export { ${migrationClassName} } from './${migrationClassName}';`);
  }

  await Bun.write(join(process.cwd(), migrationsDir, "migrations.ts"), `${imports.sort().join("\n")}\n`);

  return {
    migrationPath: join(migrationsDir, `${name}.ts`),
  };
};
