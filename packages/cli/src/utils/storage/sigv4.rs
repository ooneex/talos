// AWS Signature Version 4 signing, XML listing parsing, and content-type
// inference for object storage — split out of the parent module to keep
// it under the file-size budget.

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

const ALGORITHM: &str = "AWS4-HMAC-SHA256";
const SERVICE: &str = "s3";

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
