use clap::{Args, ValueEnum};

use crate::utils::{
    ask_input_with_default, ask_password, ask_plain_input, ask_select, save_credentials,
};

/// Third-party service a credentials profile can be saved for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum CredentialsProvider {
    Jira,
    Linear,
    #[value(name = "x", alias = "twitter")]
    X,
    Instagram,
    Facebook,
    Linkedin,
    Tiktok,
    Threads,
    Whatsapp,
    Telegram,
    Messenger,
    Discord,
    Reddit,
    Medium,
    #[value(name = "cloudflare", alias = "r2")]
    Cloudflare,
    Bunny,
    S3,
}

pub const PROVIDERS: &[CredentialsProvider] = &[
    CredentialsProvider::Jira,
    CredentialsProvider::Linear,
    CredentialsProvider::X,
    CredentialsProvider::Instagram,
    CredentialsProvider::Facebook,
    CredentialsProvider::Linkedin,
    CredentialsProvider::Tiktok,
    CredentialsProvider::Threads,
    CredentialsProvider::Whatsapp,
    CredentialsProvider::Telegram,
    CredentialsProvider::Messenger,
    CredentialsProvider::Discord,
    CredentialsProvider::Reddit,
    CredentialsProvider::Medium,
    CredentialsProvider::Cloudflare,
    CredentialsProvider::Bunny,
    CredentialsProvider::S3,
];

#[derive(Clone, Copy, Debug)]
enum FieldKind {
    Plain,
    Secret,
    WithDefault(&'static str),
}

#[derive(Clone, Copy, Debug)]
struct Field {
    key: &'static str,
    prompt: &'static str,
    kind: FieldKind,
}

const fn plain(key: &'static str, prompt: &'static str) -> Field {
    Field {
        key,
        prompt,
        kind: FieldKind::Plain,
    }
}

const fn secret(key: &'static str, prompt: &'static str) -> Field {
    Field {
        key,
        prompt,
        kind: FieldKind::Secret,
    }
}

const fn with_default(key: &'static str, prompt: &'static str, initial: &'static str) -> Field {
    Field {
        key,
        prompt,
        kind: FieldKind::WithDefault(initial),
    }
}

const JIRA_FIELDS: &[Field] = &[
    with_default(
        "baseUrl",
        "Enter Jira base URL",
        "https://your-domain.atlassian.net",
    ),
    plain("email", "Enter Jira account email"),
    secret("token", "Enter Jira API token"),
];

const LINEAR_FIELDS: &[Field] = &[secret("token", "Enter Linear Personal API key")];

const X_FIELDS: &[Field] = &[
    plain("clientId", "Enter X client ID"),
    secret("clientSecret", "Enter X client secret"),
    secret("accessToken", "Enter X access token"),
];

const INSTAGRAM_FIELDS: &[Field] = &[
    plain("appId", "Enter Instagram app ID"),
    secret("appSecret", "Enter Instagram app secret"),
    secret("accessToken", "Enter Instagram access token"),
];

const FACEBOOK_FIELDS: &[Field] = &[
    plain("appId", "Enter Facebook app ID"),
    secret("appSecret", "Enter Facebook app secret"),
    secret("accessToken", "Enter Facebook access token"),
];

const LINKEDIN_FIELDS: &[Field] = &[
    plain("clientId", "Enter LinkedIn client ID"),
    secret("clientSecret", "Enter LinkedIn client secret"),
    secret("accessToken", "Enter LinkedIn access token"),
];

const TIKTOK_FIELDS: &[Field] = &[
    plain("clientKey", "Enter TikTok client key"),
    secret("clientSecret", "Enter TikTok client secret"),
    secret("accessToken", "Enter TikTok access token"),
];

const THREADS_FIELDS: &[Field] = &[
    plain("appId", "Enter Threads app ID"),
    secret("appSecret", "Enter Threads app secret"),
    secret("accessToken", "Enter Threads access token"),
];

const WHATSAPP_FIELDS: &[Field] = &[
    plain("phoneNumberId", "Enter WhatsApp phone number ID"),
    secret("accessToken", "Enter WhatsApp access token"),
];

const TELEGRAM_FIELDS: &[Field] = &[secret("botToken", "Enter Telegram bot token")];

const MESSENGER_FIELDS: &[Field] = &[
    plain("pageId", "Enter Messenger page ID"),
    secret("appSecret", "Enter Messenger app secret"),
    secret("accessToken", "Enter Messenger page access token"),
];

const DISCORD_FIELDS: &[Field] = &[
    plain("applicationId", "Enter Discord application ID"),
    secret("botToken", "Enter Discord bot token"),
];

const REDDIT_FIELDS: &[Field] = &[
    plain("clientId", "Enter Reddit client ID"),
    secret("clientSecret", "Enter Reddit client secret"),
    plain("username", "Enter Reddit username"),
    secret("password", "Enter Reddit password"),
];

const MEDIUM_FIELDS: &[Field] = &[secret("token", "Enter Medium integration token")];

const CLOUDFLARE_FIELDS: &[Field] = &[
    secret("accessKey", "Enter Cloudflare R2 access key ID"),
    secret("secretKey", "Enter Cloudflare R2 secret access key"),
    with_default(
        "endpoint",
        "Enter Cloudflare R2 endpoint",
        "https://your-account-id.r2.cloudflarestorage.com",
    ),
    with_default("region", "Enter Cloudflare R2 region", "EEUR"),
];

const BUNNY_FIELDS: &[Field] = &[
    plain("storageZone", "Enter Bunny storage zone name"),
    secret("accessKey", "Enter Bunny storage zone password"),
    with_default("region", "Enter Bunny storage region", "de"),
];

const S3_FIELDS: &[Field] = &[
    secret("accessKey", "Enter S3 access key ID"),
    secret("secretKey", "Enter S3 secret access key"),
    plain("bucket", "Enter S3 bucket name"),
    with_default("region", "Enter S3 region", "us-east-1"),
];

impl CredentialsProvider {
    pub fn slug(self) -> &'static str {
        match self {
            Self::Jira => "jira",
            Self::Linear => "linear",
            Self::X => "x",
            Self::Instagram => "instagram",
            Self::Facebook => "facebook",
            Self::Linkedin => "linkedin",
            Self::Tiktok => "tiktok",
            Self::Threads => "threads",
            Self::Whatsapp => "whatsapp",
            Self::Telegram => "telegram",
            Self::Messenger => "messenger",
            Self::Discord => "discord",
            Self::Reddit => "reddit",
            Self::Medium => "medium",
            Self::Cloudflare => "cloudflare",
            Self::Bunny => "bunny",
            Self::S3 => "s3",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Jira => "Jira",
            Self::Linear => "Linear",
            Self::X => "X",
            Self::Instagram => "Instagram",
            Self::Facebook => "Facebook",
            Self::Linkedin => "LinkedIn",
            Self::Tiktok => "TikTok",
            Self::Threads => "Threads",
            Self::Whatsapp => "WhatsApp",
            Self::Telegram => "Telegram",
            Self::Messenger => "Messenger",
            Self::Discord => "Discord",
            Self::Reddit => "Reddit",
            Self::Medium => "Medium",
            Self::Cloudflare => "Cloudflare R2",
            Self::Bunny => "Bunny",
            Self::S3 => "Amazon S3",
        }
    }

    /// Where the user creates the credentials this command asks for.
    pub fn hint(self) -> &'static str {
        match self {
            Self::Jira => {
                "Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens"
            }
            Self::Linear => "Create a Personal API key at https://linear.app/settings/api",
            Self::X => "Create an app at https://developer.x.com/en/portal/dashboard",
            Self::Instagram | Self::Facebook | Self::Threads | Self::Whatsapp | Self::Messenger => {
                "Create an app at https://developers.facebook.com/apps"
            }
            Self::Linkedin => "Create an app at https://www.linkedin.com/developers/apps",
            Self::Tiktok => "Create an app at https://developers.tiktok.com/apps",
            Self::Telegram => "Create a bot with https://t.me/BotFather",
            Self::Discord => "Create an application at https://discord.com/developers/applications",
            Self::Reddit => "Create an app at https://www.reddit.com/prefs/apps",
            Self::Medium => {
                "Create an integration token at https://medium.com/me/settings/security"
            }
            Self::Cloudflare => {
                "Create an R2 API token at https://dash.cloudflare.com/?to=/:account/r2/api-tokens"
            }
            Self::Bunny => "Copy the storage zone password at https://dash.bunny.net/storage",
            Self::S3 => {
                "Create an access key at https://console.aws.amazon.com/iam/home#/security_credentials"
            }
        }
    }

    fn fields(self) -> &'static [Field] {
        match self {
            Self::Jira => JIRA_FIELDS,
            Self::Linear => LINEAR_FIELDS,
            Self::X => X_FIELDS,
            Self::Instagram => INSTAGRAM_FIELDS,
            Self::Facebook => FACEBOOK_FIELDS,
            Self::Linkedin => LINKEDIN_FIELDS,
            Self::Tiktok => TIKTOK_FIELDS,
            Self::Threads => THREADS_FIELDS,
            Self::Whatsapp => WHATSAPP_FIELDS,
            Self::Telegram => TELEGRAM_FIELDS,
            Self::Messenger => MESSENGER_FIELDS,
            Self::Discord => DISCORD_FIELDS,
            Self::Reddit => REDDIT_FIELDS,
            Self::Medium => MEDIUM_FIELDS,
            Self::Cloudflare => CLOUDFLARE_FIELDS,
            Self::Bunny => BUNNY_FIELDS,
            Self::S3 => S3_FIELDS,
        }
    }
}

#[derive(Args, Debug)]
pub struct CredentialsCreateArgs {
    #[arg(long, value_enum)]
    pub provider: Option<CredentialsProvider>,

    #[arg(long)]
    pub base_url: Option<String>,

    #[arg(long)]
    pub email: Option<String>,

    #[arg(long)]
    pub token: Option<String>,

    #[arg(long)]
    pub client_id: Option<String>,

    #[arg(long)]
    pub client_secret: Option<String>,

    #[arg(long)]
    pub client_key: Option<String>,

    #[arg(long)]
    pub access_token: Option<String>,

    #[arg(long)]
    pub app_id: Option<String>,

    #[arg(long)]
    pub app_secret: Option<String>,

    #[arg(long)]
    pub page_id: Option<String>,

    #[arg(long)]
    pub phone_number_id: Option<String>,

    #[arg(long)]
    pub application_id: Option<String>,

    #[arg(long)]
    pub bot_token: Option<String>,

    #[arg(long)]
    pub username: Option<String>,

    #[arg(long)]
    pub password: Option<String>,

    #[arg(long)]
    pub access_key: Option<String>,

    #[arg(long)]
    pub secret_key: Option<String>,

    #[arg(long)]
    pub endpoint: Option<String>,

    #[arg(long)]
    pub region: Option<String>,

    #[arg(long)]
    pub bucket: Option<String>,

    #[arg(long)]
    pub storage_zone: Option<String>,

    #[arg(long, default_value_t = false)]
    pub silent: bool,
}

impl CredentialsCreateArgs {
    fn flag(&self, key: &str) -> Option<String> {
        match key {
            "baseUrl" => self.base_url.clone(),
            "email" => self.email.clone(),
            "token" => self.token.clone(),
            "clientId" => self.client_id.clone(),
            "clientSecret" => self.client_secret.clone(),
            "clientKey" => self.client_key.clone(),
            "accessToken" => self.access_token.clone(),
            "appId" => self.app_id.clone(),
            "appSecret" => self.app_secret.clone(),
            "pageId" => self.page_id.clone(),
            "phoneNumberId" => self.phone_number_id.clone(),
            "applicationId" => self.application_id.clone(),
            "botToken" => self.bot_token.clone(),
            "username" => self.username.clone(),
            "password" => self.password.clone(),
            "accessKey" => self.access_key.clone(),
            "secretKey" => self.secret_key.clone(),
            "endpoint" => self.endpoint.clone(),
            "region" => self.region.clone(),
            "bucket" => self.bucket.clone(),
            "storageZone" => self.storage_zone.clone(),
            _ => None,
        }
    }
}

pub fn run(args: &CredentialsCreateArgs) {
    let Some(provider) = args.provider.or_else(ask_provider) else {
        return;
    };

    if !args.silent {
        println!("{}", provider.hint());
    }

    let mut profile = Vec::new();
    for field in provider.fields() {
        let value = match args.flag(field.key) {
            Some(value) => Some(value),
            None => match field.kind {
                FieldKind::Plain => ask_plain_input(field.prompt),
                FieldKind::Secret => ask_password(field.prompt),
                FieldKind::WithDefault(initial) => ask_input_with_default(field.prompt, initial),
            },
        };
        let Some(value) = value else {
            return;
        };
        profile.push((field.key.to_string(), value));
    }

    save_credentials(
        &format!("{}.yml", provider.slug()),
        provider.label(),
        &profile,
        args.silent,
    );
}

fn ask_provider() -> Option<CredentialsProvider> {
    let labels: Vec<&str> = PROVIDERS.iter().map(|provider| provider.label()).collect();
    let index = ask_select("Select a provider", &labels)?;

    PROVIDERS.get(index).copied()
}
