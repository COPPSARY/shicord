// ponytail: client-side spam guard only; real abuse prevention belongs on a server gate.
export function createMessageRateLimiter(limit = 50, windowMs = 60_000, cooldownMs = 15_000) {
	let timestamps = [];
	let cooldownUntil = 0;

	return {
		check(now = Date.now()) {
			timestamps = timestamps.filter((timestamp) => now - timestamp < windowMs);

			if (now < cooldownUntil) {
				return { allowed: false, reason: "Please don't spam", retryAfterMs: cooldownUntil - now };
			}

			if (timestamps.length >= limit) {
				cooldownUntil = now + cooldownMs;
				timestamps = [];
				return { allowed: false, reason: "Please don't spam", retryAfterMs: cooldownMs };
			}

			timestamps.push(now);
			return { allowed: true, reason: '', retryAfterMs: 0 };
		}
	};
}
