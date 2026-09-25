use super::inline::compute_inline_diff;
use super::options::DiffOptions;
use super::types::{DiffChunk, DiffLine, DiffLineType};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock, RwLock};

pub enum SourceBuffer {
    Memory(Arc<Vec<u8>>),
    Mmap(Arc<memmap2::Mmap>),
}

impl SourceBuffer {
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            SourceBuffer::Memory(b) => b.as_slice(),
            SourceBuffer::Mmap(m) => m.as_ref(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CompactLine {
    pub left_line_num: Option<u32>,
    pub right_line_num: Option<u32>,
    pub line_type: DiffLineType,
    pub chunk_id: Option<u32>,
    pub left_span: Option<(u64, u32)>,  // (offset, len)
    pub right_span: Option<(u64, u32)>, // (offset, len)
}

pub struct DiffSession {
    pub session_id: String,
    pub total_virtual_lines: usize,
    pub total_left_lines: usize,
    pub total_right_lines: usize,
    pub added_chunks: usize,
    pub deleted_chunks: usize,
    pub modified_chunks: usize,
    pub is_identical: bool,
    pub hash_matched: bool,
    pub chunks: Vec<DiffChunk>,
    pub lines: Vec<CompactLine>,
    pub left_source: Option<SourceBuffer>,
    pub right_source: Option<SourceBuffer>,
    pub options: DiffOptions,
    pub created_at: std::time::Instant,
}

impl DiffSession {
    pub fn get_slice(&self, offset: usize, limit: usize) -> Vec<DiffLine> {
        let end = (offset + limit).min(self.lines.len());
        if offset >= end {
            return Vec::new();
        }

        let left_bytes = self.left_source.as_ref().map(|s| s.as_bytes());
        let right_bytes = self.right_source.as_ref().map(|s| s.as_bytes());

        let mut result = Vec::with_capacity(end - offset);

        for compact in &self.lines[offset..end] {
            let left_text = compact.left_span.and_then(|(off, len)| {
                left_bytes.and_then(|b| {
                    let s = off as usize;
                    let e = s + len as usize;
                    if e <= b.len() {
                        Some(String::from_utf8_lossy(&b[s..e]).into_owned())
                    } else {
                        None
                    }
                })
            });

            let right_text = compact.right_span.and_then(|(off, len)| {
                right_bytes.and_then(|b| {
                    let s = off as usize;
                    let e = s + len as usize;
                    if e <= b.len() {
                        Some(String::from_utf8_lossy(&b[s..e]).into_owned())
                    } else {
                        None
                    }
                })
            });

            let (left_inline, right_inline) = if compact.line_type == DiffLineType::Modified {
                match (&left_text, &right_text) {
                    (Some(l), Some(r)) => compute_inline_diff(l, r, &self.options),
                    _ => (Vec::new(), Vec::new()),
                }
            } else {
                (Vec::new(), Vec::new())
            };

            result.push(DiffLine {
                left_line_num: compact.left_line_num.map(|n| n as usize),
                right_line_num: compact.right_line_num.map(|n| n as usize),
                left_text,
                right_text,
                line_type: compact.line_type,
                left_inline,
                right_inline,
                chunk_id: compact.chunk_id.map(|n| n as usize),
            });
        }

        result
    }
}

pub struct DiffSessionManager {
    sessions: RwLock<HashMap<String, Arc<DiffSession>>>,
    session_order: Mutex<Vec<String>>,
}

impl DiffSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            session_order: Mutex::new(Vec::new()),
        }
    }

    pub fn insert_session(&self, session: DiffSession) -> String {
        let id = session.session_id.clone();
        let arc = Arc::new(session);

        {
            let mut w = self.sessions.write().unwrap();
            w.insert(id.clone(), arc);
        }

        {
            let mut order = self.session_order.lock().unwrap();
            order.push(id.clone());

            // Limit active sessions to prevent excessive memory retention
            if order.len() > 10 {
                let old_id = order.remove(0);
                let mut w = self.sessions.write().unwrap();
                w.remove(&old_id);
            }
        }

        id
    }

    pub fn get_slice(&self, session_id: &str, offset: usize, limit: usize) -> Result<Vec<DiffLine>, String> {
        let r = self.sessions.read().map_err(|e| e.to_string())?;
        match r.get(session_id) {
            Some(session) => Ok(session.get_slice(offset, limit)),
            None => Err(format!("Diff session '{}' not found or expired.", session_id)),
        }
    }

    pub fn remove_session(&self, session_id: &str) {
        if let Ok(mut w) = self.sessions.write() {
            w.remove(session_id);
        }
        if let Ok(mut order) = self.session_order.lock() {
            order.retain(|id| id != session_id);
        }
    }
}

static GLOBAL_DIFF_MANAGER: OnceLock<DiffSessionManager> = OnceLock::new();

pub fn get_diff_session_manager() -> &'static DiffSessionManager {
    GLOBAL_DIFF_MANAGER.get_or_init(DiffSessionManager::new)
}

/// Fast scan of line byte spans using memchr.
/// Returns Vec<(offset, length)> for each line, stripping \r and \n.
pub fn scan_line_spans(bytes: &[u8]) -> Vec<(u64, u32)> {
    if bytes.is_empty() {
        return Vec::new();
    }

    let mut spans = Vec::new();
    let mut line_start: usize = 0;

    for newline_pos in memchr::memchr_iter(b'\n', bytes) {
        let mut line_end = newline_pos;
        if line_end > line_start && bytes[line_end - 1] == b'\r' {
            line_end -= 1;
        }

        let len = (line_end - line_start) as u32;
        spans.push((line_start as u64, len));
        line_start = newline_pos + 1;
    }

    // Trailing line without trailing newline
    if line_start < bytes.len() {
        let mut line_end = bytes.len();
        if line_end > line_start && bytes[line_end - 1] == b'\r' {
            line_end -= 1;
        }
        let len = (line_end - line_start) as u32;
        spans.push((line_start as u64, len));
    }

    spans
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_line_spans() {
        let text = b"line1\nline2\r\nline3";
        let spans = scan_line_spans(text);
        assert_eq!(spans.len(), 3);
        assert_eq!(&text[spans[0].0 as usize..(spans[0].0 as usize + spans[0].1 as usize)], b"line1");
        assert_eq!(&text[spans[1].0 as usize..(spans[1].0 as usize + spans[1].1 as usize)], b"line2");
        assert_eq!(&text[spans[2].0 as usize..(spans[2].0 as usize + spans[2].1 as usize)], b"line3");
    }

    #[test]
    fn test_session_manager_slice() {
        let text_l = b"aaa\nbbb\nccc";
        let text_r = b"aaa\nbbx\nccc";

        let spans_l = scan_line_spans(text_l);
        let spans_r = scan_line_spans(text_r);

        let lines = vec![
            CompactLine {
                left_line_num: Some(1),
                right_line_num: Some(1),
                line_type: DiffLineType::Unchanged,
                chunk_id: None,
                left_span: Some(spans_l[0]),
                right_span: Some(spans_r[0]),
            },
            CompactLine {
                left_line_num: Some(2),
                right_line_num: Some(2),
                line_type: DiffLineType::Modified,
                chunk_id: Some(0),
                left_span: Some(spans_l[1]),
                right_span: Some(spans_r[1]),
            },
            CompactLine {
                left_line_num: Some(3),
                right_line_num: Some(3),
                line_type: DiffLineType::Unchanged,
                chunk_id: None,
                left_span: Some(spans_l[2]),
                right_span: Some(spans_r[2]),
            },
        ];

        let session = DiffSession {
            session_id: "test-sess-1".to_string(),
            total_virtual_lines: lines.len(),
            total_left_lines: 3,
            total_right_lines: 3,
            added_chunks: 0,
            deleted_chunks: 0,
            modified_chunks: 1,
            is_identical: false,
            hash_matched: false,
            chunks: vec![DiffChunk {
                chunk_id: 0,
                left_start: 2,
                left_count: 1,
                right_start: 2,
                right_count: 1,
                chunk_type: super::super::types::DiffChunkType::Modification,
                left_lines: vec!["bbb".to_string()],
                right_lines: vec!["bbx".to_string()],
            }],
            lines,
            left_source: Some(SourceBuffer::Memory(Arc::new(text_l.to_vec()))),
            right_source: Some(SourceBuffer::Memory(Arc::new(text_r.to_vec()))),
            options: DiffOptions::default(),
            created_at: std::time::Instant::now(),
        };

        let manager = DiffSessionManager::new();
        let sid = manager.insert_session(session);

        let slice = manager.get_slice(&sid, 1, 1).unwrap();
        assert_eq!(slice.len(), 1);
        assert_eq!(slice[0].left_text.as_deref(), Some("bbb"));
        assert_eq!(slice[0].right_text.as_deref(), Some("bbx"));
        assert_eq!(slice[0].line_type, DiffLineType::Modified);
        assert!(!slice[0].left_inline.is_empty());
    }
}
