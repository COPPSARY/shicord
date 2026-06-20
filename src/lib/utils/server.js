export function extractInviteCode(input) {
	return input.trim().split('/').filter(Boolean).pop() || '';
}

export function isVoicePresence(user, channelName) {
	if (!user || user.status !== 'voice') return false;
	return channelName ? user.channelName === channelName : true;
}
