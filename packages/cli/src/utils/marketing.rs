use std::path::Path;

use super::rng::Rng;
use super::yaml::{quote_scalar, yaml_literal};

const LETTERS: &[u8] = b"ABCDEF";
const MEDIA_ALPHABET: &[u8] = b"abcdef0123456789";
const MEDIA_NAME_LENGTH: usize = 6;

/// Social platforms a marketing post can be published to, in canonical casing.
pub const MARKETING_PLATFORMS: &[&str] = &[
    "X",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "TikTok",
    "Threads",
    "WhatsApp",
    "Telegram",
    "Messenger",
    "Discord",
    "Reddit",
    "Medium",
];

/// Lifecycle states of a marketing post, in canonical casing.
pub const MARKETING_STATES: &[&str] = &["Todo", "In Review", "Published"];

pub const IMAGE_EXTENSION: &str = "png";
pub const VIDEO_EXTENSION: &str = "mp4";

/// Resolve a user-supplied platform to its canonical casing. `twitter` is
/// accepted as an alias of `X`.
pub fn normalize_platform(value: &str) -> Option<&'static str> {
    let value = value.trim();
    if value.eq_ignore_ascii_case("twitter") {
        return Some("X");
    }
    MARKETING_PLATFORMS
        .iter()
        .find(|platform| platform.eq_ignore_ascii_case(value))
        .copied()
}

/// Resolve a user-supplied state to its canonical casing. `in-review` and
/// `inreview` are accepted as aliases of `In Review`.
pub fn normalize_state(value: &str) -> Option<&'static str> {
    let value = value.trim();
    if value.eq_ignore_ascii_case("in-review") || value.eq_ignore_ascii_case("inreview") {
        return Some("In Review");
    }
    MARKETING_STATES
        .iter()
        .find(|state| state.eq_ignore_ascii_case(value))
        .copied()
}

/// Generate a marketing id (`ABC-123456`), avoiding collisions with the post
/// directories already present in `marketing_dir`.
pub fn generate_marketing_id(marketing_dir: Option<&Path>) -> String {
    let mut rng = Rng::new();
    loop {
        let prefix: String = (0..3)
            .map(|_| LETTERS[rng.gen_range(LETTERS.len() as u64) as usize] as char)
            .collect();
        let number = rng.gen_range(1_000_000);
        let id = format!("{prefix}-{number:06}");

        let collides = marketing_dir.is_some_and(|dir| dir.join(&id).exists());
        if !collides {
            return id;
        }
    }
}

/// Generate a media file name — 6 `a-f0-9` characters plus `extension` —
/// avoiding collisions with the files already present in `media_dir`.
pub fn generate_media_name(media_dir: Option<&Path>, extension: &str) -> String {
    let mut rng = Rng::new();
    loop {
        let stem: String = (0..MEDIA_NAME_LENGTH)
            .map(|_| MEDIA_ALPHABET[rng.gen_range(MEDIA_ALPHABET.len() as u64) as usize] as char)
            .collect();
        let name = format!("{stem}.{extension}");

        let collides = media_dir.is_some_and(|dir| dir.join(&name).exists());
        if !collides {
            return name;
        }
    }
}

#[derive(Default)]
pub struct MarketingYaml {
    pub id: Option<String>,
    pub module: Option<String>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub hashtags: Option<Vec<String>>,
    pub images: Option<Vec<String>>,
    pub videos: Option<Vec<String>>,
    pub platforms: Option<Vec<String>>,
    pub state: Option<String>,
}

fn push_sequence(lines: &mut Vec<String>, key: &str, values: &[String]) {
    if values.is_empty() {
        lines.push(format!("{key}: []"));
        return;
    }
    lines.push(format!("{key}:"));
    for value in values {
        lines.push(format!("  - {}", quote_scalar(Some(value))));
    }
}

pub fn marketing_to_yaml(marketing: &MarketingYaml) -> String {
    let mut lines: Vec<String> = Vec::new();

    if let Some(id) = &marketing.id {
        lines.push(format!("id: {}", quote_scalar(Some(id))));
    }
    if let Some(module) = &marketing.module {
        lines.push(format!("module: {}", quote_scalar(Some(module))));
    }
    if let Some(title) = &marketing.title {
        lines.push(format!("title: {}", quote_scalar(Some(title))));
    }

    if let Some(content) = &marketing.content {
        if content.is_empty() {
            lines.push("content: null".to_string());
        } else {
            lines.push(format!("content: {}", yaml_literal(content)));
        }
    }

    if let Some(hashtags) = &marketing.hashtags {
        push_sequence(&mut lines, "hashtags", hashtags);
    }
    if let Some(images) = &marketing.images {
        push_sequence(&mut lines, "images", images);
    }
    if let Some(videos) = &marketing.videos {
        push_sequence(&mut lines, "videos", videos);
    }
    if let Some(platforms) = &marketing.platforms {
        push_sequence(&mut lines, "platforms", platforms);
    }

    if let Some(state) = &marketing.state {
        lines.push(format!("state: {}", quote_scalar(Some(state))));
    }

    format!("{}\n", lines.join("\n"))
}
