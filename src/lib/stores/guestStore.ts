const GUEST_ID_KEY = 'shicord_guest_id';
const GUEST_NAME_KEY = 'shicord_guest_name';
const GUEST_AVATAR_KEY = 'shicord_guest_avatar';

function generateId(): string {
  return 'guest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

export function getGuestId(): string {
  if (typeof sessionStorage === 'undefined') return generateId();
  // ponytail: realtime identity must be per-tab or local two-tab voice tests collide.
  let id = sessionStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = generateId();
    sessionStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

export function getGuestName(): string {
  if (typeof localStorage === 'undefined') return 'Guest';
  return localStorage.getItem(GUEST_NAME_KEY) || '';
}

export function setGuestName(name: string) {
  localStorage.setItem(GUEST_NAME_KEY, name);
}

export function getGuestAvatar(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(GUEST_AVATAR_KEY) || '';
}

export function setGuestAvatar(url: string) {
  localStorage.setItem(GUEST_AVATAR_KEY, url);
}
