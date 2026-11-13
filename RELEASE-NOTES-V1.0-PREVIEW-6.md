# PocketPod V1.0 Preview 6 — MP3.pm Search Handoff

## What changed
- Music Finder now asks for a song/artist search, opens MP3.pm, and copies the query so it can be pasted directly into MP3.pm's search field.
- Added **Play copied MP3.pm stream**: after copying a direct HTTPS `*.mp3.pm/listen/...` audio URL on MP3.pm, return to PocketPod and select this action. PocketPod reads the clipboard (when browser permission allows) and starts the stream in Now Playing.
- Kept **Enter stream URL manually** as a fallback for browsers that block clipboard access.
- Remote streams remain streaming-only: they are not imported into IndexedDB, Songs, Recently Added, or playlists.
- Internet Archive remains the separate download/import source.
- Updated the service-worker cache name so deployed clients fetch the new app shell.

## Important limitation
This preview does not claim native MP3.pm catalog/API integration. No public search API or documented integration endpoint was verified. Search itself remains on MP3.pm; PocketPod stream playback is the part integrated.

## Test checklist
1. Open Music → Music Finder → STREAM · MP3.pm Search.
2. Enter a query; confirm MP3.pm opens and the query is copied. Paste it into MP3.pm's search box.
3. On MP3.pm, copy a direct HTTPS `cs1.mp3.pm/listen/...` audio URL.
4. Return to PocketPod → Play copied MP3.pm stream. If clipboard read is denied, use Enter stream URL manually.
5. Confirm Now Playing starts and the stream does not appear in Songs/Recently Added or local playlists.
6. Test Internet Archive import and normal local playback remain intact.
