//! Shared plumbing for the generators that scaffold a browser module from the
//! skeleton — `storybook:create` and `swagger:create`.
//!
//! Both copy a whole template directory rather than emit a handful of files, so
//! both have to answer the same four questions: which dev port is still free,
//! which design module to alias, how to rewrite the template's own
//! `@module/<template>` imports, and how to write the `design:` line into the
//! manifest.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use serde_json::Value;

/// Set — or remove — the `design:` line of a copied manifest.
///
/// A template ships with the skeleton's own design module named; the generated
/// module names the one the user picked, or none at all when they picked
/// nothing.
pub fn with_design_field(yml_content: &str, design_kebab: Option<&str>) -> String {
    let design_re = regex::Regex::new(r#"(?m)^design:\s*".*"$"#).ok();
    match (design_re, design_kebab) {
        (Some(re), Some(design)) if re.is_match(yml_content) => re
            .replace(yml_content, format!("design: \"{design}\""))
            .into_owned(),
        (Some(re), None) if re.is_match(yml_content) => {
            re.replace(yml_content, "").replace("\n\n\n", "\n\n")
        }
        (_, Some(design)) => format!("{}\ndesign: \"{design}\"\n", yml_content.trim_end()),
        _ => yml_content.to_string(),
    }
}

/// Every dev-server port already claimed by a module's `package.json` scripts.
///
/// `exclude` is the module being generated. Its template has already been
/// copied by the time the port is picked, so without this it reads its own
/// template's port as taken and every generated module drifts one port along.
pub fn collect_used_ports(modules_dir: &Path, exclude: &str) -> BTreeSet<u16> {
    let mut used = BTreeSet::new();
    let Ok(entries) = fs::read_dir(modules_dir) else {
        return used;
    };
    let re = regex::Regex::new(r"--port\s+(\d+)").ok();
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy() == exclude {
            continue;
        }
        let package_path = entry.path().join("package.json");
        if let Ok(raw) = fs::read_to_string(package_path)
            && let Ok(package_json) = serde_json::from_str::<Value>(&raw)
            && let Some(scripts) = package_json.get("scripts").and_then(Value::as_object)
        {
            for script in scripts.values().filter_map(Value::as_str) {
                if let Some(re) = &re {
                    for caps in re.captures_iter(script) {
                        if let Some(port) = caps.get(1).and_then(|m| m.as_str().parse::<u16>().ok())
                        {
                            used.insert(port);
                        }
                    }
                }
            }
        }
    }
    used
}

/// The first free port at or after `preferred`.
pub fn find_free_port(used_ports: &BTreeSet<u16>, preferred: u16) -> u16 {
    let mut port = preferred;
    while used_ports.contains(&port) {
        port += 1;
    }
    port
}

/// The design modules a workspace already has, so the prompt can offer them.
pub fn collect_design_modules(modules_dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(modules_dir) else {
        return Vec::new();
    };
    let mut designs = Vec::new();
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let yml_path = entry.path().join(format!("{name}.yml"));
        if let Ok(content) = fs::read_to_string(yml_path)
            && content.contains("type: \"design\"")
        {
            designs.push(name);
        }
    }
    designs
}

pub fn visit_files_recursive(dir: &Path, callback: &mut impl FnMut(&Path)) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            visit_files_recursive(&path, callback);
        } else if path.is_file() {
            callback(&path);
        }
    }
}

/// Repoint the template's self-imports at the generated module's name.
pub fn rewrite_self_imports(src_dir: &Path, template: &str, kebab_name: &str) {
    let Ok(pattern) = regex::Regex::new(&format!(r#"from \"@module/{template}(["/])"#)) else {
        return;
    };
    visit_files_recursive(src_dir, &mut |file_path| {
        if let Ok(content) = fs::read_to_string(file_path) {
            let rewritten = pattern
                .replace_all(&content, format!("from \"@module/{kebab_name}$1"))
                .into_owned();
            if rewritten != content {
                let _ = fs::write(file_path, rewritten);
            }
        }
    });
}

/// Point the copied `vite.config.ts` at the chosen design module, dropping the
/// template's own alias whether or not one replaces it.
pub fn rewrite_design_alias(vite_path: &Path, design_kebab: Option<&str>) {
    let Ok(vite_content) = fs::read_to_string(vite_path) else {
        return;
    };
    let without_alias = regex::Regex::new(
        r#"\n\s*\"@module/[\w-]+\":\s*fileURLToPath\(\s*\n?\s*new URL\("\.\./[\w-]+/src",\s*import\.meta\.url\),?\s*\n?\s*\),"#,
    )
    .ok()
    .map(|re| re.replace_all(&vite_content, "").into_owned())
    .unwrap_or_else(|| vite_content.clone());

    let with_alias = match design_kebab {
        Some(design_kebab) => without_alias.replace(
            r#"      "@": fileURLToPath(new URL("./src", import.meta.url)),"#,
            &format!(
                "      \"@\": fileURLToPath(new URL(\"./src\", import.meta.url)),\n      \"@module/{design_kebab}\": fileURLToPath(\n        new URL(\"../{design_kebab}/src\", import.meta.url),\n      ),"
            ),
        ),
        None => without_alias,
    };

    if with_alias != vite_content {
        let _ = fs::write(vite_path, with_alias);
    }
}

/// The dependency names a copied `package.json` declares, before it is renamed.
pub fn read_dependency_names(package_path: &Path) -> (Vec<String>, Vec<String>) {
    let Ok(raw) = fs::read_to_string(package_path) else {
        return (Vec::new(), Vec::new());
    };
    let Ok(package_json) = serde_json::from_str::<Value>(&raw) else {
        return (Vec::new(), Vec::new());
    };
    let names = |field: &str| -> Vec<String> {
        package_json
            .get(field)
            .and_then(Value::as_object)
            .map(|deps| deps.keys().cloned().collect())
            .unwrap_or_default()
    };
    (names("dependencies"), names("devDependencies"))
}

/// Rename the copied manifest and pin its dev/build/preview scripts to `port`.
pub fn rewrite_package_json(package_path: &Path, kebab_name: &str, port: u16) {
    let Ok(raw) = fs::read_to_string(package_path) else {
        return;
    };
    let Ok(mut package_json) = serde_json::from_str::<Value>(&raw) else {
        return;
    };
    let Some(root) = package_json.as_object_mut() else {
        return;
    };

    root.insert(
        "name".to_string(),
        Value::String(format!("@module/{kebab_name}")),
    );
    root.insert("type".to_string(), Value::String("module".to_string()));
    let scripts = root
        .entry("scripts")
        .or_insert_with(|| Value::Object(Default::default()));
    if let Some(scripts_map) = scripts.as_object_mut() {
        scripts_map.insert(
            "dev".to_string(),
            Value::String(format!("bun --bun run vite --port {port}")),
        );
        scripts_map.insert(
            "build".to_string(),
            Value::String("bun --bun run vite build".to_string()),
        );
        scripts_map.insert(
            "preview".to_string(),
            Value::String("bun --bun run vite preview".to_string()),
        );
    }

    if let Ok(json) = serde_json::to_string_pretty(&package_json) {
        let _ = fs::write(package_path, format!("{json}\n"));
    }
}

/// Point the copied Playwright config at the port the module actually serves.
pub fn rewrite_playwright_port(config_path: &Path, port: u16) {
    let Ok(content) = fs::read_to_string(config_path) else {
        return;
    };
    let Ok(pattern) = regex::Regex::new(r"127\.0\.0\.1:(\d+)|--port (\d+)") else {
        return;
    };
    let rewritten = pattern
        .replace_all(&content, |caps: &regex::Captures| {
            if caps.get(1).is_some() {
                format!("127.0.0.1:{port}")
            } else {
                format!("--port {port}")
            }
        })
        .into_owned();
    if rewritten != content {
        let _ = fs::write(config_path, rewritten);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_an_existing_design_field() {
        let yml = "type: \"swagger\"\ndesign: \"design\"\ntarget: \"app\"\n";
        assert!(with_design_field(yml, Some("ui")).contains("design: \"ui\""));
    }

    #[test]
    fn appends_a_design_field_when_the_template_has_none() {
        assert!(with_design_field("type: \"swagger\"\n", Some("ui")).contains("design: \"ui\""));
    }

    #[test]
    fn removes_the_design_field_when_no_design_was_chosen() {
        let yml = "type: \"swagger\"\ndesign: \"design\"\n";
        assert!(!with_design_field(yml, None).contains("design:"));
    }

    #[test]
    fn picks_the_first_port_nobody_claimed() {
        let used = BTreeSet::from([3032, 3033]);
        assert_eq!(find_free_port(&used, 3032), 3034);
    }

    #[test]
    fn keeps_the_preferred_port_when_it_is_free() {
        assert_eq!(find_free_port(&BTreeSet::new(), 3032), 3032);
    }

    #[test]
    fn reads_the_ports_the_other_modules_already_claim() {
        let temp = tempfile::tempdir().expect("temp dir");
        let spa = temp.path().join("spa");
        fs::create_dir_all(&spa).expect("create module dir");
        fs::write(
            spa.join("package.json"),
            r#"{"scripts":{"dev":"vite --port 3030","e2e":"vite --port 3030"}}"#,
        )
        .expect("write manifest");

        assert_eq!(
            collect_used_ports(temp.path(), "swagger"),
            BTreeSet::from([3030])
        );
    }

    #[test]
    fn ignores_the_port_of_the_module_being_generated() {
        let temp = tempfile::tempdir().expect("temp dir");
        // The template has already been copied in, carrying its own port.
        let swagger = temp.path().join("swagger");
        fs::create_dir_all(&swagger).expect("create module dir");
        fs::write(
            swagger.join("package.json"),
            r#"{"scripts":{"dev":"vite --port 3032"}}"#,
        )
        .expect("write manifest");

        let used = collect_used_ports(temp.path(), "swagger");

        assert!(used.is_empty());
        assert_eq!(find_free_port(&used, 3032), 3032);
    }

    #[test]
    fn rewrites_every_port_of_a_playwright_config() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("playwright.config.ts");
        fs::write(
            &path,
            "baseURL: \"http://127.0.0.1:3032\"\ncommand: \"vite --port 3032\"\n",
        )
        .expect("write config");

        rewrite_playwright_port(&path, 3040);

        let content = fs::read_to_string(&path).expect("read config");
        assert!(content.contains("127.0.0.1:3040"));
        assert!(content.contains("--port 3040"));
    }
}
