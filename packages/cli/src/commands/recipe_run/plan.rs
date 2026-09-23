use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::utils::{Recipe, RecipeStep, parse_recipe};

/// A recipe file found at `modules/<module>/recipes/<id>.yml`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecipeFile {
    pub module: String,
    pub id: String,
    pub path: PathBuf,
}

impl RecipeFile {
    fn key(&self) -> String {
        format!("{}/{}", self.module, self.id)
    }
}

/// A step of a run, with the recipe it comes from — the target itself or one
/// of its dependencies: its ID, qualified as `<module>/<ID>` when it lives in
/// another module than the target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedStep {
    pub source: String,
    pub step: RecipeStep,
}

/// A target recipe with every step to replay in one browser view: its
/// dependencies' steps first, then its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunPlan {
    pub id: String,
    pub module: String,
    pub title: String,
    pub steps: Vec<PlannedStep>,
}

/// Lists every recipe of the project, sorted by module then ID.
pub fn discover_recipes(root: &Path) -> Vec<RecipeFile> {
    let mut files = Vec::new();
    let Ok(modules) = std::fs::read_dir(root.join("modules")) else {
        return files;
    };

    for module in modules.flatten() {
        let Ok(entries) = std::fs::read_dir(module.path().join("recipes")) else {
            continue;
        };
        let module_name = module.file_name().to_string_lossy().to_string();
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() || path.extension().is_none_or(|extension| extension != "yml") {
                continue;
            }
            let Some(id) = path
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string())
            else {
                continue;
            };
            files.push(RecipeFile {
                module: module_name.clone(),
                id,
                path,
            });
        }
    }

    files.sort_by(|left, right| (&left.module, &left.id).cmp(&(&right.module, &right.id)));
    files
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

fn module_list(files: &[&RecipeFile]) -> String {
    files
        .iter()
        .map(|file| file.module.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

/// Picks the recipes to run. `--module` narrows the candidates; `--id` picks
/// among them in the order given, and without it every candidate runs.
pub fn select_recipes<'a>(
    root: &Path,
    files: &'a [RecipeFile],
    modules: &[String],
    ids: &[String],
) -> Result<Vec<&'a RecipeFile>, String> {
    let modules = unique_values(modules);
    if let Some(missing) = modules
        .iter()
        .find(|module| !root.join("modules").join(module).is_dir())
    {
        return Err(format!("Module \"{missing}\" not found in modules/"));
    }

    let candidates: Vec<&RecipeFile> = files
        .iter()
        .filter(|file| modules.is_empty() || modules.contains(&file.module))
        .collect();

    let ids = unique_values(ids);
    if ids.is_empty() {
        return Ok(candidates);
    }

    let mut selected: Vec<&RecipeFile> = Vec::new();
    for id in &ids {
        let matches: Vec<&RecipeFile> = candidates
            .iter()
            .copied()
            .filter(|file| file.id.eq_ignore_ascii_case(id))
            .collect();
        match matches.as_slice() {
            [] => return Err(format!("Recipe \"{id}\" not found")),
            [file] => {
                if !selected.contains(file) {
                    selected.push(file);
                }
            }
            several => {
                return Err(format!(
                    "Recipe \"{id}\" exists in several modules ({}); pass --module to pick one",
                    module_list(several)
                ));
            }
        }
    }
    Ok(selected)
}

/// Reads each recipe file once, however many runs depend on it.
#[derive(Default)]
pub struct RecipeLoader {
    cache: HashMap<PathBuf, Result<Recipe, String>>,
}

impl RecipeLoader {
    pub fn load(&mut self, file: &RecipeFile) -> Result<&Recipe, String> {
        self.cache
            .entry(file.path.clone())
            .or_insert_with(|| read_recipe(file))
            .as_ref()
            .map_err(Clone::clone)
    }
}

fn read_recipe(file: &RecipeFile) -> Result<Recipe, String> {
    let location = format!("modules/{}/recipes/{}.yml", file.module, file.id);
    let content = std::fs::read_to_string(&file.path)
        .map_err(|error| format!("Could not read {location}: {error}"))?;
    let recipe =
        parse_recipe(&content).map_err(|error| format!("Invalid recipe {location}: {error}"))?;

    if recipe.id != file.id {
        return Err(format!(
            "{location} declares id \"{}\"; it must match the file name",
            recipe.id
        ));
    }
    if recipe.module != file.module {
        return Err(format!(
            "{location} declares module \"{}\"; it must match its folder",
            recipe.module
        ));
    }
    Ok(recipe)
}

/// Finds the recipe a dependency names. An ID shared by several modules
/// resolves to the one in the dependent's module.
fn resolve_dependency<'a>(
    files: &'a [RecipeFile],
    dependent: &RecipeFile,
    id: &str,
) -> Result<&'a RecipeFile, String> {
    let matches: Vec<&RecipeFile> = files.iter().filter(|file| file.id == id).collect();
    match matches.as_slice() {
        [] => Err(format!(
            "Recipe \"{}\" depends on \"{id}\", which does not exist",
            dependent.id
        )),
        [file] => Ok(file),
        several => several
            .iter()
            .copied()
            .find(|file| file.module == dependent.module)
            .ok_or_else(|| {
                format!(
                    "Recipe \"{}\" depends on \"{id}\", which exists in several modules ({})",
                    dependent.id,
                    module_list(several)
                )
            }),
    }
}

struct Planner<'a, 'l> {
    files: &'a [RecipeFile],
    target: &'a RecipeFile,
    loader: &'l mut RecipeLoader,
    visiting: Vec<&'a RecipeFile>,
    done: HashSet<String>,
    steps: Vec<PlannedStep>,
}

impl<'a> Planner<'a, '_> {
    fn visit(&mut self, file: &'a RecipeFile) -> Result<(), String> {
        if self.done.contains(&file.key()) {
            return Ok(());
        }
        if let Some(start) = self.visiting.iter().position(|entry| *entry == file) {
            let cycle: Vec<&str> = self.visiting[start..]
                .iter()
                .map(|entry| entry.id.as_str())
                .chain(std::iter::once(file.id.as_str()))
                .collect();
            return Err(format!("Dependency cycle: {}", cycle.join(" → ")));
        }

        let recipe = self.loader.load(file)?.clone();
        self.visiting.push(file);
        for dependency in unique_values(&recipe.dependencies) {
            let dependency = resolve_dependency(self.files, file, &dependency)?;
            self.visit(dependency)?;
        }
        self.visiting.pop();

        let source = if file.module == self.target.module {
            file.id.clone()
        } else {
            file.key()
        };
        self.steps
            .extend(recipe.steps.into_iter().map(|step| PlannedStep {
                source: source.clone(),
                step,
            }));
        self.done.insert(file.key());
        Ok(())
    }
}

/// Lays out the steps of `target`: every dependency's steps first (depth
/// first, each recipe at most once), then the target's own.
pub fn plan_recipe<'a>(
    files: &'a [RecipeFile],
    target: &'a RecipeFile,
    loader: &mut RecipeLoader,
) -> Result<RunPlan, String> {
    let recipe = loader.load(target)?;
    let (id, module, title) = (
        recipe.id.clone(),
        recipe.module.clone(),
        recipe.title.clone(),
    );

    let mut planner = Planner {
        files,
        target,
        loader,
        visiting: Vec::new(),
        done: HashSet::new(),
        steps: Vec::new(),
    };
    planner.visit(target)?;

    Ok(RunPlan {
        id,
        module,
        title,
        steps: planner.steps,
    })
}
