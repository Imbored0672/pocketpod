# PocketPod V1.1 — Streaming & Quality-of-Life Update

PocketPod V1.1 builds on the fully tested V1.0 Preview 8 native MP3.pm search integration. This release keeps the Internet Archive download/import path separate from MP3.pm streaming.

## What's new

- **Native streaming search screen:** Search MP3.pm from inside PocketPod with a proper in-app text field. The last search is remembered and can be run again without leaving the app.
- **Improved streaming results:** Results show title and an artist guess derived from the MP3 filename when available. Album artwork is looked up asynchronously and displayed when a match is found; artwork lookup failures do not block search or playback.
- **Streaming Now Playing:** Streamed tracks have a clear MP3.pm streaming indicator, source/status text, artwork when available, and Media Session metadata for supported lock-screen controls.
- **Play Next and Add to Queue:** Streamed tracks and local library tracks can be placed into a persistent Up Next queue. Queue items can be played or removed. The existing local-library playback queue remains supported.
- **Recently Streamed:** PocketPod keeps a separate local history of up to 30 successfully started streamed tracks. Selecting a history item repeats its original search rather than relying on a possibly expired stream URL.
- **Remembered preferences:** Last MP3.pm search, Recently Streamed history, Up Next queue, shuffle, and repeat settings are persisted on the device.
- **PWA cache update:** Service-worker cache version is bumped for V1.1 so deployed clients fetch the new app shell.

## Preserved

- Existing local music library and IndexedDB database (no database schema change)
- Local audio import, metadata, artwork, playlists, search, sorting, Cover Flow, and themes
- Internet Archive download/import workflow
- MP3.pm remains streaming-only; remote tracks are not added to the local library or local playlists
- Existing mobile layout, click-wheel navigation, background audio, and Media Session support

## Notes and limitations

- MP3.pm stream URLs can expire. Recently Streamed re-runs the saved search to obtain fresh results; queued remote URLs may need to be searched again if they expire before playback.
- Artwork is best-effort and comes from the iTunes Search API. It is not required for playback and may be unavailable or mismatched for some results.
- The artist label is inferred from the stream filename when it contains an `Artist - Title` pattern; otherwise PocketPod labels the source as MP3.pm.
- Live search/playback still depends on the configured PocketPod Cloudflare Worker and MP3.pm being reachable. This build does not bypass bot checks, access restrictions, or site controls.

## Validation performed for this package

- JavaScript syntax check (`node --check app.js`)
- Manifest JSON validation
- Static feature-marker checks for search, artwork, queue, history, and preferences
- ZIP integrity check

The live MP3.pm search and playback path was already confirmed by the user on V1.0 Preview 8. V1.1's new UI and queue/history/artwork additions still require desktop and iPhone PWA testing before being treated as fully verified.
