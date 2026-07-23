use clap::Args;

use crate::utils::{
    ask_input, current_dir, ensure_module, to_kebab_case, to_pascal_case, write_export_index,
};

const SEED_TEMPLATE: &str = include_str!("../templates/seeds/seed.txt");
const SEED_TEST_TEMPLATE: &str = include_str!("../templates/seeds/seed.test.txt");
const SEED_RUN_TEMPLATE: &str = include_str!("../templates/module/seed.run.txt");

/// Rust port of `packages/cli/src/commands/SeedCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct SeedCreateArgs {
    /// Seed name.
    #[arg(long)]
    pub name: Option<String>,

    /// Destination module (defaults to "shared").
    #[arg(long)]
    pub module: Option<String>,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &SeedCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter seed name") {
            Some(name) => name,
            None => return,
        },
    };
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let module = args.module.clone().unwrap_or_else(|| "shared".to_string());

    ensure_module(&module, &cwd);

    let base = cwd.join("modules").join(&module);
    let seeds_dir = base.join("src").join("seeds");
    let tests_dir = base.join("tests").join("seeds");

    let class_name = to_pascal_case(&name)
        .strip_suffix("Seed")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let seed_name = format!("{class_name}Seed");
    let data_file = to_kebab_case(&seed_name);

    let seed_content = SEED_TEMPLATE
        .replace("{{ name }}", &seed_name)
        .replace("{{ dataFile }}", &data_file);
    let data_content = "# Seed data\n";
    let test_content = SEED_TEST_TEMPLATE
        .replace("{{NAME}}", &class_name)
        .replace("{{DATA_FILE}}", &data_file)
        .replace("{{MODULE}}", &module);

    if let Err(error) = std::fs::create_dir_all(&seeds_dir) {
        eprintln!("✖ Failed to create {}: {error}", seeds_dir.display());
        return;
    }
    if let Some(parent) = std::path::Path::new(&tests_dir).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::create_dir_all(&tests_dir);

    let seed_path = seeds_dir.join(format!("{seed_name}.ts"));
    let data_path = seeds_dir.join(format!("{data_file}.yml"));
    let test_path = tests_dir.join(format!("{seed_name}.spec.ts"));

    if let Err(error) = std::fs::write(&seed_path, seed_content) {
        eprintln!("✖ Failed to write {}: {error}", seed_path.display());
        return;
    }
    if let Err(error) = std::fs::write(&data_path, data_content) {
        eprintln!("✖ Failed to write {}: {error}", data_path.display());
        return;
    }
    if let Err(error) = std::fs::write(&test_path, test_content) {
        eprintln!("✖ Failed to write {}: {error}", test_path.display());
        return;
    }

    if let Err(error) = write_export_index(&seeds_dir, "seeds.ts", |class_name| {
        class_name.ends_with("Seed")
    }) {
        eprintln!(
            "✖ Failed to write {}: {error}",
            seeds_dir.join("seeds.ts").display()
        );
        return;
    }

    // Create bin/seed/run.ts if it doesn't exist yet.
    let bin_run_path = base.join("bin").join("seed").join("run.ts");
    if !bin_run_path.exists() {
        if let Some(parent) = bin_run_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(
            &bin_run_path,
            SEED_RUN_TEMPLATE.replace("{{name}}", &module),
        );
    }

    println!("✔ {} created successfully", seed_path.display());
    println!("✔ {} created successfully", data_path.display());
    println!("✔ {} created successfully", test_path.display());
}
