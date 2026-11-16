/* ============================================================
   profilecard.js — your profile, as a card, at the top of
   Settings → Profile.

   Banner, picture, name, @name, a line about you, and two counts.
   Laminar has no online side, so nobody can follow anybody: the
   one account there is, is Laminar's own. Everyone follows it and
   it follows everyone, and that cannot be undone. Both counts
   therefore read 1, and both lists hold that single account.
   ============================================================ */
import { el, icon, brandMark } from '../ui.js';
import { sheet } from '../sheet.js';
import { profileFill } from '../shell.js';

export const LAMINAR = { name: 'Laminar', handle: 'laminar', bio: 'The official Laminar account. Your edge, in writing.' };

/** A handle from whatever was typed: lower case, letters, digits, dot and underscore. */
export const tidyHandle = s => String(s || '').toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9._]/g, '').slice(0, 24);
export const handleOf = store => store.userHandle || tidyHandle((store.userName || '').replace(/\s+/g, '')) || 'you';

/* A plain tick on a blue disc. */
const tick = (size = 16) => el('span', { class: 'pf-tick', role: 'img', 'aria-label': 'Official account', title: 'Official account',
  style: { width: size + 'px', height: size + 'px' } }, icon('check', Math.round(size * 0.62), '#fff', 3));

const following = () => el('span', { class: 'pf-following', title: 'Everyone follows Laminar', 'aria-disabled': 'true' }, 'Following');

/** Laminar's own profile. */
export function openLaminarProfile() {
  const body = el('div', { class: 'pf-card is-laminar' },
    el('div', { class: 'pf-banner' }, el('img', { src: 'media/welcome/land.jpg', alt: '', draggable: 'false' })),
    el('div', { class: 'pf-row' },
      el('span', { class: 'pf-pic' }, brandMark(84)),
      following()),
    el('div', { class: 'pf-text' },
      el('div', { class: 'pf-name' }, LAMINAR.name, tick(17)),
      el('div', { class: 'pf-handle' }, '@' + LAMINAR.handle),
      el('p', { class: 'pf-bio' }, LAMINAR.bio)));
  return sheet({ cls: 'is-profile', body, label: 'Laminar' });
}

/** The list behind a count: the one account. */
export function openFollowList(which) {
  const title = which === 'following' ? 'Following' : 'Followers';
  let api;
  const body = el('div', { class: 'pf-list' },
    el('button', { class: 'pf-acct', 'data-acct': 'laminar', onClick: () => { api.close(); openLaminarProfile(); } },
      el('span', { class: 'pf-acct-pic' }, brandMark(40)),
      el('span', { class: 'pf-acct-t' },
        el('span', { class: 'pf-acct-n' }, LAMINAR.name, tick(14)),
        el('span', { class: 'pf-acct-h' }, '@' + LAMINAR.handle)),
      following()));
  api = sheet({ cls: 'is-follow', title, body });
  return api;
}

/** Your own card. `picker(which)` opens the file chooser for 'avatar' or 'banner'. */
export function profileHeader(store, { picker } = {}) {
  const who = store.userName;
  const initials = (who || 'You').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const banner = el('div', { class: 'pf-banner', style: { '--uc': store.userColour } },
    picker ? el('button', { class: 'pf-banner-b', 'data-pick': 'banner', title: 'A picture or a video for your banner', onClick: () => picker('banner') },
      icon('image', 13, 'currentColor', 1.9), store.profileMedia('banner') ? 'Change banner' : 'Add banner') : null);
  profileFill(store, 'banner', banner);
  const frost = !store.data.accounts.userColour;
  const pic = el('span', { class: 'pf-pic st-avatar' + (frost ? ' is-frost' : ''), style: frost ? {} : { background: store.userColour, color: store.userInk } },
    who ? initials : icon('user', 26, 'currentColor', 1.7));
  profileFill(store, 'avatar', pic);
  const count = (which, n, label) => el('button', { class: 'pf-count', 'data-count': which, onClick: () => openFollowList(which) },
    el('b', {}, String(n)), ' ' + label);
  return el('section', { class: 'card pf-card' },
    banner,
    el('div', { class: 'pf-row' },
      el('span', { class: 'pf-pic-w' }, pic,
        picker ? el('button', { class: 'st-avatar-b', 'data-pick': 'avatar', title: 'A picture or a video of your own', 'aria-label': 'Change your picture',
          onClick: () => picker('avatar') }, icon('camera', 13, 'currentColor', 2)) : null)),
    el('div', { class: 'pf-text' },
      el('div', { class: 'pf-name' }, who || 'Your name'),
      el('div', { class: 'pf-handle' }, '@' + handleOf(store)),
      store.userBio ? el('p', { class: 'pf-bio' }, store.userBio) : el('p', { class: 'pf-bio is-empty' }, 'Add a line about yourself below.'),
      el('div', { class: 'pf-counts' }, count('following', 1, 'Following'), count('followers', 1, 'Followers'))));
}
