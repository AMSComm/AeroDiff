use aerodiff::commands::{check_path, close_diff_session, compare_files, get_diff_slice, read_file};
use aerodiff::diff::options::DiffOptions;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};

#[derive(Deserialize)]
struct Request {
    id: u64,
    cmd: String,
    args: Value,
}

#[derive(Serialize)]
struct Response {
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out_handle = stdout.lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let req: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let err_res = Response {
                    id: 0,
                    result: None,
                    error: Some(format!("Invalid JSON request: {}", e)),
                };
                let _ = writeln!(out_handle, "{}", serde_json::to_string(&err_res).unwrap());
                let _ = out_handle.flush();
                continue;
            }
        };

        let res = match req.cmd.as_str() {
            "check_path" => {
                let path = req.args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
                match check_path(path) {
                    Ok(p_info) => Response {
                        id: req.id,
                        result: serde_json::to_value(p_info).ok(),
                        error: None,
                    },
                    Err(e) => Response {
                        id: req.id,
                        result: None,
                        error: Some(e),
                    },
                }
            }
            "read_file" => {
                let path = req.args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let encoding = req.args.get("encoding").and_then(|v| v.as_str()).map(|s| s.to_string());
                match read_file(path, encoding) {
                    Ok(f_info) => Response {
                        id: req.id,
                        result: serde_json::to_value(f_info).ok(),
                        error: None,
                    },
                    Err(e) => Response {
                        id: req.id,
                        result: None,
                        error: Some(e),
                    },
                }
            }
            "compare_files" => {
                let left_path = req.args.get("leftPath").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let right_path = req.args.get("rightPath").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let options: DiffOptions = req.args.get("options")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
                    .unwrap_or_default();
                let left_enc = req.args.get("leftEncoding").and_then(|v| v.as_str()).map(|s| s.to_string());
                let right_enc = req.args.get("rightEncoding").and_then(|v| v.as_str()).map(|s| s.to_string());

                match compare_files(left_path, right_path, options, left_enc, right_enc) {
                    Ok(diff_res) => Response {
                        id: req.id,
                        result: serde_json::to_value(diff_res).ok(),
                        error: None,
                    },
                    Err(e) => Response {
                        id: req.id,
                        result: None,
                        error: Some(e),
                    },
                }
            }
            "get_diff_slice" => {
                let session_id = req.args.get("sessionId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let offset = req.args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let limit = req.args.get("limit").and_then(|v| v.as_u64()).unwrap_or(100) as usize;

                match get_diff_slice(session_id, offset, limit) {
                    Ok(lines) => Response {
                        id: req.id,
                        result: serde_json::to_value(lines).ok(),
                        error: None,
                    },
                    Err(e) => Response {
                        id: req.id,
                        result: None,
                        error: Some(e),
                    },
                }
            }
            "close_diff_session" => {
                let session_id = req.args.get("sessionId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let _ = close_diff_session(session_id);
                Response {
                    id: req.id,
                    result: Some(Value::Null),
                    error: None,
                }
            }
            other => Response {
                id: req.id,
                result: None,
                error: Some(format!("Unknown command: {}", other)),
            },
        };

        if let Ok(serialized) = serde_json::to_string(&res) {
            let _ = writeln!(out_handle, "{}", serialized);
            let _ = out_handle.flush();
        }
    }
}
