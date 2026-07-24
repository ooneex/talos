use clap::Args;

use crate::utils::{
    ask_confirm, ask_input, ask_select, current_dir, ensure_module, install_dependency,
    to_pascal_case,
};

const PG_TEMPLATE: &str = include_str!("../templates/database.pg.txt");
const REDIS_TEMPLATE: &str = include_str!("../templates/database.redis.txt");
const SQLITE_TEMPLATE: &str = include_str!("../templates/database.sqlite.txt");
const TEST_TEMPLATE: &str = include_str!("../templates/database.test.txt");
const REDIS_TEST_TEMPLATE: &str = include_str!("../templates/database.redis.test.txt");

const DATABASE_TYPES: &[&str] = &["postgres", "sqlite", "redis"];

#[derive(Args, Debug)]
pub struct DatabaseCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub r#type: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &DatabaseCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter database name") {
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

    let name = to_pascal_case(&name);
    let name = name
        .strip_suffix("DatabaseAdapter")
        .or_else(|| name.strip_suffix("Database"))
        .map(str::to_string)
        .unwrap_or(name);

    let db_type = match args.r#type.clone() {
        Some(db_type) => db_type,
        None => match ask_select("Select database type", DATABASE_TYPES) {
            Some(index) => DATABASE_TYPES[index].to_string(),
            None => return,
        },
    };

    let template = match db_type.as_str() {
        "postgres" => PG_TEMPLATE,
        "redis" => REDIS_TEMPLATE,
        _ => SQLITE_TEMPLATE,
    };
    let content = template.replace("{{NAME}}", &name);

    ensure_module(&module, &cwd);

    let base = cwd.join("modules").join(&module);
    let database_dir = base.join("src").join("databases");
    let file_path = database_dir.join(format!("{name}Database.ts"));

    if !args.r#override
        && file_path.exists()
        && !ask_confirm(
            &format!("Database \"{name}Database\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    if let Err(error) = std::fs::create_dir_all(&database_dir) {
        crate::utils::error(format!(
            "Failed to create {}: {error}",
            database_dir.display()
        ));
        return;
    }
    if let Err(error) = std::fs::write(&file_path, content) {
        crate::utils::error(format!("Failed to write {}: {error}", file_path.display()));
        return;
    }

    let test_template = if db_type == "redis" {
        REDIS_TEST_TEMPLATE
    } else {
        TEST_TEMPLATE
    };
    let test_content = test_template
        .replace("{{NAME}}", &name)
        .replace("{{MODULE}}", &module);
    let tests_dir = base.join("tests").join("databases");
    let test_file_path = tests_dir.join(format!("{name}Database.spec.ts"));
    let _ = std::fs::create_dir_all(&tests_dir);
    if let Err(error) = std::fs::write(&test_file_path, test_content) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            test_file_path.display()
        ));
        return;
    }

    crate::utils::success(format!("{} created successfully", file_path.display()));
    crate::utils::success(format!("{} created successfully", test_file_path.display()));

    install_dependency("@talosjs/database", &cwd);
}
