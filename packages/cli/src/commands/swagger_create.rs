//! `swagger:create` — scaffold the API explorer and write one route file per
//! controller it documents.
//!
//! The explorer itself is a browser module copied from the skeleton, the way
//! `storybook:create` copies the gallery. What is generated on top of it is the
//! documentation: every `@Route.<verb>` decorator in the target's controllers
//! becomes a `src/features/<module>/<Name>.route.ts` stating exactly what the
//! decorator and the route type say — verb, path, version, roles, and the
//! declared `params`/`queries`/`payload`/`response` fields.
//!
//! `src/features/` is generated output and is rebuilt on every run, so a meta
//! can never drift from the controller that serves it, and the meta of a
//! controller that was deleted or unregistered retires with it. Only the
//! controllers a module's `<Name>Module.ts` actually registers are documented:
//! a file nobody registers serves nothing.

use serde_json::{Map, Value, json};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use clap::Args;
use fs_extra::dir::{CopyOptions, copy as copy_dir};

use crate::commands::design_create::{self, DesignCreateArgs};
use crate::utils::frontend_module::{
    collect_design_modules, collect_used_ports, find_free_port, read_dependency_names,
    rewrite_design_alias, rewrite_package_json, rewrite_playwright_port, rewrite_self_imports,
    with_design_field,
};
use crate::utils::{
    Spinner, add_path_alias, ask_input, ask_select, clone_skeleton, current_dir, run_spinner_step,
    to_kebab_case, to_pascal_case,
};

#[derive(Args, Debug)]
pub struct SwaggerCreateArgs {
    #[arg(long)]
    pub name: Option<String>,

    #[arg(long, help = "The module whose controllers are documented")]
    pub module: Option<String>,

    #[arg(long, help = "The design module the explorer is styled from")]
    pub design: Option<String>,

    #[arg(
        long,
        help = "Route prefix the backend mounts its controllers under [default: api]"
    )]
    pub prefix: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Reinstall the explorer from the template, discarding every local change to it. Without this, a re-run only writes route files and the specification"
    )]
    pub force: bool,

    #[arg(
        long,
        default_value_t = false,
        help = "Bypass the skeleton cache and re-download templates (the cache otherwise auto-refreshes after 24h)"
    )]
    pub no_cache: bool,
}

const DEFAULT_PORT: u16 = 3032;
const DEFAULT_PREFIX: &str = "api";
const CREATE_NEW_DESIGN: &str = "Create a new design";

/// One documented value read off a route type's `params`/`queries`/`payload`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteField {
    pub name: String,
    pub ty: String,
    pub required: bool,
    /// The JSDoc written above the member in the route type, if any.
    ///
    /// A controller is the only place a description can live and survive: the
    /// swagger's `src/features/` is regenerated wholesale on every run, so
    /// prose written there would be wiped by the next one.
    pub description: String,
    /// The members of a nested object literal, e.g. `address: { city: string }`.
    pub fields: Vec<RouteField>,
}

/// One member of a route type, as written.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Member {
    pub name: String,
    pub ty: String,
    pub required: bool,
    pub description: String,
}

/// One route, as much of it as a controller states out loud.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteDefinition {
    /// PascalCase file stem, e.g. `HealthCheck`.
    pub file_stem: String,
    /// Sentence-case label, e.g. `Health check`.
    pub title: String,
    pub key: String,
    pub version: i64,
    pub method: String,
    /// Served path, prefix and version included.
    pub path: String,
    /// The decorator's one-liner, published as the summary.
    pub description: String,
    /// The JSDoc written above the decorator, published as the prose.
    pub prose: String,
    pub roles: Vec<String>,
    pub params: Vec<RouteField>,
    pub queries: Vec<RouteField>,
    pub payload: Vec<RouteField>,
    /// The `response` block of the route type — what the route answers with.
    pub response: Vec<RouteField>,
}

/// The body of the `{ … }` opening at `open_index`, and the byte offset of its
/// closing brace.
///
/// `open_index` is a **byte** offset, so the walk slices from it rather than
/// skipping that many items of `char_indices()`: one multi-byte character
/// earlier in the file — an em dash in a comment is enough — would otherwise
/// start the depth count inside the block and lose a closing brace.
fn match_balanced(text: &str, open_index: usize) -> Option<(String, usize)> {
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

fn read_module_type(modules_dir: &Path, module_kebab: &str) -> String {
    let yml_file = modules_dir
        .join(module_kebab)
        .join(format!("{module_kebab}.yml"));
    fs::read_to_string(yml_file)
        .ok()
        .and_then(|content| {
            content.lines().find_map(|line| {
                let value = line.trim().strip_prefix("type:")?;
                let value = value.split('#').next().unwrap_or(value);
                Some(value.trim().trim_matches('"').to_string())
            })
        })
        .unwrap_or_else(|| "module".to_string())
}

/// The controller classes a module actually registers.
///
/// A `*Controller.ts` sitting in `src/controllers/` is not served by anything
/// until it appears in the module's `controllers: [...]`. Documenting the file
/// rather than the registration would publish routes the app does not answer —
/// so the manifest, not the directory listing, is what is read.
///
/// `None` means the module has no manifest to read, in which case every
/// controller file counts: that is a module the convention has not reached yet,
/// and skipping it silently would be worse than documenting too much.
pub fn registered_controllers(module_dir: &Path, module_kebab: &str) -> Option<BTreeSet<String>> {
    let manifest = module_dir
        .join("src")
        .join(format!("{}Module.ts", to_pascal_case(module_kebab)));
    let content = fs::read_to_string(manifest).ok()?;
    let matched = regex::Regex::new(r"controllers\s*:\s*\[")
        .ok()?
        .find(&content)?;
    let list = content.get(matched.end()..)?.split(']').next()?.to_string();

    Some(
        list.split(',')
            .map(str::trim)
            // `...SharedModule.controllers` is a spread of another module's own
            // registrations, which that module is documented for on its own.
            .filter(|entry| !entry.is_empty() && !entry.starts_with("..."))
            .map(str::to_string)
            .collect(),
    )
}

/// The class a controller file declares, e.g. `HealthController`.
pub fn controller_class_of(content: &str) -> Option<String> {
    regex::Regex::new(r"export\s+class\s+(\w+)")
        .ok()?
        .captures(content)?
        .get(1)
        .map(|matched| matched.as_str().to_string())
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

/// Split one object literal type into its top-level `name: type` members.
///
/// Nested objects, unions and generics all live inside the member's type, so
/// the split tracks bracket depth rather than looking for the next separator.
/// The prose of a JSDoc block, with the decoration every line carries removed.
fn clean_jsdoc(body: &str) -> String {
    body.lines()
        .map(|line| line.trim().trim_start_matches('*').trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// The JSDoc block written immediately above `index`, if there is one.
///
/// "Immediately" means nothing but whitespace between the block's `*/` and the
/// thing it documents — otherwise the file's own header comment would be read
/// as the description of whatever happens to come first.
fn jsdoc_above(content: &str, index: usize) -> String {
    let Some(before) = content.get(..index) else {
        return String::new();
    };
    let before = before.trim_end();
    let Some(head) = before.strip_suffix("*/") else {
        return String::new();
    };
    let Some(start) = head.rfind("/**") else {
        return String::new();
    };
    let body = head.get(start + 3..).unwrap_or("");
    // A `*/` inside means the `/**` found opens an earlier block and the one
    // just closed was a plain `/* … */`, which documents nothing.
    if body.contains("*/") {
        return String::new();
    }
    clean_jsdoc(body)
}

/// The members of one object literal, comments removed and the JSDoc above each
/// member kept as its documentation.
///
/// Comments come off during the scan rather than after it: a separator inside a
/// comment — the comma of "1-based, from the top" is enough — would otherwise
/// cut a member in two and both halves would be discarded as unparseable. A
/// string literal is walked through for the same reason, so the `//` of a
/// `"https://…"` union member starts no comment.
///
/// Of the two comment forms only `/** … */` documents; a `//` aside is a note
/// to whoever reads the controller, not a line of the published contract.
pub fn split_members(body: &str) -> Vec<Member> {
    let characters = body.chars().collect::<Vec<_>>();
    let mut members: Vec<(String, String)> = Vec::new();
    let mut depth = 0;
    let mut current = String::new();
    let mut description = String::new();
    let mut index = 0;

    while index < characters.len() {
        let ch = characters[index];
        let next = characters.get(index + 1).copied();

        if ch == '/' && next == Some('/') {
            index += 2;
            while index < characters.len() && characters[index] != '\n' {
                index += 1;
            }
            continue;
        }

        if ch == '/' && next == Some('*') {
            let documents = characters.get(index + 2) == Some(&'*');
            let start = index + 2;
            index = start;
            while index < characters.len()
                && !(characters[index] == '*' && characters.get(index + 1) == Some(&'/'))
            {
                index += 1;
            }
            // Only a block that *precedes* a member documents it. One met
            // further in belongs to a nested member: it is copied through
            // untouched so the pass that reads that nested literal still finds
            // it, and letting it through here would overwrite the parent's
            // description with its first child's.
            if depth == 0 && current.trim().is_empty() {
                if documents {
                    let text = characters[start..index].iter().collect::<String>();
                    description = clean_jsdoc(text.trim_start_matches('*'));
                }
            } else {
                current.push_str("/*");
                current.extend(&characters[start..index.min(characters.len())]);
                current.push_str("*/");
            }
            index = (index + 2).min(characters.len());
            continue;
        }

        if ch == '"' || ch == '\'' || ch == '`' {
            current.push(ch);
            index += 1;
            while index < characters.len() && characters[index] != ch {
                current.push(characters[index]);
                index += 1;
            }
            if index < characters.len() {
                current.push(ch);
                index += 1;
            }
            continue;
        }

        match ch {
            '{' | '[' | '(' | '<' => {
                depth += 1;
                current.push(ch);
            }
            '}' | ']' | ')' | '>' => {
                depth -= 1;
                current.push(ch);
            }
            ';' | ',' if depth == 0 => {
                members.push((
                    std::mem::take(&mut current),
                    std::mem::take(&mut description),
                ));
            }
            _ => current.push(ch),
        }
        index += 1;
    }
    members.push((current, description));

    members
        .into_iter()
        .filter_map(|(member, description)| {
            let (name, ty) = member.trim().split_once(':')?;
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            let optional = name.ends_with('?');
            let name = name.trim_end_matches('?').trim();
            if !name
                .chars()
                .all(|ch| ch.is_alphanumeric() || ch == '_' || ch == '$')
            {
                return None;
            }
            Some(Member {
                name: name.to_string(),
                ty: ty.trim().trim_end_matches(';').trim().to_string(),
                required: !optional,
                description,
            })
        })
        .collect()
}

/// Whether a declared type is a file the framework rebuilds as a `RequestFile`.
///
/// A controller reads an upload through `context.request.files[name]`, which is
/// only populated for `multipart/form-data` — so a payload naming `RequestFile`
/// (or the browser's `File`) is what marks the whole body as multipart.
pub fn is_file_type(ty: &str) -> bool {
    let normalized = ty.trim().trim_end_matches("[]").trim();
    normalized == "File"
        || normalized.ends_with("RequestFile")
        || normalized.ends_with("IRequestFile")
}

/// The members of one named block of a route type, e.g. its `queries`.
pub fn extract_block(type_body: &str, block: &str) -> Vec<RouteField> {
    let Ok(pattern) = regex::Regex::new(&format!(r"\b{block}\s*:\s*\{{")) else {
        return Vec::new();
    };
    let Some(matched) = pattern.find(type_body) else {
        return Vec::new();
    };
    let Some((body, _)) = match_balanced(type_body, matched.end().saturating_sub(1)) else {
        return Vec::new();
    };

    fields_of(&body)
}

/// Turn the members of one object literal into fields, recursing into nested
/// ones.
///
/// A member whose type is itself an object is documented as an object carrying
/// its own fields, rather than as a field whose "type" is the whole literal
/// spelled out — which is unreadable past two members and tells a reader
/// nothing about which parts are optional.
pub fn fields_of(body: &str) -> Vec<RouteField> {
    split_members(body)
        .into_iter()
        .map(|member| {
            let Member {
                name,
                ty,
                required,
                description,
            } = member;

            // The explorer keys its upload control off the literal `file`, so a
            // `RequestFile` is translated here rather than re-detected there.
            if is_file_type(&ty) {
                return RouteField {
                    name,
                    ty: "file".to_string(),
                    required,
                    description,
                    fields: Vec::new(),
                };
            }

            let trimmed = ty.trim();
            let array = trimmed.ends_with("[]");
            let inner = trimmed.trim_end_matches("[]").trim();
            if inner.starts_with('{') && inner.ends_with('}') {
                return RouteField {
                    name,
                    ty: if array {
                        "object[]".to_string()
                    } else {
                        "object".to_string()
                    },
                    required,
                    description,
                    fields: fields_of(&inner[1..inner.len() - 1]),
                };
            }

            RouteField {
                name,
                ty,
                required,
                description,
                fields: Vec::new(),
            }
        })
        .collect()
}

/// The `:param` segments of a path, in the order they are served.
pub fn path_params(path: &str) -> Vec<String> {
    regex::Regex::new(r":(\w+)")
        .ok()
        .map(|pattern| {
            pattern
                .captures_iter(path)
                .filter_map(|caps| caps.get(1).map(|m| m.as_str().to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// `app.health.check` in module `app` → `HealthCheck`.
pub fn file_stem_of(key: &str, module_name: &str) -> String {
    let tail = key
        .strip_prefix(&format!("{module_name}."))
        .unwrap_or(key)
        .replace('.', "-");
    to_pascal_case(&tail)
}

/// `HealthCheck` → `Health check` — a label, not an identifier.
pub fn title_of(file_stem: &str) -> String {
    let spaced = regex::Regex::new(r"([a-z0-9])([A-Z])")
        .ok()
        .map(|pattern| pattern.replace_all(file_stem, "$1 $2").into_owned())
        .unwrap_or_else(|| file_stem.to_string());

    let mut chars = spaced.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
        None => spaced,
    }
}

/// Read one controller into the route it serves.
pub fn parse_controller(content: &str, module_name: &str, prefix: &str) -> Option<RouteDefinition> {
    let decorator = regex::Regex::new(r#"@Route\.(\w+)\(\s*"([^"]+)"\s*,\s*\{"#)
        .ok()?
        .captures(content)?;
    let method = decorator.get(1)?.as_str().to_lowercase();
    let route_path = decorator.get(2)?.as_str().to_string();
    let (config, _) = match_balanced(content, decorator.get(0)?.end().saturating_sub(1))?;

    let key = regex::Regex::new(r#"name\s*:\s*"([^"]+)""#)
        .ok()?
        .captures(&config)?
        .get(1)?
        .as_str()
        .to_string();
    let version = regex::Regex::new(r"version\s*:\s*(\d+)")
        .ok()
        .and_then(|pattern| pattern.captures(&config))
        .and_then(|caps| caps.get(1))
        .and_then(|m| m.as_str().parse::<i64>().ok())
        .unwrap_or(1);
    let description = regex::Regex::new(r#"description\s*:\s*"([^"]*)""#)
        .ok()
        .and_then(|pattern| pattern.captures(&config))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();
    let roles = regex::Regex::new(r"roles\s*:\s*\[([^\]]*)\]")
        .ok()
        .and_then(|pattern| pattern.captures(&config))
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default()
        .split(',')
        .map(|role| role.trim().trim_matches(['"', '\'']))
        .filter(|role| !role.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    // The decorator's one-liner is the summary; the prose a reader comes for —
    // when to call the route, what it costs, when not to — is the JSDoc above
    // the decorator, the only place it can be written and survive a rebuild.
    let prose = jsdoc_above(content, decorator.get(0)?.start());

    // The route type carries the shapes; a controller that declares none still
    // documents fine, it just has no fields to pre-fill.
    let type_body = regex::Regex::new(r"(?:export\s+)?type\s+\w+RouteType\s*=\s*\{")
        .ok()
        .and_then(|pattern| pattern.find(content))
        .and_then(|matched| match_balanced(content, matched.end().saturating_sub(1)))
        .map(|(body, _)| body)
        .unwrap_or_default();

    let mut params = extract_block(&type_body, "params");
    for name in path_params(&route_path) {
        if !params.iter().any(|field| field.name == name) {
            params.push(RouteField {
                name,
                ty: "string".to_string(),
                required: true,
                description: String::new(),
                fields: Vec::new(),
            });
        }
    }

    let file_stem = file_stem_of(&key, module_name);
    Some(RouteDefinition {
        title: title_of(&file_stem),
        file_stem,
        key,
        version,
        method,
        path: format!("/{prefix}/v{version}{route_path}"),
        description,
        prose,
        roles,
        params,
        queries: extract_block(&type_body, "queries"),
        payload: extract_block(&type_body, "payload"),
        response: extract_block(&type_body, "response"),
    })
}

fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

/// One field, on one line when it is a leaf and as a block when it nests.
fn render_field(indent: &str, field: &RouteField) -> String {
    let described = if field.description.is_empty() {
        String::new()
    } else {
        format!(", description: {}", quote(&field.description))
    };
    let head = format!(
        "name: {}, type: {}, required: {}{described}",
        quote(&field.name),
        quote(&field.ty),
        field.required
    );

    if field.fields.is_empty() {
        return format!("{indent}{{ {head} }},");
    }

    let nested = render_fields(&format!("{indent}  "), "fields", &field.fields);
    format!("{indent}{{\n{indent}  {head},\n{nested}{indent}}},")
}

fn render_fields(indent: &str, label: &str, fields: &[RouteField]) -> String {
    if fields.is_empty() {
        return String::new();
    }
    let entries = fields
        .iter()
        .map(|field| render_field(&format!("{indent}  "), field))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{indent}{label}: [\n{entries}\n{indent}],\n")
}

/// The `*.route.ts` a route generates.
pub fn render_route_file(definition: &RouteDefinition, group: &str) -> String {
    let roles = definition
        .roles
        .iter()
        .map(|role| quote(role))
        .collect::<Vec<_>>()
        .join(", ");

    let mut body = String::new();
    body.push_str(&format!("  title: {},\n", quote(&definition.title)));
    body.push_str(&format!("  group: {},\n", quote(group)));
    body.push_str(&format!("  key: {},\n", quote(&definition.key)));
    body.push_str(&format!("  version: {},\n", definition.version));
    body.push_str(&format!("  method: {},\n", quote(&definition.method)));
    body.push_str(&format!("  path: {},\n", quote(&definition.path)));
    body.push_str(&format!("  roles: [{roles}],\n"));
    // An empty key is scaffolding, not documentation. The generator states only
    // what the controller says; prose is added afterwards, by hand or by the
    // `swagger-create` skill.
    if !definition.description.is_empty() {
        body.push_str(&format!("  summary: {},\n", quote(&definition.description)));
    }
    if !definition.prose.is_empty() {
        body.push_str(&format!("  description: {},\n", quote(&definition.prose)));
    }
    body.push_str(&render_fields("  ", "params", &definition.params));
    body.push_str(&render_fields("  ", "queries", &definition.queries));
    if !definition.payload.is_empty() {
        body.push_str("  payload: {\n");
        if definition.payload.iter().any(|field| field.ty == "file") {
            body.push_str("    contentType: \"multipart\",\n");
        }
        body.push_str(&render_fields("    ", "fields", &definition.payload));
        body.push_str("  },\n");
    }
    if definition.response.is_empty() {
        body.push_str("  responses: [{ status: 200 }],\n");
    } else {
        body.push_str("  responses: [\n    {\n      status: 200,\n");
        body.push_str(&render_fields("      ", "fields", &definition.response));
        body.push_str("    },\n  ],\n");
    }

    format!(
        "import type {{ RouteMetaType }} from \"../../shared/route\";\n\nexport const meta = {{\n{body}}} satisfies RouteMetaType;\n"
    )
}

/// The JSON Schema a declared scalar name describes, with the `format` the name
/// implies where one exists.
fn scalar_schema(name: &str) -> Option<Value> {
    let (ty, format) = match name.to_lowercase().as_str() {
        "string" => ("string", None),
        "uuid" => ("string", Some("uuid")),
        "email" => ("string", Some("email")),
        "url" => ("string", Some("uri")),
        "date" => ("string", Some("date")),
        "datetime" => ("string", Some("date-time")),
        // An upload travels as raw bytes multipart-side and as base64 JSON-side.
        "file" => ("string", Some("binary")),
        "base64" => ("string", Some("byte")),
        "number" | "float" => ("number", None),
        "integer" | "int" => ("integer", None),
        "boolean" | "bool" => ("boolean", None),
        _ => return None,
    };
    Some(match format {
        Some(format) => json!({ "type": ty, "format": format }),
        None => json!({ "type": ty }),
    })
}

/// The schema a declared type describes: an array for a `[]` suffix, an object
/// for a type with members, an `enum` for a union of quoted literals, and a
/// free-form value for anything the generator cannot pin down — which is
/// honest, where guessing would not be.
fn schema_of(declared: &str, fields: &[RouteField]) -> Value {
    let declared = declared.trim();

    if let Some(element) = declared.strip_suffix("[]") {
        return json!({ "type": "array", "items": schema_of(element, fields) });
    }

    if !fields.is_empty() {
        return object_schema(fields);
    }

    if declared.contains('|') {
        let literals = declared
            .split('|')
            .map(str::trim)
            .filter(|part| part.len() >= 2 && (part.starts_with('"') || part.starts_with('\'')))
            .map(|part| &part[1..part.len() - 1])
            .collect::<Vec<_>>();
        if !literals.is_empty() {
            return json!({ "type": "string", "enum": literals });
        }
    }

    scalar_schema(declared).unwrap_or_else(|| json!({}))
}

/// The object schema a list of documented fields adds up to.
fn object_schema(fields: &[RouteField]) -> Value {
    let mut properties = Map::new();
    for field in fields {
        let mut schema = schema_of(&field.ty, &field.fields);
        if !field.description.is_empty() {
            schema["description"] = json!(field.description);
        }
        properties.insert(field.name.clone(), schema);
    }

    let mut schema = json!({ "type": "object", "properties": Value::Object(properties) });
    let required = fields
        .iter()
        .filter(|field| field.required)
        .map(|field| field.name.as_str())
        .collect::<Vec<_>>();
    if !required.is_empty() {
        schema["required"] = json!(required);
    }
    schema
}

/// The wire shape of a successful answer.
///
/// A route type's `response` block names what the handler puts in `data`; the
/// framework wraps it in an envelope before it reaches the network. A consumer
/// reading the specification parses the envelope, so that is what the schema
/// has to describe.
fn envelope_schema(response: &[RouteField]) -> Value {
    json!({
        "type": "object",
        "properties": {
            "key": { "type": ["string", "null"] },
            "data": object_schema(response),
            "message": { "type": ["string", "null"] },
            "success": { "type": "boolean" },
            "done": { "type": "boolean" },
            "status": { "type": "integer" },
            "isClientError": { "type": "boolean" },
            "isServerError": { "type": "boolean" },
            "isNotFound": { "type": "boolean" },
            "isUnauthorized": { "type": "boolean" },
            "isForbidden": { "type": "boolean" },
            "app": { "type": "object", "properties": { "env": { "type": "string" } } },
        },
        "required": ["data", "success", "status"],
    })
}

fn parameter_of(field: &RouteField, location: &str) -> Value {
    let mut parameter = json!({
        "name": field.name,
        "in": location,
        "required": location == "path" || field.required,
        "schema": schema_of(&field.ty, &field.fields),
    });
    if !field.description.is_empty() {
        parameter["description"] = json!(field.description);
    }
    parameter
}

/// The single operation a route definition publishes.
fn operation_of(definition: &RouteDefinition) -> Value {
    let mut operation = Map::new();
    operation.insert("operationId".into(), json!(definition.key));
    if !definition.description.is_empty() {
        operation.insert("summary".into(), json!(definition.description));
    }
    if !definition.prose.is_empty() {
        operation.insert("description".into(), json!(definition.prose));
    }
    // The route key is `<module>.<…>`, and the module is the tag.
    let group = definition.key.split('.').next().unwrap_or("API");
    operation.insert("tags".into(), json!([to_pascal_case(group)]));

    let parameters = definition
        .params
        .iter()
        .map(|field| parameter_of(field, "path"))
        .chain(
            definition
                .queries
                .iter()
                .map(|field| parameter_of(field, "query")),
        )
        .collect::<Vec<_>>();
    if !parameters.is_empty() {
        operation.insert("parameters".into(), json!(parameters));
    }

    if !definition.payload.is_empty() {
        // A payload naming a file is carried by a form, not by JSON.
        let media = if definition.payload.iter().any(|field| field.ty == "file") {
            "multipart/form-data"
        } else {
            "application/json"
        };
        operation.insert(
            "requestBody".into(),
            json!({
                "required": true,
                "content": { media: { "schema": object_schema(&definition.payload) } },
            }),
        );
    }

    let success = if definition.response.is_empty() {
        json!({ "description": "Successful response" })
    } else {
        json!({
            "description": "Successful response",
            "content": { "application/json": { "schema": envelope_schema(&definition.response) } },
        })
    };
    operation.insert("responses".into(), json!({ "200": success }));

    let security = if definition.roles.is_empty() {
        json!([])
    } else {
        json!([{ "bearerAuth": [] }])
    };
    operation.insert("security".into(), security);

    Value::Object(operation)
}

/// The OpenAPI document the generated routes add up to, published for consumers
/// that read a specification rather than the explorer.
///
/// The mount prefix goes in `servers` and the paths carry only `/v<version>`.
/// That is what OpenAPI means by a server — and it is also the shape
/// `project:check --only=openapi` compares against, since a controller's
/// decorator states the route without the prefix the app mounts it under.
pub fn render_openapi(definitions: &[(String, RouteDefinition)], prefix: &str) -> String {
    let mut paths: std::collections::BTreeMap<String, Map<String, Value>> =
        std::collections::BTreeMap::new();
    let parameter = regex::Regex::new(r":(\w+)").ok();
    for (_, definition) in definitions {
        // A socket route has no HTTP operation to publish; the explorer
        // documents it, the specification leaves it out.
        if definition.method == "socket" {
            continue;
        }
        let served = definition
            .path
            .strip_prefix(&format!("/{prefix}"))
            .unwrap_or(&definition.path);
        // OpenAPI spells a path parameter `{id}`, a route decorator spells it `:id`.
        let path = parameter
            .as_ref()
            .map(|pattern| pattern.replace_all(served, "{$1}").into_owned())
            .unwrap_or_else(|| served.to_string());
        paths
            .entry(path)
            .or_default()
            .insert(definition.method.clone(), operation_of(definition));
    }

    let document = json!({
        "openapi": "3.1.0",
        "info": {
            "title": "API",
            "version": "1.0.0",
            "description": "Generated by `talos swagger:create` from the target module's controllers. Re-run the generator whenever a route is added, renamed or removed.",
        },
        "servers": [{ "url": format!("/{prefix}") }],
        "components": {
            "securitySchemes": {
                "bearerAuth": { "type": "http", "scheme": "bearer", "bearerFormat": "JWT" },
            },
        },
        "paths": paths,
    });

    format!(
        "{}\n",
        serde_json::to_string_pretty(&document).unwrap_or_else(|_| "{}".to_string())
    )
}

/// Every route of every module the swagger documents.
///
/// An `api` target aggregates the controllers of every backend module, the way
/// the app itself mounts them; any other target exposes only its own.
fn collect_routes(
    modules_dir: &Path,
    target_module: &str,
    swagger_name: &str,
    prefix: &str,
) -> Vec<(String, RouteDefinition)> {
    let is_api_target = read_module_type(modules_dir, target_module) == "api";
    let mut routes = Vec::new();

    let Ok(entries) = fs::read_dir(modules_dir) else {
        return routes;
    };
    let mut module_dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    module_dirs.sort();

    for module_dir in module_dirs {
        let module_kebab = module_dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        if module_kebab == swagger_name {
            continue;
        }
        if is_api_target {
            let kind = read_module_type(modules_dir, &module_kebab);
            if kind != "module" && kind != "api" {
                continue;
            }
        } else if module_kebab != target_module {
            continue;
        }

        let registered = registered_controllers(&module_dir, &module_kebab);
        let mut controller_files = Vec::new();
        collect_controller_files(
            &module_dir.join("src").join("controllers"),
            &mut controller_files,
        );
        controller_files.sort();
        for file in controller_files {
            let Ok(content) = fs::read_to_string(file) else {
                continue;
            };
            // A controller file is not served by anything until the module's
            // manifest lists it, so the registration is what is documented.
            if let Some(registered) = &registered
                && !registered.contains(&controller_class_of(&content).unwrap_or_default())
            {
                continue;
            }
            if let Some(definition) = parse_controller(&content, &module_kebab, prefix) {
                routes.push((module_kebab.clone(), definition));
            }
        }
    }

    routes
}

/// Write the documentation half of the module: one `*.route.ts` per route that
/// does not have one yet, plus the published specification.
///
/// A route file that already exists is never rewritten — it holds the prose,
/// the examples and the error statuses somebody wrote by hand, and none of that
/// can be recovered from a decorator. Returns how many files were created.
fn write_documentation(
    module_dir: &Path,
    routes: &[(String, RouteDefinition)],
    prefix: &str,
) -> usize {
    let features_dir = module_dir.join("src").join("features");
    // `src/features/` is generated output, rebuilt from scratch on every run. A
    // route meta states only what a decorator states, so regenerating it loses
    // nothing — and freezing it would let `roles`, a path or a field type drift
    // away from the controller that actually serves the route. Wiping first is
    // also what retires the metas of controllers that were removed or
    // unregistered.
    let _ = fs::remove_dir_all(&features_dir);
    let mut written = 0;

    for (module_kebab, definition) in routes {
        let feature_dir = features_dir.join(module_kebab);
        let _ = fs::create_dir_all(&feature_dir);
        let file_path = feature_dir.join(format!("{}.route.ts", definition.file_stem));
        let _ = fs::write(
            &file_path,
            render_route_file(definition, &to_pascal_case(module_kebab)),
        );
        written += 1;
    }

    let public_dir = module_dir.join("public");
    let _ = fs::create_dir_all(&public_dir);
    let _ = fs::write(
        public_dir.join("openapi.json"),
        render_openapi(routes, prefix),
    );

    written
}

fn install_root_dependencies(cwd: &Path, deps: &[String], dev_deps: &[String]) -> bool {
    if !deps.is_empty()
        && !run_spinner_step(
            false,
            "Installing swagger dependencies",
            Command::new("bun")
                .args(["add"])
                .args(deps)
                .current_dir(cwd),
        )
    {
        return false;
    }
    if !dev_deps.is_empty()
        && !run_spinner_step(
            false,
            "Installing swagger dev dependencies",
            Command::new("bun")
                .args(["add", "-D"])
                .args(dev_deps)
                .current_dir(cwd),
        )
    {
        return false;
    }
    true
}

/// Write the `target:` line into the copied manifest, replacing the template's.
fn with_target_field(yml_content: &str, target: &str) -> String {
    let pattern = regex::Regex::new(r#"(?m)^target:\s*".*"$"#).ok();
    match pattern {
        Some(pattern) if pattern.is_match(yml_content) => pattern
            .replace(yml_content, format!("target: \"{target}\""))
            .into_owned(),
        _ => format!("{}\ntarget: \"{target}\"\n", yml_content.trim_end()),
    }
}

pub fn run(args: &SwaggerCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let silent = args.silent;
    let name = match args.name.clone() {
        Some(name) => name,
        None if silent => "swagger".to_string(),
        None => match ask_input("Enter swagger name") {
            Some(name) => name,
            None => return,
        },
    };

    let pascal_name = to_pascal_case(&name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(&name));
    let kebab_name = to_kebab_case(&pascal_name);
    let modules_dir = cwd.join("modules");
    let module_dir = modules_dir.join(&kebab_name);
    let src_dir = module_dir.join("src");
    let target_module = to_kebab_case(&args.module.clone().unwrap_or_else(|| "app".to_string()));
    let prefix = args
        .prefix
        .clone()
        .unwrap_or_else(|| DEFAULT_PREFIX.to_string());
    let prefix = prefix.trim_matches('/').to_string();

    let mut design = args.design.clone();
    if design.is_none() && !silent {
        let existing = collect_design_modules(&modules_dir);
        if existing.is_empty() {
            design = ask_input("Enter design name");
        } else {
            let mut choices: Vec<String> = existing.clone();
            choices.push(CREATE_NEW_DESIGN.to_string());
            let refs: Vec<&str> = choices.iter().map(String::as_str).collect();
            if let Some(index) = ask_select("Choose a design module", &refs) {
                let selected = refs[index];
                design = if selected == CREATE_NEW_DESIGN {
                    ask_input("Enter design name")
                } else {
                    Some(selected.to_string())
                };
            }
        }
    }
    let design_kebab = design.as_ref().map(|value| {
        to_kebab_case(
            to_pascal_case(value)
                .strip_suffix("Module")
                .unwrap_or(&to_pascal_case(value)),
        )
    });

    // The routes are read before the template lands, so re-running the
    // generator over an existing swagger cannot see its own output.
    let routes = collect_routes(&modules_dir, &target_module, &kebab_name, &prefix);

    // An existing swagger owns its engine: the explorer is meant to be edited —
    // an environment panel, a header editor, whatever the team adds — and a
    // regeneration that reinstalled the template would silently undo all of it.
    // A re-run therefore writes documentation only, and `--force` is the
    // explicit way to ask for the template back.
    let scaffolded = module_dir.join("package.json").exists();
    let routes_only = scaffolded && !args.force;

    if routes_only {
        let written = write_documentation(&module_dir, &routes, &prefix);
        if !silent {
            crate::utils::success(format!(
                "modules/{kebab_name} updated · {} route(s) documented · engine left untouched (--force to reset it)",
                written
            ));
        }
        return;
    }

    let clone_spinner = Spinner::start("Downloading swagger template...");
    let cloned = clone_skeleton(true, !args.no_cache);
    clone_spinner.stop();
    let Some(repo_dir) = cloned else {
        return;
    };
    let template_dir = repo_dir.join("modules").join("swagger");

    let _ = fs::remove_dir_all(&module_dir);
    let _ = fs::create_dir_all(&module_dir);
    let options = CopyOptions::new().content_only(true).overwrite(true);
    if let Err(error) = copy_dir(&template_dir, &module_dir, &options) {
        crate::utils::error(format!("Failed to copy swagger template: {error}"));
        return;
    }

    let template_yml = module_dir.join("swagger.yml");
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    if let Ok(yml_content) = fs::read_to_string(&template_yml) {
        let updated = with_target_field(
            &with_design_field(&yml_content, design_kebab.as_deref()),
            &target_module,
        );
        let _ = fs::write(&yml_path, updated);
        if template_yml != yml_path {
            let _ = fs::remove_file(&template_yml);
        }
    }

    let port = find_free_port(&collect_used_ports(&modules_dir, &kebab_name), DEFAULT_PORT);
    let package_path = module_dir.join("package.json");
    let (deps, dev_deps) = read_dependency_names(&package_path);
    rewrite_package_json(&package_path, &kebab_name, port);
    rewrite_playwright_port(&module_dir.join("playwright.config.ts"), port);
    rewrite_self_imports(&src_dir, "swagger", &kebab_name);
    rewrite_design_alias(&module_dir.join("vite.config.ts"), design_kebab.as_deref());

    let written = write_documentation(&module_dir, &routes, &prefix);

    if !install_root_dependencies(&cwd, &deps, &dev_deps) {
        return;
    }

    if let Some(design_name) = design.as_ref()
        && let Some(design_kebab) = design_kebab.as_ref()
        && !modules_dir.join(design_kebab).exists()
    {
        design_create::run(&DesignCreateArgs {
            name: Some(design_name.clone()),
            cwd: Some(cwd.to_string_lossy().to_string()),
            silent,
            no_cache: args.no_cache,
        });
    }

    let app_tsconfig_path = cwd.join("tsconfig.json");
    if app_tsconfig_path.exists() {
        let _ = add_path_alias(&app_tsconfig_path, &kebab_name);
    }

    if !silent {
        crate::utils::success(format!(
            "modules/{kebab_name} created with {written} route file(s) from {} route(s)",
            routes.len()
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEALTH_CONTROLLER: &str = r#"
import type { ContextType } from "@talosjs/controller";
import { Route } from "@talosjs/routing";

type HealthRouteType = {
  response: { status: string; timestamp: string };
};

@Route.get("/health", {
  name: "app.health.check",
  version: 1,
  description: "Report whether the app is up and reachable",
  roles: [],
})
export class HealthController {}
"#;

    const GRANT_CONTROLLER: &str = r#"
type GrantRouteType = {
  params: { userId: string };
  queries: { page?: number; search?: string };
  payload: { plan: "free" | "pro"; seats: number };
  response: { granted: boolean };
};

@Route.post("/entitlement/:userId/grants", {
  name: "entitlement.grant",
  version: 2,
  description: "Grant an entitlement to a user",
  roles: ["ROLE_ADMIN", "ROLE_OWNER"],
})
export class GrantEntitlementController {}
"#;

    #[test]
    fn reads_the_decorator_a_controller_declares() {
        let route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");

        assert_eq!(route.key, "app.health.check");
        assert_eq!(route.method, "get");
        assert_eq!(route.path, "/api/v1/health");
        assert_eq!(route.roles, Vec::<String>::new());
        assert_eq!(route.file_stem, "HealthCheck");
        assert_eq!(route.title, "Health check");
    }

    #[test]
    fn bakes_the_prefix_and_the_version_into_the_path() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "gateway").expect("a route");

        assert_eq!(route.path, "/gateway/v2/entitlement/:userId/grants");
    }

    #[test]
    fn reads_every_documented_field_off_the_route_type() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");

        assert_eq!(
            route.params,
            vec![RouteField {
                name: "userId".to_string(),
                ty: "string".to_string(),
                required: true,
                description: String::new(),
                fields: Vec::new(),
            }]
        );
        assert_eq!(
            route.queries,
            vec![
                RouteField {
                    name: "page".to_string(),
                    ty: "number".to_string(),
                    required: false,
                    description: String::new(),
                    fields: Vec::new(),
                },
                RouteField {
                    name: "search".to_string(),
                    ty: "string".to_string(),
                    required: false,
                    description: String::new(),
                    fields: Vec::new(),
                },
            ]
        );
        assert_eq!(route.payload.len(), 2);
        assert_eq!(route.payload[0].ty, "\"free\" | \"pro\"");
    }

    #[test]
    fn documents_a_nested_object_as_an_object_carrying_fields() {
        let fields = fields_of("address: { city: string; zip?: number }; name: string");

        assert_eq!(fields[0].name, "address");
        assert_eq!(fields[0].ty, "object");
        assert_eq!(fields[0].fields.len(), 2);
        assert_eq!(fields[0].fields[0].name, "city");
        assert!(!fields[0].fields[1].required);
        assert!(fields[1].fields.is_empty());
    }

    #[test]
    fn survives_a_multi_byte_character_before_the_block() {
        // `open_index` is a byte offset; an em dash earlier in the file used to
        // shift the walk and swallow a closing brace, so a nested object came
        // out as a truncated type string — and the generated file no longer
        // parsed.
        let text = "type T = {\n  // note — here\n  response: {\n    actor: {\n      id: string;\n    };\n  };\n};";
        let start = text.find("response: {").expect("a block") + "response: ".len();
        let (body, _) = match_balanced(text, start).expect("a balanced block");

        assert!(body.contains("actor"));
        assert_eq!(body.matches('{').count(), body.matches('}').count());
        assert_eq!(fields_of(&body)[0].ty, "object");
    }

    #[test]
    fn recurses_through_more_than_one_level() {
        let fields = fields_of("a: { b: { c: string } }");

        assert_eq!(fields[0].fields[0].ty, "object");
        assert_eq!(fields[0].fields[0].fields[0].name, "c");
    }

    #[test]
    fn marks_an_array_of_objects_as_such() {
        let fields = fields_of("items: { sku: string }[]");

        assert_eq!(fields[0].ty, "object[]");
        assert_eq!(fields[0].fields[0].name, "sku");
    }

    #[test]
    fn renders_a_nested_field_as_a_block() {
        let rendered = render_fields("  ", "payload", &fields_of("address: { city: string }"));

        assert!(rendered.contains("name: \"address\", type: \"object\""));
        assert!(rendered.contains("fields: ["));
        assert!(rendered.contains("name: \"city\""));
    }

    #[test]
    fn takes_a_path_parameter_the_route_type_forgot_to_declare() {
        let controller = GRANT_CONTROLLER.replace("params: { userId: string };\n", "");
        let route = parse_controller(&controller, "entitlement", "api").expect("a route");

        assert_eq!(route.params.len(), 1);
        assert_eq!(route.params[0].name, "userId");
    }

    #[test]
    fn keeps_the_roles_that_make_a_route_protected() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");

        assert_eq!(route.roles, vec!["ROLE_ADMIN", "ROLE_OWNER"]);
    }

    #[test]
    fn reads_no_route_out_of_a_file_with_no_decorator() {
        assert!(parse_controller("export class Nothing {}", "app", "api").is_none());
    }

    #[test]
    fn lifts_the_jsdoc_written_above_a_member() {
        let members = split_members("/** The page to read, 1-based. */\n  page?: number;");

        assert_eq!(members.len(), 1);
        assert_eq!(members[0].name, "page");
        assert_eq!(members[0].description, "The page to read, 1-based.");
    }

    #[test]
    fn joins_a_jsdoc_block_written_across_several_lines() {
        let members = split_members(
            "/**\n   * Which slice to read.\n   *\n   * 1-based.\n   */\n  page: number;",
        );

        assert_eq!(members[0].description, "Which slice to read. 1-based.");
    }

    #[test]
    fn lifts_the_jsdoc_written_above_the_decorator_as_the_route_prose() {
        let source = r#"
/**
 * Grant an entitlement.
 *
 * Charges the card on file. Prefer `entitlement.preview` to check first.
 */
@Route.post("/grants", { name: "app.grant", version: 1, description: "Grant" })
export class GrantController {}
"#;
        let route = parse_controller(source, "app", "api").expect("a route");

        // The decorator's one-liner is the summary; the block above it is the
        // prose a reader comes for.
        assert_eq!(route.description, "Grant");
        assert_eq!(
            route.prose,
            "Grant an entitlement. Charges the card on file. Prefer `entitlement.preview` to check first."
        );

        let operation = only_operation(&render_openapi(&[("app".to_string(), route)], "api"));
        assert_eq!(operation["summary"], "Grant");
        assert!(operation["description"].as_str().is_some());
    }

    #[test]
    fn leaves_the_prose_empty_when_the_comment_above_is_not_jsdoc() {
        let source = r#"
/* not documentation */
@Route.get("/health", { name: "app.health", version: 1, description: "Health" })
export class HealthController {}
"#;

        assert_eq!(
            parse_controller(source, "app", "api")
                .expect("a route")
                .prose,
            ""
        );
    }

    #[test]
    fn keeps_a_nested_members_jsdoc_off_its_parent() {
        let fields = fields_of(
            "/** Where the slice sits. */\n  page: {\n    /** 1-based. */\n    index: number;\n  };",
        );

        assert_eq!(fields[0].description, "Where the slice sits.");
        assert_eq!(fields[0].fields[0].description, "1-based.");
    }

    #[test]
    fn reads_a_string_literal_without_mistaking_it_for_a_comment() {
        let members = split_members(r#"origin: "https://a.example" | "https://b.example";"#);

        assert_eq!(members.len(), 1);
        assert_eq!(
            members[0].ty,
            r#""https://a.example" | "https://b.example""#
        );
    }

    #[test]
    fn keeps_a_commented_member_rather_than_dropping_it() {
        // A comment left in place would be read as part of the member's name,
        // and the member would vanish from the documentation entirely.
        let members = split_members("// an aside\n  page: number;\n  /* another */ size: number;");

        assert_eq!(
            members
                .iter()
                .map(|member| member.name.as_str())
                .collect::<Vec<_>>(),
            vec!["page", "size"]
        );
        // Only `/** … */` documents; the rest is a note to whoever reads the file.
        assert!(members.iter().all(|member| member.description.is_empty()));
    }

    #[test]
    fn publishes_a_field_description_in_the_meta_and_the_specification() {
        let source = r#"
type SearchRouteType = {
  queries: {
    /** Free-text needle. */
    q: string;
  };
};

@Route.get("/search", { name: "app.search", version: 1, description: "Search" })
export class SearchController {}
"#;
        let route = parse_controller(source, "app", "api").expect("a route");

        assert!(render_route_file(&route, "App").contains("description: \"Free-text needle.\""));
        let operation = only_operation(&render_openapi(&[("app".to_string(), route)], "api"));
        assert_eq!(
            operation["parameters"][0]["description"],
            "Free-text needle."
        );
    }

    #[test]
    fn splits_members_without_being_fooled_by_a_nested_shape() {
        let members = split_members("a: { b: string; c: number }; d: string[]");

        assert_eq!(members.len(), 2);
        assert_eq!(members[0].name, "a");
        assert_eq!(members[1].ty, "string[]");
    }

    #[test]
    fn renders_a_route_file_that_satisfies_the_meta_contract() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");
        let file = render_route_file(&route, "Entitlement");

        assert!(file.contains("import type { RouteMetaType } from \"../../shared/route\";"));
        assert!(file.contains("} satisfies RouteMetaType;"));
        assert!(file.contains("method: \"post\""));
        assert!(file.contains("roles: [\"ROLE_ADMIN\", \"ROLE_OWNER\"]"));
        assert!(file.contains("group: \"Entitlement\""));
        assert!(file.contains("payload: {"));
    }

    #[test]
    fn escapes_a_quote_so_the_generated_file_still_parses() {
        let mut route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");
        route.description = "the \"live\" probe".to_string();

        assert!(render_route_file(&route, "App").contains(r#"summary: "the \"live\" probe""#));
    }

    #[test]
    fn publishes_the_shape_the_route_answers_with() {
        let route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");

        assert_eq!(route.response.len(), 2);
        assert_eq!(route.response[0].name, "status");
        assert!(render_route_file(&route, "App").contains("fields: ["));
    }

    #[test]
    fn writes_no_empty_key_the_controller_says_nothing_about() {
        let mut route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");
        route.description = String::new();
        let file = render_route_file(&route, "App");

        assert!(!file.contains("summary:"));
        assert!(!file.contains("description:"));
        assert!(!file.contains(r#"description: """#));
    }

    #[test]
    fn falls_back_to_a_bare_status_when_the_route_declares_no_response() {
        let mut route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");
        route.response.clear();

        assert!(render_route_file(&route, "App").contains("responses: [{ status: 200 }]"));
    }

    /// The one operation a single-route specification publishes.
    fn only_operation(spec: &str) -> Value {
        let document: Value = serde_json::from_str(spec).expect("a JSON document");
        let paths = document["paths"].as_object().expect("a path map");
        let item = paths.values().next().expect("one path");
        item.as_object()
            .expect("an item")
            .values()
            .next()
            .expect("one operation")
            .clone()
    }

    #[test]
    fn publishes_a_specification_spelling_parameters_the_openapi_way() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");
        let spec = render_openapi(&[("entitlement".to_string(), route)], "api");
        let document: Value = serde_json::from_str(&spec).expect("a JSON document");

        // The mount prefix lives in `servers`, so the path is what the decorator
        // states — which is what the openapi check compares against.
        assert!(document["paths"]["/v2/entitlement/{userId}/grants"].is_object());
        assert_eq!(document["servers"][0]["url"], "/api");
        assert_eq!(
            only_operation(&spec)["security"][0]["bearerAuth"],
            json!([])
        );
    }

    #[test]
    fn documents_every_parameter_a_route_declares() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");
        let operation = only_operation(&render_openapi(
            &[("entitlement".to_string(), route)],
            "api",
        ));
        let parameters = operation["parameters"].as_array().expect("parameters");

        let path = &parameters[0];
        assert_eq!(path["name"], "userId");
        assert_eq!(path["in"], "path");
        // A path parameter is required by construction, whatever the type says.
        assert_eq!(path["required"], true);
        assert_eq!(path["schema"]["type"], "string");

        let query = &parameters[1];
        assert_eq!(query["name"], "page");
        assert_eq!(query["in"], "query");
        assert_eq!(query["required"], false);
        assert_eq!(query["schema"]["type"], "number");
    }

    #[test]
    fn documents_the_body_a_route_accepts() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");
        let operation = only_operation(&render_openapi(
            &[("entitlement".to_string(), route)],
            "api",
        ));
        let schema = &operation["requestBody"]["content"]["application/json"]["schema"];

        assert_eq!(schema["type"], "object");
        assert_eq!(schema["properties"]["plan"]["enum"], json!(["free", "pro"]));
        assert_eq!(schema["properties"]["seats"]["type"], "number");
        assert_eq!(schema["required"], json!(["plan", "seats"]));
    }

    #[test]
    fn carries_a_file_payload_as_a_form_rather_than_as_json() {
        let route = parse_controller(UPLOAD_CONTROLLER, "media", "api").expect("a route");
        let operation = only_operation(&render_openapi(&[("media".to_string(), route)], "api"));
        let schema = &operation["requestBody"]["content"]["multipart/form-data"]["schema"];

        assert_eq!(schema["properties"]["avatar"]["format"], "binary");
        assert!(operation["requestBody"]["content"]["application/json"].is_null());
    }

    #[test]
    fn describes_the_answer_as_the_envelope_it_travels_in() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");
        let operation = only_operation(&render_openapi(
            &[("entitlement".to_string(), route)],
            "api",
        ));
        let schema = &operation["responses"]["200"]["content"]["application/json"]["schema"];

        // The route type names what goes in `data`; the wire carries the whole
        // envelope, and that is what a consumer parses.
        assert_eq!(schema["properties"]["success"]["type"], "boolean");
        assert_eq!(
            schema["properties"]["data"]["properties"]["granted"]["type"],
            "boolean"
        );
    }

    #[test]
    fn nests_a_schema_the_way_the_route_type_nests_it() {
        let source = r#"
type ProfileRouteType = {
  response: { actor: { id: string; tags: string[] } };
};

@Route.get("/profile", { name: "app.profile", version: 1, description: "Read a profile" })
export class ProfileController {}
"#;
        let route = parse_controller(source, "app", "api").expect("a route");
        let operation = only_operation(&render_openapi(&[("app".to_string(), route)], "api"));
        let actor = &operation["responses"]["200"]["content"]["application/json"]["schema"]["properties"]
            ["data"]["properties"]["actor"];

        assert_eq!(actor["type"], "object");
        assert_eq!(actor["properties"]["id"]["type"], "string");
        assert_eq!(actor["properties"]["tags"]["type"], "array");
        assert_eq!(actor["properties"]["tags"]["items"]["type"], "string");
    }

    #[test]
    fn leaves_a_socket_route_out_of_the_specification() {
        let mut route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");
        route.method = "socket".to_string();

        assert!(!render_openapi(&[("app".to_string(), route)], "api").contains("/v1/health"));
    }

    const UPLOAD_CONTROLLER: &str = r#"
type UploadRouteType = {
  payload: { avatar: RequestFile; caption: string };
  response: { url: string };
};

@Route.post("/media/upload", {
  name: "media.upload",
  version: 1,
  description: "Upload an avatar",
  roles: ["ROLE_USER"],
})
export class UploadController {}
"#;

    #[test]
    fn recognises_the_types_the_framework_rebuilds_as_a_request_file() {
        assert!(is_file_type("RequestFile"));
        assert!(is_file_type("IRequestFile"));
        assert!(is_file_type("File"));
        assert!(is_file_type(" RequestFile[] "));
        assert!(!is_file_type("string"));
        assert!(!is_file_type("Profile"));
    }

    #[test]
    fn marks_a_file_payload_field_as_a_file() {
        let route = parse_controller(UPLOAD_CONTROLLER, "media", "api").expect("a route");

        assert_eq!(route.payload[0].name, "avatar");
        assert_eq!(route.payload[0].ty, "file");
        assert_eq!(route.payload[1].ty, "string");
    }

    #[test]
    fn declares_a_multipart_body_when_a_field_carries_a_file() {
        let route = parse_controller(UPLOAD_CONTROLLER, "media", "api").expect("a route");

        assert!(render_route_file(&route, "Media").contains("contentType: \"multipart\""));
    }

    #[test]
    fn leaves_a_json_body_unmarked() {
        let route = parse_controller(GRANT_CONTROLLER, "entitlement", "api").expect("a route");

        assert!(!render_route_file(&route, "Entitlement").contains("contentType"));
    }

    #[test]
    fn writes_a_route_file_and_the_specification() {
        let temp = tempfile::tempdir().expect("temp dir");
        let route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");

        let written = write_documentation(temp.path(), &[("app".to_string(), route)], "api");

        assert_eq!(written, 1);
        assert!(
            temp.path()
                .join("src/features/app/HealthCheck.route.ts")
                .is_file()
        );
        assert!(temp.path().join("public/openapi.json").is_file());
    }

    #[test]
    fn rewrites_a_route_file_so_it_cannot_drift_from_its_controller() {
        let temp = tempfile::tempdir().expect("temp dir");
        let route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");
        let routes = [("app".to_string(), route)];
        write_documentation(temp.path(), &routes, "api");

        let path = temp.path().join("src/features/app/HealthCheck.route.ts");
        fs::write(
            &path,
            "// stale, written when the decorator said something else",
        )
        .expect("write route file");
        let written = write_documentation(temp.path(), &routes, "api");

        assert_eq!(written, 1);
        assert!(
            fs::read_to_string(&path)
                .expect("read back")
                .contains("app.health.check")
        );
    }

    #[test]
    fn retires_the_meta_of_a_controller_that_is_gone() {
        let temp = tempfile::tempdir().expect("temp dir");
        let route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");
        write_documentation(temp.path(), &[("app".to_string(), route)], "api");
        let orphan = temp.path().join("src/features/app/Removed.route.ts");
        fs::write(&orphan, "// a controller nobody registers any more").expect("write orphan");

        write_documentation(temp.path(), &[], "api");

        assert!(!orphan.exists());
    }

    #[test]
    fn documents_only_the_controllers_a_module_registers() {
        let temp = tempfile::tempdir().expect("temp dir");
        let src = temp.path().join("src");
        fs::create_dir_all(&src).expect("create src");
        fs::write(
            src.join("AppModule.ts"),
            "export const AppModule: ModuleType = {\n  controllers: [...SharedModule.controllers, HealthController],\n};",
        )
        .expect("write manifest");

        let registered = registered_controllers(temp.path(), "app").expect("a manifest");

        // The spread belongs to the module it comes from, which documents it.
        assert_eq!(registered.len(), 1);
        assert!(registered.contains("HealthController"));
    }

    #[test]
    fn documents_everything_when_a_module_has_no_manifest() {
        let temp = tempfile::tempdir().expect("temp dir");

        assert!(registered_controllers(temp.path(), "app").is_none());
    }

    #[test]
    fn reads_the_class_a_controller_declares() {
        assert_eq!(
            controller_class_of(HEALTH_CONTROLLER).as_deref(),
            Some("HealthController")
        );
        assert!(controller_class_of("const x = 1;").is_none());
    }

    #[test]
    fn republishes_the_specification_even_when_no_route_file_is_new() {
        let temp = tempfile::tempdir().expect("temp dir");
        let route = parse_controller(HEALTH_CONTROLLER, "app", "api").expect("a route");
        let routes = [("app".to_string(), route)];
        write_documentation(temp.path(), &routes, "api");
        fs::write(temp.path().join("public/openapi.json"), "stale").expect("stale spec");

        write_documentation(temp.path(), &routes, "gateway");

        let spec = fs::read_to_string(temp.path().join("public/openapi.json")).expect("read spec");
        assert!(spec.contains("\"/gateway\""));
    }

    #[test]
    fn sets_the_target_the_swagger_documents() {
        let yml = "type: \"swagger\"\ndesign: \"design\"\ntarget: \"app\"\n";

        assert!(with_target_field(yml, "gateway").contains("target: \"gateway\""));
    }
}
