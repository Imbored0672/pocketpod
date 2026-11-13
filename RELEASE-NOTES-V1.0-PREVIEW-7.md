# PocketPod V1.0 Preview 7 — MP3.pm Search Results Bridge

## What's new
- MP3.pm search opens the query-specific results subdomain using the observed `s-<query>.mp3.pm` pattern.
- Added a user-triggered PocketPod bookmarklet helper for MP3.pm result pages.
- The helper reads visible `.cplayer-sound-item` elements and their `data-sound-id` / `data-sound-url` attributes on the MP3.pm page itself, then copies a compact result payload to the clipboard.
- PocketPod can import that payload into a selectable MP3.pm results screen.
- Selecting a result sends its direct `/listen/` URL to the existing Now Playing player and displays the extracted title/artist when available.
- Remote MP3.pm streams remain playback-only: they are not downloaded, indexed in the local library, or added to local playlists.
- Existing manual stream URL and copied-URL playback remain available as fallbacks.

## How to use MP3.pm search
1. Open Music → Music Finder → Set up MP3.pm helper.
2. Copy the helper bookmarklet and save it as a browser bookmark named `PocketPod` (the bookmark's address/URL must be the copied `javascript:` text).
3. Choose STREAM · MP3.pm Search and search for a track or artist.
4. On the MP3.pm results page, run the `PocketPod` bookmark.
5. Return to PocketPod → Music Finder → Import MP3.pm search results.
6. Select a result to start streaming in Now Playing.

If clipboard access is unavailable, the helper opens a copy prompt. Existing manual URL entry is still available.

## Technical note
The helper is explicitly user-invoked in the MP3.pm page's own browsing context. It does not fetch MP3.pm HTML from PocketPod, run a proxy, or bypass browser CORS. This preview does not establish rights to any particular recording or permission for automated third-party catalog access. Use only content you are authorized to access.

## Preserved
- Internet Archive remains the download/import source.
- Existing PocketPod library, metadata, playlists, local playback, themes, navigation, and PWA behavior are retained from Preview 6.
