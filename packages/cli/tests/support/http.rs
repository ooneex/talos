//! A one-thread HTTP stub, so the specs can exercise the commands that talk to
//! Linear, npm, OSV and Bitbucket without leaving the test process.
//!
//! It speaks just enough HTTP for `ureq`: read the request line, headers and
//! `Content-Length` body, hand the request to a closure, write back what the
//! closure returns. Requests are recorded so a spec can assert on what the
//! command actually sent.

#![allow(dead_code)]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

/// One request the stub answered.
#[derive(Clone, Debug)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

impl Request {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    /// The request body parsed as JSON, for the GraphQL and REST payloads.
    pub fn json(&self) -> serde_json::Value {
        serde_json::from_str(&self.body).unwrap_or(serde_json::Value::Null)
    }
}

/// What the stub writes back.
pub struct Reply {
    pub status: u16,
    pub body: String,
}

impl Reply {
    pub fn json(value: serde_json::Value) -> Self {
        Self {
            status: 200,
            body: value.to_string(),
        }
    }

    pub fn status(status: u16, body: impl Into<String>) -> Self {
        Self {
            status,
            body: body.into(),
        }
    }
}

pub struct Server {
    base: String,
    requests: Arc<Mutex<Vec<Request>>>,
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl Server {
    /// Start a stub on a free port, answering every request with `handler`.
    pub fn start(handler: impl Fn(&Request) -> Reply + Send + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind a free port");
        let base = format!(
            "http://{}",
            listener.local_addr().expect("the stub has an address")
        );
        listener
            .set_nonblocking(true)
            .expect("the stub can poll for connections");

        let requests = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));

        let served = requests.clone();
        let stopped = stop.clone();
        let handle = std::thread::spawn(move || {
            while !stopped.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        stream
                            .set_nonblocking(false)
                            .expect("the accepted stream blocks");
                        if let Some(request) = read_request(&stream) {
                            let reply = handler(&request);
                            served.lock().expect("not poisoned").push(request);
                            write_reply(stream, &reply);
                        }
                    }
                    Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(std::time::Duration::from_millis(2));
                    }
                    Err(_) => break,
                }
            }
        });

        Self {
            base,
            requests,
            stop,
            handle: Some(handle),
        }
    }

    /// Always answer with the same JSON payload.
    pub fn always(value: serde_json::Value) -> Self {
        Self::start(move |_| Reply::json(value.clone()))
    }

    /// `http://127.0.0.1:<port>` — join the path the command expects onto it.
    pub fn base(&self) -> &str {
        &self.base
    }

    pub fn url(&self, path: &str) -> String {
        format!("{}{path}", self.base)
    }

    pub fn requests(&self) -> Vec<Request> {
        self.requests.lock().expect("not poisoned").clone()
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

fn read_request(stream: &TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream);

    let mut start = String::new();
    reader.read_line(&mut start).ok()?;
    let mut parts = start.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();

    let mut headers = Vec::new();
    let mut length = 0usize;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).ok()?;
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        let (name, value) = line.split_once(':')?;
        let (name, value) = (name.trim().to_string(), value.trim().to_string());
        if name.eq_ignore_ascii_case("content-length") {
            length = value.parse().unwrap_or(0);
        }
        headers.push((name, value));
    }

    let mut body = vec![0u8; length];
    if length > 0 {
        reader.read_exact(&mut body).ok()?;
    }

    Some(Request {
        method,
        path,
        headers,
        body: String::from_utf8_lossy(&body).to_string(),
    })
}

fn write_reply(mut stream: TcpStream, reply: &Reply) {
    let response = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        reply.status,
        if reply.status == 200 { "OK" } else { "Error" },
        reply.body.len(),
        reply.body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}
