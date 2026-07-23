//! Registers/unregisters generated modules into `AppModule`/`SharedModule`/
//! microservice modules and `tsconfig.json` path aliases, mirroring
//! `packages/cli/src/moduleRegistry.ts`.

use std::fs;
use std::path::Path;

use regex::Regex;
use serde_json::Value;

/// Fields spread into `AppModule` (entities live in `SharedModule` instead).
pub const APP_MODULE_FIELDS: [&str; 4] = ["controllers", "middlewares", "cronJobs", "events"];
/// A microservice is standalone (no `SharedModule`), so it also owns its entities.
pub const MICROSERVICE_MODULE_FIELDS: [&str; 5] = [
    "controllers",
    "entities",
    "middlewares",
    "cronJobs",
    "events",
];

/// Mirrors `spreadIntoField`: appends `...ModuleName.field` into the `field: [...]`
/// array literal in `content`, preserving existing entries and indentation.
fn spread_into_field(content: &str, field: &str, module_name: &str) -> String {
    let Ok(re) = Regex::new(&format!(r"(?s)({field}:\s*\[)([^\]]*)")) else {
        return content.to_string();
    };
    let Some(caps) = re.captures(content) else {
        return content.to_string();
    };
    let existing = caps.get(2).map(|m| m.as_str()).unwrap_or("");
    let spread = format!("...{module_name}.{field}");

    let indent = Regex::new(r"\n(\s+)\S")
        .ok()
        .and_then(|re| re.captures(existing))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "    ".to_string());
    let closing_indent = Regex::new(r"\n(\s*)$")
        .ok()
        .and_then(|re| re.captures(existing))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "  ".to_string());

    let trimmed_existing = existing.trim_end().trim_end_matches(',').trim_end();
    let new_value = if !trimmed_existing.is_empty() {
        format!("{trimmed_existing},\n{indent}{spread},\n{closing_indent}")
    } else {
        format!("\n{indent}{spread},\n{closing_indent}")
    };

    let whole = caps.get(0).unwrap().as_str();
    let prefix = caps.get(1).unwrap().as_str();
    content.replacen(whole, &format!("{prefix}{new_value}"), 1)
}

/// Mirrors `removeSpreadFromFields`.
fn remove_spread_from_fields(content: &str, module_name: &str, fields: &[&str]) -> String {
    let mut content = content.to_string();
    for field in fields {
        let spread = regex::escape(&format!("...{module_name}.{field}"));
        if let Ok(re) = Regex::new(&format!(r",\s*{spread}")) {
            content = re.replace_all(&content, "").into_owned();
        }
        if let Ok(re) = Regex::new(&format!(r"{spread}\s*,\s*")) {
            content = re.replace_all(&content, "").into_owned();
        }
        content = content.replace(&format!("...{module_name}.{field}"), "");
    }
    content
}

/// Mirrors `insertImport`: inserts an import line right after the last
/// existing `import ` line in `content`.
fn insert_import(content: &str, module_name: &str, import_path: &str) -> String {
    let import_line = format!("import {{ {module_name} }} from \"{import_path}\";\n");
    let Some(last_import_index) = content.rfind("import ") else {
        return format!("{import_line}{content}");
    };
    let line_end = content[last_import_index..]
        .find('\n')
        .map(|i| last_import_index + i)
        .unwrap_or(content.len() - 1);
    format!(
        "{}{import_line}{}",
        &content[..=line_end],
        &content[line_end + 1..]
    )
}

/// Mirrors `removeImport`.
fn remove_import(content: &str, module_name: &str, import_path: &str) -> String {
    let escaped_path = regex::escape(import_path);
    let pattern = format!(r#"import\s*\{{\s*{module_name}\s*\}}\s*from\s*"{escaped_path}";\s*\n"#);
    match Regex::new(&pattern) {
        Ok(re) => re.replace_all(content, "").into_owned(),
        Err(_) => content.to_string(),
    }
}

/// Mirrors `addToAppModule`.
pub fn add_to_app_module(
    app_module_path: &Path,
    pascal_name: &str,
    kebab_name: &str,
) -> Result<(), String> {
    let mut content = fs::read_to_string(app_module_path).map_err(|e| e.to_string())?;
    let module_name = format!("{pascal_name}Module");

    content = insert_import(
        &content,
        &module_name,
        &format!("@module/{kebab_name}/{module_name}"),
    );
    for field in APP_MODULE_FIELDS {
        content = spread_into_field(&content, field, &module_name);
    }

    fs::write(app_module_path, content).map_err(|e| e.to_string())
}

/// Mirrors `addToMicroserviceModule`.
pub fn add_to_microservice_module(
    microservice_module_path: &Path,
    pascal_name: &str,
    kebab_name: &str,
) -> Result<(), String> {
    let mut content = fs::read_to_string(microservice_module_path).map_err(|e| e.to_string())?;
    let module_name = format!("{pascal_name}Module");

    content = insert_import(
        &content,
        &module_name,
        &format!("@module/{kebab_name}/{module_name}"),
    );
    for field in MICROSERVICE_MODULE_FIELDS {
        content = spread_into_field(&content, field, &module_name);
    }

    fs::write(microservice_module_path, content).map_err(|e| e.to_string())
}

/// Mirrors `addToSharedModule`.
pub fn add_to_shared_module(
    shared_module_path: &Path,
    pascal_name: &str,
    kebab_name: &str,
) -> Result<(), String> {
    let mut content = fs::read_to_string(shared_module_path).map_err(|e| e.to_string())?;
    let module_name = format!("{pascal_name}Module");

    content = insert_import(
        &content,
        &module_name,
        &format!("@module/{kebab_name}/{module_name}"),
    );
    content = spread_into_field(&content, "entities", &module_name);

    fs::write(shared_module_path, content).map_err(|e| e.to_string())
}

/// Mirrors `removeFromAppModule`. No-op when `app_module_path` doesn't exist.
pub fn remove_from_app_module(
    app_module_path: &Path,
    pascal_name: &str,
    kebab_name: &str,
) -> Result<(), String> {
    if !app_module_path.exists() {
        return Ok(());
    }
    let mut content = fs::read_to_string(app_module_path).map_err(|e| e.to_string())?;
    let module_name = format!("{pascal_name}Module");

    content = remove_import(
        &content,
        &module_name,
        &format!("@module/{kebab_name}/{module_name}"),
    );
    content = remove_spread_from_fields(&content, &module_name, &APP_MODULE_FIELDS);

    fs::write(app_module_path, content).map_err(|e| e.to_string())
}

/// Mirrors `removeFromSharedModule`. No-op when `shared_module_path` doesn't exist.
pub fn remove_from_shared_module(
    shared_module_path: &Path,
    pascal_name: &str,
    kebab_name: &str,
) -> Result<(), String> {
    if !shared_module_path.exists() {
        return Ok(());
    }
    let mut content = fs::read_to_string(shared_module_path).map_err(|e| e.to_string())?;
    let module_name = format!("{pascal_name}Module");

    content = remove_import(
        &content,
        &module_name,
        &format!("@module/{kebab_name}/{module_name}"),
    );
    content = remove_spread_from_fields(&content, &module_name, &["entities"]);

    fs::write(shared_module_path, content).map_err(|e| e.to_string())
}

/// Mirrors `addPathAlias`: adds `@module/<kebab_name>/*` to
/// `compilerOptions.paths` in `tsconfig.json`, preserving other keys.
pub fn add_path_alias(tsconfig_path: &Path, kebab_name: &str) -> Result<(), String> {
    let raw = fs::read_to_string(tsconfig_path).map_err(|e| e.to_string())?;
    let mut tsconfig: Value =
        serde_json::from_str(&strip_jsonc(&raw)).map_err(|e| e.to_string())?;

    let compiler_options = tsconfig
        .as_object_mut()
        .ok_or("tsconfig.json is not a JSON object")?
        .entry("compilerOptions")
        .or_insert_with(|| Value::Object(Default::default()));
    let paths = compiler_options
        .as_object_mut()
        .ok_or("compilerOptions is not a JSON object")?
        .entry("paths")
        .or_insert_with(|| Value::Object(Default::default()));
    paths
        .as_object_mut()
        .ok_or("paths is not a JSON object")?
        .insert(
            format!("@module/{kebab_name}/*"),
            Value::Array(vec![Value::String(format!("./modules/{kebab_name}/src/*"))]),
        );

    fs::write(
        tsconfig_path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&tsconfig).map_err(|e| e.to_string())?
        ),
    )
    .map_err(|e| e.to_string())
}

/// Mirrors `removePathAlias`. No-op when `tsconfig_path` doesn't exist.
pub fn remove_path_alias(tsconfig_path: &Path, kebab_name: &str) -> Result<(), String> {
    if !tsconfig_path.exists() {
        return Ok(());
    }
    let raw = fs::read_to_string(tsconfig_path).map_err(|e| e.to_string())?;
    let mut tsconfig: Value =
        serde_json::from_str(&strip_jsonc(&raw)).map_err(|e| e.to_string())?;

    if let Some(paths) = tsconfig
        .get_mut("compilerOptions")
        .and_then(|c| c.get_mut("paths"))
        .and_then(|p| p.as_object_mut())
    {
        paths.remove(&format!("@module/{kebab_name}/*"));
    }

    fs::write(
        tsconfig_path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&tsconfig).map_err(|e| e.to_string())?
        ),
    )
    .map_err(|e| e.to_string())
}

/// Mirrors `parseJsonc`: strips `//`/`/* */` comments and trailing commas
/// (string-literal aware) so `tsconfig.json` (JSONC) parses as plain JSON.
pub fn strip_jsonc(text: &str) -> String {
    let mut stripped = String::with_capacity(text.len());
    let mut chars = text.char_indices().peekable();
    let mut in_string = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;

    while let Some((_, c)) = chars.next() {
        let next = chars.peek().map(|(_, c)| *c);

        if in_line_comment {
            if c == '\n' {
                in_line_comment = false;
                stripped.push(c);
            }
            continue;
        }
        if in_block_comment {
            if c == '*' && next == Some('/') {
                in_block_comment = false;
                chars.next();
            }
            continue;
        }
        if in_string {
            stripped.push(c);
            if c == '\\' {
                if let Some((_, escaped)) = chars.next() {
                    stripped.push(escaped);
                }
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        if c == '"' {
            in_string = true;
            stripped.push(c);
            continue;
        }
        if c == '/' && next == Some('/') {
            in_line_comment = true;
            chars.next();
            continue;
        }
        if c == '/' && next == Some('*') {
            in_block_comment = true;
            chars.next();
            continue;
        }
        stripped.push(c);
    }

    // Drop trailing commas before a closing `}`/`]`, skipping those inside strings.
    let mut cleaned = String::with_capacity(stripped.len());
    let bytes: Vec<char> = stripped.chars().collect();
    in_string = false;
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if in_string {
            cleaned.push(c);
            if c == '\\' && i + 1 < bytes.len() {
                cleaned.push(bytes[i + 1]);
                i += 2;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if c == '"' {
            in_string = true;
            cleaned.push(c);
            i += 1;
            continue;
        }
        if c == ',' {
            let mut j = i + 1;
            while j < bytes.len() && bytes[j].is_whitespace() {
                j += 1;
            }
            if j < bytes.len() && (bytes[j] == '}' || bytes[j] == ']') {
                i += 1;
                continue;
            }
        }
        cleaned.push(c);
        i += 1;
    }

    cleaned
}
