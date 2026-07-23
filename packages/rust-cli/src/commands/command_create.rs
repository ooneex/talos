use clap::Args;

use crate::utils::{
    ask_confirm, ask_input, current_dir, ensure_module, to_kebab_case, to_pascal_case,
    write_export_index,
};

const COMMAND_TEMPLATE: &str = include_str!("../templates/command/command.txt");
const COMMAND_TEST_TEMPLATE: &str = include_str!("../templates/command/command.test.txt");
const COMMAND_RUN_TEMPLATE: &str = include_str!("../templates/module/command.run.txt");

/// Rust port of `packages/cli/src/commands/CommandCreateCommand.ts`.
#[derive(Args, Debug)]
pub struct CommandCreateArgs {
    /// Command class name.
    #[arg(long)]
    pub name: Option<String>,

    /// Destination module (defaults to "shared").
    #[arg(long)]
    pub module: Option<String>,

    /// Overwrite the file if it already exists without prompting.
    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    /// Working directory (defaults to the current directory).
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &CommandCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter command name") {
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
    let command_dir = base.join("src").join("commands");
    let tests_dir = base.join("tests").join("commands");

    let class_name = to_pascal_case(&name)
        .strip_suffix("Command")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
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
    let content = COMMAND_TEMPLATE
        .replace("{{NAME}}", &class_name)
        .replace("{{COMMAND_NAME}}", &command_name)
        .replace(
            "{{COMMAND_DESCRIPTION}}",
            &format!("Execute {command_name} command"),
        );
    let test_content = COMMAND_TEST_TEMPLATE
        .replace("{{NAME}}", &class_name)
        .replace("{{MODULE}}", &to_kebab_case(&module));

    if let Err(error) = std::fs::create_dir_all(&command_dir) {
        crate::utils::error(format!(
            "Failed to create {}: {error}",
            command_dir.display()
        ));
        return;
    }
    let _ = std::fs::create_dir_all(&tests_dir);

    let test_path = tests_dir.join(format!("{class_name}Command.spec.ts"));

    if let Err(error) = std::fs::write(&command_file_path, content) {
        crate::utils::error(format!(
            "Failed to write {}: {error}",
            command_file_path.display()
        ));
        return;
    }
    if let Err(error) = std::fs::write(&test_path, test_content) {
        crate::utils::error(format!("Failed to write {}: {error}", test_path.display()));
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

    // Create bin/command/run.ts if it doesn't exist yet.
    let bin_run_path = base.join("bin").join("command").join("run.ts");
    if !bin_run_path.exists() {
        if let Some(parent) = bin_run_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(
            &bin_run_path,
            COMMAND_RUN_TEMPLATE.replace("{{name}}", &module),
        );
    }

    crate::utils::success(format!(
        "{} created successfully",
        command_file_path.display()
    ));
    crate::utils::success(format!("{} created successfully", test_path.display()));
}
