use clap::Args;

use crate::utils::{
    Recipe, RecipeStep, current_dir, ensure_module, generate_issue_id, recipe_to_yaml,
};

#[derive(Args, Debug)]
pub struct RecipeCreateArgs {
    #[arg(long)]
    pub title: Option<String>,

    #[arg(long)]
    pub description: Option<String>,

    #[arg(
        long = "step",
        help = "Browser step (repeatable, run in the order given): `navigate <url>`, `click <selector>`, `fill <selector> <value>`, `press <key>`, `scroll <selector>` or `wait <500|500ms|5s>`"
    )]
    pub steps: Vec<String>,

    #[arg(
        long = "dependency",
        value_delimiter = ',',
        help = "ID of a recipe to run first (repeatable or comma-separated)"
    )]
    pub dependencies: Vec<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

/// Trims every value, dropping the blank ones and the repeats, keeping the order given.
fn unique_values(values: &[String]) -> Vec<String> {
    let mut unique: Vec<String> = Vec::new();
    for value in values.iter().map(|value| value.trim()) {
        if !value.is_empty() && !unique.iter().any(|existing| existing == value) {
            unique.push(value.to_string());
        }
    }
    unique
}

/// Parses every non-blank `--step`, printing an error and returning `None` on
/// the first one that isn't a valid step.
fn parse_steps(inputs: &[String]) -> Option<Vec<RecipeStep>> {
    let mut steps = Vec::new();
    for input in inputs.iter().filter(|input| !input.trim().is_empty()) {
        match RecipeStep::parse(input) {
            Ok(step) => steps.push(step),
            Err(error) => {
                crate::utils::error(format!("Invalid step \"{}\": {error}", input.trim()));
                return None;
            }
        }
    }
    Some(steps)
}

pub fn run(args: &RecipeCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    let module = args.module.clone().unwrap_or_else(|| "shared".to_string());
    let title = args.title.clone().unwrap_or_default();
    let description = args.description.clone().unwrap_or_default();

    let Some(steps) = parse_steps(&args.steps) else {
        return;
    };

    ensure_module(&module, &cwd);

    let recipes_dir = cwd.join("modules").join(&module).join("recipes");
    let _ = std::fs::create_dir_all(&recipes_dir);

    let resolved_id = generate_issue_id(Some(&recipes_dir));
    let yaml = recipe_to_yaml(&Recipe {
        id: resolved_id.clone(),
        module: module.clone(),
        title: title.trim().to_string(),
        description: Some(description.trim().to_string()),
        dependencies: unique_values(&args.dependencies),
        steps,
    });

    let file_path = recipes_dir.join(format!("{resolved_id}.yml"));
    if let Err(error) = std::fs::write(&file_path, yaml) {
        crate::utils::error(format!("Failed to write {}: {error}", file_path.display()));
        return;
    }

    crate::utils::success(format!("{} created successfully", file_path.display()));
}
