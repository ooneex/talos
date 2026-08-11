use std::fs;
use std::path::{Path, PathBuf};

use regex::Regex;

use super::{
    ask_confirm, current_dir, find_app_module_name, remove_from_app_module,
    remove_from_shared_module, remove_path_alias, to_kebab_case, to_pascal_case,
};

pub struct ModuleIdentity {
    pub pascal_name: String,
    pub kebab_name: String,
    pub module_dir: PathBuf,
}

pub fn resolve_module_identity(cwd: &Path, name: &str) -> ModuleIdentity {
    let pascal_name = to_pascal_case(name)
        .strip_suffix("Module")
        .map(str::to_string)
        .unwrap_or_else(|| to_pascal_case(name));
    let kebab_name = to_kebab_case(&pascal_name);
    let module_dir = cwd.join("modules").join(&kebab_name);

    ModuleIdentity {
        pascal_name,
        kebab_name,
        module_dir,
    }
}

pub fn resolve_cwd(cwd: Option<&str>) -> PathBuf {
    cwd.map(PathBuf::from).unwrap_or_else(current_dir)
}

pub fn ensure_removable(
    cwd: &Path,
    identity: &ModuleIdentity,
    missing_label: &str,
    silent: bool,
) -> bool {
    // The literal "app" is always protected, even if the app module's yml
    // can't be read — the dynamic check additionally covers it once it's
    // renamed to the project's name.
    let is_app_module = identity.kebab_name == "app"
        || find_app_module_name(cwd).as_deref() == Some(identity.kebab_name.as_str());
    if is_app_module || identity.kebab_name == "shared" {
        if !silent {
            crate::utils::error(format!(
                "Cannot remove the \"{}\" module",
                identity.kebab_name
            ));
        }
        return false;
    }

    if !identity.module_dir.join("package.json").exists() {
        if !silent {
            crate::utils::error(format!(
                "{missing_label} \"{}\" does not exist",
                identity.kebab_name
            ));
        }
        return false;
    }

    true
}

pub fn declared_module_type(module_dir: &Path, kebab_name: &str) -> Option<String> {
    let yml_path = module_dir.join(format!("{kebab_name}.yml"));
    let content = fs::read_to_string(yml_path).ok()?;
    let re = Regex::new(r#"(?m)^type:\s*"?([a-z]+)"?"#).ok()?;
    re.captures(&content)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

pub fn ensure_expected_type(
    identity: &ModuleIdentity,
    expected_type: &str,
    label: &str,
    silent: bool,
) -> bool {
    if declared_module_type(&identity.module_dir, &identity.kebab_name).as_deref()
        == Some(expected_type)
    {
        return true;
    }

    if !silent {
        crate::utils::error(format!(
            "Module \"{}\" is not a {label}",
            identity.kebab_name
        ));
    }
    false
}

pub fn confirm_removal(kebab_name: &str, label: &str, silent: bool) -> bool {
    silent
        || ask_confirm(
            &format!("Are you sure you want to remove the \"{kebab_name}\" {label}?"),
            false,
        )
}

pub fn remove_standard_module_references(cwd: &Path, pascal_name: &str, kebab_name: &str) {
    let app_name = find_app_module_name(cwd).unwrap_or_else(|| "app".to_string());
    let app_module_path = cwd
        .join("modules")
        .join(&app_name)
        .join("src")
        .join("AppModule.ts");
    let _ = remove_from_app_module(&app_module_path, pascal_name, kebab_name);

    let shared_module_path = cwd
        .join("modules")
        .join("shared")
        .join("src")
        .join("SharedModule.ts");
    let _ = remove_from_shared_module(&shared_module_path, pascal_name, kebab_name);

    let tsconfig_path = cwd.join("tsconfig.json");
    let _ = remove_path_alias(&tsconfig_path, kebab_name);
}

pub fn remove_microservice_app_blocks(cwd: &Path, kebab_name: &str) {
    let app_name = find_app_module_name(cwd).unwrap_or_else(|| "app".to_string());
    let app_dir = cwd.join("modules").join(&app_name);
    let esc = regex::escape(kebab_name);
    remove_block(
        &app_dir.join(format!("{app_name}.yml")),
        &format!(
            r#"(?m)(?:^[ \t]*# {esc} microservice[^\n]*\n)?^  - name: "{esc}"\n(?:^ {{4,}}[^\n]*\n)*"#
        ),
    );
    remove_block(
        &app_dir.join(".env.yml"),
        &format!(r"(?m)^  {esc}:\n(?:^ {{4,}}[^\n]*\n)*"),
    );
    remove_block(
        &app_dir.join("docker-compose.yml"),
        &format!(r#"(?m)(?:^[ \t]*# {esc} microservice[^\n]*\n)?^  {esc}:\n(?:^ {{4,}}[^\n]*\n)*"#),
    );
}

pub fn remove_from_app_yml(app_yml_path: &Path, kebab_name: &str) {
    let Ok(mut content) = fs::read_to_string(app_yml_path) else {
        return;
    };
    let esc = regex::escape(kebab_name);

    if let Ok(re) = Regex::new(&format!(
        r#"(?m)(?:^[ \t]*# {esc} microservice[^\n]*\n)?^  - name: "{esc}"\n(?:^ {{4,}}[^\n]*\n)*"#
    )) {
        content = re.replace(&content, "").into_owned();
    }
    if let Ok(re) = Regex::new(r"\n{3,}") {
        content = re.replace_all(&content, "\n\n").into_owned();
    }

    let _ = fs::write(app_yml_path, content);
}

pub fn remove_block(path: &Path, pattern: &str) {
    let Ok(content) = fs::read_to_string(path) else {
        return;
    };
    let Ok(re) = Regex::new(pattern) else {
        return;
    };
    let cleaned = re.replace(&content, "").into_owned();
    let cleaned = Regex::new(r"\n{3,}")
        .ok()
        .map(|re| re.replace_all(&cleaned, "\n\n").into_owned())
        .unwrap_or(cleaned);
    let _ = fs::write(path, cleaned);
}
