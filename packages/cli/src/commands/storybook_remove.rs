use clap::Args;

use crate::utils::{
    ask_input, ensure_expected_type, ensure_removable, remove_standard_module_references,
    resolve_cwd, resolve_module_identity,
};

#[derive(Args, Debug)]
pub struct StorybookRemoveArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

pub fn run(args: &StorybookRemoveArgs) {
    let name = args
        .name
        .clone()
        .or_else(|| ask_input("Enter storybook name to remove"))
        .unwrap_or_default();
    if name.is_empty() {
        return;
    }

    let cwd = resolve_cwd(args.cwd.as_deref());
    let identity = resolve_module_identity(&cwd, &name);
    if !ensure_removable(&identity, "Storybook", args.silent)
        || !ensure_expected_type(&identity, "storybook", "storybook module", args.silent)
        || !crate::utils::confirm_removal(&identity.kebab_name, "storybook", args.silent)
    {
        return;
    }

    remove_standard_module_references(&cwd, &identity.pascal_name, &identity.kebab_name);
    let _ = std::fs::remove_dir_all(&identity.module_dir);

    if !args.silent {
        crate::utils::success(format!(
            "modules/{} removed successfully",
            identity.kebab_name
        ));
    }
}
