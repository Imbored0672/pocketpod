# PocketPod V1.0 Preview — Music Finder

This build adds the first PocketPod Music Finder connector while preserving the V0.9.1 local player.

## What's new
- Music Finder appears inside the Music menu.
- Search Internet Archive's audio catalog using its public Advanced Search JSON API.
- Browse up to 30 results, sorted by Archive download count.
- Inspect item metadata and available audio files using the public Metadata API.
- Show uploader-declared Creative Commons / public-domain license information.
- Show uploader-declared license/rights information when available.
- Keep missing or unrecognized rights metadata as a warning instead of automatically blocking every file.
- Ask for confirmation before importing a source file when rights are unverified.
- Import fetched audio into the existing IndexedDB library and open Now Playing automatically.
- Report CORS/source-access failures rather than opening the raw audio in a new tab.
- Do not offer a download when the uploader metadata explicitly indicates a restriction.
- Open the Internet Archive item page to inspect the original source and rights statement.

## How to test
1. Open PocketPod and select Music > Music Finder > Search Internet Archive.
2. Try a title, artist, album, or keywords (for example: `Standing Outside the Fire Garth Brooks`).
3. Select a result to inspect its metadata and available audio files.
4. Select an audio file. If rights are unverified, PocketPod asks you to confirm before attempting an import.
5. When the source allows browser access, PocketPod imports the audio into its local library and opens Now Playing automatically. If the source blocks browser access (CORS), PocketPod reports that limitation and offers the Archive item page instead.

## Important limitations in this preview
- Search and metadata use Internet Archive's browser-accessible JSON APIs.
- Direct import depends on the individual Archive file endpoint allowing browser CORS access. If it does not, a small proxy/worker is required for reliable one-tap import; this preview does not include a hosted proxy.
- Rights and license information is supplied by uploaders and may be missing or inaccurate. PocketPod cannot independently establish ownership or permission. An unverified item can still expose a source download, but the app warns and asks you to confirm; this is not a claim that downloading or reuse is authorized. Explicit restriction text is not offered for download.
- This is the first connector preview, not the finished multi-source Music Finder. MP3.pm and MP3Juice are not integrated.

## Preserved
The existing IndexedDB library, playlists, playback, queue, themes, Theme Studio, Cover Flow, click-wheel navigation modes, PWA shell, and media-session controls are retained from the V0.9.1 project baseline.
