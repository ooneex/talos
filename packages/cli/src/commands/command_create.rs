use clap::Args;

use crate::utils::{
    ask_confirm, ask_input, read_template, resolve_scaffold_module, skeleton_templates_dir,
    to_kebab_case, to_pascal_case, write_export_index,
};

#[derive(Args, Debug)]
pub struct CommandCreateArgs {
    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton cache and re-download templates (the cache otherwise auto-refreshes after 24h)"
    )]
    pub no_cache: bool,

    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

struct CommandTemplates {
    command: String,
    test: String,
    run: String,
}

fn class_name(name: &str) -> String {
    to_pascal_case(name)
        .strip_suffix("Command")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(name))
}

fn ensure_command_files(
    command_dir: &std::path::Path,
    tests_dir: &std::path::Path,
    command_file_path: &std::path::Path,
    test_path: &std::path::Path,
    content: &str,
    test_content: &str,
) -> bool {
    if let Err(error) = std::fs::create_dir_all(command_dir) {
        crate::utils::error(format!(
            "Failed to create {}: {error}",
            command_dir.display()
        ));
        return false;
    }
    let _ = std::fs::create_dir_all(tests_dir);
    if let Err(error) = std::fs::write(command_file_path, content) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            command_file_path.display()
        ));
        return false;
    }
    if let Err(error) = std::fs::write(test_path, test_content) {
        crate::utils::error(format!("Failed to write {}: {error}", test_path.display()));
        return false;
    }
    true
}

fn ensure_command_runner(base: &std::path::Path, module: &str, template: &str) {
    let bin_run_path = base.join("bin").join("command").join("run.ts");
    if !bin_run_path.exists() {
        if let Some(parent) = bin_run_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&bin_run_path, template.replace("{{name}}", module));
    }
}

fn load_templates(no_cache: bool) -> Option<CommandTemplates> {
    let templates_dir = skeleton_templates_dir(false, !no_cache)?;
    Some(CommandTemplates {
        command: read_template(&templates_dir, "command/command.txt")?,
        test: read_template(&templates_dir, "command/command.test.txt")?,
        run: read_template(&templates_dir, "module/command.run.txt")?,
    })
}

fn resolve_name(name: Option<String>) -> Option<String> {
    name.or_else(|| ask_input("Enter command name"))
}

pub fn run(args: &CommandCreateArgs) {
    let Some(name) = resolve_name(args.name.clone()) else {
        return;
    };
    let (cwd, module) = resolve_scaffold_module(args.cwd.clone(), args.module.clone());

    let Some(templates) = load_templates(args.no_cache) else {
        return;
    };

    let base = cwd.join("modules").join(&module);
    let command_dir = base.join("src").join("commands");
    let tests_dir = base.join("tests").join("commands");

    let class_name = class_name(&name);
    let command_file_path = command_dir.join(format!("{class_name}Command.ts"));

    if !args.r#override
        && command_file_path.exists()
        && !ask_confirm(
            &format!("Command \"{class_name}Command\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    let command_name = to_kebab_case(&class_name).replace('-', ":");
    let content = templates
        .command
        .replace("{{NAME}}", &class_name)
        .replace("{{COMMAND_NAME}}", &command_name)
        .replace(
            "{{COMMAND_DESCRIPTION}}",
            &format!("Execute {command_name} command"),
        );
    let test_content = templates
        .test
        .replace("{{NAME}}", &class_name)
        .replace("{{MODULE}}", &to_kebab_case(&module));

    let test_path = tests_dir.join(format!("{class_name}Command.spec.ts"));
    if !ensure_command_files(
        &command_dir,
        &tests_dir,
        &command_file_path,
        &test_path,
        &content,
        &test_content,
    ) {
        return;
    }

    if let Err(error) = write_export_index(&command_dir, "commands.ts", |class_name| {
        class_name.ends_with("Command")
    }) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            command_dir.join("commands.ts").display()
        ));
        return;
    }

    ensure_command_runner(&base, &module, &templates.run);

    crate::utils::success(format!(
        "{} created successfully",
        command_file_path.display()
    ));
    crate::utils::success(format!("{} created successfully", test_path.display()));
}
