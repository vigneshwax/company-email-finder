const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MAILTO_REGEX = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

// Domains that commonly show up in tracking pixels / placeholders / libraries,
// not real contact emails.
const IGNORE_DOMAINS = [
  "sentry.io",
  "wixpress.com",
  "example.com",
  "godaddy.com",
  "schema.org",
  "w3.org",
  "yourdomain.com",
  "domain.com",
  "email.com",
  "test.com",
  "site.com",
  "cloudflare.com",
  "sentry-next.wixpress.com"
];

const IGNORE_FILE_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js", ".woff", ".woff2"
];

function isJunkEmail(email) {
  const domain = (email.split("@")[1] || "").toLowerCase();
  if (IGNORE_DOMAINS.some((d) => domain.includes(d))) return true;
  if (IGNORE_FILE_EXTENSIONS.some((ext) => email.endsWith(ext))) return true;
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(email)) return true;
  return false;
}

/**
 * Extract every email address found inside a blob of text/HTML.
 */
function extractEmails(text) {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) || [];
  const cleaned = matches
    .map((e) => e.trim().toLowerCase().replace(/[.,;:]+$/, ""))
    .filter((e) => !isJunkEmail(e));
  return [...new Set(cleaned)];
}

/**
 * Extract emails specifically from mailto: links (higher confidence source).
 */
function extractMailtoEmails(html) {
  if (!html) return [];
  const found = [];
  let match;
  MAILTO_REGEX.lastIndex = 0;
  while ((match = MAILTO_REGEX.exec(html)) !== null) {
    found.push(match[1].toLowerCase());
  }
  return [...new Set(found.filter((e) => !isJunkEmail(e)))];
}

module.exports = { extractEmails, extractMailtoEmails };
