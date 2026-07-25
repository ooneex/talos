use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunnableModuleType {
    Api,
    Microservice,
    Spa,
    Storybook,
    Swagger,
}

#[derive(Debug, Clone)]
pub struct RunnableModule {
    pub name: String,
    pub r#type: RunnableModuleType,
    pub dir: PathBuf,
}

fn read_module_type(module_dir: &Path, name: &str) -> Option<String> {
    let yml_file = module_dir.join(format!("{name}.yml"));
    let content = fs::read_to_string(yml_file).ok()?;
    let prefix = "type:";
    content.lines().find_map(|line| {
        let trimmed = line.trim();
        let value = trimmed.strip_prefix(prefix)?;
        let value = value.split('#').next().unwrap_or(value);
        Some(value.trim().trim_matches('"').to_string())
    })
}

pub fn collect_runnable_modules(modules_dir: &Path) -> Vec<RunnableModule> {
    let Ok(entries) = fs::read_dir(modules_dir) else {
        return Vec::new();
    };

    let mut modules = Vec::new();
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(module_type) = read_module_type(&entry.path(), &name) else {
            continue;
        };
        let r#type = match module_type.as_str() {
            "api" => RunnableModuleType::Api,
            "microservice" => RunnableModuleType::Microservice,
            "spa" => RunnableModuleType::Spa,
            "storybook" => RunnableModuleType::Storybook,
            "swagger" => RunnableModuleType::Swagger,
            _ => continue,
        };
        modules.push(RunnableModule {
            name,
            r#type,
            dir: entry.path(),
        });
    }
    modules
}

pub fn select_runnable_modules(
    modules: &[RunnableModule],
    modules_flag: Option<&str>,
    packages_flag: Option<&str>,
) -> Vec<RunnableModule> {
    let requested: Vec<String> = [modules_flag, packages_flag]
        .into_iter()
        .flatten()
        .flat_map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .collect();

    if requested.is_empty() {
        return modules.to_vec();
    }

    modules
        .iter()
        .filter(|module| requested.contains(&module.name))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_module_when_type_has_inline_comment() {
        let temp = tempfile::tempdir().expect("temp dir");
        let modules_dir = temp.path();
        let storybook_dir = modules_dir.join("storybook");
        fs::create_dir_all(&storybook_dir).expect("create module dir");
        fs::write(
            storybook_dir.join("storybook.yml"),
            "type: \"storybook\" # \"api\" | \"microservice\" | \"storybook\"\ndesign: \"design\"\n",
        )
        .expect("write yml");

        let modules = collect_runnable_modules(modules_dir);
        assert_eq!(modules.len(), 1);
        assert_eq!(modules[0].name, "storybook");
        assert_eq!(modules[0].r#type, RunnableModuleType::Storybook);
    }

    #[test]
    fn skips_non_runnable_module_type() {
        let temp = tempfile::tempdir().expect("temp dir");
        let modules_dir = temp.path();
        let user_dir = modules_dir.join("user");
        fs::create_dir_all(&user_dir).expect("create module dir");
        fs::write(
            user_dir.join("user.yml"),
            "type: \"module\" # \"api\" | \"module\"\n",
        )
        .expect("write yml");

        assert!(collect_runnable_modules(modules_dir).is_empty());
    }
}
