//! The object-storage transport `storage:push` and `storage:pull` share.
//!
//! Cloudflare R2 and Amazon S3 speak the S3 REST API, signed with Signature
//! Version 4; Bunny has its own storage API keyed by a single `AccessKey`
//! header. Credentials come from the profile `credentials:create` wrote under
//! `$HOME/.talos/credentials`.

use clap::ValueEnum;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

/// Bunny's default region is served from the bare host; every other region
/// prefixes it.
const BUNNY_DEFAULT_REGION: &str = "de";
const BUNNY_HOST: &str = "storage.bunnycdn.com";

/// R2 buckets are signed against `auto`, whatever jurisdiction they live in.
const R2_SIGNING_REGION: &str = "auto";

const ALGORITHM: &str = "AWS4-HMAC-SHA256";
const SERVICE: &str = "s3";

/// The hash of an empty body, which every unsigned-payload GET sends.
const EMPTY_PAYLOAD_HASH: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/// Object storage a push or a pull can target.
#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub enum StorageProvider {
    #[value(name = "cloudflare", alias = "r2")]
    Cloudflare,
    Bunny,
    S3,
}

pub const STORAGE_PROVIDERS: &[StorageProvider] = &[
    StorageProvider::Cloudflare,
    StorageProvider::Bunny,
    StorageProvider::S3,
];

impl StorageProvider {
    pub fn slug(self) -> &'static str {
        match self {
            Self::Cloudflare => "cloudflare",
            Self::Bunny => "bunny",
            Self::S3 => "s3",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Cloudflare => "Cloudflare R2",
            Self::Bunny => "Bunny",
            Self::S3 => "Amazon S3",
        }
    }
}

/// Where objects live, once the profile and the bucket path are read.
#[derive(Clone, Debug)]
pub enum Remote {
    /// Anything speaking the S3 REST API: Amazon S3 and Cloudflare R2.
    S3 {
        base_url: String,
        host: String,
        /// `/{bucket}` for path-style R2, empty for virtual-hosted S3.
        path_prefix: String,
        region: String,
        access_key: String,
        secret_key: String,
    },
    Bunny {
        host: String,
        zone: String,
        access_key: String,
    },
}

// ---------------------------------------------------------------------------
// Keys and paths
// ---------------------------------------------------------------------------

fn field(profile: &[(String, String)], key: &str) -> Option<String> {
    profile
        .iter()
        .find(|(name, _)| name == key)
        .map(|(_, value)| value.clone())
        .filter(|value| !value.trim().is_empty())
}

/// Drop the slashes around a bucket path so keys join cleanly.
pub fn normalize_prefix(path: &str) -> String {
    path.trim().trim_matches('/').to_string()
}

pub fn join_key(prefix: &str, name: &str) -> String {
    let prefix = normalize_prefix(prefix);
    if prefix.is_empty() {
        return name.to_string();
    }

    format!("{prefix}/{name}")
}

/// Split `bucket/some/prefix` into its bucket and the rest.
pub fn split_bucket(path: &str) -> Option<(String, String)> {
    let normalized = normalize_prefix(path);
    let mut parts = normalized.splitn(2, '/');
    let bucket = parts.next().filter(|part| !part.is_empty())?;

    Some((
        bucket.to_string(),
        parts.next().unwrap_or_default().to_string(),
    ))
}

/// The host serving a Bunny storage region.
pub fn bunny_host(region: &str) -> String {
    let region = region.trim().to_lowercase();
    if region.is_empty() || region == BUNNY_DEFAULT_REGION {
        return BUNNY_HOST.to_string();
    }

    format!("{region}.{BUNNY_HOST}")
}

/// The `host` header for an endpoint URL — authority only, port included.
pub fn host_of(endpoint: &str) -> String {
    endpoint
        .trim()
        .trim_end_matches('/')
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(endpoint)
        .split('/')
        .next()
        .unwrap_or_default()
        .to_string()
}

/// Turn a credentials profile plus a bucket path into the remote to talk to,
/// and the key prefix under it.
pub fn resolve_remote(
    provider: StorageProvider,
    profile: &[(String, String)],
    path: &str,
) -> Result<(Remote, String), String> {
    let missing = |key: &str| format!("The {} profile has no `{key}`", provider.label());

    match provider {
        StorageProvider::Cloudflare => {
            let endpoint = field(profile, "endpoint").ok_or_else(|| missing("endpoint"))?;
            let (bucket, prefix) = split_bucket(path).ok_or_else(|| {
                "The R2 bucket path must start with the bucket name, as in `my-bucket/assets`"
                    .to_string()
            })?;
            let base_url = endpoint.trim().trim_end_matches('/').to_string();

            Ok((
                Remote::S3 {
                    host: host_of(&base_url),
                    base_url,
                    path_prefix: format!("/{bucket}"),
                    region: R2_SIGNING_REGION.to_string(),
                    access_key: field(profile, "accessKey").ok_or_else(|| missing("accessKey"))?,
                    secret_key: field(profile, "secretKey").ok_or_else(|| missing("secretKey"))?,
                },
                prefix,
            ))
        }
        StorageProvider::S3 => {
            let bucket = field(profile, "bucket").ok_or_else(|| missing("bucket"))?;
            let region = field(profile, "region").unwrap_or_else(|| "us-east-1".to_string());
            let host = format!("{bucket}.s3.{region}.amazonaws.com");

            Ok((
                Remote::S3 {
                    base_url: format!("https://{host}"),
                    host,
                    path_prefix: String::new(),
                    region,
                    access_key: field(profile, "accessKey").ok_or_else(|| missing("accessKey"))?,
                    secret_key: field(profile, "secretKey").ok_or_else(|| missing("secretKey"))?,
                },
                normalize_prefix(path),
            ))
        }
        StorageProvider::Bunny => Ok((
            Remote::Bunny {
                host: bunny_host(&field(profile, "region").unwrap_or_default()),
                zone: field(profile, "storageZone").ok_or_else(|| missing("storageZone"))?,
                access_key: field(profile, "accessKey").ok_or_else(|| missing("accessKey"))?,
            },
            normalize_prefix(path),
        )),
    }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/// A shared agent that reports HTTP failures as responses, so the body of an
/// error can be read and shown.
pub fn agent() -> ureq::Agent {
    ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            .http_status_as_error(false)
            .build(),
    )
}

/// Upload one object.
pub fn put_object(
    agent: &ureq::Agent,
    remote: &Remote,
    key: &str,
    body: &[u8],
) -> Result<(), String> {
    let request = match remote {
        Remote::Bunny {
            host,
            zone,
            access_key,
        } => agent
            .put(format!("https://{host}/{zone}/{}", uri_encode(key, false)))
            .header("AccessKey", access_key),
        Remote::S3 { .. } => {
            let path = object_path(remote, key);
            signed(
                agent.put(url_of(remote, &path)),
                "PUT",
                remote,
                &path,
                "",
                body,
            )
        }
    };

    let response = request
        .header("content-type", content_type(key))
        .send(body)
        .map_err(|e| e.to_string())?;

    check(response).map(|_| ())
}

/// Download one object.
pub fn get_object(agent: &ureq::Agent, remote: &Remote, key: &str) -> Result<Vec<u8>, String> {
    let request = match remote {
        Remote::Bunny {
            host,
            zone,
            access_key,
        } => agent
            .get(format!("https://{host}/{zone}/{}", uri_encode(key, false)))
            .header("AccessKey", access_key),
        Remote::S3 { .. } => {
            let path = object_path(remote, key);
            signed(
                agent.get(url_of(remote, &path)),
                "GET",
                remote,
                &path,
                "",
                b"",
            )
        }
    };

    let response = request.call().map_err(|e| e.to_string())?;
    let mut body = check(response)?;

    body.read_to_vec().map_err(|e| e.to_string())
}

/// Every object key under `prefix`, in the order the remote lists them.
pub fn list_objects(
    agent: &ureq::Agent,
    remote: &Remote,
    prefix: &str,
) -> Result<Vec<String>, String> {
    match remote {
        Remote::S3 { .. } => list_s3(agent, remote, prefix),
        Remote::Bunny { .. } => {
            let mut keys = Vec::new();
            list_bunny(agent, remote, prefix, &mut keys)?;
            Ok(keys)
        }
    }
}

/// `ListObjectsV2`, following the continuation token to the end.
fn list_s3(agent: &ureq::Agent, remote: &Remote, prefix: &str) -> Result<Vec<String>, String> {
    let Remote::S3 { path_prefix, .. } = remote else {
        return Ok(Vec::new());
    };
    // The bucket itself is the resource being listed, so the canonical path is
    // the bucket root rather than an object path.
    let path = format!("{path_prefix}/");
    let mut keys = Vec::new();
    let mut token: Option<String> = None;

    loop {
        let mut query = vec![("list-type".to_string(), "2".to_string())];
        if !prefix.is_empty() {
            query.push(("prefix".to_string(), format!("{prefix}/")));
        }
        if let Some(token) = &token {
            query.push(("continuation-token".to_string(), token.clone()));
        }
        let canonical_query = canonical_query(&query);

        let response = signed(
            agent.get(format!("{}{path}?{canonical_query}", url_base(remote))),
            "GET",
            remote,
            &path,
            &canonical_query,
            b"",
        )
        .call()
        .map_err(|e| e.to_string())?;
        let body = check(response)?
            .read_to_string()
            .map_err(|e| e.to_string())?;

        keys.extend(tags(&body, "Key"));
        if tags(&body, "IsTruncated").first().map(String::as_str) != Some("true") {
            break;
        }
        let Some(next) = tags(&body, "NextContinuationToken").into_iter().next() else {
            break;
        };
        token = Some(next);
    }

    Ok(keys)
}

/// Bunny lists one folder at a time, so a prefix is walked depth-first.
fn list_bunny(
    agent: &ureq::Agent,
    remote: &Remote,
    prefix: &str,
    keys: &mut Vec<String>,
) -> Result<(), String> {
    let Remote::Bunny {
        host,
        zone,
        access_key,
    } = remote
    else {
        return Ok(());
    };
    let path = if prefix.is_empty() {
        String::new()
    } else {
        format!("{}/", uri_encode(prefix, false))
    };

    let response = agent
        .get(format!("https://{host}/{zone}/{path}"))
        .header("AccessKey", access_key)
        .call()
        .map_err(|e| e.to_string())?;
    let body = check(response)?
        .read_to_string()
        .map_err(|e| e.to_string())?;
    let entries: Vec<serde_json::Value> = serde_json::from_str(&body).map_err(|e| e.to_string())?;

    for entry in entries {
        let Some(name) = entry.get("ObjectName").and_then(|v| v.as_str()) else {
            continue;
        };
        let key = join_key(prefix, name);
        if entry
            .get("IsDirectory")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false)
        {
            list_bunny(agent, remote, &key, keys)?;
            continue;
        }
        keys.push(key);
    }

    Ok(())
}

fn url_base(remote: &Remote) -> String {
    match remote {
        Remote::S3 { base_url, .. } => base_url.clone(),
        Remote::Bunny { host, .. } => format!("https://{host}"),
    }
}

fn url_of(remote: &Remote, path: &str) -> String {
    format!("{}{path}", url_base(remote))
}

/// The path an object sits at, bucket segment included where the remote is
/// addressed path-style.
fn object_path(remote: &Remote, key: &str) -> String {
    match remote {
        Remote::S3 { path_prefix, .. } => format!("{path_prefix}/{}", uri_encode(key, false)),
        Remote::Bunny { zone, .. } => format!("/{zone}/{}", uri_encode(key, false)),
    }
}

/// Add the SigV4 headers to a request. Anything but `Remote::S3` is returned
/// untouched, since only the S3 API is signed this way.
fn signed<Any>(
    request: ureq::RequestBuilder<Any>,
    method: &str,
    remote: &Remote,
    canonical_uri: &str,
    canonical_query: &str,
    body: &[u8],
) -> ureq::RequestBuilder<Any> {
    let Remote::S3 {
        host,
        region,
        access_key,
        secret_key,
        ..
    } = remote
    else {
        return request;
    };
    let payload_hash = if body.is_empty() {
        EMPTY_PAYLOAD_HASH.to_string()
    } else {
        sha256_hex(body)
    };
    let now = chrono::Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    request
        .header("host", host)
        .header("x-amz-content-sha256", &payload_hash)
        .header("x-amz-date", &amz_date)
        .header(
            "Authorization",
            &authorization_header(
                method,
                access_key,
                secret_key,
                region,
                host,
                canonical_uri,
                canonical_query,
                &payload_hash,
                &amz_date,
                &date_stamp,
            ),
        )
}

/// A response body, or the status and body of a failure.
fn check(response: ureq::http::Response<ureq::Body>) -> Result<ureq::Body, String> {
    let status = response.status().as_u16();
    let mut body = response.into_body();
    if (200..300).contains(&status) {
        return Ok(body);
    }

    let detail = body.read_to_string().unwrap_or_default();
    Err(format!("HTTP {status} {}", detail.trim())
        .trim_end()
        .to_string())
}

// ---------------------------------------------------------------------------
// Signature Version 4
// ---------------------------------------------------------------------------

/// The `Authorization` header of a signed request, per AWS Signature Version 4.
#[allow(clippy::too_many_arguments, reason = "every part of the signature")]
pub fn authorization_header(
    method: &str,
    access_key: &str,
    secret_key: &str,
    region: &str,
    host: &str,
    canonical_uri: &str,
    canonical_query: &str,
    payload_hash: &str,
    amz_date: &str,
    date_stamp: &str,
) -> String {
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_request = format!(
        "{method}\n{canonical_uri}\n{canonical_query}\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n\n{signed_headers}\n{payload_hash}"
    );
    let scope = format!("{date_stamp}/{region}/{SERVICE}/aws4_request");
    let string_to_sign = format!(
        "{ALGORITHM}\n{amz_date}\n{scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );
    let signature = hex(&hmac(
        &signing_key(secret_key, date_stamp, region, SERVICE),
        string_to_sign.as_bytes(),
    ));

    format!(
        "{ALGORITHM} Credential={access_key}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"
    )
}

/// Query parameters sorted by name and encoded, the form SigV4 signs and the
/// form the request is sent with.
pub fn canonical_query(query: &[(String, String)]) -> String {
    let mut pairs: Vec<String> = query
        .iter()
        .map(|(key, value)| format!("{}={}", uri_encode(key, true), uri_encode(value, true)))
        .collect();
    pairs.sort();

    pairs.join("&")
}

/// The date/region/service-scoped key every SigV4 signature is signed with.
pub fn signing_key(secret_key: &str, date_stamp: &str, region: &str, service: &str) -> Vec<u8> {
    let date = hmac(
        format!("AWS4{secret_key}").as_bytes(),
        date_stamp.as_bytes(),
    );
    let region = hmac(&date, region.as_bytes());
    let service = hmac(&region, service.as_bytes());

    hmac(&service, b"aws4_request")
}

fn hmac(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = <Hmac<Sha256>>::new_from_slice(key).expect("HMAC takes a key of any length");
    mac.update(data);

    mac.finalize().into_bytes().to_vec()
}

pub fn sha256_hex(payload: &[u8]) -> String {
    hex(&Sha256::digest(payload))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// RFC 3986 encoding, the way SigV4 wants it: `/` is a separator in a path and
/// a plain character everywhere else.
pub fn uri_encode(value: &str, encode_slash: bool) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                encoded.push(*byte as char);
            }
            b'/' if !encode_slash => encoded.push('/'),
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }

    encoded
}

// ---------------------------------------------------------------------------
// The bits of XML a listing needs
// ---------------------------------------------------------------------------

/// The text of every `<tag>…</tag>` in a listing response, entities decoded.
pub fn tags(xml: &str, tag: &str) -> Vec<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut values = Vec::new();
    let mut rest = xml;

    while let Some(start) = rest.find(&open) {
        let after = &rest[start + open.len()..];
        let Some(end) = after.find(&close) else {
            break;
        };
        values.push(decode_entities(&after[..end]));
        rest = &after[end + close.len()..];
    }

    values
}

fn decode_entities(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

// ---------------------------------------------------------------------------
// Content types
// ---------------------------------------------------------------------------

/// What an object is served as, from its extension.
pub fn content_type(key: &str) -> &'static str {
    let extension = key.rsplit_once('.').map(|(_, ext)| ext.to_lowercase());
    match extension.as_deref() {
        Some("html" | "htm") => "text/html",
        Some("css") => "text/css",
        Some("js" | "mjs") => "text/javascript",
        Some("json" | "map") => "application/json",
        Some("xml") => "application/xml",
        Some("txt") => "text/plain",
        Some("md") => "text/markdown",
        Some("csv") => "text/csv",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("pdf") => "application/pdf",
        Some("zip") => "application/zip",
        Some("gz") => "application/gzip",
        Some("wasm") => "application/wasm",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        _ => "application/octet-stream",
    }
}
