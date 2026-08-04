use std::path::{Path, PathBuf};

use std::fs;

use crate::utils::to_pascal_case;

#[derive(Clone, Debug)]
pub struct ControllerDefinition {
    pub method: String,
    pub key: String,
    pub version: i64,
    pub description: String,
    pub roles: Vec<String>,
    pub path: String,
    pub is_socket: bool,
    pub type_name: String,
    pub type_declaration: String,
}

pub fn to_camel_case(value: &str) -> String {
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

pub fn match_balanced(text: &str, open_index: usize) -> Option<(String, usize)> {
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

pub fn read_module_type(modules_dir: &Path, module_kebab: &str) -> String {
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

pub fn collect_controller_files(dir: &Path, files: &mut Vec<PathBuf>) {
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

/// Extracts `version`, `description`, and `roles` from a controller's
/// `@Route.*` decorator config body.
fn parse_config_fields(config_body: &str) -> (i64, String, Vec<String>) {
    let version = regex::Regex::new(r"version\s*:\s*(\d+)")
        .ok()
        .and_then(|re| re.captures(config_body))
        .and_then(|caps| caps.get(1))
        .and_then(|m| m.as_str().parse::<i64>().ok())
        .unwrap_or(1);
    let description = regex::Regex::new(r#"description\s*:\s*\"([^\"]*)\""#)
        .ok()
        .and_then(|re| re.captures(config_body))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();
    let roles_raw = regex::Regex::new(r"roles\s*:\s*\[([^\]]*)\]")
        .ok()
        .and_then(|re| re.captures(config_body))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();
    let roles = roles_raw
        .split(',')
        .map(|role| role.trim().trim_matches(['\"', '\'']))
        .filter(|role| !role.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    (version, description, roles)
}

pub fn parse_controller(content: &str, module_name: &str) -> Option<ControllerDefinition> {
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
    let (version, description, roles) = parse_config_fields(&config_body);
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

pub fn build_api_entry(def: &ControllerDefinition) -> String {
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

pub fn build_definition_entry(def: &ControllerDefinition) -> String {
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

pub fn build_module_file(const_name: &str, definitions: &[ControllerDefinition]) -> String {
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

pub fn extract_existing_keys(content: &str) -> std::collections::BTreeSet<String> {
    regex::Regex::new(r#"key:\s*\"([^\"]+)\""#)
        .ok()
        .map(|re| {
            re.captures_iter(content)
                .filter_map(|caps| caps.get(1).map(|m| m.as_str().to_string()))
                .collect()
        })
        .unwrap_or_default()
}

pub fn merge_module_file(existing: &str, new_defs: &[ControllerDefinition]) -> String {
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
