use std::path::{Path, PathBuf};

use clap::Args;

use crate::utils::{
    IMAGE_EXTENSION, MARKETING_PLATFORMS, MARKETING_STATES, MarketingYaml, VIDEO_EXTENSION,
    current_dir, ensure_module, generate_marketing_id, generate_media_name, marketing_to_yaml,
    normalize_platform, normalize_state,
};

#[derive(Args, Debug)]
pub struct MarketingCreateArgs {
    #[arg(long)]
    pub title: Option<String>,

    #[arg(long)]
    pub content: Option<String>,

    #[arg(long = "hashtag", help = "Hashtag (repeatable)")]
    pub hashtags: Vec<String>,

    #[arg(
        long = "platform",
        help = "Target platform (repeatable): X, Instagram, Facebook, LinkedIn, TikTok, Threads, WhatsApp, Telegram, Messenger, Discord, Reddit, Medium"
    )]
    pub platforms: Vec<String>,

    #[arg(
        long = "image",
        help = "Path to a .png image copied into the post's images/ folder (repeatable)"
    )]
    pub images: Vec<String>,

    #[arg(
        long = "video",
        help = "Path to a .mp4 video copied into the post's videos/ folder (repeatable)"
    )]
    pub videos: Vec<String>,

    #[arg(long, help = "Post state: Todo, In Review or Published")]
    pub state: Option<String>,

    #[arg(long)]
    pub module: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

/// Copy every source file into `media_dir` under a generated `a-f0-9` name and
/// return the stored file names.
fn copy_media(
    sources: &[String],
    media_dir: &Path,
    extension: &str,
) -> Result<Vec<String>, String> {
    let mut stored = Vec::new();

    for source in sources {
        let path = PathBuf::from(source);
        if !path.is_file() {
            return Err(format!("{source} is not a file"));
        }
        let matches_extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case(extension));
        if !matches_extension {
            return Err(format!("{source} is not a .{extension} file"));
        }

        let name = generate_media_name(Some(media_dir), extension);
        std::fs::copy(&path, media_dir.join(&name))
            .map_err(|error| format!("Failed to copy {source}: {error}"))?;
        stored.push(name);
    }

    Ok(stored)
}

pub fn run(args: &MarketingCreateArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(current_dir);
    let module = args.module.clone().unwrap_or_else(|| "shared".to_string());
    let title = args.title.clone().unwrap_or_default();
    let content = args.content.clone().unwrap_or_default();

    let mut platforms = Vec::new();
    for platform in &args.platforms {
        match normalize_platform(platform) {
            Some(resolved) => {
                if !platforms.iter().any(|existing| existing == resolved) {
                    platforms.push(resolved.to_string());
                }
            }
            None => {
                crate::utils::error(format!(
                    "Unknown platform \"{platform}\". Expected one of: {}",
                    MARKETING_PLATFORMS.join(", ")
                ));
                return;
            }
        }
    }

    let state = match args.state.as_deref() {
        None => "Todo".to_string(),
        Some(value) => match normalize_state(value) {
            Some(resolved) => resolved.to_string(),
            None => {
                crate::utils::error(format!(
                    "Unknown state \"{value}\". Expected one of: {}",
                    MARKETING_STATES.join(", ")
                ));
                return;
            }
        },
    };

    ensure_module(&module, &cwd);

    let marketing_dir = cwd.join("modules").join(&module).join("marketing");
    let _ = std::fs::create_dir_all(&marketing_dir);

    let resolved_id = generate_marketing_id(Some(&marketing_dir));
    let post_dir = marketing_dir.join(&resolved_id);
    let images_dir = post_dir.join("images");
    let videos_dir = post_dir.join("videos");

    for dir in [&images_dir, &videos_dir] {
        if let Err(error) = std::fs::create_dir_all(dir) {
            crate::utils::error(format!("Failed to create {}: {error}", dir.display()));
            let _ = std::fs::remove_dir_all(&post_dir);
            return;
        }
    }

    // A post that can't take its media is not a post — leave nothing behind.
    let media = copy_media(&args.images, &images_dir, IMAGE_EXTENSION).and_then(|images| {
        Ok((
            images,
            copy_media(&args.videos, &videos_dir, VIDEO_EXTENSION)?,
        ))
    });
    let (images, videos) = match media {
        Ok(media) => media,
        Err(error) => {
            crate::utils::error(error);
            let _ = std::fs::remove_dir_all(&post_dir);
            return;
        }
    };

    // Empty media folders would not survive a commit otherwise.
    if images.is_empty() {
        let _ = std::fs::write(images_dir.join(".gitkeep"), "");
    }
    if videos.is_empty() {
        let _ = std::fs::write(videos_dir.join(".gitkeep"), "");
    }

    let yaml = marketing_to_yaml(&MarketingYaml {
        id: Some(resolved_id.clone()),
        module: Some(module.clone()),
        title: Some(title.trim().to_string()),
        content: Some(content.trim().to_string()),
        hashtags: Some(
            args.hashtags
                .iter()
                .map(|hashtag| hashtag.trim().trim_start_matches('#').to_string())
                .filter(|hashtag| !hashtag.is_empty())
                .collect(),
        ),
        images: Some(images),
        videos: Some(videos),
        platforms: Some(platforms),
        state: Some(state),
    });

    let file_path = post_dir.join(format!("{resolved_id}.yml"));
    if let Err(error) = std::fs::write(&file_path, yaml) {
        crate::utils::error(format!("Failed to write {}: {error}", file_path.display()));
        return;
    }

    crate::utils::success(format!("{} created successfully", file_path.display()));
}
