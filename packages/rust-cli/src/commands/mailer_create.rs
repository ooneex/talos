use clap::Args;

use crate::utils::{
    ask_confirm, ask_input, current_dir, ensure_module, install_dependency, to_pascal_case,
};

const MAILER_TEMPLATE: &str = include_str!("../templates/mailer/mailer.txt");
const MAILER_TEST_TEMPLATE: &str = include_str!("../templates/mailer/mailer.test.txt");
const MAILER_TEMPLATE_TEMPLATE: &str = include_str!("../templates/mailer/mailer-template.txt");
const MAILER_TEMPLATE_TEST_TEMPLATE: &str =
    include_str!("../templates/mailer/mailer-template.test.txt");

#[derive(Args, Debug)]
pub struct MailerCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long, default_value_t = false)]
    pub r#override: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &MailerCreateArgs) {
    let name = match args.name.clone() {
        Some(name) => name,
        None => match ask_input("Enter mailer name") {
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
        .strip_suffix("Mailer")
        .map(str::to_string)
        .unwrap_or(name);

    let mailer_content = MAILER_TEMPLATE.replace("{{NAME}}", &name);
    let template_content = MAILER_TEMPLATE_TEMPLATE.replace("{{NAME}}", &name);

    ensure_module(&module, &cwd);

    let base = cwd.join("modules").join(&module);
    let mailer_dir = base.join("src").join("mailers");
    let mailer_file_path = mailer_dir.join(format!("{name}Mailer.ts"));
    let template_file_path = mailer_dir.join(format!("{name}MailerTemplate.tsx"));

    if !args.r#override
        && mailer_file_path.exists()
        && !ask_confirm(
            &format!("Mailer \"{name}Mailer\" already exists. Override it?"),
            false,
        )
    {
        return;
    }

    let mailer_test_content = MAILER_TEST_TEMPLATE
        .replace("{{NAME}}", &name)
        .replace("{{MODULE}}", &module);
    let template_test_content = MAILER_TEMPLATE_TEST_TEMPLATE
        .replace("{{NAME}}", &name)
        .replace("{{MODULE}}", &module);
    let tests_dir = base.join("tests").join("mailers");
    let mailer_test_file_path = tests_dir.join(format!("{name}Mailer.spec.ts"));
    let template_test_file_path = tests_dir.join(format!("{name}MailerTemplate.spec.ts"));

    if let Err(error) = std::fs::create_dir_all(&mailer_dir) {
        crate::utils::error(format!(
            "Failed to create {}: {error}",
            mailer_dir.display()
        ));
        return;
    }
    let _ = std::fs::create_dir_all(&tests_dir);

    for (path, content) in [
        (&mailer_file_path, mailer_content.as_str()),
        (&template_file_path, template_content.as_str()),
        (&mailer_test_file_path, mailer_test_content.as_str()),
        (&template_test_file_path, template_test_content.as_str()),
    ] {
        if let Err(error) = std::fs::write(path, content) {
            crate::utils::error(format!("Failed to write {}: {error}", path.display()));
            return;
        }
    }

    crate::utils::success(format!(
        "{} created successfully",
        mailer_file_path.display()
    ));
    crate::utils::success(format!(
        "{} created successfully",
        template_file_path.display()
    ));
    crate::utils::success(format!(
        "{} created successfully",
        mailer_test_file_path.display()
    ));
    crate::utils::success(format!(
        "{} created successfully",
        template_test_file_path.display()
    ));

    install_dependency("@talosjs/mailer", &cwd);
}
