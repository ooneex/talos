use clap::{Args, ValueEnum};

use crate::utils::{
    ask_confirm, ask_input, ask_select, current_dir, ensure_module, install_dependency,
    read_template, skeleton_templates_dir, to_pascal_case,
};

/// Database adapter kind a `database:create` can scaffold.
#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum DatabaseType {
    Postgres,
    Sqlite,
    Redis,
}

const DATABASE_TYPES: &[DatabaseType] = &[
    DatabaseType::Postgres,
    DatabaseType::Sqlite,
    DatabaseType::Redis,
];

impl DatabaseType {
    fn slug(self) -> &'static str {
        match self {
            Self::Postgres => "postgres",
            Self::Sqlite => "sqlite",
            Self::Redis => "redis",
        }
    }
}

#[derive(Args, Debug)]
pub struct DatabaseCreateArgs {
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

    #[arg(long, value_enum, help = "Database type: postgres, sqlite or redis")]
    pub r#type: Option<DatabaseType>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

fn normalize_database_name(name: &str) -> String {
    let name = to_pascal_case(name);
    name.strip_suffix("DatabaseAdapter")
        .or_else(|| name.strip_suffix("Database"))
        .map(str::to_string)
        .unwrap_or(name)
}

fn template_files(db_type: DatabaseType) -> (&'static str, &'static str) {
    match db_type {
        DatabaseType::Postgres => ("database.pg.txt", "database.test.txt"),
        DatabaseType::Redis => ("database.redis.txt", "database.redis.test.txt"),
        DatabaseType::Sqlite => ("database.sqlite.txt", "database.test.txt"),
    }
}

fn write_database_files(
    database_dir: &std::path::Path,
    tests_dir: &std::path::Path,
    file_path: &std::path::Path,
    test_file_path: &std::path::Path,
    content: &str,
    test_content: &str,
) -> bool {
    if let Err(error) = std::fs::create_dir_all(database_dir) {
        crate::utils::error(format!(
            "Failed to create {}: {error}",
            database_dir.display()
        ));
        return false;
    }
    let _ = std::fs::create_dir_all(tests_dir);
    if let Err(error) = std::fs::write(file_path, content) {
        crate::utils::error(format!("Failed to write {}: {error}", file_path.display()));
        return false;
    }
    if let Err(error) = std::fs::write(test_file_path, test_content) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            test_file_path.display()
        ));
        return false;
    }
    true
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

    let name = normalize_database_name(&name);

    let db_type = match args.r#type {
        Some(db_type) => db_type,
        None => {
            let labels: Vec<&str> = DATABASE_TYPES.iter().map(|kind| kind.slug()).collect();
            match ask_select("Select database type", &labels) {
                Some(index) => DATABASE_TYPES[index],
                None => return,
            }
        }
    };

    let Some(templates_dir) = skeleton_templates_dir(false, !args.no_cache) else {
        return;
    };
    let (template_file, test_file) = template_files(db_type);
    let Some(template) = read_template(&templates_dir, template_file) else {
        return;
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

    let Some(test_template) = read_template(&templates_dir, test_file) else {
        return;
    };
    let test_content = test_template
        .replace("{{NAME}}", &name)
        .replace("{{MODULE}}", &module);
    let tests_dir = base.join("tests").join("databases");
    let test_file_path = tests_dir.join(format!("{name}Database.spec.ts"));
    if !write_database_files(
        &database_dir,
        &tests_dir,
        &file_path,
        &test_file_path,
        &content,
        &test_content,
    ) {
        return;
    }

    crate::utils::success(format!("{} created successfully", file_path.display()));
    crate::utils::success(format!("{} created successfully", test_file_path.display()));

    install_dependency("@talosjs/database", &cwd);
}
