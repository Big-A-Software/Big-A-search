const { createApiKey } = require("./_auth");

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed",
      message: "Use POST to generate a Big-A API key."
    });
  }

  try {
    const key = createApiKey();

    return res.status(201).json({
      api_key: key,
      type: "Big-A Search API key",
      account_required: false,
      note: "Save this key. Big-A does not store a copy of it."
    });
  } catch (error) {
    return res.status(503).json({
      error: "api_not_configured",
      message: "Big-A Search API needs BIG_A_API_SECRET configured on the server."
    });
  }
};
