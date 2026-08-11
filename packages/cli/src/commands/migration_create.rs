use clap::Args;

use crate::utils::{
    current_dir, ensure_module, generate_migration_version, read_template, skeleton_templates_dir,
    write_export_index,
};

#[derive(Args, Debug)]
pub struct MigrationCreateArgs {
    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton template cache and re-download templates (auto-refreshes after 24h); does not update the installed talos CLI binary itself — rerun the install script for that"
    )]
    pub no_cache: bool,

    #[arg(long)]
    pub module: Option<String>,

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

    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let Some(migration_template) = read_template(&templates_dir, "migrations/migration.txt") else {
        return;
    };
    let Some(migration_up_template) = read_template(&templates_dir, "module/migration.up.txt")
    else {
        return;
    };
    let Some(migration_down_template) = read_template(&templates_dir, "module/migration.down.txt")
    else {
        return;
    };

    let base = cwd.join("modules").join(&module);
    let migrations_dir = base.join("src").join("migrations");

    let version = generate_migration_version();
    let name = format!("Migration{version}");

    let content = migration_template
        .replace("{{ name }}", &name)
        .replace("{{ version }}", &version);

    if let Err(error) = std::fs::create_dir_all(&migrations_dir) {
        crate::utils::error(format!(
            "Failed to create {}: {error}",
            migrations_dir.display()
        ));
        return;
    }
    let file_path = migrations_dir.join(format!("{name}.ts"));
    if let Err(error) = std::fs::write(&file_path, content) {
        crate::utils::error(format!("Failed to write {}: {error}", file_path.display()));
        return;
    }

    if let Err(error) = write_export_index(&migrations_dir, "migrations.ts", |class_name| {
        class_name.starts_with("Migration")
    }) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            migrations_dir.join("migrations.ts").display()
        ));
        return;
    }

    let bin_dir = base.join("bin").join("migration");
    let up_path = bin_dir.join("up.ts");
    let down_path = bin_dir.join("down.ts");
    if !up_path.exists() || !down_path.exists() {
        let _ = std::fs::create_dir_all(&bin_dir);
    }
    if !up_path.exists() {
        let _ = std::fs::write(&up_path, migration_up_template.replace("{{name}}", &module));
    }
    if !down_path.exists() {
        let _ = std::fs::write(
            &down_path,
            migration_down_template.replace("{{name}}", &module),
        );
    }

    crate::utils::success(format!("{} created successfully", file_path.display()));
}
