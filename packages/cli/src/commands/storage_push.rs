//! `storage:push` — upload a local file or folder to a remote bucket.
//!
//! The transport lives in `utils::storage`; this command is about what a
//! `--from` path expands to and how the run reports.

use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use clap::Args;
use rayon::prelude::*;
use zip::write::SimpleFileOptions;

use crate::utils::storage::{
    Remote, STORAGE_PROVIDERS, StorageProvider, agent, put_object, resolve_remote,
};
use crate::utils::{
    Loader, LoaderGroup, ask_plain_input, ask_select, current_dir, error, info, read_credentials,
    success,
};

#[derive(Args, Debug)]
pub struct StoragePushArgs {
    #[arg(long, value_enum)]
    pub provider: Option<StorageProvider>,

    /// Local file or folder to push.
    #[arg(long)]
    pub from: Option<String>,

    /// Bucket path the content lands under. On Cloudflare R2 the first segment
    /// is the bucket name, since the R2 profile only stores the account
    /// endpoint.
    #[arg(long)]
    pub destination: Option<String>,

    /// Send one zip archive instead of the individual files.
    #[arg(long, default_value_t = false)]
    pub zip: bool,

    #[arg(long, default_value_t = false)]
    pub silent: bool,

    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(args: &StoragePushArgs) {
    let Some(provider) = args.provider.or_else(ask_storage_provider) else {
        error("No provider given");
        std::process::exit(1);
    };

    let Some(from) = args
        .from
        .clone()
        .or_else(|| ask_plain_input("Enter the local file or folder to push"))
    else {
        error("No `--from` path given");
        std::process::exit(1);
    };

    let Some(destination) = args
        .destination
        .clone()
        .or_else(|| ask_plain_input("Enter the destination bucket path"))
    else {
        error("No `--destination` path given");
        std::process::exit(1);
    };

    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let source = cwd.join(&from);
    if !source.exists() {
        error(format!("No such file or folder: {}", source.display()));
        std::process::exit(1);
    }

    let Some(profile) = read_credentials(&format!("{}.yml", provider.slug())) else {
        error(missing_credentials(provider));
        std::process::exit(1);
    };

    let (remote, prefix) = match resolve_remote(provider, &profile, &destination) {
        Ok(resolved) => resolved,
        Err(message) => {
            error(message);
            std::process::exit(1);
        }
    };

    let uploads = match collect_uploads(&source, &prefix, args.zip) {
        Ok(uploads) => uploads,
        Err(message) => {
            error(message);
            std::process::exit(1);
        }
    };
    if uploads.is_empty() {
        error(format!("Nothing to push from {}", source.display()));
        std::process::exit(1);
    }

    let failures = push_all(&remote, &uploads, provider, args.silent);

    if !args.silent {
        for (key, message) in &failures {
            error(format!("{key}: {message}"));
        }
    }

    let pushed = uploads.len() - failures.len();
    if !args.silent {
        if failures.is_empty() {
            success(format!("Pushed {pushed} object(s) to {destination}"));
        } else {
            info(format!(
                "Summary: {pushed} pushed, {} failed",
                failures.len()
            ));
        }
    }
    if !failures.is_empty() {
        std::process::exit(1);
    }
}

/// Send every upload, and report the ones that did not land.
fn push_all(
    remote: &Remote,
    uploads: &[Upload],
    provider: StorageProvider,
    silent: bool,
) -> Vec<(String, String)> {
    let agent = agent();
    let loader = if silent {
        Loader::hidden()
    } else {
        Loader::start(vec![LoaderGroup::new(
            format!("Pushing to {}", provider.label()),
            uploads.len(),
        )])
    };
    let failures: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

    uploads.par_iter().for_each(|upload| {
        loader.entered(0, upload.key.clone());
        let outcome = upload
            .read()
            .and_then(|body| put_object(&agent, remote, &upload.key, &body));
        if let Err(message) = outcome {
            failures.lock().unwrap().push((upload.key.clone(), message));
        }
        loader.left(0, &upload.key);
    });
    loader.stop();

    failures.into_inner().unwrap()
}

/// The message that names the command creating the profile this run wanted.
pub fn missing_credentials(provider: StorageProvider) -> String {
    format!(
        "No {} credentials found. Run `talos credentials:create --provider={}` first.",
        provider.label(),
        provider.slug()
    )
}

pub fn ask_storage_provider() -> Option<StorageProvider> {
    let labels: Vec<&str> = STORAGE_PROVIDERS
        .iter()
        .map(|provider| provider.label())
        .collect();
    let index = ask_select("Select a storage provider", &labels)?;

    STORAGE_PROVIDERS.get(index).copied()
}

// ---------------------------------------------------------------------------
// What gets sent
// ---------------------------------------------------------------------------

/// One object to send: either a file on disk or an archive already in memory.
#[derive(Debug)]
pub struct Upload {
    pub key: String,
    pub source: Option<PathBuf>,
    pub body: Option<Vec<u8>>,
}

impl Upload {
    fn read(&self) -> Result<Vec<u8>, String> {
        match (&self.body, &self.source) {
            (Some(body), _) => Ok(body.clone()),
            (None, Some(path)) => fs::read(path).map_err(|e| e.to_string()),
            (None, None) => Err("Nothing to read".to_string()),
        }
    }
}

/// The objects a `--from` path expands to, keyed under `prefix`.
pub fn collect_uploads(source: &Path, prefix: &str, zip: bool) -> Result<Vec<Upload>, String> {
    if zip {
        let name = archive_name(source)?;
        return Ok(vec![Upload {
            key: crate::utils::storage::join_key(prefix, &name),
            source: None,
            body: Some(zip_archive(source)?),
        }]);
    }

    if source.is_file() {
        let name = source
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .ok_or_else(|| format!("Cannot read the file name of {}", source.display()))?;
        return Ok(vec![Upload {
            key: crate::utils::storage::join_key(prefix, &name),
            source: Some(source.to_path_buf()),
            body: None,
        }]);
    }

    Ok(collect_files(source)?
        .into_iter()
        .map(|(path, relative)| Upload {
            key: crate::utils::storage::join_key(prefix, &relative),
            source: Some(path),
            body: None,
        })
        .collect())
}

/// Every file under `root`, paired with its `/`-separated path relative to it.
pub fn collect_files(root: &Path) -> Result<Vec<(PathBuf, String)>, String> {
    let mut files = Vec::new();
    walk(root, root, &mut files)?;
    files.sort_by(|left, right| left.1.cmp(&right.1));

    Ok(files)
}

fn walk(root: &Path, dir: &Path, files: &mut Vec<(PathBuf, String)>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        // A symlink is followed for files and skipped for directories, so a
        // loop cannot walk forever.
        if path.is_dir() {
            if entry.path().is_symlink() {
                continue;
            }
            walk(root, &path, files)?;
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .components()
            .map(|part| part.as_os_str().to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("/");
        files.push((path, relative));
    }

    Ok(())
}

/// `assets` -> `assets.zip`, `index.html` -> `index.html.zip`.
pub fn archive_name(source: &Path) -> Result<String, String> {
    source
        .file_name()
        .map(|name| format!("{}.zip", name.to_string_lossy()))
        .ok_or_else(|| format!("Cannot read the name of {}", source.display()))
}

/// A zip of `source`, in memory. A file is stored under its own name, a folder
/// under the paths relative to it.
pub fn zip_archive(source: &Path) -> Result<Vec<u8>, String> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default();

    let entries = if source.is_file() {
        let name = source
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .ok_or_else(|| format!("Cannot read the file name of {}", source.display()))?;
        vec![(source.to_path_buf(), name)]
    } else {
        collect_files(source)?
    };

    for (path, name) in entries {
        writer
            .start_file(name, options)
            .map_err(|e| e.to_string())?;
        let content = fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        writer.write_all(&content).map_err(|e| e.to_string())?;
    }

    Ok(writer.finish().map_err(|e| e.to_string())?.into_inner())
}
