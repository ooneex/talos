use std::fs;
use std::path::PathBuf;
use std::process::Command;

use clap::Args;

mod controller;

pub use controller::{
    ControllerDefinition, build_api_entry, build_definition_entry, build_module_file,
    collect_controller_files, extract_existing_keys, match_balanced, merge_module_file,
    parse_controller, read_module_type, to_camel_case,
};

use crate::commands::module_create::{self, ModuleCreateOptions};
use crate::utils::{
    current_dir, remove_from_app_module, remove_from_shared_module, run_spinner_step,
    to_kebab_case, to_pascal_case,
};

#[derive(Args, Debug)]
pub struct SdkCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(long, default_value_t = false)]
    pub no_cache: bool,
}

const BUNUP_CONFIG: &str = r#"import { defineConfig } from \"bunup\";

export default defineConfig({
  target: \"browser\",
  format: [\"esm\"],
  drop: [\"console\", \"debugger\"],
  packages: \"external\",
  sourcemap: \"external\",
  unused: {
    level: \"error\",
  },
  exports: true,
  minify: false,
  dts: {
    minify: false,
  },
});
"#;

/// Scaffolds the empty SDK module (via `module_create`), removes it from
/// the app/shared registrations it doesn't need, tags its `.yml` as an SDK
/// targeting `target_module`, renames its `package.json`, and writes the
/// shared `bunup.config.ts`.
fn scaffold_sdk_module(
    cwd: &std::path::Path,
    modules_dir: &std::path::Path,
    sdk_name: &str,
    target_module: &str,
    no_cache: bool,
) {
    module_create::execute(ModuleCreateOptions {
        name: sdk_name.to_string(),
        destination: None,
        cwd: cwd.to_path_buf(),
        silent: true,
        no_cache,
    });
    let pascal_name = to_pascal_case(sdk_name);
    let _ = remove_from_app_module(
        &cwd.join("modules")
            .join("app")
            .join("src")
            .join("AppModule.ts"),
        &pascal_name,
        sdk_name,
    );
    let _ = remove_from_shared_module(
        &cwd.join("modules")
            .join("shared")
            .join("src")
            .join("SharedModule.ts"),
        &pascal_name,
        sdk_name,
    );

    let sdk_dir = modules_dir.join(sdk_name);
    let yml_path = sdk_dir.join(format!("{sdk_name}.yml"));
    if let Ok(yml_content) = fs::read_to_string(&yml_path) {
        let _ = fs::write(
            &yml_path,
            yml_content.replace(
                "type: \"module\"",
                &format!("type: \"sdk\"\ntarget: \"{target_module}\""),
            ),
        );
    }

    let root_package_name = fs::read_to_string(cwd.join("package.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|pkg| pkg.get("name").and_then(|v| v.as_str()).map(str::to_string))
        .unwrap_or_else(|| "app".to_string());
    let scope = to_kebab_case(&root_package_name);
    let sdk_package_json_path = sdk_dir.join("package.json");
    if let Ok(raw) = fs::read_to_string(&sdk_package_json_path)
        && let Ok(mut package_json) = serde_json::from_str::<serde_json::Value>(&raw)
        && let Some(root) = package_json.as_object_mut()
    {
        root.insert(
            "name".to_string(),
            serde_json::Value::String(format!("@{scope}/{sdk_name}")),
        );
        let _ = fs::write(
            &sdk_package_json_path,
            format!(
                "{}\n",
                serde_json::to_string_pretty(&package_json).unwrap_or_default()
            ),
        );
    }
    let _ = fs::write(sdk_dir.join("bunup.config.ts"), BUNUP_CONFIG);
}

/// Parses every eligible module's controllers into SDK client files under
/// `sdk_src_dir`, merging with any file already generated there. Returns the
/// `(module_kebab, const_name)` pairs written so the index can import them.
fn generate_sdk_modules(
    modules_dir: &std::path::Path,
    sdk_src_dir: &std::path::Path,
    sdk_name: &str,
    target_module: &str,
    is_api_target: bool,
) -> Vec<(String, String)> {
    let mut generated = Vec::new();
    let Ok(entries) = fs::read_dir(modules_dir) else {
        return generated;
    };
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let module_kebab = entry.file_name().to_string_lossy().to_string();
        if module_kebab == sdk_name {
            continue;
        }
        if is_api_target {
            let ty = read_module_type(modules_dir, &module_kebab);
            if ty != "module" && ty != "api" {
                continue;
            }
        } else if module_kebab != target_module {
            continue;
        }
        let controllers_dir = entry.path().join("src").join("controllers");
        let mut controller_files = Vec::new();
        collect_controller_files(&controllers_dir, &mut controller_files);
        if controller_files.is_empty() {
            continue;
        }
        let mut definitions = Vec::new();
        for file in controller_files {
            if let Ok(content) = fs::read_to_string(file)
                && let Some(definition) = parse_controller(&content, &module_kebab)
            {
                definitions.push(definition);
            }
        }
        if definitions.is_empty() {
            continue;
        }
        let const_name = to_camel_case(&module_kebab);
        let sdk_file_path = sdk_src_dir.join(format!("{module_kebab}.ts"));
        if let Ok(existing_content) = fs::read_to_string(&sdk_file_path) {
            let existing_keys = extract_existing_keys(&existing_content);
            let new_defs = definitions
                .into_iter()
                .filter(|def| !existing_keys.contains(&def.key))
                .collect::<Vec<_>>();
            if !new_defs.is_empty() {
                let _ = fs::write(
                    &sdk_file_path,
                    merge_module_file(&existing_content, &new_defs),
                );
            }
        } else {
            let _ = fs::write(&sdk_file_path, build_module_file(&const_name, &definitions));
        }
        generated.push((module_kebab, const_name));
    }
    generated
}

/// Writes the SDK's `index.ts`, importing and re-exporting each generated
/// module's const under `export const sdk = { ... }`.
fn write_sdk_index(sdk_src_dir: &std::path::Path, generated: &[(String, String)]) {
    let imports = generated
        .iter()
        .map(|(kebab, const_name)| format!("import {{ {const_name} }} from \"./{kebab}\";"))
        .collect::<Vec<_>>()
        .join("\n");
    let members = generated
        .iter()
        .map(|(_, const_name)| format!("  {const_name},"))
        .collect::<Vec<_>>()
        .join("\n");
    let index_content = format!(
        "{}{}export const sdk = {{\n{}\n}};\n",
        imports,
        if imports.is_empty() { "" } else { "\n\n" },
        members
    );
    let _ = fs::write(sdk_src_dir.join("index.ts"), index_content);
}

/// Installs the SDK's runtime and build dependencies. Returns `false` when
/// either install step failed.
fn install_sdk_dependencies(sdk_dir: &std::path::Path, silent: bool) -> bool {
    if !run_spinner_step(
        silent,
        "Installing dependencies",
        Command::new("bun")
            .args([
                "add",
                "@talosjs/fetcher",
                "@talosjs/http-response",
                "@talosjs/socket-client",
            ])
            .current_dir(sdk_dir),
    ) {
        return false;
    }
    run_spinner_step(
        silent,
        "Installing bunup",
        Command::new("bun")
            .args(["add", "-D", "bunup"])
            .current_dir(sdk_dir),
    )
}

pub fn run(args: &SdkCreateArgs) {
    let name = args.name.clone().unwrap_or_else(|| "sdk".to_string());
    let module = args.module.clone().unwrap_or_else(|| "app".to_string());
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;

    let pascal_name = to_pascal_case(&name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let sdk_name = to_kebab_case(&pascal_name);
    let modules_dir = cwd.join("modules");
    let target_module = to_kebab_case(&module);
    let target_type = read_module_type(&modules_dir, &target_module);
    let is_api_target = target_type == "api";

    scaffold_sdk_module(&cwd, &modules_dir, &sdk_name, &target_module, args.no_cache);

    let sdk_dir = modules_dir.join(&sdk_name);
    let sdk_src_dir = sdk_dir.join("src");
    let generated = generate_sdk_modules(
        &modules_dir,
        &sdk_src_dir,
        &sdk_name,
        &target_module,
        is_api_target,
    );

    write_sdk_index(&sdk_src_dir, &generated);

    if !install_sdk_dependencies(&sdk_dir, silent) {
        return;
    }

    if !silent {
        crate::utils::success(format!(
            "modules/{sdk_name} generated with {} module(s)",
            generated.len()
        ));
    }
}
