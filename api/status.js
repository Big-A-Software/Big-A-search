const fs = require("fs");
const path = require("path");

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const indexPath = path.join(process.cwd(), "data", "index.json");
    const pages = JSON.parse(fs.readFileSync(indexPath, "utf8"));

    return res.status(200).json({
      service: "Big-A Search API",
      status: "ok",
      indexed_pages: Array.isArray(pages) ? pages.length : 0,
      account_required: false,
      api_key_required_for_search: true
    });
  } catch {
    return res.status(200).json({
      service: "Big-A Search API",
      status: "ok",
      indexed_pages: null,
      account_required: false,
      api_key_required_for_search: true
    });
  }
};
