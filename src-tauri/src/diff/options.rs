use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum IgnoreWhitespace {
    #[default]
    None,
    LeadingAndTrailing,
    All,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct DiffOptions {
    pub ignore_whitespace: IgnoreWhitespace,
    pub ignore_blank_lines: bool,
    pub ignore_case: bool,
    pub regex_filter: Option<String>,
}

impl DiffOptions {
    pub fn normalize_line<'a>(&self, line: &'a str) -> String {
        let mut s = line.to_string();

        if self.ignore_case {
            s = s.to_lowercase();
        }

        match self.ignore_whitespace {
            IgnoreWhitespace::None => s,
            IgnoreWhitespace::LeadingAndTrailing => s.trim().to_string(),
            IgnoreWhitespace::All => s.chars().filter(|c| !c.is_whitespace()).collect(),
        }
    }

    pub fn should_ignore_line(&self, line: &str) -> bool {
        if self.ignore_blank_lines && line.trim().is_empty() {
            return true;
        }

        if let Some(ref pattern) = self.regex_filter {
            if !pattern.is_empty() {
                if let Ok(re) = Regex::new(pattern) {
                    if re.is_match(line) {
                        return true;
                    }
                }
            }
        }

        false
    }
}
