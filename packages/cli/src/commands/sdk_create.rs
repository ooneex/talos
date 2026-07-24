use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;

use crate::commands::module_create::{self, ModuleCreateOptions};
use crate::utils::{
    current_dir, remove_from_app_module, remove_from_shared_module, run_spinner_step,
    to_kebab_case, to_pascal_case,
};

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

#[derive(Clone)]
struct ControllerDefinition {
    method: String,
    key: String,
    version: i64,
    description: String,
    roles: Vec<String>,
    path: String,
    is_socket: bool,
    type_name: String,
    type_declaration: String,
}

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
}

fn to_camel_case(value: &str) -> String {
    let mut result = String::new();
    for (index, part) in value
        .split(['-', '.'])
        .filter(|part| !part.is_empty())
        .enumerate()
    {
        if index == 0 {
            result.push_str(&part.to_lowercase());
        } else {
            result.push_str(&to_pascal_case(part));
        }
    }
    result
}

fn match_balanced(text: &str, open_index: usize) -> Option<(String, usize)> {
    let mut depth = 0;
    for (i, ch) in text.char_indices().skip(open_index) {
        if ch == '{' {
            depth += 1;
        }
        if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some((text[open_index + 1..i].to_string(), i));
            }
        }
    }
    None
}

fn read_module_type(modules_dir: &Path, module_kebab: &str) -> String {
    let yml_file = modules_dir
        .join(module_kebab)
        .join(format!("{module_kebab}.yml"));
    fs::read_to_string(yml_file)
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                line.trim()
                    .strip_prefix("type:")
                    .map(|value| value.trim().trim_matches('"').to_string())
            })
        })
        .unwrap_or_else(|| "module".to_string())
}

fn collect_controller_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_controller_files(&path, files);
        } else if path.is_file()
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with("Controller.ts"))
        {
            files.push(path);
        }
    }
}

fn parse_controller(content: &str, module_name: &str) -> Option<ControllerDefinition> {
    let type_match = regex::Regex::new(r"export\s+type\s+(\w+RouteType)\s*=\s*\{")
        .ok()?
        .captures(content)?;
    let decorator_match = regex::Regex::new(r#"@Route\.(\w+)\(\s*"([^"]+)"\s*,\s*\{"#)
        .ok()?
        .captures(content)?;
    let type_name = type_match.get(1)?.as_str().to_string();
    let type_index = type_match.get(0)?.end().saturating_sub(1);
    let (type_body, _) = match_balanced(content, type_index)?;
    let type_declaration = format!("type {type_name} = {{{type_body}}};");
    let method = decorator_match.get(1)?.as_str().to_lowercase();
    let path = decorator_match.get(2)?.as_str().to_string();
    let is_socket = method == "socket";
    let decorator_index = decorator_match.get(0)?.end().saturating_sub(1);
    let (config_body, _) = match_balanced(content, decorator_index)?;
    let key = regex::Regex::new(r#"name\s*:\s*\"([^\"]+)\""#)
        .ok()?
        .captures(&config_body)?
        .get(1)?
        .as_str()
        .to_string();
    let version = regex::Regex::new(r"version\s*:\s*(\d+)")
        .ok()
        .and_then(|re| re.captures(&config_body))
        .and_then(|caps| caps.get(1))
        .and_then(|m| m.as_str().parse::<i64>().ok())
        .unwrap_or(1);
    let description = regex::Regex::new(r#"description\s*:\s*\"([^\"]*)\""#)
        .ok()
        .and_then(|re| re.captures(&config_body))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();
    let roles_raw = regex::Regex::new(r"roles\s*:\s*\[([^\]]*)\]")
        .ok()
        .and_then(|re| re.captures(&config_body))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();
    let roles = roles_raw
        .split(',')
        .map(|role| role.trim().trim_matches(['\"', '\'']))
        .filter(|role| !role.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    let method_key = key
        .strip_prefix(&format!("{module_name}."))
        .unwrap_or(&key)
        .replace('.', "-");
    let method_name = to_camel_case(&method_key);
    Some(ControllerDefinition {
        method: method_name,
        key,
        version,
        description,
        roles,
        path,
        is_socket,
        type_name,
        type_declaration,
    })
}

fn build_api_entry(def: &ControllerDefinition) -> String {
    let bearer_token = if def.roles.is_empty() {
        String::new()
    } else {
        "\n        bearerToken: string;".to_string()
    };
    format!(
        "    {}: (\n      input: {{\n        baseURL: string;\n        params: {}[\"params\"];\n        payload: {}[\"payload\"];\n        queries: {}[\"queries\"];{}\n        onSuccess?: (response: ResponseDataType<{}[\"response\"]>) => void;\n        onMessage?: (response: ResponseDataType<{}[\"response\"]>) => void;\n        onOpen?: (event?: Event) => void;\n        onClose?: (event?: CloseEvent) => void;\n        onError?: (event?: Event, response?: ResponseDataType<{}[\"response\"]>) => void;\n      }},\n    ): Promise<{}[\"response\"]> => {{\n      // TODO: use {} api according to controller definition\n      throw new Error(\"Not implemented\");\n    }},",
        def.method,
        def.type_name,
        def.type_name,
        def.type_name,
        bearer_token,
        def.type_name,
        def.type_name,
        def.type_name,
        def.type_name,
        if def.is_socket { "socket" } else { "fetch" },
    )
}

fn build_definition_entry(def: &ControllerDefinition) -> String {
    let roles = format!(
        "[{}]",
        def.roles
            .iter()
            .map(|role| format!("\"{role}\""))
            .collect::<Vec<_>>()
            .join(", ")
    );
    format!(
        "    {}: {{\n      key: \"{}\",\n      version: {},\n      description: \"{}\",\n      roles: {},\n      endpoint: \"/<prefix>/v{}{}\",\n    }},",
        def.method,
        def.key,
        def.version,
        def.description.replace('"', "\\\""),
        roles,
        def.version,
        def.path,
    )
}

fn build_module_file(const_name: &str, definitions: &[ControllerDefinition]) -> String {
    let types = definitions
        .iter()
        .map(|def| def.type_declaration.clone())
        .collect::<Vec<_>>()
        .join("\n\n");
    let api_entries = definitions
        .iter()
        .map(build_api_entry)
        .collect::<Vec<_>>()
        .join("\n");
    let definition_entries = definitions
        .iter()
        .map(build_definition_entry)
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "import type {{ ResponseDataType }} from \"@talosjs/http-response\";\n\n{}\n\nexport const {} = {{\n  api: {{\n{}\n  }},\n  definition: {{\n{}\n  }},\n}};\n",
        types, const_name, api_entries, definition_entries
    )
}

fn extract_existing_keys(content: &str) -> std::collections::BTreeSet<String> {
    regex::Regex::new(r#"key:\s*\"([^\"]+)\""#)
        .ok()
        .map(|re| {
            re.captures_iter(content)
                .filter_map(|caps| caps.get(1).map(|m| m.as_str().to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn merge_module_file(existing: &str, new_defs: &[ControllerDefinition]) -> String {
    let types = new_defs
        .iter()
        .map(|def| def.type_declaration.clone())
        .collect::<Vec<_>>()
        .join("\n\n");
    let api_entries = new_defs
        .iter()
        .map(build_api_entry)
        .collect::<Vec<_>>()
        .join("\n");
    let definition_entries = new_defs
        .iter()
        .map(build_definition_entry)
        .collect::<Vec<_>>()
        .join("\n");
    existing
        .replace("\nexport const ", &format!("\n{}\n\nexport const ", types))
        .replace(
            "\n  },\n  definition: {",
            &format!("\n{}\n  }},\n  definition: {{", api_entries),
        )
        .replace(
            "\n  },\n};\n",
            &format!("\n{}\n  }},\n}};\n", definition_entries),
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

    module_create::execute(ModuleCreateOptions {
        name: sdk_name.clone(),
        destination: None,
        cwd: cwd.clone(),
        silent: true,
    });
    let _ = remove_from_app_module(
        &cwd.join("modules")
            .join("app")
            .join("src")
            .join("AppModule.ts"),
        &pascal_name,
        &sdk_name,
    );
    let _ = remove_from_shared_module(
        &cwd.join("modules")
            .join("shared")
            .join("src")
            .join("SharedModule.ts"),
        &pascal_name,
        &sdk_name,
    );

    let sdk_dir = modules_dir.join(&sdk_name);
    let sdk_src_dir = sdk_dir.join("src");
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

    let mut generated = Vec::new();
    if let Ok(entries) = fs::read_dir(&modules_dir) {
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let module_kebab = entry.file_name().to_string_lossy().to_string();
            if module_kebab == sdk_name {
                continue;
            }
            if is_api_target {
                let ty = read_module_type(&modules_dir, &module_kebab);
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
    }

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
            .current_dir(&sdk_dir),
    ) {
        return;
    }
    if !run_spinner_step(
        silent,
        "Installing bunup",
        Command::new("bun")
            .args(["add", "-D", "bunup"])
            .current_dir(&sdk_dir),
    ) {
        return;
    }

    if !silent {
        crate::utils::success(format!(
            "modules/{sdk_name} generated with {} module(s)",
            generated.len()
        ));
    }
}
