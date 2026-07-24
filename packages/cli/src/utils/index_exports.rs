use std::fs;
use std::path::Path;

fn collect_matching_class_names(dir: &Path, filter: &dyn Fn(&str) -> bool) -> Vec<String> {
    let mut names = Vec::new();
    collect_matching_class_names_into(dir, filter, &mut names);
    names
}

fn collect_matching_class_names_into(
    dir: &Path,
    filter: &dyn Fn(&str) -> bool,
    names: &mut Vec<String>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_matching_class_names_into(&path, filter, names);
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if let Some(class_name) = file_name.strip_suffix(".ts")
            && filter(class_name)
        {
            names.push(class_name.to_string());
        }
    }
}

pub fn write_export_index(
    dir: &Path,
    index_file_name: &str,
    filter: impl Fn(&str) -> bool,
) -> Result<(), String> {
    let mut names = collect_matching_class_names(dir, &filter);
    names.sort();

    let content = names
        .iter()
        .map(|name| format!("export {{ {name} }} from './{name}';"))
        .collect::<Vec<_>>()
        .join("\n");

    fs::write(dir.join(index_file_name), format!("{content}\n")).map_err(|e| e.to_string())
}
