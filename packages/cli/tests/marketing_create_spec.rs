use clap::Parser;
use cli::commands::marketing_create::{MarketingCreateArgs, run};
use cli::utils::{
    MARKETING_PLATFORMS, MARKETING_STATES, generate_marketing_id, generate_media_name,
    normalize_platform, normalize_state,
};

#[derive(Parser)]
struct TestCli {
    #[command(flatten)]
    args: MarketingCreateArgs,
}

#[test]
fn marketing_create_parses_all_flags() {
    let cli = TestCli::try_parse_from([
        "talos",
        "--title",
        "Launch week",
        "--content",
        "We shipped it",
        "--hashtag",
        "launch",
        "--hashtag",
        "talos",
        "--platform",
        "X",
        "--platform",
        "linkedin",
        "--image",
        "./hero.png",
        "--video",
        "./demo.mp4",
        "--state",
        "In Review",
        "--module",
        "user",
        "--cwd",
        "./here",
    ])
    .expect("valid arguments should parse");

    assert_eq!(cli.args.title.as_deref(), Some("Launch week"));
    assert_eq!(cli.args.content.as_deref(), Some("We shipped it"));
    assert_eq!(
        cli.args.hashtags,
        vec!["launch".to_string(), "talos".to_string()]
    );
    assert_eq!(
        cli.args.platforms,
        vec!["X".to_string(), "linkedin".to_string()]
    );
    assert_eq!(cli.args.images, vec!["./hero.png".to_string()]);
    assert_eq!(cli.args.videos, vec!["./demo.mp4".to_string()]);
    assert_eq!(cli.args.state.as_deref(), Some("In Review"));
    assert_eq!(cli.args.module.as_deref(), Some("user"));
    assert_eq!(cli.args.cwd.as_deref(), Some("./here"));
}

#[test]
fn marketing_create_defaults_are_empty() {
    let cli = TestCli::try_parse_from(["talos"]).expect("no arguments is valid");

    assert!(cli.args.title.is_none());
    assert!(cli.args.content.is_none());
    assert!(cli.args.hashtags.is_empty());
    assert!(cli.args.platforms.is_empty());
    assert!(cli.args.images.is_empty());
    assert!(cli.args.videos.is_empty());
    assert!(cli.args.state.is_none());
    assert!(cli.args.module.is_none());
    assert!(cli.args.cwd.is_none());
}

#[test]
fn marketing_create_rejects_unknown_flag() {
    assert!(TestCli::try_parse_from(["talos", "--definitely-not-a-flag"]).is_err());
}

#[test]
fn normalize_platform_is_case_insensitive_and_maps_twitter() {
    assert_eq!(normalize_platform("instagram"), Some("Instagram"));
    assert_eq!(normalize_platform(" LINKEDIN "), Some("LinkedIn"));
    assert_eq!(normalize_platform("twitter"), Some("X"));
    assert_eq!(normalize_platform("myspace"), None);
    assert_eq!(MARKETING_PLATFORMS.len(), 12);
}

#[test]
fn normalize_state_accepts_the_in_review_aliases() {
    assert_eq!(normalize_state("todo"), Some("Todo"));
    assert_eq!(normalize_state("in review"), Some("In Review"));
    assert_eq!(normalize_state("in-review"), Some("In Review"));
    assert_eq!(normalize_state("PUBLISHED"), Some("Published"));
    assert_eq!(normalize_state("archived"), None);
    assert_eq!(MARKETING_STATES, ["Todo", "In Review", "Published"]);
}

#[test]
fn generate_marketing_id_uses_the_letter_prefix_and_six_digits() {
    let id = generate_marketing_id(None);
    let (prefix, number) = id.split_once('-').expect("id should contain a dash");

    assert_eq!(prefix.len(), 3);
    assert!(prefix.chars().all(|c| ('A'..='F').contains(&c)));
    assert_eq!(number.len(), 6);
    assert!(number.chars().all(|c| c.is_ascii_digit()));
}

#[test]
fn generate_media_name_uses_six_hex_characters() {
    let name = generate_media_name(None, "png");
    let stem = name
        .strip_suffix(".png")
        .expect("name should end with .png");

    assert_eq!(stem.len(), 6);
    assert!(
        stem.chars()
            .all(|c| ('a'..='f').contains(&c) || c.is_ascii_digit())
    );
}

#[test]
fn marketing_create_leaves_nothing_behind_when_the_media_is_rejected() {
    let cwd = std::env::temp_dir().join(format!("talos-marketing-media-{}", std::process::id()));
    let module_dir = cwd.join("modules").join("blog");
    std::fs::create_dir_all(&module_dir).expect("module directory should be created");
    std::fs::write(module_dir.join("package.json"), "{}").expect("package.json should be written");

    let source = cwd.join("hero.gif");
    std::fs::write(&source, "gif").expect("source file should be written");

    run(&MarketingCreateArgs {
        title: Some("Launch week".to_string()),
        content: None,
        hashtags: Vec::new(),
        platforms: Vec::new(),
        images: vec![source.to_string_lossy().to_string()],
        videos: Vec::new(),
        state: None,
        module: Some("blog".to_string()),
        cwd: Some(cwd.to_string_lossy().to_string()),
    });

    let posts = std::fs::read_dir(module_dir.join("marketing"))
        .expect("marketing directory should exist")
        .flatten()
        .count();
    assert_eq!(posts, 0);

    let _ = std::fs::remove_dir_all(&cwd);
}

#[test]
fn marketing_create_writes_the_post_resource() {
    let cwd = std::env::temp_dir().join(format!("talos-marketing-{}", std::process::id()));
    let module_dir = cwd.join("modules").join("blog");
    std::fs::create_dir_all(&module_dir).expect("module directory should be created");
    // ensure_module() scaffolds a module when package.json is missing.
    std::fs::write(module_dir.join("package.json"), "{}").expect("package.json should be written");

    let source_image = cwd.join("hero.png");
    std::fs::write(&source_image, "png").expect("source image should be written");

    run(&MarketingCreateArgs {
        title: Some("Launch week".to_string()),
        content: Some("We shipped it".to_string()),
        hashtags: vec!["#launch".to_string()],
        platforms: vec!["twitter".to_string(), "X".to_string()],
        images: vec![source_image.to_string_lossy().to_string()],
        videos: Vec::new(),
        state: Some("in-review".to_string()),
        module: Some("blog".to_string()),
        cwd: Some(cwd.to_string_lossy().to_string()),
    });

    let marketing_dir = module_dir.join("marketing");
    let post_dir = std::fs::read_dir(&marketing_dir)
        .expect("marketing directory should exist")
        .flatten()
        .map(|entry| entry.path())
        .next()
        .expect("a post directory should exist");
    let id = post_dir
        .file_name()
        .and_then(|name| name.to_str())
        .expect("post directory should be named after the id")
        .to_string();

    let yaml = std::fs::read_to_string(post_dir.join(format!("{id}.yml")))
        .expect("post yaml should exist");

    assert!(yaml.contains(&format!("id: \"{id}\"")));
    assert!(yaml.contains("module: \"blog\""));
    assert!(yaml.contains("title: \"Launch week\""));
    assert!(yaml.contains("content: |\n  We shipped it"));
    assert!(yaml.contains("  - \"launch\""));
    assert!(yaml.contains("state: \"In Review\""));
    // twitter and X collapse into a single platform entry.
    assert_eq!(yaml.matches("  - \"X\"").count(), 1);
    assert!(yaml.contains("videos: []"));

    assert!(post_dir.join("videos").join(".gitkeep").is_file());
    let stored_image = std::fs::read_dir(post_dir.join("images"))
        .expect("images directory should exist")
        .flatten()
        .find(|entry| entry.path().extension().is_some_and(|ext| ext == "png"))
        .expect("the image should have been copied");
    assert!(yaml.contains(&format!(
        "  - \"{}\"",
        stored_image.file_name().to_string_lossy()
    )));

    let _ = std::fs::remove_dir_all(&cwd);
}
