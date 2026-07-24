use rust_cli::utils::{read_credentials, save_credentials};

#[test]
fn save_and_read_credentials_round_trip() {
    let original_home = std::env::var_os("HOME");
    let tmp = tempfile::tempdir().expect("tempdir");
    unsafe {
        std::env::set_var("HOME", tmp.path());
    }

    let profile = vec![
        ("token".to_string(), "abc123".to_string()),
        ("username".to_string(), "octocat".to_string()),
    ];
    let path = save_credentials("github.yml", "GitHub", &profile, true)
        .expect("save_credentials should succeed");
    assert!(path.ends_with(".talos/credentials/github.yml"));
    assert!(path.exists());

    let read_back =
        read_credentials("github.yml").expect("read_credentials should find the saved profile");
    assert_eq!(
        read_back
            .iter()
            .find(|(k, _)| k == "token")
            .map(|(_, v)| v.as_str()),
        Some("abc123")
    );
    assert_eq!(
        read_back
            .iter()
            .find(|(k, _)| k == "username")
            .map(|(_, v)| v.as_str()),
        Some("octocat")
    );

    assert!(read_credentials("does-not-exist.yml").is_none());

    unsafe {
        match original_home {
            Some(home) => std::env::set_var("HOME", home),
            None => std::env::remove_var("HOME"),
        }
    }
}
