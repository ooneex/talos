use clap::Args;

use crate::utils::{
    ask_input, read_template, resolve_scaffold_module, skeleton_templates_dir, to_kebab_case,
    to_pascal_case, write_export_index,
};

#[derive(Args, Debug)]
pub struct SeedCreateArgs {
    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton template cache and re-download templates (auto-refreshes after 24h); does not update the installed talos CLI binary itself — rerun the install script for that"
    )]
    pub no_cache: bool,

    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

struct SeedTemplates {
    seed: String,
    test: String,
    run: String,
}

fn seed_names(name: &str) -> (String, String) {
    let class_name = to_pascal_case(name)
        .strip_suffix("Seed")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(name));
    let seed_name = format!("{class_name}Seed");
    (seed_name.clone(), to_kebab_case(&seed_name))
}

fn ensure_seed_runner(base: &std::path::Path, module: &str, template: &str) {
    let bin_run_path = base.join("bin").join("seed").join("run.ts");
    if !bin_run_path.exists() {
        if let Some(parent) = bin_run_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&bin_run_path, template.replace("{{name}}", module));
    }
}

fn load_templates(no_cache: bool) -> Option<SeedTemplates> {
    let templates_dir = skeleton_templates_dir(false, !no_cache)?;
    Some(SeedTemplates {
        seed: read_template(&templates_dir, "seeds/seed.txt")?,
        test: read_template(&templates_dir, "seeds/seed.test.txt")?,
        run: read_template(&templates_dir, "module/seed.run.txt")?,
    })
}

fn resolve_name(name: Option<String>) -> Option<String> {
    name.or_else(|| ask_input("Enter seed name"))
}

pub fn run(args: &SeedCreateArgs) {
    let Some(name) = resolve_name(args.name.clone()) else {
        return;
    };
    let (cwd, module) = resolve_scaffold_module(args.cwd.clone(), args.module.clone());

    let Some(templates) = load_templates(args.no_cache) else {
        return;
    };

    let base = cwd.join("modules").join(&module);
    let seeds_dir = base.join("src").join("seeds");
    let tests_dir = base.join("tests").join("seeds");

    let (seed_name, data_file) = seed_names(&name);
    let class_name = seed_name.trim_end_matches("Seed");

    let seed_content = templates
        .seed
        .replace("{{ name }}", &seed_name)
        .replace("{{ dataFile }}", &data_file);
    let data_content = "# Seed data\n";
    let test_content = templates
        .test
        .replace("{{NAME}}", class_name)
        .replace("{{DATA_FILE}}", &data_file)
        .replace("{{MODULE}}", &module);

    if let Err(error) = std::fs::create_dir_all(&seeds_dir) {
        crate::utils::error(format!("Failed to create {}: {error}", seeds_dir.display()));
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
        crate::utils::error(format!("Failed to write {}: {error}", seed_path.display()));
        return;
    }
    if let Err(error) = std::fs::write(&data_path, data_content) {
        crate::utils::error(format!("Failed to write {}: {error}", data_path.display()));
        return;
    }
    if let Err(error) = std::fs::write(&test_path, test_content) {
        crate::utils::error(format!("Failed to write {}: {error}", test_path.display()));
        return;
    }

    if let Err(error) = write_export_index(&seeds_dir, "seeds.ts", |class_name| {
        class_name.ends_with("Seed")
    }) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            seeds_dir.join("seeds.ts").display()
        ));
        return;
    }

    ensure_seed_runner(&base, &module, &templates.run);

    crate::utils::success(format!("{} created successfully", seed_path.display()));
    crate::utils::success(format!("{} created successfully", data_path.display()));
    crate::utils::success(format!("{} created successfully", test_path.display()));
}
