//! Recipes are the steps to test a feature, stored as
//! `modules/<module>/recipes/<ID>.yml`: `recipe:create` writes them and
//! `recipe:run` replays their `steps` in a browser, one action at a time.

use std::fmt;

use serde::{Deserialize, Serialize};

use super::yaml::{push_sequence, quote_scalar, yaml_literal};

/// The actions a step can take, as written in the `--step` shorthand and in
/// the `action:` field.
pub const RECIPE_ACTIONS: &[&str] = &["navigate", "click", "fill", "press", "scroll", "wait"];

/// One browser action. Each maps onto a single `Bun.WebView` call.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
pub enum RecipeStep {
    /// Load `url` and wait for the page to finish loading.
    Navigate { url: String },
    /// Click the element matching `selector` once it is actionable.
    Click { selector: String },
    /// Focus the element matching `selector`, then type `value` into it.
    Fill { selector: String, value: String },
    /// Press a key such as `Enter`, `Tab` or `Escape`.
    Press { key: String },
    /// Scroll the element matching `selector` into view.
    Scroll { selector: String },
    /// Pause for `duration` milliseconds.
    Wait { duration: u64 },
}

impl RecipeStep {
    /// Parses the `--step` shorthand: `<action> <arguments>`.
    ///
    /// ```text
    /// navigate http://localhost:3033
    /// click button[type='submit']
    /// fill input[name='email'] john@example.com
    /// press Enter
    /// scroll #footer
    /// wait 5s
    /// ```
    ///
    /// The last argument takes the rest of the line, so only a `fill` selector
    /// containing spaces needs quoting: `fill "form input" hello world`.
    pub fn parse(input: &str) -> Result<Self, String> {
        let input = input.trim();
        let (action, rest) = input.split_once(char::is_whitespace).unwrap_or((input, ""));
        let rest = rest.trim();

        let step = match action.to_lowercase().as_str() {
            "navigate" => RecipeStep::Navigate {
                url: required(last_argument(rest)?, "a URL")?,
            },
            "click" => RecipeStep::Click {
                selector: required(last_argument(rest)?, "a selector")?,
            },
            "fill" => {
                let (selector, rest) = next_argument(rest)?;
                RecipeStep::Fill {
                    selector: required(selector, "a selector")?,
                    value: last_argument(rest)?,
                }
            }
            "press" => RecipeStep::Press {
                key: required(last_argument(rest)?, "a key")?,
            },
            "scroll" => RecipeStep::Scroll {
                selector: required(last_argument(rest)?, "a selector")?,
            },
            "wait" => RecipeStep::Wait {
                duration: parse_duration(&last_argument(rest)?)?,
            },
            _ => {
                return Err(format!(
                    "Unknown action \"{action}\". Expected one of: {}",
                    RECIPE_ACTIONS.join(", ")
                ));
            }
        };

        Ok(step)
    }

    pub fn action(&self) -> &'static str {
        match self {
            RecipeStep::Navigate { .. } => "navigate",
            RecipeStep::Click { .. } => "click",
            RecipeStep::Fill { .. } => "fill",
            RecipeStep::Press { .. } => "press",
            RecipeStep::Scroll { .. } => "scroll",
            RecipeStep::Wait { .. } => "wait",
        }
    }

    fn push_yaml(&self, lines: &mut Vec<String>) {
        lines.push(format!("  - action: {}", quote_scalar(Some(self.action()))));
        let mut field = |key: &str, value: &str| {
            lines.push(format!("    {key}: {}", quote_scalar(Some(value))));
        };
        match self {
            RecipeStep::Navigate { url } => field("url", url),
            RecipeStep::Click { selector } | RecipeStep::Scroll { selector } => {
                field("selector", selector);
            }
            RecipeStep::Fill { selector, value } => {
                field("selector", selector);
                field("value", value);
            }
            RecipeStep::Press { key } => field("key", key),
            RecipeStep::Wait { duration } => lines.push(format!("    duration: {duration}")),
        }
    }
}

/// Prints the `--step` shorthand, quoted so that [`RecipeStep::parse`] reads it back.
impl fmt::Display for RecipeStep {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let action = self.action();
        match self {
            RecipeStep::Navigate { url } => write!(formatter, "{action} {}", quote_last(url)),
            RecipeStep::Click { selector } | RecipeStep::Scroll { selector } => {
                write!(formatter, "{action} {}", quote_last(selector))
            }
            RecipeStep::Fill { selector, value } => write!(
                formatter,
                "{action} {} {}",
                quote_next(selector),
                quote_last(value)
            ),
            RecipeStep::Press { key } => write!(formatter, "{action} {}", quote_last(key)),
            RecipeStep::Wait { duration } if *duration >= 1000 && duration % 1000 == 0 => {
                write!(formatter, "{action} {}s", duration / 1000)
            }
            RecipeStep::Wait { duration } => write!(formatter, "{action} {duration}ms"),
        }
    }
}

fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn starts_quoted(value: &str) -> bool {
    value.starts_with(['"', '\''])
}

/// A non-final argument ends at whitespace, so it is quoted when it holds any.
fn quote_next(value: &str) -> String {
    if value.is_empty() || starts_quoted(value) || value.contains(char::is_whitespace) {
        quote(value)
    } else {
        value.to_string()
    }
}

/// The final argument takes the rest of the line, trimmed.
fn quote_last(value: &str) -> String {
    if value.is_empty() || starts_quoted(value) || value.trim() != value {
        quote(value)
    } else {
        value.to_string()
    }
}

/// Splits off the next argument — quoted, or up to the next whitespace.
fn next_argument(input: &str) -> Result<(String, &str), String> {
    let input = input.trim_start();
    let Some(quote) = input.chars().next().filter(|c| *c == '"' || *c == '\'') else {
        let (argument, rest) = input.split_once(char::is_whitespace).unwrap_or((input, ""));
        return Ok((argument.to_string(), rest));
    };

    let mut argument = String::new();
    let mut chars = input[1..].char_indices();
    while let Some((index, c)) = chars.next() {
        match c {
            '\\' => match chars.next() {
                Some((_, escaped)) if escaped == quote || escaped == '\\' => argument.push(escaped),
                Some((_, other)) => {
                    argument.push('\\');
                    argument.push(other);
                }
                None => argument.push('\\'),
            },
            c if c == quote => return Ok((argument, &input[1 + index + 1..])),
            c => argument.push(c),
        }
    }
    Err(format!("Unterminated {quote} quote in \"{input}\""))
}

/// The final argument: the rest of the line, or one quoted value.
fn last_argument(input: &str) -> Result<String, String> {
    let input = input.trim();
    if !input.starts_with(['"', '\'']) {
        return Ok(input.to_string());
    }
    let (argument, rest) = next_argument(input)?;
    if !rest.trim().is_empty() {
        return Err(format!(
            "Unexpected \"{}\" after the quoted value",
            rest.trim()
        ));
    }
    Ok(argument)
}

fn required(value: String, what: &str) -> Result<String, String> {
    if value.trim().is_empty() {
        return Err(format!("Missing {what}"));
    }
    Ok(value)
}

/// `5000`, `5000ms` or `5s`, in milliseconds.
fn parse_duration(value: &str) -> Result<u64, String> {
    let invalid = || {
        format!("Invalid duration \"{value}\". Use milliseconds (`500`, `500ms`) or seconds (`5s`)")
    };
    let value = value.trim().to_lowercase();
    let (number, factor) = if let Some(number) = value.strip_suffix("ms") {
        (number, 1)
    } else if let Some(number) = value.strip_suffix('s') {
        (number, 1000)
    } else {
        (value.as_str(), 1)
    };
    number
        .trim()
        .parse::<u64>()
        .ok()
        .and_then(|number| number.checked_mul(factor))
        .ok_or_else(invalid)
}

/// A recipe file, as `recipe:create` writes it and `recipe:run` reads it.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Recipe {
    pub id: String,
    pub module: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub steps: Vec<RecipeStep>,
}

pub fn parse_recipe(content: &str) -> Result<Recipe, String> {
    serde_yaml::from_str(content).map_err(|error| error.to_string())
}

pub fn recipe_to_yaml(recipe: &Recipe) -> String {
    let mut lines = vec![
        format!("id: {}", quote_scalar(Some(&recipe.id))),
        format!("module: {}", quote_scalar(Some(&recipe.module))),
        format!("title: {}", quote_scalar(Some(&recipe.title))),
    ];

    match recipe
        .description
        .as_deref()
        .filter(|text| !text.is_empty())
    {
        Some(description) => lines.push(format!("description: {}", yaml_literal(description))),
        None => lines.push("description: null".to_string()),
    }

    push_sequence(&mut lines, "dependencies", &recipe.dependencies);

    if recipe.steps.is_empty() {
        lines.push("steps: []".to_string());
    } else {
        lines.push("steps:".to_string());
        for step in &recipe.steps {
            step.push_yaml(&mut lines);
        }
    }

    format!("{}\n", lines.join("\n"))
}
