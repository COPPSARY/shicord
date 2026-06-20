import test from 'node:test';
import assert from 'node:assert/strict';
import { extractInviteCode, isVoicePresence } from '../src/lib/utils/server.js';

test('extractInviteCode handles raw codes', () => {
	assert.equal(extractInviteCode('ABC123'), 'ABC123');
});

test('extractInviteCode handles join URLs', () => {
	assert.equal(extractInviteCode('https://example.com/join/ABC123'), 'ABC123');
});

test('extractInviteCode trims whitespace and trailing slash', () => {
	assert.equal(extractInviteCode('  /join/ROOM42/  '), 'ROOM42');
});

test('isVoicePresence only matches voice users', () => {
	assert.equal(isVoicePresence({ status: 'online', channelName: 'Voice' }), false);
	assert.equal(isVoicePresence({ status: 'voice', channelName: 'Voice' }), true);
});

test('isVoicePresence can match a specific channel', () => {
	assert.equal(isVoicePresence({ status: 'voice', channelName: 'Voice' }, 'Voice'), true);
	assert.equal(isVoicePresence({ status: 'voice', channelName: 'Other' }, 'Voice'), false);
});
