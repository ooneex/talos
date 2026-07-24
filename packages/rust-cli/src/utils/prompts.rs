use std::path::PathBuf;

use dialoguer::{Confirm, Input, MultiSelect, Select, theme::ColorfulTheme};
use regex::Regex;

use super::case::to_kebab_case;

pub fn validate_name(input: &str) -> Result<(), String> {
    let valid = input
        .chars()
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && input.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');

    if valid {
        Ok(())
    } else {
        Err("Name must start with a letter and contain only letters, numbers, and hyphens".into())
    }
}

pub fn validate_destination(input: &str) -> Result<(), String> {
    let trimmed = input.trim();
    let valid = !trimmed.is_empty()
        && input
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '~' | '/' | '-'));

    if valid {
        Ok(())
    } else {
        Err(
            "Destination must be a valid path (letters, numbers, dots, hyphens, underscores, and slashes)"
                .into(),
        )
    }
}

pub fn ask_input(prompt: &str) -> Option<String> {
    Input::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .validate_with(|input: &String| validate_name(input))
        .interact_text()
        .ok()
}

pub fn ask_input_with_default(prompt: &str, initial: &str) -> Option<String> {
    Input::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .with_initial_text(initial)
        .interact_text()
        .ok()
}

pub fn ask_plain_input(prompt: &str) -> Option<String> {
    Input::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .interact_text()
        .ok()
}

pub fn ask_name() -> Option<String> {
    Input::with_theme(&ColorfulTheme::default())
        .with_prompt("Enter application name")
        .validate_with(|input: &String| validate_name(input))
        .interact_text()
        .ok()
}

pub fn ask_destination(initial: &str) -> Option<String> {
    Input::with_theme(&ColorfulTheme::default())
        .with_prompt("Enter destination path")
        .with_initial_text(initial)
        .validate_with(|input: &String| validate_destination(input))
        .interact_text()
        .ok()
}

pub fn ask_confirm(prompt: &str, default: bool) -> bool {
    Confirm::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .default(default)
        .interact()
        .unwrap_or(default)
}

pub fn ask_select(prompt: &str, items: &[&str]) -> Option<usize> {
    Select::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .items(items)
        .default(0)
        .interact()
        .ok()
}

pub fn ask_multiselect(prompt: &str, items: &[&str], defaults: &[bool]) -> Option<Vec<usize>> {
    MultiSelect::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .items(items)
        .defaults(defaults)
        .interact()
        .ok()
}

pub fn validate_route_name(input: &str) -> Result<(), String> {
    let trimmed = input.trim();
    let valid = trimmed == input
        && input.len() >= 7
        && Regex::new(r"^[a-zA-Z0-9]+\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+$")
            .map(|re| re.is_match(input))
            .unwrap_or(false);

    if valid {
        Ok(())
    } else {
        Err(
            "Route name must follow format: namespace.resource.action (e.g., 'api.users.list')"
                .into(),
        )
    }
}

pub fn validate_route_path(input: &str) -> Result<(), String> {
    let trimmed = input.trim();
    if trimmed != input {
        return Err(
            "Route path must start with '/' and contain only valid segments (e.g., '/users', '/api/users/:id')"
                .into(),
        );
    }
    if !input.starts_with('/') {
        return Err("Route path must start with '/'".into());
    }
    if input.len() > 1 && input.ends_with('/') {
        return Err("Route path cannot end with '/' (except for root path)".into());
    }
    if !Regex::new(r"^/[\w\-/:]*$")
        .map(|re| re.is_match(input))
        .unwrap_or(false)
    {
        return Err(
            "Route path must start with '/' and contain only valid segments (e.g., '/users', '/api/users/:id')"
                .into(),
        );
    }
    if input == "/" {
        return Ok(());
    }
    let valid_segment = Regex::new(r"^[a-zA-Z0-9\-_]+$").ok();
    let param_segment = Regex::new(r"^:[a-zA-Z][a-zA-Z0-9]*$").ok();
    for segment in input.trim_start_matches('/').split('/') {
        if segment.is_empty() {
            return Err("Route path cannot contain empty segments (double slashes)".into());
        }
        if segment.starts_with(':') {
            if !param_segment
                .as_ref()
                .is_some_and(|re| re.is_match(segment))
            {
                return Err(format!(
                    "Invalid parameter segment '{segment}'. Parameters must follow format ':paramName' with alphanumeric characters only"
                ));
            }
        } else if !valid_segment
            .as_ref()
            .is_some_and(|re| re.is_match(segment))
        {
            return Err(format!(
                "Invalid path segment '{segment}'. Segments must contain only letters, numbers, hyphens, and underscores"
            ));
        }
    }
    Ok(())
}

pub fn validate_route_method(input: &str) -> Result<(), String> {
    const HTTP_METHODS: &[&str] = &["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];
    if input.trim() != input || !HTTP_METHODS.contains(&input.to_uppercase().as_str()) {
        Err(format!(
            "Route method must be one of: {}",
            HTTP_METHODS.join(", ")
        ))
    } else {
        Ok(())
    }
}

pub fn ask_password(prompt: &str) -> Option<String> {
    dialoguer::Password::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .interact()
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn find_destination_modules(cwd: &std::path::Path) -> Vec<String> {
    let modules_dir = cwd.join("modules");
    let Ok(entries) = std::fs::read_dir(&modules_dir) else {
        return Vec::new();
    };

    let mut destinations: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let yml_path = modules_dir.join(&name).join(format!("{name}.yml"));
            let content = std::fs::read_to_string(yml_path).ok()?;
            let is_destination = content.lines().any(|line| {
                let trimmed = line.trim();
                trimmed == r#"type: "api""# || trimmed == r#"type: "microservice""#
            });
            is_destination.then_some(name)
        })
        .collect();

    destinations.sort();
    destinations
}

pub fn ask_destination_module(cwd: &std::path::Path, message: &str) -> String {
    let choices = find_destination_modules(cwd);
    if choices.is_empty() {
        return "app".to_string();
    }

    let default_index = choices.iter().position(|c| c == "app").unwrap_or(0);
    Select::with_theme(&ColorfulTheme::default())
        .with_prompt(message)
        .items(&choices)
        .default(default_index)
        .interact()
        .ok()
        .and_then(|index| choices.get(index).cloned())
        .unwrap_or_else(|| "app".to_string())
}

pub fn resolve_name_and_destination(
    name: Option<String>,
    destination: Option<String>,
) -> Option<(String, String, PathBuf)> {
    let name = match name {
        Some(name) => name,
        None => ask_name()?,
    };

    let kebab_name = to_kebab_case(&name);

    let destination = match destination {
        Some(destination) => destination,
        None => ask_destination(&kebab_name)?,
    };

    let destination_path = PathBuf::from(&destination);
    Some((name, kebab_name, destination_path))
}

pub fn ask_route_name(prompt: &str) -> Option<String> {
    Input::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .validate_with(|input: &String| validate_route_name(input))
        .interact_text()
        .ok()
}

pub fn ask_route_path(prompt: &str, initial: &str) -> Option<String> {
    Input::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .with_initial_text(initial)
        .validate_with(|input: &String| validate_route_path(input))
        .interact_text()
        .ok()
}

pub fn ask_route_method(prompt: &str) -> Option<String> {
    const HTTP_METHODS: &[&str] = &["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];
    Select::with_theme(&ColorfulTheme::default())
        .with_prompt(prompt)
        .items(HTTP_METHODS)
        .default(0)
        .interact()
        .ok()
        .and_then(|index| HTTP_METHODS.get(index).map(|value| (*value).to_string()))
}
