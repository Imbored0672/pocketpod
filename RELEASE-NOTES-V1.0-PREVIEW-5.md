# PocketPod V1.0 — Preview 5: Download / Stream Split

This preview is based on the user-tested V1.0 Music Finder Preview 3.

## Music Finder split

- **DOWNLOAD · Internet Archive** retains the existing Archive search, item details, rights review, and local import workflow.
- **STREAM · MP3.pm** opens MP3.pm's own search site in a separate tab.
- **Play MP3.pm Stream URL** accepts a direct HTTPS MP3.pm `/listen/` audio URL and plays it through PocketPod's existing audio element and Now Playing screen.

## Streaming behavior

- Remote MP3.pm streams are played directly from their source; PocketPod does not fetch them as blobs or add them to IndexedDB.
- Stream metadata appears in Now Playing and Media Session where supported.
- Playback progress, seek, play, and pause use the existing player controls.
- Remote streams are deliberately excluded from Songs, Recently Added, local playlists, and the local play queue.
- Next/previous controls show a message because a remote stream queue has not been implemented.
- A stream URL can expire; if it does, return to MP3.pm and provide a fresh URL.

## Important scope note

This is a first streaming bridge, not automated MP3.pm search-result scraping. MP3.pm's public disclaimer describes its indexed music as being for fact-finding listening and says users must remove downloaded songs after listening. The app therefore opens MP3.pm for its own search UI and only accepts a user-provided direct stream URL; it does not scrape the catalog, download the audio, or store a local copy. This technical preview does not establish rights to any recording or grant permission for uses beyond the source's terms.

## Preserved features

- Existing IndexedDB library and playlists are unchanged.
- Existing local import, metadata, artwork, library browsing, queue, shuffle/repeat, themes, click-wheel navigation, and Now Playing controls remain in place.
- No database version change or migration is required.

## Test checklist

1. Confirm existing local songs still play and queue normally.
2. Music → Music Finder → DOWNLOAD · Internet Archive; search an item and confirm the existing import workflow still works.
3. Music → Music Finder → STREAM · MP3.pm; confirm MP3.pm opens in a new tab.
4. Return to PocketPod → Play MP3.pm Stream URL; paste a direct HTTPS `cs1.mp3.pm/listen/...` URL.
5. Confirm Now Playing shows the remote title and identifies it as not saved locally; test seek and pause.
6. Open Songs / Recently Added and confirm the stream is not added to the library.
7. Return to local music and confirm local playback still works.
