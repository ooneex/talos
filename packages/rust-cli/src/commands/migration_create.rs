use clap::Args;

use crate::utils::{current_dir, ensure_module, generate_migration_version, write_export_index};

const MIGRATION_TEMPLATE: &str = include_str!("../templates/migrations/migration.txt");
const MIGRATION_UP_TEMPLATE: &str = include_str!("../templates/module/migration.up.txt");
const MIGRATION_DOWN_TEMPLATE: &str = include_str!("../templates/module/migration.down.txt");

/// Rust port of `packages/cli/src/commands/MigrationCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct MigrationCreateArgs {
    /// Destination module (defaults to "shared").
    #[arg(long)]
    pub module: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &MigrationCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let module = args.module.clone().unwrap_or_else(|| "shared".to_string());

    ensure_module(&module, &cwd);

    let base = cwd.join("modules").join(&module);
    let migrations_dir = base.join("src").join("migrations");

    let version = generate_migration_version();
    let name = format!("Migration{version}");

    let content = MIGRATION_TEMPLATE
        .replace("{{ name }}", &name)
        .replace("{{ version }}", &version);

    if let Err(error) = std::fs::create_dir_all(&migrations_dir) {
        eprintln!("✖ Failed to create {}: {error}", migrations_dir.display());
        return;
    }
    let file_path = migrations_dir.join(format!("{name}.ts"));
    if let Err(error) = std::fs::write(&file_path, content) {
        eprintln!("✖ Failed to write {}: {error}", file_path.display());
        return;
    }

    if let Err(error) = write_export_index(&migrations_dir, "migrations.ts", |class_name| {
        class_name.starts_with("Migration")
    }) {
        eprintln!(
            "✖ Failed to write {}: {error}",
            migrations_dir.join("migrations.ts").display()
        );
        return;
    }

    // Create bin/migration/up.ts and bin/migration/down.ts if they don't exist yet.
    let bin_dir = base.join("bin").join("migration");
    let up_path = bin_dir.join("up.ts");
    let down_path = bin_dir.join("down.ts");
    if !up_path.exists() || !down_path.exists() {
        let _ = std::fs::create_dir_all(&bin_dir);
    }
    if !up_path.exists() {
        let _ = std::fs::write(&up_path, MIGRATION_UP_TEMPLATE.replace("{{name}}", &module));
    }
    if !down_path.exists() {
        let _ = std::fs::write(
            &down_path,
            MIGRATION_DOWN_TEMPLATE.replace("{{name}}", &module),
        );
    }

    println!("✔ {} created successfully", file_path.display());
}
