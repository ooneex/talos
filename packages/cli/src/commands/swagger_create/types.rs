//! Expanding the named types a route type points at.
//!
//! A route type rarely spells its response out: it names an alias
//! (`response: PlanViewType`), a generic one (`PageType<CampaignType>`), an
//! intersection, or the return type of a mapper (`ReturnType<typeof toView>`),
//! declared in the controller or in a file it imports. Each is resolved here to
//! the object literal it stands for, so the generator can document its members.

use std::fs;
use std::path::{Path, PathBuf};

use super::match_balanced;

/// How many aliases, imports and nested members are followed before giving up,
/// which also stops a recursive type.
pub const MAX_DEPTH: u8 = 4;

/// The source a type is read in: its text, and the directory its relative
/// imports start from.
#[derive(Clone, Debug, Default)]
pub struct TypeScope {
    pub content: String,
    pub dir: Option<PathBuf>,
}

impl TypeScope {
    pub fn new(content: &str, dir: Option<&Path>) -> Self {
        Self {
            content: content.to_string(),
            dir: dir.map(Path::to_path_buf),
        }
    }
}

/// An object literal a type expression resolves to, with the scope its own
/// members are read in.
#[derive(Clone, Debug)]
pub struct Resolved {
    pub body: String,
    pub scope: TypeScope,
}

/// The parts of `text` separated by `separator` at its top level.
pub fn split_top_level(text: &str, separator: char) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut previous = '\0';

    for ch in text.chars() {
        if let Some(open) = quote {
            current.push(ch);
            if ch == open {
                quote = None;
            }
            previous = ch;
            continue;
        }
        match ch {
            '"' | '\'' | '`' => quote = Some(ch),
            '{' | '[' | '(' | '<' => depth += 1,
            '>' if previous == '=' => {}
            '}' | ']' | ')' | '>' => depth -= 1,
            _ => {}
        }
        if ch == separator && depth == 0 {
            parts.push(std::mem::take(&mut current));
        } else {
            current.push(ch);
        }
        previous = ch;
    }
    parts.push(current);

    parts
        .into_iter()
        .map(|part| part.trim().to_string())
        .filter(|part| !part.is_empty())
        .collect()
}

/// `Name<A, B>` → `("Name", ["A", "B"])`; `Name` → `("Name", [])`.
fn name_and_arguments(ty: &str) -> Option<(String, Vec<String>)> {
    let ty = ty.trim();
    let name_end = ty
        .find(|ch: char| !(ch.is_alphanumeric() || ch == '_' || ch == '$' || ch == '.'))
        .unwrap_or(ty.len());
    let name = &ty[..name_end];
    if name.is_empty() || !name.starts_with(|ch: char| ch.is_alphabetic() || ch == '_') {
        return None;
    }
    let rest = ty[name_end..].trim();
    if rest.is_empty() {
        return Some((name.to_string(), Vec::new()));
    }
    let inner = rest.strip_prefix('<')?.strip_suffix('>')?;
    Some((name.to_string(), split_top_level(inner, ',')))
}

/// Replaces each generic parameter with its argument, as whole words.
fn substitute(expression: &str, parameters: &[String], arguments: &[String]) -> String {
    let mut out = expression.to_string();
    for (index, parameter) in parameters.iter().enumerate() {
        // `T extends X = Y` declares `T`.
        let name = parameter
            .split(|ch: char| ch.is_whitespace() || ch == '=')
            .next()
            .unwrap_or_default();
        let argument = arguments
            .get(index)
            .map(String::as_str)
            .or_else(|| parameter.split_once('=').map(|(_, default)| default.trim()));
        let (Some(argument), false) = (argument, name.is_empty()) else {
            continue;
        };
        if let Ok(pattern) = regex::Regex::new(&format!(r"\b{}\b", regex::escape(name))) {
            out = pattern.replace_all(&out, argument).into_owned();
        }
    }
    out
}

/// The expression a `type NAME<…> = …;` declares, with its generic parameters,
/// or the body of an `interface NAME<…> { … }` written as an object literal.
fn declaration(content: &str, name: &str) -> Option<(Vec<String>, String)> {
    let escaped = regex::escape(name);
    let alias = regex::Regex::new(&format!(
        r"(?m)^\s*(?:export\s+)?type\s+{escaped}\s*(<[^=]*>)?\s*="
    ))
    .ok()?;
    if let Some(found) = alias.captures(content) {
        let parameters = found
            .get(1)
            .map(|group| split_top_level(&group.as_str()[1..group.as_str().len() - 1], ','))
            .unwrap_or_default();
        let start = found.get(0)?.end();
        return Some((parameters, expression_until_end(&content[start..])));
    }

    let interface = regex::Regex::new(&format!(
        r"(?m)^\s*(?:export\s+)?interface\s+{escaped}\s*(<[^{{]*>)?[^{{]*\{{"
    ))
    .ok()?;
    let found = interface.captures(content)?;
    let parameters = found
        .get(1)
        .map(|group| split_top_level(&group.as_str()[1..group.as_str().len() - 1], ','))
        .unwrap_or_default();
    let open = found.get(0)?.end() - 1;
    let (body, _) = match_balanced(content, open)?;
    Some((parameters, format!("{{{body}}}")))
}

/// A type expression up to the `;` (or the line break, once something was
/// read) that ends it at the top level.
fn expression_until_end(text: &str) -> String {
    let mut depth = 0i32;
    let mut previous = '\0';
    for (index, ch) in text.char_indices() {
        match ch {
            '{' | '[' | '(' | '<' => depth += 1,
            '>' if previous == '=' => {}
            '}' | ']' | ')' | '>' => depth -= 1,
            ';' if depth == 0 => return text[..index].trim().to_string(),
            '\n' if depth == 0 => {
                let read = text[..index].trim();
                let continued = text[index..].trim_start();
                if !read.is_empty()
                    && !read.ends_with(['|', '&', '=', ','])
                    && !continued.starts_with(['|', '&'])
                {
                    return read.to_string();
                }
            }
            _ => {}
        }
        previous = ch;
    }
    text.trim().to_string()
}

/// The file a relative `import { NAME } from "./…"` of the scope points at.
fn imported_file(scope: &TypeScope, name: &str) -> Option<PathBuf> {
    let dir = scope.dir.as_ref()?;
    let import =
        regex::Regex::new(r#"import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'](\.{1,2}/[^"']*)["']"#)
            .ok()?;
    let specifier = import.captures_iter(&scope.content).find_map(|found| {
        let names = found.get(1)?.as_str();
        names
            .split(',')
            .map(|part| part.trim().trim_start_matches("type ").trim())
            .any(|part| part == name)
            .then(|| found.get(2).map(|group| group.as_str().to_string()))
            .flatten()
    })?;
    let base = dir.join(specifier);
    ["ts", "tsx"]
        .iter()
        .map(|extension| base.with_extension(extension))
        .chain(
            ["index.ts", "index.tsx"]
                .iter()
                .map(|index| base.join(index)),
        )
        .find(|candidate| candidate.is_file())
}

/// The scope and expression a name is declared with, in the scope itself or in
/// the file a relative import brings it from.
fn find_declaration(scope: &TypeScope, name: &str) -> Option<(TypeScope, Vec<String>, String)> {
    if let Some((parameters, expression)) = declaration(&scope.content, name) {
        return Some((scope.clone(), parameters, expression));
    }
    let file = imported_file(scope, name)?;
    let content = fs::read_to_string(&file).ok()?;
    let imported = TypeScope::new(&content, file.parent());
    let (parameters, expression) = declaration(&imported.content, name)?;
    Some((imported, parameters, expression))
}

/// The members an object literal *value* declares, typed `unknown`: the keys a
/// mapper returns are known, the types of its expressions are not.
fn value_members(body: &str) -> String {
    split_top_level(body, ',')
        .into_iter()
        .filter(|entry| !entry.starts_with("..."))
        .filter_map(|entry| {
            let key = entry
                .split_once(':')
                .map_or(entry.as_str(), |(key, _)| key)
                .trim();
            key.chars()
                .all(|ch| ch.is_alphanumeric() || ch == '_' || ch == '$')
                .then(|| format!("{key}: unknown"))
        })
        .collect::<Vec<_>>()
        .join(";\n")
}

/// The object a function returns: its declared return type, or the object
/// literal an arrow function returns directly.
fn return_object(scope: &TypeScope, function: &str, depth: u8) -> Option<Resolved> {
    let escaped = regex::escape(function);
    let declared = regex::Regex::new(&format!(
        r"(?m)^\s*(?:export\s+)?(?:async\s+)?(?:function\s+{escaped}\s*(?:<[^>]*>)?\s*\(|(?:const|let)\s+{escaped}\s*=\s*(?:async\s*)?(?:<[^>]*>)?\s*\()"
    ))
    .ok()?;
    let (scope, found_at) = match declared.find(&scope.content) {
        Some(found) => (scope.clone(), found.end() - 1),
        None => {
            let file = imported_file(scope, function)?;
            let content = fs::read_to_string(&file).ok()?;
            let imported = TypeScope::new(&content, file.parent());
            let at = declared.find(&imported.content)?.end() - 1;
            (imported, at)
        }
    };

    // Past the parameter list: a `: Type` annotation, then `=>` or `{`.
    let content = &scope.content;
    let mut depth_count = 0i32;
    let mut close = None;
    for (offset, ch) in content[found_at..].char_indices() {
        match ch {
            '(' => depth_count += 1,
            ')' => {
                depth_count -= 1;
                if depth_count == 0 {
                    close = Some(found_at + offset);
                    break;
                }
            }
            _ => {}
        }
    }
    let after = content[close? + 1..].trim_start();
    if let Some(annotated) = after.strip_prefix(':') {
        let end = annotated.find("=>").or_else(|| annotated.find('{'))?;
        return resolve_object(annotated[..end].trim(), &scope, depth.saturating_sub(1));
    }
    let returned = after
        .strip_prefix("=>")?
        .trim_start()
        .strip_prefix('(')?
        .trim_start();
    if !returned.starts_with('{') {
        return None;
    }
    let (body, _) = match_balanced(returned, 0)?;
    Some(Resolved {
        body: value_members(&body),
        scope,
    })
}

/// The object literal a type expression stands for, or `None` when it is not
/// an object (a scalar, a union) or cannot be followed.
pub fn resolve_object(ty: &str, scope: &TypeScope, depth: u8) -> Option<Resolved> {
    let ty = ty.trim().trim_end_matches(';').trim();
    if depth == 0 || ty.is_empty() {
        return None;
    }

    if ty.starts_with('{') {
        let (body, close) = match_balanced(ty, 0)?;
        if close == ty.len() - 1 {
            return Some(Resolved {
                body,
                scope: scope.clone(),
            });
        }
    }

    let parts = split_top_level(ty, '&');
    if parts.len() > 1 {
        let resolved = parts
            .iter()
            .map(|part| resolve_object(part, scope, depth - 1))
            .collect::<Option<Vec<_>>>()?;
        let first_scope = resolved.first()?.scope.clone();
        return Some(Resolved {
            body: resolved
                .into_iter()
                .map(|part| part.body)
                .collect::<Vec<_>>()
                .join(";\n"),
            scope: first_scope,
        });
    }

    let (name, arguments) = name_and_arguments(ty)?;
    match name.as_str() {
        "ReturnType" => {
            let function = arguments.first()?.trim().strip_prefix("typeof ")?.trim();
            return_object(scope, function, depth)
        }
        "Awaited" | "Readonly" | "Required" => resolve_object(arguments.first()?, scope, depth - 1),
        _ => {
            let (found_scope, parameters, expression) = find_declaration(scope, &name)?;
            let expression = substitute(&expression, &parameters, &arguments);
            resolve_object(&expression, &found_scope, depth - 1)
        }
    }
}
