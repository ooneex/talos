use std::os::unix::fs::PermissionsExt;
use std::sync::Mutex;

use cli::utils::{read_credentials, save_credentials};

/// HOME is process-wide, so the tests that repoint it cannot overlap.
static HOME_GUARD: Mutex<()> = Mutex::new(());

fn with_temp_home<T>(test: impl FnOnce() -> T) -> T {
    let _guard = HOME_GUARD.lock().unwrap_or_else(|error| error.into_inner());
    let original_home = std::env::var_os("HOME");
    let tmp = tempfile::tempdir().expect("tempdir");
    unsafe {
        std::env::set_var("HOME", tmp.path());
    }

    let outcome = test();

    unsafe {
        match original_home {
            Some(home) => std::env::set_var("HOME", home),
            None => std::env::remove_var("HOME"),
        }
    }

    outcome
}

fn value_of<'a>(profile: &'a [(String, String)], key: &str) -> Option<&'a str> {
    profile
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
}

#[test]
fn save_and_read_credentials_round_trip() {
    with_temp_home(|| {
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
        assert_eq!(value_of(&read_back, "token"), Some("abc123"));
        assert_eq!(value_of(&read_back, "username"), Some("octocat"));

        assert!(read_credentials("does-not-exist.yml").is_none());
    });
}

#[test]
fn save_credentials_round_trips_values_needing_yaml_quoting() {
    with_temp_home(|| {
        let profile = vec![
            (
                "baseUrl".to_string(),
                "https://acme.atlassian.net".to_string(),
            ),
            ("pageId".to_string(), "42".to_string()),
            ("botToken".to_string(), "-leading-dash".to_string()),
            ("appSecret".to_string(), "has # hash".to_string()),
            ("password".to_string(), "say \"hi\"\\now".to_string()),
            ("clientSecret".to_string(), "key: value".to_string()),
            ("accessToken".to_string(), " padded ".to_string()),
            ("empty".to_string(), String::new()),
        ];
        save_credentials("quoting.yml", "Quoting", &profile, true).expect("save");

        let read_back = read_credentials("quoting.yml").expect("read");
        for (key, value) in &profile {
            assert_eq!(value_of(&read_back, key), Some(value.as_str()), "key {key}");
        }
    });
}

#[test]
fn saved_credentials_are_readable_by_their_owner_only() {
    with_temp_home(|| {
        let path = save_credentials(
            "modes.yml",
            "Modes",
            &[("token".to_string(), "secret".to_string())],
            true,
        )
        .expect("save");

        let file_mode = std::fs::metadata(&path).expect("file").permissions().mode();
        let dir_mode = std::fs::metadata(path.parent().expect("parent"))
            .expect("dir")
            .permissions()
            .mode();

        assert_eq!(file_mode & 0o777, 0o600);
        assert_eq!(dir_mode & 0o777, 0o700);
    });
}

#[test]
fn read_credentials_ignores_profiles_other_than_default() {
    with_temp_home(|| {
        let path = save_credentials(
            "profiles.yml",
            "Profiles",
            &[("token".to_string(), "placeholder".to_string())],
            true,
        )
        .expect("save");

        std::fs::write(
            &path,
            "profiles:\n  default:\n    token: mine\n  work:\n    token: theirs\n    email: work@acme.com\n",
        )
        .expect("write");

        let read_back = read_credentials("profiles.yml").expect("read");
        assert_eq!(read_back, vec![("token".to_string(), "mine".to_string())]);
    });
}

#[test]
fn credentials_helpers_bail_out_without_a_home() {
    with_temp_home(|| {
        let home = std::env::var_os("HOME").expect("HOME");
        unsafe {
            std::env::remove_var("HOME");
        }

        let saved = save_credentials(
            "nowhere.yml",
            "Nowhere",
            &[("token".to_string(), "secret".to_string())],
            true,
        );
        let read = read_credentials("nowhere.yml");

        unsafe {
            std::env::set_var("HOME", home);
        }

        assert!(saved.is_none());
        assert!(read.is_none());
    });
}

#[test]
fn save_credentials_reports_a_failed_write() {
    with_temp_home(|| {
        // A directory where the credentials file belongs makes the write fail.
        let blocked = std::path::PathBuf::from(std::env::var("HOME").expect("HOME"))
            .join(".talos")
            .join("credentials")
            .join("blocked.yml");
        std::fs::create_dir_all(&blocked).expect("dir");

        let saved = save_credentials(
            "blocked.yml",
            "Blocked",
            &[("token".to_string(), "secret".to_string())],
            true,
        );

        assert!(saved.is_none());
    });
}

#[test]
fn save_credentials_with_feedback_still_returns_the_written_path() {
    with_temp_home(|| {
        let path = save_credentials(
            "loud.yml",
            "Loud",
            &[("token".to_string(), "secret".to_string())],
            false,
        )
        .expect("save");

        assert!(path.exists());
        assert_eq!(
            read_credentials("loud.yml"),
            Some(vec![("token".to_string(), "secret".to_string())])
        );
    });
}

#[test]
fn read_credentials_tolerates_malformed_yaml_by_returning_no_entries() {
    with_temp_home(|| {
        let path = std::path::PathBuf::from(std::env::var("HOME").expect("HOME"))
            .join(".talos")
            .join("credentials");
        std::fs::create_dir_all(&path).expect("credentials dir");
        std::fs::write(path.join("broken.yml"), "profiles: [").expect("broken yaml");

        assert_eq!(read_credentials("broken.yml"), Some(Vec::new()));
    });
}
