POCKETPOD V1.1 — INSTALL / UPDATE

1. Make a backup of your current PocketPod GitHub Pages repository.
2. Extract this ZIP.
3. Open the PocketPod folder inside the ZIP.
4. Replace the existing PocketPod site files with the contents of this folder.
5. Commit and push the changes to GitHub Pages.
6. On iPhone, fully close PocketPod and reopen it after the deployment finishes. If the old shell remains, open the site once in Safari to allow the V1.1 service-worker update to install, then relaunch the Home Screen app.

IMPORTANT
- Keep your existing PocketPod Cloudflare Worker deployed at the endpoint already configured in app.js.
- The local music database is not reset or upgraded; V1.1 keeps the existing IndexedDB schema.
- MP3.pm tracks are streaming-only and are not imported into the local library.
- Read RELEASE-NOTES-V1.1.md for the feature list and known limitations.
