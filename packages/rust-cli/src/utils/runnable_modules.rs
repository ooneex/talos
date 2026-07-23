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
        trimmed
            .strip_prefix(prefix)
            .map(|value| value.trim().trim_matches('"').to_string())
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
