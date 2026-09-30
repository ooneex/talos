// `recipe:run --headed` replays in the user's default browser. A Chromium
// browser with remote debugging on names its DevTools endpoint in the
// `DevToolsActivePort` file of its profile; the runner connects there, so every
// run opens a window of that browser the user can watch.

use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use serde::Serialize;

/// A running browser the runner drives over the DevTools protocol.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Browser {
    pub name: String,
    /// What the OS reports as the default browser (see `KnownBrowser::ids`).
    #[serde(skip)]
    pub id: String,
    /// `ws://127.0.0.1:<port>/devtools/browser/<id>`.
    pub url: String,
}

impl Browser {
    /// Brings the browser to the front, so the user watches the run from its
    /// first step. Elsewhere than macOS, the tab the runner opens already
    /// raises its window.
    pub fn focus(&self) {
        #[cfg(target_os = "macos")]
        {
            let script = format!("tell application id \"{}\" to activate", self.id);
            let _ = Command::new("osascript")
                .args(["-e", &script])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
    }
}

/// A Chromium browser `--headed` can drive.
struct KnownBrowser {
    name: &'static str,
    /// What the OS reports as the default browser: a macOS bundle id, a Linux
    /// desktop entry, or a Windows ProgId.
    ids: &'static [&'static str],
    /// Profile directory, under the platform's application-data directory.
    profile: &'static str,
}

#[cfg(target_os = "macos")]
const BROWSERS: &[KnownBrowser] = &[
    KnownBrowser {
        name: "Google Chrome",
        ids: &["com.google.chrome"],
        profile: "Google/Chrome",
    },
    KnownBrowser {
        name: "Google Chrome Beta",
        ids: &["com.google.chrome.beta"],
        profile: "Google/Chrome Beta",
    },
    KnownBrowser {
        name: "Google Chrome Dev",
        ids: &["com.google.chrome.dev"],
        profile: "Google/Chrome Dev",
    },
    KnownBrowser {
        name: "Google Chrome Canary",
        ids: &["com.google.chrome.canary"],
        profile: "Google/Chrome Canary",
    },
    KnownBrowser {
        name: "Chromium",
        ids: &["org.chromium.chromium"],
        profile: "Chromium",
    },
    KnownBrowser {
        name: "Microsoft Edge",
        ids: &["com.microsoft.edgemac"],
        profile: "Microsoft Edge",
    },
    KnownBrowser {
        name: "Brave",
        ids: &["com.brave.browser"],
        profile: "BraveSoftware/Brave-Browser",
    },
    KnownBrowser {
        name: "Vivaldi",
        ids: &["com.vivaldi.vivaldi"],
        profile: "Vivaldi",
    },
    KnownBrowser {
        name: "Opera",
        ids: &["com.operasoftware.opera"],
        profile: "com.operasoftware.Opera",
    },
    KnownBrowser {
        name: "Arc",
        ids: &["company.thebrowser.browser"],
        profile: "Arc/User Data",
    },
    KnownBrowser {
        name: "Dia",
        ids: &["company.thebrowser.dia"],
        profile: "Dia/User Data",
    },
];

#[cfg(windows)]
const BROWSERS: &[KnownBrowser] = &[
    KnownBrowser {
        name: "Google Chrome",
        ids: &["ChromeHTML"],
        profile: r"Google\Chrome\User Data",
    },
    KnownBrowser {
        name: "Google Chrome Beta",
        ids: &["ChromeBHTML"],
        profile: r"Google\Chrome Beta\User Data",
    },
    KnownBrowser {
        name: "Google Chrome Dev",
        ids: &["ChromeDHTML"],
        profile: r"Google\Chrome Dev\User Data",
    },
    KnownBrowser {
        name: "Google Chrome Canary",
        ids: &["ChromeSSHTM"],
        profile: r"Google\Chrome SxS\User Data",
    },
    KnownBrowser {
        name: "Chromium",
        ids: &["ChromiumHTM"],
        profile: r"Chromium\User Data",
    },
    KnownBrowser {
        name: "Microsoft Edge",
        ids: &["MSEdgeHTM"],
        profile: r"Microsoft\Edge\User Data",
    },
    KnownBrowser {
        name: "Brave",
        ids: &["BraveHTML"],
        profile: r"BraveSoftware\Brave-Browser\User Data",
    },
    KnownBrowser {
        name: "Vivaldi",
        ids: &["VivaldiHTM"],
        profile: r"Vivaldi\User Data",
    },
];

#[cfg(not(any(target_os = "macos", windows)))]
const BROWSERS: &[KnownBrowser] = &[
    KnownBrowser {
        name: "Google Chrome",
        ids: &["google-chrome"],
        profile: "google-chrome",
    },
    KnownBrowser {
        name: "Google Chrome Beta",
        ids: &["google-chrome-beta"],
        profile: "google-chrome-beta",
    },
    KnownBrowser {
        name: "Google Chrome Dev",
        ids: &["google-chrome-unstable"],
        profile: "google-chrome-unstable",
    },
    KnownBrowser {
        name: "Chromium",
        ids: &["chromium", "chromium-browser"],
        profile: "chromium",
    },
    KnownBrowser {
        name: "Microsoft Edge",
        ids: &["microsoft-edge"],
        profile: "microsoft-edge",
    },
    KnownBrowser {
        name: "Brave",
        ids: &["brave-browser"],
        profile: "BraveSoftware/Brave-Browser",
    },
    KnownBrowser {
        name: "Vivaldi",
        ids: &["vivaldi-stable"],
        profile: "vivaldi",
    },
    KnownBrowser {
        name: "Opera",
        ids: &["opera"],
        profile: "opera",
    },
];

/// The display name and profile directory of the Chromium browser `id`
/// identifies, as the OS reports the default browser.
pub fn chromium_browser(id: &str) -> Option<(&'static str, &'static str)> {
    BROWSERS
        .iter()
        .find(|browser| {
            browser
                .ids
                .iter()
                .any(|known| known.eq_ignore_ascii_case(id))
        })
        .map(|browser| (browser.name, browser.profile))
}

/// The port and WebSocket URL a `DevToolsActivePort` file names: the port on
/// its first line, the browser's DevTools path on the second.
pub fn parse_devtools_active_port(contents: &str) -> Option<(u16, String)> {
    let mut lines = contents.lines().map(str::trim);
    let port = lines
        .next()?
        .parse::<u16>()
        .ok()
        .filter(|port| *port != 0)?;
    let path = lines.next().filter(|path| path.starts_with('/'))?;
    Some((port, format!("ws://127.0.0.1:{port}{path}")))
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from)
}

#[cfg(target_os = "macos")]
fn app_data_dir() -> Option<PathBuf> {
    home().map(|home| home.join("Library/Application Support"))
}

#[cfg(windows)]
fn app_data_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
}

#[cfg(not(any(target_os = "macos", windows)))]
fn app_data_dir() -> Option<PathBuf> {
    std::env::var_os("XDG_CONFIG_HOME")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .or_else(|| home().map(|home| home.join(".config")))
}

#[cfg(target_os = "macos")]
fn default_browser_id() -> Option<String> {
    let plist = home()?
        .join("Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist");
    let handlers = Command::new("plutil")
        .args(["-extract", "LSHandlers", "json", "-o", "-"])
        .arg(&plist)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| serde_json::from_slice::<Vec<serde_json::Value>>(&output.stdout).ok())
        .unwrap_or_default();
    let handler = |scheme: &str| {
        handlers
            .iter()
            .filter(|handler| {
                handler["LSHandlerURLScheme"]
                    .as_str()
                    .is_some_and(|value| value.eq_ignore_ascii_case(scheme))
            })
            .find_map(|handler| handler["LSHandlerRoleAll"].as_str())
            .filter(|id| !id.is_empty() && *id != "-")
            .map(str::to_string)
    };
    // Without a handler of its own, the web opens in Safari.
    Some(
        handler("https")
            .or_else(|| handler("http"))
            .unwrap_or_else(|| "com.apple.Safari".to_string()),
    )
}

#[cfg(windows)]
fn default_browser_id() -> Option<String> {
    let output = Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice",
            "/v",
            "ProgId",
        ])
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|line| {
            // `    ProgId    REG_SZ    ChromeHTML`
            let mut fields = line.split_whitespace();
            if fields.next()? != "ProgId" {
                return None;
            }
            fields.nth(1)
        })
        // Some ProgIds carry a per-install suffix: `VivaldiHTM.<hash>`.
        .and_then(|prog_id| prog_id.split('.').next())
        .filter(|prog_id| !prog_id.is_empty())
        .map(str::to_string)
}

#[cfg(not(any(target_os = "macos", windows)))]
fn default_browser_id() -> Option<String> {
    let output = Command::new("xdg-settings")
        .args(["get", "default-web-browser"])
        .output()
        .ok()
        .filter(|output| output.status.success())?;
    let entry = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let id = entry.strip_suffix(".desktop").unwrap_or(&entry);
    (!id.is_empty()).then(|| id.to_string())
}

fn listening(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(500),
    )
    .is_ok()
}

/// The user's default browser and the DevTools endpoint it exposes, or why
/// `--headed` cannot drive it.
pub fn default_browser() -> Result<Browser, String> {
    let id = default_browser_id().ok_or("--headed could not tell which browser is your default")?;
    let (name, profile) = chromium_browser(&id).ok_or_else(|| {
        format!(
            "--headed drives your default browser, but {id} is not a Chromium browser it supports (Chrome, Edge, Brave, Vivaldi, Opera, Arc, Dia)"
        )
    })?;
    let enable = format!(
        "turn remote debugging on in {name} at chrome://inspect/#remote-debugging, then run again"
    );
    let (port, url) = app_data_dir()
        .map(|dir| dir.join(profile).join("DevToolsActivePort"))
        .and_then(|file| std::fs::read_to_string(file).ok())
        .and_then(|contents| parse_devtools_active_port(&contents))
        .ok_or_else(|| format!("{name} does not accept remote debugging — {enable}"))?;
    if !listening(port) {
        return Err(format!(
            "{name} is not running with remote debugging on — open it, {enable}"
        ));
    }
    Ok(Browser {
        name: name.to_string(),
        id,
        url,
    })
}
