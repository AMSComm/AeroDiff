/**
 * Clean path by stripping quotes, whitespace, escape characters, and file:// prefixes
 */
export function cleanPath(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim();

  // Strip file:// or file:/// URL scheme
  if (cleaned.startsWith('file://')) {
    cleaned = cleaned.replace(/^file:\/\/\/?/, '/');
    // On Windows, /C:/path -> C:/path
    if (/^\/[a-zA-Z]:/.test(cleaned)) {
      cleaned = cleaned.slice(1);
    }
  }

  // URL percent decode (e.g. %20 for space)
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // If not a valid percent-encoded string, proceed
  }

  // Unescape backslash-escaped spaces from terminal paste (e.g. "My\ Folder" -> "My Folder")
  cleaned = cleaned.replace(/\\ /g, ' ');

  // Strip single or double quotes repeatedly
  while (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned.trim();
}
