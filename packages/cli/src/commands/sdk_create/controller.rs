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
    /// The `import type` line that brings the route type in from its controller.
    pub type_import: String,
    /// Whether the controller already exports the route type the import names.
    pub type_exported: bool,
    /// The request parts the route type declares: `params`, `payload`, `queries`.
    pub inputs: Vec<String>,
}

/// The request parts a route type can declare, in the order the client takes them.
const INPUT_KEYS: [&str; 3] = ["params", "payload", "queries"];

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

/// The body of the `{ … }` opening at `open_index`, and the byte offset of its
/// closing brace.
///
/// `open_index` is a **byte** offset, so the walk slices from it rather than
/// skipping that many items of `char_indices()`: one multi-byte character
/// earlier in the file — an em dash in a comment is enough — would otherwise
/// start the depth count inside the block and lose a closing brace.
pub fn match_balanced(text: &str, open_index: usize) -> Option<(String, usize)> {
    let mut depth = 0;
    for (offset, ch) in text.get(open_index..)?.char_indices() {
        let index = open_index + offset;
        if ch == '{' {
            depth += 1;
        }
        if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some((text[open_index + 1..index].to_string(), index));
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

/// The keys declared at the top level of a type literal body, so
/// `{ params: { id: string }; queries?: {…} }` yields `params` and `queries`.
fn top_level_keys(body: &str) -> Vec<String> {
    let key = regex::Regex::new(r"^\s*(?:readonly\s+)?(\w+)\??\s*:").ok();
    let mut keys = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    for (index, ch) in body.char_indices() {
        match ch {
            '{' | '[' | '(' => depth += 1,
            '}' | ']' | ')' => depth -= 1,
            _ => {}
        }
        if depth == 0 && matches!(ch, ';' | ',' | '\n') || index + ch.len_utf8() == body.len() {
            if let Some(name) = key
                .as_ref()
                .and_then(|re| re.captures(&body[start..index + ch.len_utf8()]))
                .and_then(|caps| caps.get(1))
            {
                keys.push(name.as_str().to_string());
            }
            start = index + ch.len_utf8();
        }
    }
    keys
}

/// Exports the route type `type_name` the controller declares without
/// `export`, so the generated SDK can import it. Returns `None` when there is
/// nothing to change.
pub fn export_route_type(content: &str, type_name: &str) -> Option<String> {
    let re = regex::Regex::new(&format!(r"(?m)^(\s*)type\s+{type_name}\s*=")).ok()?;
    let found = re.captures(content)?;
    let whole = found.get(0)?;
    let indent = found.get(1)?.as_str();
    Some(format!(
        "{}{indent}export type {type_name} ={}",
        &content[..whole.start()],
        &content[whole.end()..]
    ))
}

/// Reads a controller's `@Route` decorator and its `…RouteType`. `import_path`
/// is the specifier the SDK imports the route type from, such as
/// `@module/user/controllers/UserListController`.
pub fn parse_controller(
    content: &str,
    module_name: &str,
    import_path: &str,
) -> Option<ControllerDefinition> {
    let type_match = regex::Regex::new(r"(?m)^\s*(export\s+)?type\s+(\w+RouteType)\s*=\s*\{")
        .ok()?
        .captures(content)?;
    let decorator_match = regex::Regex::new(r#"@Route\.(\w+)\(\s*"([^"]+)"\s*,\s*\{"#)
        .ok()?
        .captures(content)?;
    let type_exported = type_match.get(1).is_some();
    let type_name = type_match.get(2)?.as_str().to_string();
    let type_index = type_match.get(0)?.end().saturating_sub(1);
    let (type_body, _) = match_balanced(content, type_index)?;
    let declared = top_level_keys(&type_body);
    let inputs = INPUT_KEYS
        .iter()
        .filter(|key| declared.iter().any(|name| name == *key))
        .map(|key| key.to_string())
        .collect();
    let type_import = format!("import type {{ {type_name} }} from \"{import_path}\";");
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
        type_import,
        type_exported,
        inputs,
    })
}

pub fn build_api_entry(def: &ControllerDefinition) -> String {
    let bearer_token = if def.roles.is_empty() {
        String::new()
    } else {
        "\n        bearerToken: string;".to_string()
    };
    let inputs = def
        .inputs
        .iter()
        .map(|key| format!("\n        {key}: {}[\"{key}\"];", def.type_name))
        .collect::<String>();
    format!(
        "    {}: (\n      input: {{\n        baseURL: string;{}{}\n        onSuccess?: (response: ResponseDataType<{}[\"response\"]>) => void;\n        onMessage?: (response: ResponseDataType<{}[\"response\"]>) => void;\n        onOpen?: (event?: Event) => void;\n        onClose?: (event?: CloseEvent) => void;\n        onError?: (event?: Event, response?: ResponseDataType<{}[\"response\"]>) => void;\n      }},\n    ): Promise<{}[\"response\"]> => {{\n      // TODO: use {} api according to controller definition\n      throw new Error(\"Not implemented\");\n    }},",
        def.method,
        inputs,
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
        .map(|def| def.type_import.clone())
        .collect::<Vec<_>>()
        .join("\n");
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
        .map(|def| def.type_import.clone())
        .collect::<Vec<_>>()
        .join("\n");
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
