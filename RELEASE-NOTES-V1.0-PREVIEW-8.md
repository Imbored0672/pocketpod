# PocketPod V1.0 Preview 8 — Native MP3.pm Search

## What changed
- MP3.pm search now calls the PocketPod Cloudflare Worker directly from Music Finder.
- Search results are displayed inside PocketPod; no MP3.pm tab, bookmarklet, clipboard transfer, or manual import step is needed.
- Selecting a result starts the existing Now Playing remote-stream player.
- MP3.pm streams remain streaming-only and are not added to IndexedDB, Songs, Recently Added, or local playlists.
- Internet Archive remains the separate download/import source and its existing flow is preserved.
- The service-worker cache name was bumped so deployed clients fetch this app-shell update.

## Setup requirement
The MP3.pm search bridge must be deployed and reachable at `https://pocketpodlink.gybhqy.workers.dev/` and return JSON with `source: "mp3pm"` and an `items` array containing `id`, `title`, and `url` fields. The Worker must allow cross-origin GET requests from the PocketPod site.

## Testing notes
- JavaScript syntax checked with Node.
- Validate the live search on desktop and iPhone/PWA after deployment. MP3.pm stream URLs may expire; search again if a result stops playing.
