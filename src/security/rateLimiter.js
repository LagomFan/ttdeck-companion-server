function createRateLimiter({ windowMs = 60 * 1000, maxAttempts = 20 } = {}) {
  const buckets = new Map();

  function check(key, now = Date.now()) {
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: maxAttempts - 1, retryAfterSeconds: 0 };
    }

    if (current.count >= maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      };
    }

    current.count += 1;
    return {
      allowed: true,
      remaining: maxAttempts - current.count,
      retryAfterSeconds: 0
    };
  }

  return { check };
}

module.exports = {
  createRateLimiter
};
