use crate::utils::{
    DesignWithTargetCreateArgs, add_module_alias_if_present, ask_input, clone_frontend_template,
    collect_modules_by_type, collect_used_ports as collect_used_ports_impl, current_dir,
    ensure_design_module, ensure_shared_placeholder, finalize_module_yml,
    find_free_port as find_free_port_impl, install_frontend_dependencies, normalize_module_name,
    prompt_design_module, prompt_target_module, rewrite_frontend_package, rewrite_module_imports,
    rewrite_vite_alias, visit_files_recursive as visit_files_recursive_impl,
};
pub use crate::utils::{with_design_field, with_target_field};

pub type SpaCreateArgs = DesignWithTargetCreateArgs;

pub const DEFAULT_PORT: u16 = 3030;

pub fn collect_target_modules(modules_dir: &std::path::Path) -> Vec<String> {
    collect_modules_by_type(modules_dir, &["api", "microservice"])
}

pub fn collect_design_modules(modules_dir: &std::path::Path) -> Vec<String> {
    collect_modules_by_type(modules_dir, &["design"])
}

pub fn collect_used_ports(modules_dir: &std::path::Path) -> std::collections::BTreeSet<u16> {
    collect_used_ports_impl(modules_dir)
}

pub fn find_free_port(used_ports: &std::collections::BTreeSet<u16>) -> u16 {
    find_free_port_impl(DEFAULT_PORT, used_ports)
}

pub fn visit_files_recursive(dir: &std::path::Path, callback: &mut impl FnMut(&std::path::Path)) {
    visit_files_recursive_impl(dir, callback);
}

pub fn run(args: &SpaCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;
    let name = args
        .name
        .clone()
        .or_else(|| ask_input("Enter spa name"))
        .unwrap_or_default();
    if name.is_empty() {
        return;
    }

    let kebab_name = normalize_module_name(&name);
    let module_dir = cwd.join("modules").join(&kebab_name);
    let src_dir = module_dir.join("src");
    let modules_dir = cwd.join("modules");

    let design = prompt_design_module(&modules_dir, args.design.clone(), silent);
    let design_kebab = design.as_deref().map(normalize_module_name);
    let target = prompt_target_module(&modules_dir, args.target.clone(), silent);
    let target_kebab = target.as_deref().map(normalize_module_name);

    if let Err(error) = clone_frontend_template("spa", &module_dir, args.no_cache) {
        crate::utils::error(error);
        return;
    }

    finalize_module_yml(
        &module_dir,
        "spa",
        &kebab_name,
        design_kebab.as_deref(),
        target_kebab.as_deref(),
    );

    let port = find_free_port_impl(DEFAULT_PORT, &collect_used_ports_impl(&modules_dir));
    let package_path = module_dir.join("package.json");
    let (deps, dev_deps) = rewrite_frontend_package(&package_path, &kebab_name, port);

    rewrite_module_imports(&src_dir, "spa", &kebab_name);
    rewrite_vite_alias(&module_dir.join("vite.config.ts"), design_kebab.as_deref());
    ensure_shared_placeholder(&src_dir);

    if !install_frontend_dependencies(&cwd, "spa", &deps, &dev_deps, silent) {
        return;
    }

    ensure_design_module(
        &cwd,
        &modules_dir,
        design.as_deref(),
        design_kebab.as_deref(),
        silent,
        args.no_cache,
    );
    add_module_alias_if_present(&cwd, &kebab_name);

    if !silent {
        crate::utils::success(format!("modules/{kebab_name} created successfully"));
    }
}
