import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageRateLimiter } from '../src/lib/utils/rate-limit.js';

test('rate limiter allows sends under the limit', () => {
	const limiter = createMessageRateLimiter(2, 60_000, 15_000);
	assert.equal(limiter.check(1_000).allowed, true);
	assert.equal(limiter.check(2_000).allowed, true);
});

test('rate limiter blocks on spam and respects cooldown', () => {
	const limiter = createMessageRateLimiter(2, 60_000, 15_000);
	limiter.check(1_000);
	limiter.check(2_000);

	const blocked = limiter.check(3_000);
	assert.equal(blocked.allowed, false);
	assert.equal(blocked.reason, "Please don't spam");
	assert.equal(blocked.retryAfterMs, 15_000);

	assert.equal(limiter.check(10_000).allowed, false);
	assert.equal(limiter.check(18_001).allowed, true);
});
