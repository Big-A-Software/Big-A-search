const crypto = require("crypto");

function getSecret() {
  const secret = process.env.BIG_A_API_SECRET;

  if (!secret) {
    throw new Error("BIG_A_API_SECRET is not configured");
  }

  return secret;
}

function sign(value) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(value)
    .digest("base64url");
}

function createApiKey() {
  const id = crypto.randomBytes(18).toString("base64url");
  const issued = Date.now().toString(36);
  const payload = `BA1.${id}.${issued}`;
  const signature = sign(payload).slice(0, 32);

  return `${payload}.${signature}`;
}

function verifyApiKey(key) {
  if (typeof key !== "string") return false;

  const parts = key.split(".");
  if (parts.length !== 4 || parts[0] !== "BA1") return false;

  const payload = parts.slice(0, 3).join(".");
  const expected = sign(payload).slice(0, 32);
  const supplied = parts[3];

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);

    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = {
  createApiKey,
  verifyApiKey
};
