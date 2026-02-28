const ALLOWED_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com"
]);

const RESERVED_USER_SEGMENTS = new Set(["i", "home", "explore", "search", "intent", "share"]);

function normalizeHost(hostname) {
  return hostname.trim().toLowerCase();
}

function isNumeric(value) {
  return /^\d+$/.test(value);
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function normalizeTweetUrl(input) {
  let parsedUrl;
  try {
    parsedUrl = new URL(input);
  } catch {
    throw new Error("Invalid URL.");
  }

  const host = normalizeHost(parsedUrl.hostname);
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error("Only x.com/twitter.com post URLs are supported.");
  }

  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const statusIndex = segments.findIndex((segment) => segment.toLowerCase() === "status");
  if (statusIndex === -1 || statusIndex + 1 >= segments.length) {
    throw new Error("URL is not a valid X post URL.");
  }

  const tweetId = segments[statusIndex + 1];
  if (!isNumeric(tweetId)) {
    throw new Error("URL is not a valid X post URL.");
  }

  let userSegment = null;
  if (statusIndex === 1) {
    const maybeUser = segments[0];
    if (!RESERVED_USER_SEGMENTS.has(maybeUser.toLowerCase())) {
      userSegment = maybeUser;
    }
  }

  const canonicalPath = userSegment
    ? `/${encodeURIComponent(userSegment)}/status/${tweetId}`
    : `/i/web/status/${tweetId}`;
  // Use twitter.com for maximum compatibility with Ghost/X embed processors.
  const canonicalUrl = `https://twitter.com${canonicalPath}`;

  return { canonicalUrl, tweetId };
}

export function buildTweetEmbedHtml(canonicalUrl) {
  const safeUrl = escapeHtmlAttribute(canonicalUrl);
  // Wrap in Ghost HTML-card markers so Admin API HTML->Lexical conversion is lossless.
  return [
    "<!--kg-card-begin: html-->",
    `<blockquote class="twitter-tweet"><a href="${safeUrl}">${safeUrl}</a></blockquote>`,
    "<!--kg-card-end: html-->"
  ].join("\n");
}

export function postContainsTweet(html, tweetId) {
  if (!html) {
    return false;
  }

  const escapedId = tweetId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idPattern = new RegExp(`status/${escapedId}(?:\\b|[/?#])`, "i");
  return idPattern.test(html);
}
