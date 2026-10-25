/* ============================================================
   share/clips.js — the clips with sound that come with Laminar.

   His own four, sent for the share sheet and cut clean (the TikTok marks
   and the black openings and endings taken off): they sit under
   Background → With sound, ready to use, beside the ones he adds himself.
   The files are in src/media/clips/ (the desktop app serves them; the
   single-file build carries them only with --with-media).

   How he leaves each one — trim, position, dim, sound — is kept in the
   share prefs (store.updateShareClip), the way his own clips keep theirs.
   ============================================================ */
export const BUILTIN_CLIPS = [
  { id: 'builtin:luffy',       name: 'Luffy',       src: 'media/clips/luffy.mp4',       thumb: 'media/clips/luffy.jpg',       dur: 21.3 },
  { id: 'builtin:levi',        name: 'Levi',        src: 'media/clips/levi.mp4',        thumb: 'media/clips/levi.jpg',        dur: 14.633 },
  { id: 'builtin:asta',        name: 'Asta',        src: 'media/clips/asta.mp4',        thumb: 'media/clips/asta.jpg',        dur: 11.3 },
  { id: 'builtin:wall-street', name: 'Wall Street', src: 'media/clips/wall-street.mp4', thumb: 'media/clips/wall-street.jpg', dur: 16.6 },
];
export const isBuiltinClip = id => String(id || '').startsWith('builtin:');
