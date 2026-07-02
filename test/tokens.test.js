const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createReadToken,
  hashToken,
  verifyToken
} = require("../src/security/tokens");

test("createReadToken returns raw token and hash", () => {
  const token = createReadToken({ secret: "test-secret", now: 1782330000000 });

  assert.equal(token.raw.startsWith("tmc_"), true);
  assert.equal(token.hash.length, 64);
});

test("verifyToken accepts matching token", () => {
  const token = createReadToken({ secret: "test-secret", now: 1782330000000 });

  assert.equal(
    verifyToken({
      rawToken: token.raw,
      expectedHash: token.hash,
      secret: "test-secret"
    }),
    true
  );
});

test("verifyToken rejects different token", () => {
  const token = createReadToken({ secret: "test-secret", now: 1782330000000 });
  const otherHash = hashToken({ rawToken: "tmc_other", secret: "test-secret" });

  assert.notEqual(token.hash, otherHash);
  assert.equal(
    verifyToken({
      rawToken: "tmc_other",
      expectedHash: token.hash,
      secret: "test-secret"
    }),
    false
  );
});

test("verifyToken rejects malformed expected hash", () => {
  const token = createReadToken({ secret: "test-secret", now: 1782330000000 });

  assert.equal(
    verifyToken({
      rawToken: token.raw,
      expectedHash: "not-a-hex-hash",
      secret: "test-secret"
    }),
    false
  );
});
