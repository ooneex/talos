import { join } from "node:path";
import { Glob } from "bun";
import { generateMigrationVersion } from "./generateMigrationVersion";

const migrationTemplate = `import { decorator, type IMigration, type MigrationClassType } from '@talosjs/migrations';
import type { TransactionSQL } from 'bun';

@decorator.migration()
export class {{ name }} implements IMigration {
  public async up(tx: TransactionSQL): Promise<void> {
    // await tx\`...\`;
  }

  public async down(tx: TransactionSQL): Promise<void> {
    // await tx\`...\`;
  }

  public getVersion(): string {
    return '{{ version }}';
  }

  public getDependencies(): MigrationClassType[] {
    return [];
  }
}
`;

export const migrationCreate = async (config?: { migrationsDir?: string }): Promise<{ migrationPath: string }> => {
  const version = generateMigrationVersion();
  const name = `Migration${version}`;
  const migrationsDir = config?.migrationsDir || "migrations";

  await Bun.write(
    join(process.cwd(), migrationsDir, `${name}.ts`),
    migrationTemplate.replaceAll("{{ name }}", name).replaceAll("{{ version }}", version),
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
