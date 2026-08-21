const fs = require("fs");
const path = require("path");
const { verifyApiKey } = require("./_auth");

function getApiKey(req) {
  const headerKey = req.headers["x-big-a-key"];
  const auth = req.headers.authorization;
  if (headerKey) return String(headerKey).trim();
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

function scorePage(page, query, words) {
  const title = String(page.title || "").toLowerCase();
  const description = String(page.description || "").toLowerCase();
  const url = String(page.url || "").toLowerCase();
  let score = 0;
  if (title === query) score += 100;
  if (title.startsWith(query)) score += 40;
  if (title.includes(query)) score += 25;
  if (url.includes(query)) score += 12;
  if (description.includes(query)) score += 8;
  for (const word of words) {
    if (title.includes(word)) score += 8;
    if (url.includes(word)) score += 4;
    if (description.includes(word)) score += 2;
  }
  return score;
}

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, X-Big-A-Key, Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed", message: "Use GET to search Big-A." });

  // Big-A Search is public. API keys identify integrations; they do not unlock search access.
  const suppliedKey = getApiKey(req);
  let integration = { key_supplied: Boolean(suppliedKey), key_valid: null };
  if (suppliedKey) {
    try {
      integration.key_valid = verifyApiKey(suppliedKey);
    } catch {
      // If the signing secret is not configured, public search still works.
      integration.key_valid = null;
    }
  }

  const rawQuery = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const query = String(rawQuery || "").trim().toLowerCase();
  if (!query) return res.status(400).json({ error: "missing_query", message: "Add a search query using ?q=your+search." });

  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 10;

  try {
    const indexPath = path.join(process.cwd(), "data", "index.json");
    const pages = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    const words = query.split(/\s+/).filter(Boolean);
    const results = pages
      .map(page => ({ page, score: scorePage(page, query, words) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({ title: item.page.title, url: item.page.url, description: item.page.description }));

    return res.status(200).json({ engine: "Big-A Search", query, count: results.length, integration, results });
  } catch {
    return res.status(500).json({ error: "search_failed", message: "Big-A could not read the search index." });
  }
};
