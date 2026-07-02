const crypto = require("node:crypto");

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hashToken({ rawToken, secret }) {
  return crypto
    .createHmac("sha256", secret)
    .update(rawToken)
    .digest("hex");
}

function hashDeviceSecret({ rawDeviceSecret, secret }) {
  return crypto
    .createHmac("sha256", secret)
    .update(`device:${rawDeviceSecret}`)
    .digest("hex");
}

function createReadToken({ secret, now = Date.now() }) {
  const entropy = base64url(crypto.randomBytes(24));
  const raw = `tmc_${now}_${entropy}`;
  return {
    raw,
    hash: hashToken({ rawToken: raw, secret })
  };
}

function verifyToken({ rawToken, expectedHash, secret }) {
  const actualHash = hashToken({ rawToken, secret });
  return timingSafeHashEqual(actualHash, expectedHash);
}

function verifyDeviceSecret({ rawDeviceSecret, expectedHash, secret }) {
  const actualHash = hashDeviceSecret({ rawDeviceSecret, secret });
  return timingSafeHashEqual(actualHash, expectedHash);
}

function timingSafeHashEqual(actualHash, expectedHash) {
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = {
  createReadToken,
  hashDeviceSecret,
  hashToken,
  verifyDeviceSecret,
  verifyToken
};
