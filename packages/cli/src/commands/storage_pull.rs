// `storage:pull` — download a remote bucket path into a local folder.
//
// The mirror of `storage:push`: the transport lives in `utils::storage`, and
// this command is about turning object keys into local paths — safely, since
// a key and a zip entry both come from the other side of the network.

use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use clap::Args;
use rayon::prelude::*;

use crate::commands::storage_push::{
    ask_storage_provider, exit_with, missing_credentials, resolve_required_input,
};
use crate::utils::storage::{
    Remote, StorageProvider, agent, get_object, join_key, list_objects, resolve_remote,
};
use crate::utils::{
    Loader, LoaderGroup, current_dir, error, info, read_credentials, success, warn,
};

#[derive(Args, Debug)]
pub struct StoragePullArgs {
    #[arg(long, value_enum)]
    pub provider: Option<StorageProvider>,

    /// Remote bucket path to pull. On Cloudflare R2 the first segment is the
    /// bucket name, since the R2 profile only stores the account endpoint.
    #[arg(long)]
    pub from: Option<String>,

    /// Local folder the content lands in.
    #[arg(long)]
    pub destination: Option<String>,

    /// Unpack every zip archive that comes down, instead of writing it as a
    /// file.
    #[arg(long, default_value_t = false)]
    pub unzip: bool,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

fn print_pull_summary(
    root: &std::path::Path,
    from: &str,
    downloads_len: usize,
    skipped: usize,
    failures: &[(String, String)],
    silent: bool,
) {
    if !silent && skipped > 0 {
        warn(format!(
            "Skipped {skipped} object(s) whose key escapes {}",
            root.display()
        ));
    }
    if silent {
        return;
    }
    for (key, message) in failures {
        error(format!("{key}: {message}"));
    }
    let pulled = downloads_len.saturating_sub(failures.len());
    if failures.is_empty() {
        success(format!("Pulled {pulled} object(s) into {}", root.display()));
    } else {
        info(format!(
            "Summary: {pulled} pulled, {} failed",
            failures.len()
        ));
    }
    let _ = from;
}

pub fn run(args: &StoragePullArgs) {
    let Some(provider) = args.provider.or_else(ask_storage_provider) else {
        exit_with("No provider given");
    };

    let Some(from) = resolve_required_input(
        args.from.clone(),
        "Enter the remote bucket path to pull",
        "No `--from` path given",
    ) else {
        std::process::exit(1);
    };
    let Some(destination) = resolve_required_input(
        args.destination.clone(),
        "Enter the local folder to pull into",
        "No `--destination` folder given",
    ) else {
        std::process::exit(1);
    };

    let Some(profile) = read_credentials(&format!("{}.yml", provider.slug())) else {
        exit_with(missing_credentials(provider));
    };

    let (remote, prefix) = match resolve_remote(provider, &profile, &from) {
        Ok(resolved) => resolved,
        Err(message) => exit_with(message),
    };

    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let root = cwd.join(&destination);
    if let Err(e) = fs::create_dir_all(&root) {
        exit_with(format!("Cannot create {}: {e}", root.display()));
    }

    let agent = agent();
    let keys = match list_objects(&agent, &remote, &prefix) {
        Ok(keys) => keys,
        Err(message) => exit_with(format!("Cannot list {from}: {message}")),
    };

    // A prefix that lists nothing may still be one object's exact key — that is
    // what `--from bucket/assets/app.css` means.
    let keys = if keys.is_empty() {
        vec![prefix.clone()]
    } else {
        keys
    };
    let downloads: Vec<(String, PathBuf)> = keys
        .iter()
        .filter(|key| !key.ends_with('/'))
        .filter_map(|key| local_path(&root, &prefix, key).map(|path| (key.clone(), path)))
        .collect();
    let skipped = keys.iter().filter(|key| !key.ends_with('/')).count() - downloads.len();
    if downloads.is_empty() {
        exit_with(format!("Nothing to pull from {from}"));
    }

    let failures = pull_all(&remote, &downloads, provider, args.unzip, args.silent);
    print_pull_summary(
        &root,
        &from,
        downloads.len(),
        skipped,
        &failures,
        args.silent,
    );
    if !failures.is_empty() {
        std::process::exit(1);
    }
}

/// Download every object, and report the ones that did not land.
fn pull_all(
    remote: &Remote,
    downloads: &[(String, PathBuf)],
    provider: StorageProvider,
    unzip: bool,
    silent: bool,
) -> Vec<(String, String)> {
    let agent = agent();
    let loader = if silent {
        Loader::hidden()
    } else {
        Loader::start(vec![LoaderGroup::new(
            format!("Pulling from {}", provider.label()),
            downloads.len(),
        )])
    };
    let failures: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

    downloads.par_iter().for_each(|(key, path)| {
        loader.entered(0, key.clone());
        let outcome = get_object(&agent, remote, key)
            .and_then(|body| write_object(path, &body, unzip && is_zip(key)));
        if let Err(message) = outcome
            && let Ok(mut locked) = failures.lock()
        {
            locked.push((key.clone(), message));
        }
        loader.left(0, key);
    });
    loader.stop();

    failures.into_inner().unwrap_or_default()
}

fn is_zip(key: &str) -> bool {
    key.to_lowercase().ends_with(".zip")
}

/// Write one object down: as a file, or unpacked into a folder named after the
/// archive.
fn write_object(path: &Path, body: &[u8], unzip: bool) -> Result<(), String> {
    if unzip {
        return unzip_into(&strip_zip_extension(path), body);
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
    }

    fs::write(path, body).map_err(|e| format!("{}: {e}", path.display()))
}

/// `site/dist.zip` -> `site/dist`, so an archive unpacks beside where it would
/// have been written.
pub fn strip_zip_extension(path: &Path) -> PathBuf {
    path.file_stem()
        .map(|stem| path.with_file_name(stem))
        .unwrap_or_else(|| path.to_path_buf())
}

/// Extract an archive under `root`, dropping any entry whose path would escape
/// it.
pub fn unzip_into(root: &Path, body: &[u8]) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(body)).map_err(|e| e.to_string())?;
    fs::create_dir_all(root).map_err(|e| format!("{}: {e}", root.display()))?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        // `enclosed_name` is the zip crate's own zip-slip guard: it returns
        // nothing for an absolute or `..`-escaping entry.
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let path = root.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            continue;
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
        }
        let mut content = Vec::new();
        entry
            .read_to_end(&mut content)
            .map_err(|e| format!("{}: {e}", path.display()))?;
        fs::write(&path, content).map_err(|e| format!("{}: {e}", path.display()))?;
    }

    Ok(())
}

/// Where an object key lands under `root`, or nothing when the key would climb
/// out of it. Keys come from the network, so `..` and absolute paths are the
/// remote's word, not something to trust.
pub fn local_path(root: &Path, prefix: &str, key: &str) -> Option<PathBuf> {
    let relative = relative_key(prefix, key);
    if relative.is_empty() {
        return None;
    }

    let mut path = root.to_path_buf();
    for part in relative.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || Path::new(part).components().count() != 1 {
            return None;
        }
        if !matches!(
            Path::new(part).components().next(),
            Some(Component::Normal(_))
        ) {
            return None;
        }
        path.push(part);
    }

    (path != root).then_some(path)
}

/// The part of a key that sits under the prefix — the path it keeps locally.
/// A key that is the prefix itself (a single pulled object) keeps its name.
pub fn relative_key(prefix: &str, key: &str) -> String {
    let prefix = crate::utils::storage::normalize_prefix(prefix);
    if prefix.is_empty() {
        return key.trim_start_matches('/').to_string();
    }
    if key == prefix {
        return key.rsplit('/').next().unwrap_or(key).to_string();
    }

    key.strip_prefix(&join_key(&prefix, ""))
        .unwrap_or(key)
        .trim_start_matches('/')
        .to_string()
}
