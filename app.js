const menuEl = document.getElementById("menu");
const titleEl = document.getElementById("screen-title");
const nowPlayingEl = document.getElementById("now-playing");
const footerHint = document.getElementById("footer-hint");
const wheel = document.getElementById("wheel");
const audio = document.getElementById("audio-player");
const filePicker = document.getElementById("file-picker");
const folderPicker = document.getElementById("folder-picker");
const trackNameEl = document.getElementById("track-name");
const trackArtistEl = document.getElementById("track-artist");
const progressFill = document.getElementById("progress-fill");
const elapsedEl = document.getElementById("elapsed");
const durationEl = document.getElementById("duration");
const albumArt = document.getElementById("album-art");
const progressEl = document.getElementById("progress");

const DB_NAME = "PocketPodLibrary";
const DB_VERSION = 2;
let db;
let library = [];
let playlists = [];
let playbackQueue = null;
let queueIndex = -1;
let currentTrackIndex = -1;
let currentObjectUrl = null;
let currentArtUrl = null;
let currentRemoteTrack = null;
let playing = false;
let repeatMode = localStorage.getItem("pp-repeat-mode") || "off";
let shuffle = localStorage.getItem("pp-shuffle") === "true";
let stack = ["home"];
let selected = 0;
let finish = localStorage.getItem("pp-finish") || "Black";
let highlight = localStorage.getItem("pp-highlight") || "Blue";
let wheelColor = localStorage.getItem("pp-wheel") || "Silver";
let themePack = localStorage.getItem("pp-theme-pack") || "Classic";
let librarySort = localStorage.getItem("pp-library-sort") || "title";
let navigationMode = localStorage.getItem("pp-navigation-mode") || "both";
let artworkTargetId = null;
const artworkPicker = document.getElementById("artwork-picker");

const pages = {
  home: { title: "iPod", items: [["Music","music"],["Now Playing","now"],["Play Queue","queue"],["Extras","extras"],["Import Music","import"],["Settings","settings"]] },
  music: { title: "Music", items: [["Playlists","playlists"],["Music Finder","musicFinder"],["Recently Streamed","streamRecent"],["Artists","artists"],["Albums","albums"],["Cover Flow","coverFlow"],["Songs","songs"],["Genres","genres"],["Recently Added","recent"],["Search Library","searchLibrary"],["Sort Library","sortLibrary"],["Find Missing Album Info","bulkAlbums"],["Shuffle Songs","shufflePlay"]] },
  mp3pmSearchForm: { title: "MP3.pm Search", items: [] },
  musicFinder: { title: "Music Finder", items: [["DOWNLOAD · Internet Archive","iaSearch"],["STREAM · MP3.pm","mp3pmSearch"],["About Music Finder","iaAbout"],["Search tips","iaTips"]] },
  extras: { title: "Extras", items: [["Recently Added","recent"],["Recently Streamed","streamRecent"],["Search Library","searchLibrary"],["Sort Library","sortLibrary"],["Shuffle Songs","shufflePlay"],["About PocketPod","about"]] },
  recent: { title: "Recently Added", items: [] },
  sortLibrary: { title: "Sort Library", items: [["Song Title (A–Z)","sort:title"],["Artist (A–Z)","sort:artist"],["Album (A–Z)","sort:album"],["Recently Added (Newest)","sort:recent"]] },
  artists: { title: "Artists", items: [] }, albums: { title: "Albums", items: [] }, songs: { title: "Songs", items: [] }, genres: { title: "Genres", items: [] }, coverFlow: { title: "Cover Flow", items: [] },
  playlists: { title: "Playlists", items: [["+ Create Playlist","createPlaylist"],["No Playlists Yet","empty"]] },
  import: { title: "Import Music", items: [["Choose Music Files","pickFiles"],["Import a Music Folder","pickFolder"],["Import copies files into PocketPod","empty"],["Supported: MP3, M4A, AAC, WAV, FLAC","empty"]] },
  settings: { title: "Settings", items: [["Theme Studio","themeStudio"],["Appearance","appearance"],["Navigation: Touch + Wheel","navigationMode"],["Playback","playback"],["About PocketPod","about"]] },
  themeStudio: { title: "Theme Studio", items: [] },
  themePacks: { title: "Theme Packs", items: [] },
  appearance: { title: "Appearance", items: [] },
  playback: { title: "Playback", items: [[`Repeat: ${repeatMode=== "off"?"Off":repeatMode=== "one"?"One":"All"}`,"repeat"],[`Shuffle: ${shuffle?"On":"Off"}`,"shuffleSetting"],["Play Queue","queue"]] },
  about: { title: "About PocketPod", items: [["PocketPod V1.1.1","empty"],["Ad-free. Your music. Your device.","empty"],["Songs stored on this device","empty"],["Album lookup powered by MusicBrainz","empty"]] }
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("tracks")) database.createObjectStore("tracks", { keyPath: "id" });
      if (!database.objectStoreNames.contains("playlists")) database.createObjectStore("playlists", { keyPath: "id" });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onblocked = () => console.warn("PocketPod database upgrade is blocked. Close other PocketPod tabs and reload.");
    request.onerror = () => reject(request.error);
  });
}
function dbRequest(mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tracks", mode);
    const store = tx.objectStore("tracks");
    const req = action(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function storeRequest(storeName, mode, action) {
  return new Promise((resolve, reject) => {
    let result;
    let request;
    let tx;
    try {
      tx = db.transaction(storeName, mode);
      request = action(tx.objectStore(storeName));
    } catch (error) {
      reject(error);
      return;
    }
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error("Playlist storage request failed"));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("Playlist storage transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("Playlist storage transaction was aborted"));
  });
}
function loadLibrary() { return dbRequest("readonly", s => s.getAll()); }
function saveTrack(track) { return dbRequest("readwrite", s => s.put(track)); }
function deleteTrack(id) { return dbRequest("readwrite", s => s.delete(id)); }
function loadPlaylists() { return storeRequest("playlists", "readonly", s => s.getAll()); }
function savePlaylist(playlist) { return storeRequest("playlists", "readwrite", s => s.put(playlist)); }
function removePlaylist(id) { return storeRequest("playlists", "readwrite", s => s.delete(id)); }
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `pl-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function rebuildPlaylistPage() {
  pages.playlists.items = [["+ Create Playlist", "createPlaylist"]];
  if (!playlists.length) pages.playlists.items.push(["No Playlists Yet", "empty"]);
  else playlists.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(p => pages.playlists.items.push([p.name, `playlist:${p.id}`]));
}
function buildPlaylistDetail(id) {
  const playlist = playlists.find(p => p.id === id);
  if (!playlist) return;
  const tracks = (playlist.trackIds || []).map(trackId => library.find(t => t.id === trackId)).filter(Boolean);
  pages.playlistDetail = { playlistId: id, title: playlist.name, items: [
    ["▶ Play Playlist", `playPlaylist:${id}`],
    ["＋ Add Songs", `addSongs:${id}`],
    ["Rename Playlist", `renamePlaylist:${id}`],
    ["Delete Playlist", `deletePlaylist:${id}`],
    ...(tracks.length ? tracks.flatMap(t => [[t.title, `playlistPlayTrack:${id}:${encodeURIComponent(t.id)}`], [`− Remove ${t.title}`, `removePlaylistTrack:${id}:${encodeURIComponent(t.id)}`]]) : [["No songs in this playlist yet", "empty"]])
  ]};
}
function openPlaylistDetail(id) {
  buildPlaylistDetail(id);
  if (!pages.playlistDetail) return;
  stack.push("playlistDetail"); selected = 0; render();
}
function openAddSongs(id) {
  const playlist = playlists.find(p => p.id === id);
  if (!playlist) return;
  const available = library.filter(t => !(playlist.trackIds || []).includes(t.id));
  pages.addSongs = { title: "Add Songs", items: available.length ? available.map(t => [t.title, `addToPlaylist:${id}:${encodeURIComponent(t.id)}`]) : [["All library songs added", "empty"]] };
  stack.push("addSongs"); selected = 0; render();
}

function cleanName(value) { return value.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim(); }
function fallbackMetadata(file) {
  const base = cleanName(file.name);
  const parts = base.split(" - ");
  return { title: parts.length > 1 ? parts.slice(1).join(" - ") : base, artist: parts.length > 1 ? parts[0] : "Unknown Artist", album: "Unknown Album", releaseYear: "", genre: "Unknown Genre" };
}
function decodeSynchsafe(bytes, offset) { return (bytes[offset] << 21) | (bytes[offset+1] << 14) | (bytes[offset+2] << 7) | bytes[offset+3]; }
async function readMetadata(file) {
  const meta = fallbackMetadata(file);
  if (!file.name.toLowerCase().endsWith(".mp3")) return meta;
  let artBlob = null;
  try {
    const buffer = await file.slice(0, 512 * 1024).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (String.fromCharCode(...bytes.slice(0,3)) !== "ID3") return meta;
    const version = bytes[3];
    let offset = 10;
    const tagEnd = Math.min(bytes.length, 10 + decodeSynchsafe(bytes, 6));
    const map = { TIT2:"title", TPE1:"artist", TALB:"album", TCON:"genre", TDRC:"releaseYear", TYER:"releaseYear" };
    while (offset + 10 < tagEnd) {
      const id = String.fromCharCode(...bytes.slice(offset, offset+4));
      if (!id.trim()) break;
      const size = version >= 4 ? decodeSynchsafe(bytes, offset+4) : (bytes[offset+4]*16777216 + bytes[offset+5]*65536 + bytes[offset+6]*256 + bytes[offset+7]);
      if (!size || offset + 10 + size > tagEnd) break;
      if (id === "APIC" && !artBlob) {
        const frame = bytes.slice(offset+10, offset+10+size);
        try {
          const enc = frame[0]; let cursor = 1;
          while (cursor < frame.length && frame[cursor] !== 0) cursor++;
          const mime = new TextDecoder().decode(frame.slice(1,cursor)) || "image/jpeg";
          cursor += 2; // MIME terminator and picture type
          if (enc === 1 || enc === 2) { while (cursor + 1 < frame.length && !(frame[cursor] === 0 && frame[cursor+1] === 0)) cursor += 2; cursor += 2; }
          else { while (cursor < frame.length && frame[cursor] !== 0) cursor++; cursor++; }
          if (cursor < frame.length) artBlob = new Blob([frame.slice(cursor)], { type: mime });
        } catch {}
      }
      if (map[id]) {
        const frame = bytes.slice(offset+10, offset+10+size);
        const encoding = frame[0];
        let value = "";
        try {
          const data = frame.slice(1);
          value = encoding === 1 || encoding === 2 ? new TextDecoder(encoding === 2 ? "utf-16be" : "utf-16").decode(data) : new TextDecoder("iso-8859-1").decode(data);
        } catch {}
        value = value.replace(/\0/g, "").trim();
        if (value) meta[map[id]] = value;
      }
      offset += 10 + size;
    }
  } catch {}
  if (meta.releaseYear) meta.releaseYear = (String(meta.releaseYear).match(/\d{4}/) || [""])[0];
  if (artBlob) meta.artBlob = artBlob;
  return meta;
}
function trackId(file) { return `${file.name}::${file.size}::${file.lastModified}`; }
async function fingerprint(file) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  } catch { return ""; }
}
async function importFiles(fileList) {
  const files = [...fileList].filter(f => /\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(f.name));
  if (!files.length) { footerHint.textContent = "No supported audio files found"; return; }
  footerHint.textContent = `Importing ${files.length} file${files.length===1?"":"s"}…`;
  let added = 0;
  for (const file of files) {
    const id = trackId(file);
    if (library.some(t => t.id === id)) continue;
    footerHint.textContent = `Checking ${file.name}…`;
    const hash = await fingerprint(file);
    if (hash && library.some(t => t.fingerprint === hash)) continue;
    const meta = await readMetadata(file);
    await saveTrack({ id, ...meta, filename:file.name, type:file.type, size:file.size, lastModified:file.lastModified, blob:file, fingerprint:hash, addedAt:Date.now(), relativePath:file.webkitRelativePath || file.name });
    added++;
  }
  library = await loadLibrary();
  rebuildPages();
  footerHint.textContent = added ? `Added ${added} song${added===1?"":"s"}` : "Already in your library";
  render();
}
function getSortedLibrary() {
  const copy = library.slice();
  if (librarySort === "recent") return copy.sort((a,b)=>(b.addedAt||b.lastModified||0)-(a.addedAt||a.lastModified||0));
  const field = librarySort === "artist" ? "artist" : librarySort === "album" ? "album" : "title";
  return copy.sort((a,b)=>(a[field]||"").localeCompare(b[field]||"") || (a.title||"").localeCompare(b.title||""));
}
function openTrackDetail(id) {
  const track = library.find(t=>t.id===id); if (!track) return;
  pages.trackDetail = { title: track.title, trackId:id, items: [["▶ Play Song",`track:${id}`],["Play Next",`localNext:${id}`],["Add to Queue",`localQueue:${id}`],["Find Album Info Online",`lookupAlbum:${encodeURIComponent(id)}`],["Edit Song Details",`editTrack:${encodeURIComponent(id)}`],["Change Album Artwork",`changeArt:${encodeURIComponent(id)}`],["Remove from PocketPod",`removeTrack:${encodeURIComponent(id)}`]] };
  stack.push("trackDetail"); selected=0; render();
}
function rebuildPages() {
  const artistNames = [...new Set(library.map(t=>t.artist || "Unknown Artist"))].sort((a,b)=>a.localeCompare(b));
  const albumNames = [...new Set(library.filter(t=>(t.album||"Unknown Album")!=="Unknown Album").map(t=>t.album))].sort((a,b)=>a.localeCompare(b));
  const unknownArtists = [...new Set(library.filter(t=>!t.album||t.album==="Unknown Album").map(t=>t.artist||"Unknown Artist"))].sort((a,b)=>a.localeCompare(b));
  pages.artists.items = artistNames.length ? artistNames.map(name=>[name,`artist:${name}`]) : [["No Artists Yet","empty"]];
  pages.albums.items = [...albumNames.map(name=>[name,`album:${name}`]), ...unknownArtists.map(name=>[`Unknown Album — ${name}`,`unknownAlbum:${encodeURIComponent(name)}`])];
  if (!pages.albums.items.length) pages.albums.items=[["No Albums Yet","empty"]];
  pages.albums.items.unshift(["Open Cover Flow","coverFlow"]);
  const genreNames=[...new Set(library.map(t=>t.genre||"Unknown Genre"))].sort((a,b)=>a.localeCompare(b));
  pages.genres.items=genreNames.length?genreNames.map(name=>[name,`genre:${name}`]):[["No Genres Yet","empty"]];
  pages.coverFlow.items=albumNames.map(name=>[name,`album:${name}`]);
  if (!pages.coverFlow.items.length) pages.coverFlow.items=[["No identified albums yet","empty"]];
  const sorted = getSortedLibrary();
  pages.songs.items = sorted.length ? sorted.map(t=>[`${t.title} — ${t.artist || "Unknown Artist"}`,`trackDetail:${encodeURIComponent(t.id)}`]) : [["No Songs Yet","empty"],["Import music to get started","import"]];
  pages.recent.items = library.length ? library.slice().sort((a,b)=>(b.addedAt||b.lastModified||0)-(a.addedAt||a.lastModified||0)).map(t=>[`${t.title} — ${t.artist || "Unknown Artist"}`,`trackDetail:${encodeURIComponent(t.id)}`]) : [["No Recently Added Songs","empty"],["Import music to get started","import"]];
  pages.sortLibrary.items[0][0] = `${librarySort === "title" ? "✓ " : ""}Song Title (A–Z)`;
  pages.sortLibrary.items[1][0] = `${librarySort === "artist" ? "✓ " : ""}Artist (A–Z)`;
  pages.sortLibrary.items[2][0] = `${librarySort === "album" ? "✓ " : ""}Album (A–Z)`;
  pages.sortLibrary.items[3][0] = `${librarySort === "recent" ? "✓ " : ""}Recently Added (Newest)`;
  rebuildPlaylistPage();
}
function rebuildQueuePage(){
  const items=[];
  if(upNextQueue.length){ items.push(["— UP NEXT —","empty"]); upNextQueue.forEach((entry,i)=>{items.push([`${i===0?"▶ ":""}${entry.title||"Queued track"} · ${entry.kind==="local"?"PocketPod":"Stream"}`,`upNextTrack:${i}`]);items.push([`− Remove ${entry.title||"track"}`,`removeUpNext:${i}`]);}); }
  const ids = playbackQueue && playbackQueue.length ? playbackQueue : (currentRemoteTrack?[]:library.map(t=>t.id));
  const start = playbackQueue && playbackQueue.length ? queueIndex : Math.max(0, ids.indexOf(library[currentTrackIndex]?.id));
  if(ids.length){items.push(["— LIBRARY QUEUE —","empty"]);ids.forEach((id,i)=>{const t=library.find(x=>x.id===id);items.push([`${i===start&&!currentRemoteTrack?"▶ ":""}${t?.title || "Unavailable song"}`,`queueTrack:${encodeURIComponent(id)}`]);});}
  if(!items.length) items.push(["Queue is empty","empty"],["Play a song or add tracks to queue","empty"]);
  pages.queue = { title: "Play Queue", items };
}

const archiveItemCache = new Map();
let mp3PmSearchResults = [];
let activeMp3PmTrack = null;
let activeStreamQuery = localStorage.getItem("pp-stream-last-query") || "";
let recentlyStreamed = (() => { try { const v=JSON.parse(localStorage.getItem("pp-stream-history")||"[]"); return Array.isArray(v)?v:[]; } catch { return []; } })();
let upNextQueue = (() => { try { const v=JSON.parse(localStorage.getItem("pp-up-next")||"[]"); return Array.isArray(v)?v:[]; } catch { return []; } })();
let streamArtworkCache = (() => { try { return JSON.parse(localStorage.getItem("pp-stream-artwork")||"{}"); } catch { return {}; } })();
function persistStreamState(){
  try { localStorage.setItem("pp-stream-history",JSON.stringify(recentlyStreamed.slice(0,30))); } catch {}
  try { localStorage.setItem("pp-up-next",JSON.stringify(upNextQueue.slice(0,100))); } catch {}
  try { localStorage.setItem("pp-stream-artwork",JSON.stringify(streamArtworkCache)); } catch {}
}
function rememberStream(track){
  const entry={id:String(track.id||track.url),title:track.title||"Unknown Title",artist:track.artist||"MP3.pm",url:track.url,query:track.query||activeStreamQuery,artworkUrl:track.artworkUrl||"",playedAt:Date.now()};
  recentlyStreamed=[entry,...recentlyStreamed.filter(x=>x.id!==entry.id)].slice(0,30);
  persistStreamState(); rebuildStreamRecentPage();
}
function rebuildStreamRecentPage(){
  pages.streamRecent={title:"Recently Streamed",items:recentlyStreamed.length?recentlyStreamed.map((t,i)=>[`${t.title} — ${t.artist||"MP3.pm"}`,`streamRecent:${i}`]):[["No streamed songs yet","empty"],["Find music with MP3.pm","mp3pmSearch"]]};
}
function saveUpNext(){ try{localStorage.setItem("pp-up-next",JSON.stringify(upNextQueue.slice(0,100)));}catch{} }
function addToUpNext(track, placement="end"){
  const entry=track.kind?track:{kind:"remote",id:String(track.id||track.url),url:track.url,title:track.title,artist:track.artist||"MP3.pm",query:track.query||activeStreamQuery,artworkUrl:track.artworkUrl||""};
  if(placement==="next") upNextQueue.unshift(entry); else upNextQueue.push(entry);
  saveUpNext(); rebuildQueuePage();
  footerHint.textContent=placement==="next"?"Added to Play Next":"Added to queue";
}
function playUpNext(index=0){
  const entry=upNextQueue.splice(index,1)[0]; if(!entry)return;
  saveUpNext(); rebuildQueuePage();
  if(entry.kind==="local"){
    currentTrackIndex=library.findIndex(t=>t.id===entry.id);
    if(currentTrackIndex>=0){currentRemoteTrack=null;playCurrent();} else footerHint.textContent="Queued local song is no longer in your library";
  } else {
    const cached=recentlyStreamed.find(t=>t.id===entry.id);
    playMp3PmStreamUrl(entry.url,{...entry,artworkUrl:entry.artworkUrl||cached?.artworkUrl||""});
  }
}
function archiveText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return value == null ? "" : String(value);
}
function archiveLicense(url, rightsText = "") {
  const value = String(url || "").toLowerCase();
  const rights = String(rightsText || "").trim();
  if (/creativecommons\.org\/publicdomain\/zero\//.test(value)) return { label: "CC0 · Public Domain dedication", allowed: true, restricted: false };
  if (/creativecommons\.org\/publicdomain\/mark\//.test(value)) return { label: "Public Domain Mark", allowed: true, restricted: false };
  const match = value.match(/creativecommons\.org\/licenses\/(by-nc-nd|by-nc-sa|by-nc|by-nd|by-sa|by)\/(\d+(?:\.\d+)?)/);
  if (match) return { label: `CC ${match[1].toUpperCase()} ${match[2]}`, allowed: true, restricted: false };
  const restriction = /all rights reserved|©|copyright(?:ed)?|permission required|no unauthorized (?:use|distribution|copying)|access restricted|not for redistribution/i.test(rights);
  if (restriction) return { label: `Uploader restriction: ${rights.slice(0, 100)}`, allowed: false, restricted: true };
  if (url) return { label: "Rights statement supplied · review on Archive", allowed: false, restricted: false };
  if (rights) return { label: `Uploader rights note: ${rights.slice(0, 100)}`, allowed: false, restricted: false };
  return { label: "No rights statement found · verify on Archive", allowed: false, restricted: false };
}
function archiveAudioFile(file) {
  if (!file || file.private === "true" || file.private === true) return false;
  const name = String(file.name || "");
  const format = String(file.format || "").toLowerCase();
  return /\.(mp3|mp2|m4a|aac|flac|wav|wave|ogg|oga|opus)$/i.test(name) || /mp3|mpeg audio|flac|wave|wav|ogg vorbis|aac|apple lossless|opus/.test(format);
}
function archiveFileFormat(file) {
  const name = String(file.name || "");
  const ext = name.includes(".") ? name.split(".").pop().toUpperCase() : "AUDIO";
  const format = String(file.format || "");
  return format && format.length < 32 ? format : ext;
}
function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "Size unknown";
  const units = ["B", "KB", "MB", "GB"]; let n = size, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}
async function searchInternetArchive(query) {
  const cleaned = query.trim().replace(/[\\\"]+/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return;
  footerHint.textContent = "Searching Internet Archive…";
  const params = new URLSearchParams();
  const terms = cleaned.split(/\s+/).slice(0, 12).map(term => term.replace(/[^\p{L}\p{N}\-']/gu, "")).filter(Boolean);
  if (!terms.length) return;
  params.set("q", `mediatype:audio AND ${terms.map(term => `\"${term}\"`).join(" AND ")}`);
  ["identifier", "title", "creator", "year", "date", "licenseurl", "downloads"].forEach(field => params.append("fl[]", field));
  params.set("rows", "30"); params.set("page", "1"); params.set("output", "json");
  params.append("sort[]", "-downloads");
  try {
    const response = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`, { credentials: "omit" });
    if (!response.ok) throw new Error(`Archive search returned ${response.status}`);
    const data = await response.json();
    const docs = data?.response?.docs || [];
    pages.iaResults = { title: `Archive: ${cleaned}`, items: docs.length ? docs.map(item => {
      const title = archiveText(item.title) || item.identifier;
      const creator = archiveText(item.creator) || "Unknown creator";
      const year = archiveText(item.year);
      return [`${title} — ${creator}${year ? ` (${year})` : ""}`, `iaItem:${item.identifier}`];
    }) : [["No matching audio items found", "empty"], ["Try a shorter search phrase", "empty"]] };
    stack.push("iaResults"); selected = 0; render();
    footerHint.textContent = `${docs.length} Archive result${docs.length === 1 ? "" : "s"} · ${Number(data?.response?.numFound || 0).toLocaleString()} total matches`;
  } catch (error) {
    console.warn("Internet Archive search failed:", error);
    footerHint.textContent = "Archive search failed · check connection";
    pages.iaResults = { title: "Search unavailable", items: [["Internet Archive could not be reached", "empty"], ["Try again in a moment", "empty"]] };
    stack.push("iaResults"); selected = 0; render();
  }
}
async function openArchiveItem(identifier) {
  footerHint.textContent = "Loading Archive item details…";
  try {
    let item = archiveItemCache.get(identifier);
    if (!item) {
      const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { credentials: "omit" });
      if (!response.ok) throw new Error(`Metadata request returned ${response.status}`);
      item = await response.json();
      archiveItemCache.set(identifier, item);
    }
    const meta = item.metadata || {};
    const title = archiveText(meta.title) || identifier;
    const creator = archiveText(meta.creator) || "Creator not listed";
    const rightsText = archiveText(meta.rights);
    const license = archiveLicense(meta.licenseurl, rightsText);
    const files = (item.files || []).filter(archiveAudioFile).sort((a,b) => {
      const rank = f => /\.mp3$/i.test(f.name) ? 0 : /\.m4a$/i.test(f.name) ? 1 : /\.flac$/i.test(f.name) ? 2 : /\.wav$/i.test(f.name) ? 3 : 4;
      return rank(a)-rank(b) || Number(a.size||0)-Number(b.size||0);
    });
    const items = [
      [title, "empty"],
      [creator, "empty"],
      [`Year: ${archiveText(meta.year || meta.date) || "Not listed"}`, "empty"],
      [`Rights: ${license.label}`, "empty"],
      ["Open item page on Internet Archive", `iaOpenItem:${identifier}`],
      [files.length ? `Audio files (${files.length})` : "No recognized audio files", "empty"]
    ];
    files.slice(0, 18).forEach(file => {
      const fileLabel = `${archiveFileFormat(file)} · ${formatFileSize(file.size)} · ${file.name}`;
      const status = license.allowed ? "" : license.restricted ? " · restricted" : " · rights unverified";
      items.push([`${license.restricted ? "Restricted · " : "Import & Play · "}${fileLabel}${status}`, license.restricted ? "empty" : `iaDownload:${identifier}:${encodeURIComponent(file.name)}`]);
    });
    if (!license.allowed && !license.restricted) items.push(["Rights unclear · confirmation required before import", "empty"]);
    if (license.restricted) items.push(["Download not offered because the uploader lists restrictions", "empty"]);
    pages.iaItem = { title: "Archive Item", items };
    stack.push("iaItem"); selected = 0; render();
    footerHint.textContent = license.allowed ? "Uploader-declared license · check its conditions" : license.restricted ? "Uploader restriction listed · download not offered" : "Rights unverified · inspect the source before downloading";
  } catch (error) {
    console.warn("Internet Archive item lookup failed:", error);
    footerHint.textContent = "Could not load item details";
  }
}


async function importArchiveTrack(identifier, filename) {
  const item = archiveItemCache.get(identifier);
  const meta = item?.metadata || {};
  const license = archiveLicense(meta.licenseurl, archiveText(meta.rights));
  if (license.restricted) { footerHint.textContent = "Import unavailable · uploader restriction listed"; return; }
  if (!license.allowed && !window.confirm("Rights are unclear for this recording. PocketPod cannot verify permission. Only continue if you have checked the source and are comfortable proceeding. Import this file into PocketPod?")) return;
  footerHint.textContent = "Downloading audio into PocketPod…";
  try {
    const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`;
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) throw new Error(`Archive file request returned ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("The source returned an empty audio file");
    const mime = blob.type || (filename.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream");
    const file = new File([blob], filename, { type: mime, lastModified: Date.now() });
    await importFiles([file]);
    const id = trackId(file);
    const track = library.find(t => t.id === id);
    if (!track) throw new Error("PocketPod could not find the imported track");
    const archiveTitle = archiveText(meta.title);
    const archiveCreator = archiveText(meta.creator);
    if ((!track.title || track.title === cleanName(filename)) && archiveTitle) track.title = archiveTitle;
    if ((!track.artist || track.artist === "Unknown Artist") && archiveCreator) track.artist = archiveCreator;
    if (!track.album || track.album === "Unknown Album") track.album = archiveText(meta.album) || "Internet Archive";
    await saveTrack(track);
    library = await loadLibrary();
    rebuildPages();
    currentTrackIndex = library.findIndex(t => t.id === id);
    playbackQueue = null; queueIndex = -1;
    footerHint.textContent = "Imported · opening Now Playing…";
    playCurrent();
  } catch (error) {
    console.warn("PocketPod Archive import failed:", error);
    footerHint.textContent = "Direct import failed · this Archive file may block browser access. Open the item page instead.";
    pages.iaItem.items.unshift(["Direct import unavailable · open the Archive item page", `iaOpenItem:${identifier}`]);
    render();
  }
}

const MP3PM_WORKER_URL = "https://pocketpodlink.gybhqy.workers.dev/";
function normalizeMp3PmResponse(payload){
  if(payload?.source !== "mp3pm" || !Array.isArray(payload.items)) {
    throw new Error(payload?.error || "The MP3.pm search service returned an unexpected response");
  }
  return payload.items.map((item, index) => {
    let url;
    try { url = new URL(String(item.url || "")); } catch { return null; }
    const host = url.hostname.toLowerCase();
    if(url.protocol !== "https:" || !(host === "mp3.pm" || host.endsWith(".mp3.pm")) || !url.pathname.startsWith("/listen/")) return null;
    const title = String(item.title || "MP3.pm stream").replace(/\s+/g, " ").trim();
    let filename="";try{filename=decodeURIComponent(url.pathname.split("/").pop()||"").replace(/\.(mp3|m4a|aac|wav|flac)$/i,"");}catch{}
    const artistMatch=filename.match(/^(.+?)(?:_|\s)[-–—](?:_|\s)/);
    const artistFromFile=artistMatch?artistMatch[1].replace(/[_+]+/g," ").trim():"MP3.pm";
    return {
      id: String(item.id || index),
      url: url.href,
      title: title || "MP3.pm stream",
      artist: artistFromFile || "MP3.pm",
      album: "Streaming · not saved locally"
    };
  }).filter(Boolean);
}
async function searchMp3Pm(query){
  const cleanQuery = String(query || "").trim();
  if(!cleanQuery) return;
  activeStreamQuery=cleanQuery;
  try{localStorage.setItem("pp-stream-last-query",cleanQuery);}catch{}
  pages.mp3pmLoading = { title: "MP3.pm Search", items: [["Searching MP3.pm…", "empty"], ["Please wait", "empty"]] };
  stack.push("mp3pmLoading"); selected = 0; render();
  footerHint.textContent = "Searching MP3.pm…";
  try {
    const endpoint = new URL(MP3PM_WORKER_URL);
    endpoint.searchParams.set("q", cleanQuery);
    const response = await fetch(endpoint.href, { method: "GET", cache: "no-store", headers: { Accept: "application/json" } });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(`Search service returned invalid data (${response.status})`); }
    if(!response.ok) throw new Error(payload?.error || `Search service returned ${response.status}`);
    mp3PmSearchResults = normalizeMp3PmResponse(payload).slice(0, 40);
    if(!mp3PmSearchResults.length) throw new Error(payload?.error || "No playable results were returned. Try a different search.");
    mp3PmSearchResults=mp3PmSearchResults.map(track=>({...track,query:cleanQuery,artworkUrl:streamArtworkCache[`${track.title}|${track.artist}`.toLowerCase()]||""}));
    pages.mp3pmResults = {
      title: `MP3.pm · ${cleanQuery}`,
      items: mp3PmSearchResults.map((track, index) => [`${track.title} · MP3.pm`, `mp3pmTrack:${index}`])
    };
    stack.pop(); stack.push("mp3pmResults"); selected = 0; render();
    footerHint.textContent = `${mp3PmSearchResults.length} results · select a track to stream`;
    const resultQuery=cleanQuery;
    Promise.all(mp3PmSearchResults.slice(0,6).map(async track=>{track.artworkUrl=await lookupStreamArtwork(track);return track;})).then(()=>{
      if(stack[stack.length-1]==="mp3pmResults" && activeStreamQuery===resultQuery) render();
    });
  } catch(error) {
    console.warn("PocketPod MP3.pm search failed:", error);
    pages.mp3pmSearchError = { title: "Search Unavailable", items: [["Could not load MP3.pm results", "empty"], [String(error.message || "Check your connection and try again"), "empty"], ["Search MP3.pm again", "mp3pmSearch"]] };
    stack.pop(); stack.push("mp3pmSearchError"); selected = 2; render();
    footerHint.textContent = "MP3.pm search failed · try again";
  }
}
function openMp3PmSearch(){
  stack.push("mp3pmSearchForm"); selected=0; render();
  setTimeout(()=>{const input=document.getElementById("mp3pm-query");if(input){input.focus();input.value=activeStreamQuery;}},40);
}
function submitMp3PmSearch(value){
  const query=String(value||"").trim();if(!query)return;
  activeStreamQuery=query;localStorage.setItem("pp-stream-last-query",query);searchMp3Pm(query);
}
async function lookupStreamArtwork(track){
  if(!track)return "";
  const key=`${track.title||""}|${track.artist||""}`.toLowerCase();
  if(streamArtworkCache[key])return streamArtworkCache[key];
  try{
    const term=[track.title,track.artist].filter(Boolean).join(" ");
    const response=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8`,{cache:"force-cache"});
    if(!response.ok)return "";
    const data=await response.json();
    const results=data.results||[];
    const norm=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
    const exact=results.find(r=>norm(r.trackName)===norm(track.title)&&(!track.artist||norm(r.artistName).includes(norm(track.artist))||norm(track.artist).includes(norm(r.artistName))));
    const candidate=exact||results.find(r=>norm(r.trackName).includes(norm(track.title)));
    const artwork=String(candidate?.artworkUrl100||"").replace(/100x100bb\./,"600x600bb.");
    if(artwork){streamArtworkCache[key]=artwork;persistStreamState();return artwork;}
  }catch(error){console.debug("Streaming artwork lookup unavailable",error);}
  return "";
}
function playMp3PmStreamUrl(pastedValue, trackInfo){
  const pasted = pastedValue || prompt("Paste the direct MP3.pm audio stream URL (the cs1.mp3.pm/listen/... address):");
  if (!pasted || !pasted.trim()) return;
  let url;
  try { url = new URL(pasted.trim()); } catch { footerHint.textContent = "That does not look like a valid URL"; return; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "mp3.pm" || host.endsWith(".mp3.pm")) || !url.pathname.startsWith("/listen/")) {
    footerHint.textContent = "Clipboard does not contain an MP3.pm /listen/ stream URL · use Enter stream URL manually";
    return;
  }
  let streamName = url.pathname.split("/").pop() || "MP3.pm Stream";
  try { streamName = decodeURIComponent(streamName); } catch {}
  currentRemoteTrack = {
    id:String(trackInfo?.id||url.href), url:url.href,
    title: trackInfo?.title || streamName.replace(/\.(mp3|m4a|aac)$/i, "").replace(/[_+]/g, " "),
    artist: trackInfo?.artist || "MP3.pm",
    album: "Streaming · not saved locally", query:trackInfo?.query||activeStreamQuery,
    artworkUrl:trackInfo?.artworkUrl||""
  };
  currentTrackIndex = -1;
  if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
  audio.pause();
  audio.removeAttribute("crossorigin");
  audio.src = url.href;
  audio.load();
  progressFill.style.width = "0%"; elapsedEl.textContent = "0:00"; durationEl.textContent = "0:00";
  footerHint.textContent = "Connecting to MP3.pm stream…";
  audio.play().then(async () => { playing = true; rememberStream(currentRemoteTrack); showNowPlaying(); if(!currentRemoteTrack.artworkUrl){const art=await lookupStreamArtwork(currentRemoteTrack);if(art&&currentRemoteTrack){currentRemoteTrack.artworkUrl=art;const recent=recentlyStreamed.find(x=>x.id===currentRemoteTrack.id);if(recent){recent.artworkUrl=art;persistStreamState();}showNowPlaying();}} })
    .catch(error => { console.warn("Remote stream playback failed:", error); playing = false; showNowPlaying(); footerHint.textContent = "Stream could not start · check the URL and try again"; });
}

function currentPage(){ return pages[stack[stack.length-1]]; }
function rebuildThemePages() {
  pages.settings.items = [["Theme Studio","themeStudio"],["Appearance","appearance"],[`Navigation: ${navigationMode === "wheel" ? "Wheel Only" : "Touch + Wheel"}`,"navigationMode"],["Playback","playback"],["About PocketPod","about"]];
  pages.themeStudio.items = [[`Theme Pack: ${themePack}`,"themePacks"],["Customize Device & Colors","appearance"],["Preview Current Theme","themePreview"]];
  pages.themePacks.items = [
    [`${themePack === "Classic" ? "✓ " : ""}Classic — Original iPod`,"setTheme:Classic"],
    [`${themePack === "Modern" ? "✓ " : ""}Modern — Cover Flow`,"setTheme:Modern"],
    [`${themePack === "Aero" ? "✓ " : ""}Aero — Frutiger Aero`,"setTheme:Aero"]
  ];
  pages.appearance.items = [
    [`Body Finish: ${finish}`,"finish"],
    [`Click Wheel: ${wheelColor}`,"wheelcolor"],
    [`Accent Color: ${highlight}`,"highlight"]
  ];
  pages.themePreview = { title: "Theme Preview", items: [[`Theme Pack: ${themePack}`,"empty"],[`Device Finish: ${finish}`,"empty"],[`Click Wheel: ${wheelColor}`,"empty"],[`Accent Color: ${highlight}`,"empty"],["Changes are saved automatically","empty"]] };
}
function applyAppearance() {
  const root = document.documentElement;
  const ipod = document.querySelector(".ipod");
  root.dataset.theme = themePack.toLowerCase();
  root.dataset.finish = finish.toLowerCase();
  root.dataset.wheel = wheelColor.toLowerCase();
  root.dataset.navigation = navigationMode;
  ipod.style.filter = "";
  ipod.style.setProperty("--body-finish", finish === "Silver" ? "linear-gradient(145deg,#f0f1f2,#aeb3bb 60%,#e4e6e9)" : finish === "Red" ? "linear-gradient(145deg,#b8323b,#650e18 60%,#9f202a)" : finish === "Blue" ? "linear-gradient(145deg,#334b70,#101b30 60%,#263c5c)" : "linear-gradient(145deg,#292c31,#101114 60%,#24272c)");
  wheel.style.background = wheelColor === "Black" ? "radial-gradient(circle at 35% 25%,#666,#202226 65%,#08090a)" : wheelColor === "Red" ? "radial-gradient(circle at 35% 25%,#f3a0a4,#a92b35 65%,#68151d)" : wheelColor === "Blue" ? "radial-gradient(circle at 35% 25%,#a9c5ed,#466b9f 65%,#1b2e4b)" : "";
  const accents = {Blue:"#3478d4",Green:"#398c52",Red:"#b93d3d",Purple:"#7552b8",Orange:"#d0782d",Pink:"#c34d91"};
  root.style.setProperty("--blue", accents[highlight] || accents.Blue);
}
let coverFlowUrls=[];
function render(){
  const page = currentPage();
  titleEl.textContent = page.title;
  menuEl.classList.remove("hidden"); nowPlayingEl.classList.add("hidden"); menuEl.innerHTML = "";
  coverFlowUrls.forEach(url=>URL.revokeObjectURL(url)); coverFlowUrls=[];
  if (stack[stack.length-1] === "mp3pmSearchForm") {
    const panel=document.createElement("form");panel.className="stream-search-panel";panel.innerHTML=`<label for="mp3pm-query">Search for music</label><div class="stream-search-row"><input id="mp3pm-query" type="search" maxlength="120" autocomplete="off" placeholder="Song, artist, or album"><button type="submit" aria-label="Search">⌕</button></div><p class="stream-search-note">Search MP3.pm without leaving PocketPod.</p>`;
    panel.addEventListener("submit",e=>{e.preventDefault();submitMp3PmSearch(panel.querySelector("input").value);});
    menuEl.appendChild(panel);
    if(activeStreamQuery){const last=document.createElement("button");last.type="button";last.className="menu-row stream-last-search";last.textContent=`Search again: ${activeStreamQuery}`;last.addEventListener("click",()=>submitMp3PmSearch(activeStreamQuery));menuEl.appendChild(last);}
    if(recentlyStreamed.length){const recent=document.createElement("button");recent.type="button";recent.className="menu-row stream-last-search";recent.textContent="Recently Streamed ›";recent.addEventListener("click",()=>{rebuildStreamRecentPage();stack.push("streamRecent");selected=0;render();});menuEl.appendChild(recent);}
  } else if (stack[stack.length-1] === "mp3pmResults") {
    page.items.forEach(([label,action],i)=>{
      const row=document.createElement("div");row.className="menu-row stream-result-row"+(i===selected?" selected":"");
      const track=mp3PmSearchResults[i];if(track?.artworkUrl){const img=document.createElement("img");img.className="stream-result-art";img.src=track.artworkUrl;img.alt="";img.loading="lazy";row.appendChild(img);}
      const name=document.createElement("span");name.className="stream-result-title";const title=document.createElement("strong");title.textContent=track?.title||label;const artist=document.createElement("small");artist.textContent=track?.artist||"MP3.pm";name.append(title,artist);const chev=document.createElement("span");chev.className="chevron";chev.textContent="›";row.append(name,chev);
      row.addEventListener("click",()=>{if(navigationMode==="wheel")return;selected=i;render();activate();});menuEl.appendChild(row);
    });
  } else if (stack[stack.length-1] === "streamRecent") {
    page.items.forEach(([label,action],i)=>{const row=document.createElement("div");row.className="menu-row"+(i===selected?" selected":"");const name=document.createElement("span");name.textContent=label;const chev=document.createElement("span");chev.className="chevron";chev.textContent=action==="empty"?"":"›";row.append(name,chev);row.addEventListener("click",()=>{if(navigationMode==="wheel")return;selected=i;render();activate();});menuEl.appendChild(row);});
  } else if (stack[stack.length-1] === "coverFlow") {
    const stage=document.createElement("div"); stage.className="coverflow-stage";
    const item=page.items[selected];
    page.items.forEach(([label,action],i)=>{
      const card=document.createElement("button"); card.type="button"; card.className="coverflow-card"+(i===selected?" selected":i===selected-1?" left":i===selected+1?" right":" far");
      const art=document.createElement("div"); art.className="coverflow-art";
      const albumName=label;
      const tracks=library.filter(t=>t.album===albumName);
      const artTrack=tracks.find(t=>t.artBlob);
      if(artTrack){const img=document.createElement("img");const url=URL.createObjectURL(artTrack.artBlob);coverFlowUrls.push(url);img.src=url;img.alt=albumName;art.appendChild(img);}else{const glyph=document.createElement("span");glyph.textContent="♫";art.appendChild(glyph);}
      const caption=document.createElement("span");caption.className="coverflow-caption";caption.textContent=label;card.append(art,caption);card.addEventListener("click",()=>{if(navigationMode === "wheel")return;selected=i;render();activate();});stage.appendChild(card);
    });
    if(item){const hint=document.createElement("div");hint.className="coverflow-hint";hint.textContent=`${selected+1} / ${page.items.length} · Select album`;stage.appendChild(hint);}
    menuEl.appendChild(stage);
  } else {
    if (themePack === "Modern" && stack[stack.length-1] === "albums") {
      const groups = [...new Map(library.filter(t => t.album && t.album !== "Unknown Album").map(t => [t.album, t])).entries()];
      if (groups.length) {
        const flow=document.createElement("div"); flow.className="cover-flow"; flow.setAttribute("aria-label","Album Cover Flow");
        groups.forEach(([album,track])=>{ const card=document.createElement("button"); card.type="button"; card.className="cover-card"; const art=document.createElement("span"); art.className="cover-card-art"; if(track.artBlob){const img=document.createElement("img");const url=URL.createObjectURL(track.artBlob);coverFlowUrls.push(url);img.src=url;img.alt=album;art.appendChild(img);}else{art.textContent="♪";} const name=document.createElement("strong");name.textContent=album;const artist=document.createElement("small");artist.textContent=track.artist||"Unknown Artist";card.append(art,name,artist);card.addEventListener("click",()=>{if(navigationMode === "wheel")return;const matches=library.filter(t=>t.album===album);pages.collection={title:album,items:matches.map(t=>[t.title,`trackDetail:${encodeURIComponent(t.id)}`])};stack.push("collection");selected=0;render();});flow.appendChild(card); }); menuEl.appendChild(flow);
      }
    }
    page.items.forEach(([label, action], i) => {
    const row = document.createElement("div");
    row.className = "menu-row" + (i === selected ? " selected" : "");
    const name = document.createElement("span"); name.textContent = label;
    const chevron = document.createElement("span"); chevron.className = "chevron"; chevron.textContent = action === "empty" ? "" : "›";
    row.append(name, chevron);
    row.addEventListener("click", () => { if(navigationMode === "wheel") return; selected = i; render(); activate(); });
    menuEl.appendChild(row);
    });
  }
  footerHint.textContent = library.length ? `${library.length} song${library.length===1?"":"s"} in library` : "Select to open";
  applyAppearance();
  keepSelectedRowVisible();
}
function back(){ if(stack.length>1){ const leaving=stack.pop(); if(leaving==="addSongs" && stack[stack.length-1]==="playlistDetail" && pages.playlistDetail) buildPlaylistDetail(pages.playlistDetail.playlistId); selected=0; render(); } else { selected=0; render(); } }
function activate(){
  const item = currentPage().items[selected]; if(!item) return;
  const action = item[1];
  if(action === "now"){ showNowPlaying(); return; }
  if(action === "iaSearch"){
    const query = prompt("Search Internet Archive audio by song, artist, album, or keyword:");
    if (query && query.trim()) searchInternetArchive(query);
    return;
  }
  if(action === "mp3pmSearch"){
    openMp3PmSearch();
    return;
  }
  if(action.startsWith("mp3pmTrack:")){
    const track=mp3PmSearchResults[Number(action.slice(11))];if(!track)return;
    pages.mp3pmTrackDetail={title:"Stream Details",items:[["▶ Play Now","streamPlayNow"],["▶ Play Next","streamPlayNext"],["＋ Add to Queue","streamAddQueue"],[`Title: ${track.title}`,"empty"],[`Source: MP3.pm`,"empty"],["Not saved to local library","empty"]]};
    activeMp3PmTrack=track;stack.push("mp3pmTrackDetail");selected=0;render();return;
  }
  if(action==="streamPlayNow"){if(activeMp3PmTrack)playMp3PmStreamUrl(activeMp3PmTrack.url,activeMp3PmTrack);return;}
  if(action==="streamPlayNext"){if(activeMp3PmTrack){addToUpNext(activeMp3PmTrack,"next");back();footerHint.textContent="Added to Play Next";}return;}
  if(action==="streamAddQueue"){if(activeMp3PmTrack){addToUpNext(activeMp3PmTrack,"end");back();footerHint.textContent="Added to queue";}return;}
  if(action.startsWith("streamRecent:")){const entry=recentlyStreamed[Number(action.slice(13))];if(entry){activeStreamQuery=entry.query||entry.title;searchMp3Pm(activeStreamQuery);}return;}
  if(action.startsWith("upNextTrack:")){playUpNext(Number(action.slice(12)));return;}
  if(action.startsWith("removeUpNext:")){upNextQueue.splice(Number(action.slice(13)),1);saveUpNext();rebuildQueuePage();render();footerHint.textContent="Removed from Up Next";return;}
  if(action.startsWith("localNext:")){const id=action.slice(10);const t=library.find(x=>x.id===id);if(t)addToUpNext({kind:"local",id,title:t.title,artist:t.artist},"next");return;}
  if(action.startsWith("localQueue:")){const id=action.slice(11);const t=library.find(x=>x.id===id);if(t)addToUpNext({kind:"local",id,title:t.title,artist:t.artist},"end");return;}
  if(action === "iaAbout"){
    pages.iaInfo = { title: "About Music Finder", items: [["DOWNLOAD · Internet Archive", "empty"], ["Inspect and import audio into your local library", "empty"], ["Review uploader-supplied rights information", "empty"], ["STREAM · MP3.pm", "empty"], ["Search results load right inside PocketPod", "empty"], ["Choose Play Now, Play Next, or Add to Queue", "empty"], ["Recently Streamed remembers your listening history", "empty"], ["Album artwork is looked up automatically when available", "empty"], ["Remote streams are not saved to your library", "empty"]] };
    stack.push("iaInfo"); selected=0; render(); return;
  }
  if(action === "iaTips"){
    pages.iaTips = { title: "Search Tips", items: [["Try song title + artist", "empty"], ["Try artist name alone", "empty"], ["Try album or recording title", "empty"], ["Live recordings and collections may appear", "empty"], ["Check the item page and rights before use", "empty"]] };
    stack.push("iaTips"); selected=0; render(); return;
  }
  if(action.startsWith("iaItem:")){ openArchiveItem(action.slice(7)); return; }
  if(action.startsWith("iaOpenItem:")){ window.open(`https://archive.org/details/${encodeURIComponent(action.slice(11))}`, "_blank", "noopener"); return; }
  if(action.startsWith("iaDownload:")){
    const parts=action.split(":"); const identifier=parts[1]; const filename=decodeURIComponent(parts.slice(2).join(":"));
    importArchiveTrack(identifier, filename);
    return;
  }
  if(action === "navigationMode"){
    navigationMode = navigationMode === "wheel" ? "both" : "wheel";
    localStorage.setItem("pp-navigation-mode", navigationMode);
    rebuildThemePages(); applyAppearance(); render();
    footerHint.textContent = navigationMode === "wheel" ? "Wheel Only navigation enabled" : "Touch + Wheel navigation enabled";
    return;
  }
  if(action.startsWith("setTheme:")){
    themePack = action.slice(9); localStorage.setItem("pp-theme-pack",themePack); rebuildThemePages(); render(); footerHint.textContent = `${themePack} theme applied`; return;
  }
  if(action === "themePreview"){ stack.push("themePreview"); selected=0; render(); return; }
  if(action === "searchLibrary"){
    const query = prompt("Search songs, artists, and albums:");
    if (query && query.trim()) {
      const q=query.trim().toLocaleLowerCase();
      const matches=getSortedLibrary().filter(t=>[t.title,t.artist,t.album,t.genre,t.filename].some(v=>(v||"").toLocaleLowerCase().includes(q)));
      pages.searchResults={title:`Search: ${query.trim()}`,items:matches.length?matches.map(t=>[`${t.title} — ${t.artist||"Unknown Artist"}`,`trackDetail:${encodeURIComponent(t.id)}`]):[["No matches found","empty"]]};
      stack.push("searchResults"); selected=0; render();
    }
    return;
  }
  if(action.startsWith("sort:")){
    librarySort=action.slice(5); localStorage.setItem("pp-library-sort",librarySort); rebuildPages(); render(); footerHint.textContent="Library sort updated"; return;
  }
  if(action.startsWith("editTrack:")){
    const id=decodeURIComponent(action.slice(10)); const t=library.find(x=>x.id===id); if(!t)return;
    const title=prompt("Song title:",t.title||""); if(title===null)return;
    const artist=prompt("Artist:",t.artist||""); if(artist===null)return;
    const album=prompt("Album:",t.album||""); if(album===null)return;
    const year=prompt("Original release year (optional):",t.releaseYear||""); if(year===null)return;
    const genre=prompt("Genre:",t.genre||"Unknown Genre"); if(genre===null)return;
    t.title=title.trim()||t.title; t.artist=artist.trim()||"Unknown Artist"; t.album=album.trim()||"Unknown Album";
    const yearMatch=year.trim().match(/^(\d{4})(?:[-/].*)?$/);
    t.releaseYear=yearMatch?yearMatch[1]:""; t.genre=genre.trim()||"Unknown Genre";
    // Opening Edit Song Details is an explicit manual metadata decision; keep these values safe from later lookups.
    t.manualFields=[...new Set([...(t.manualFields||[]),"title","artist","album","releaseYear","genre"])];
    saveTrack(t).then(async()=>{
      library=await loadLibrary();rebuildPages();
      pages.trackDetail={title:t.title,trackId:id,items:[["▶ Play Song",`track:${id}`],["Play Next",`localNext:${id}`],["Add to Queue",`localQueue:${id}`],["Find Album Info Online",`lookupAlbum:${encodeURIComponent(id)}`],["Edit Song Details",`editTrack:${encodeURIComponent(id)}`],["Change Album Artwork",`changeArt:${encodeURIComponent(id)}`],["Remove from PocketPod",`removeTrack:${encodeURIComponent(id)}`]]};
      render();footerHint.textContent="Song details saved · manual edits protected";
      if(confirm("Song details saved. Would you like to choose album artwork now?")){artworkTargetId=id;artworkPicker.click();}
    }).catch(err=>{console.error(err);footerHint.textContent="Could not save song details";}); return;
  }
  if(action.startsWith("changeArt:")){
    artworkTargetId=decodeURIComponent(action.slice(10)); artworkPicker.click(); return;
  }
  if(action.startsWith("removeTrack:")){
    const id=decodeURIComponent(action.slice(12)); const t=library.find(x=>x.id===id); if(!t)return;
    if(confirm(`Remove "${t.title}" from PocketPod? The original file will not be deleted.`)){
      if(library[currentTrackIndex]?.id===id){audio.pause();playing=false;currentTrackIndex=-1;playbackQueue=null;queueIndex=-1;}
      deleteTrack(id).then(async()=>{for(const pl of playlists){pl.trackIds=(pl.trackIds||[]).filter(x=>x!==id);await savePlaylist(pl);}library=await loadLibrary();playlists=await loadPlaylists();rebuildPages();back();footerHint.textContent="Removed from PocketPod";});
    } return;
  }
  if(action.startsWith("lookupAlbum:")){
    const id=decodeURIComponent(action.slice(12)); const track=library.find(t=>t.id===id); if(!track)return;
    if(!track.title || !track.artist || track.artist==="Unknown Artist"){footerHint.textContent="Need a title and artist to search";return;}
    footerHint.textContent="Searching MusicBrainz…";
    (async()=>{try{
      const query=`recording:"${track.title.replace(/["\\]/g," ")}" AND artist:"${track.artist.replace(/["\\]/g," ")}"`;
      const response=await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=10&inc=releases`,{headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error("MusicBrainz lookup unavailable");
      const data=await response.json();
      const byId=new Map();
      for(const recording of (data.recordings||[])) for(const rel of (recording.releases||[])){
        if(!rel.id||!rel.title)continue;
        const group=rel["release-group"]||{}; const secondary=group["secondary-types"]||[];
        const candidate={title:rel.title,artist:(rel["artist-credit"]||[]).map(a=>a.name||a.artist?.name||"").join(""),id:rel.id,date:rel.date||"",status:rel.status||"",primaryType:group["primary-type"]||"",secondaryTypes:secondary,score:recording.score||0};
        const previous=byId.get(candidate.id); if(!previous||candidate.score>previous.score)byId.set(candidate.id,candidate);
      }
      const candidates=[...byId.values()];
      if(!candidates.length){footerHint.textContent="No album match found";return;}
      const dateValue=c=>/^\d{4}/.test(c.date)?Number(c.date.slice(0,4)):9999;
      candidates.sort((a,b)=>{
        const aCompilation=a.secondaryTypes.some(x=>/compilation/i.test(x)); const bCompilation=b.secondaryTypes.some(x=>/compilation/i.test(x));
        const aAlbum=a.primaryType==="Album"?0:1; const bAlbum=b.primaryType==="Album"?0:1;
        return Number(aCompilation)-Number(bCompilation) || aAlbum-bAlbum || (a.status==="Official"?0:1)-(b.status==="Official"?0:1) || dateValue(a)-dateValue(b) || b.score-a.score;
      });
      const choices=candidates.slice(0,8);
      const choiceText=choices.map((c,i)=>`${i+1}. ${c.title}${c.date?` (${c.date})`:""}${c.secondaryTypes.some(x=>/compilation/i.test(x))?" · Compilation":""}${c.artist?` — ${c.artist}`:""}`).join("\n");
      const answer=prompt(`Choose the matching album for ${track.title} by ${track.artist}:\n\n${choiceText}\n\nEnter a number, or Cancel to leave unchanged.` ,"1");
      if(answer===null){footerHint.textContent="Album lookup cancelled";return;}
      const choiceIndex=Number(answer)-1;if(!Number.isInteger(choiceIndex)||choiceIndex<0||choiceIndex>=choices.length){footerHint.textContent="No album changes made";return;}
      const best=choices[choiceIndex];
      if(!(track.manualFields||[]).includes("album"))track.album=best.title;
      if(best.date && !(track.manualFields||[]).includes("releaseYear"))track.releaseYear=best.date.slice(0,4);
      track.albumMusicBrainzId=best.id;
      if(!track.artworkManuallySet){
        try{const artResponse=await fetch(`https://coverartarchive.org/release/${best.id}/front-250`);if(artResponse.ok){const blob=await artResponse.blob();if(blob.type.startsWith("image/"))track.artBlob=blob;}}catch{}
      }
      await saveTrack(track);library=await loadLibrary();rebuildPages();render();footerHint.textContent=track.artBlob?`Album info saved${track.artworkManuallySet?" · custom artwork kept":" · artwork available"}`:"Album info saved · no cover art found";
    }catch(error){console.warn(error);footerHint.textContent="Lookup failed · check connection and try again";}})();return;
  }
  if(action==="bulkAlbums"){
    const unknown=library.filter(t=>!t.album||t.album==="Unknown Album");
    if(!unknown.length){footerHint.textContent="No missing album names found";return;}
    const artists=[...new Set(unknown.map(t=>t.artist||"Unknown Artist"))];
    const artist=prompt(`Assign an album to which artist?\n\n${artists.join("\n")}`);if(!artist)return;
    const matches=unknown.filter(t=>(t.artist||"Unknown Artist").toLocaleLowerCase()===artist.trim().toLocaleLowerCase());
    if(!matches.length){footerHint.textContent="No matching artist found";return;}
    const album=prompt(`Album name for ${matches.length} track(s) by ${artist}:`);if(!album||!album.trim())return;
    (async()=>{for(const track of matches){track.album=album.trim();await saveTrack(track);}library=await loadLibrary();rebuildPages();render();footerHint.textContent=`Updated ${matches.length} tracks`})().catch(e=>{console.error(e);footerHint.textContent="Could not save album changes"});return;
  }
  if(action.startsWith("unknownAlbum:")){
    const artist=decodeURIComponent(action.slice(13));const matches=library.filter(t=>(!t.album||t.album==="Unknown Album")&&(t.artist||"Unknown Artist")===artist);
    pages.collection={title:`Unknown Album — ${artist}`,items:matches.map(t=>[t.title,`trackDetail:${encodeURIComponent(t.id)}`])};stack.push("collection");selected=0;render();return;
  }
  if(action === "queue"){ rebuildQueuePage(); stack.push("queue"); selected=0; render(); return; }
  if(action.startsWith("queueTrack:")){ const id=decodeURIComponent(action.slice(11)); currentTrackIndex=library.findIndex(t=>t.id===id); if(currentTrackIndex>=0){playbackQueue=null;queueIndex=-1;playCurrent();} return; }
  if(action === "createPlaylist"){
    const name = prompt("Name your playlist:");
    if (name && name.trim()) {
      const playlist = { id: makeId(), name: name.trim(), trackIds: [], createdAt: Date.now() };
      savePlaylist(playlist).then(async()=>{
        playlists = await loadPlaylists();
        rebuildPlaylistPage();
        selected = pages.playlists.items.findIndex(item => item[1] === `playlist:${playlist.id}`);
        render();
        footerHint.textContent = `Created playlist: ${playlist.name}`;
      }).catch(error => {
        console.error("PocketPod could not create playlist:", error);
        footerHint.textContent = `Couldn't create playlist: ${error.message || "storage error"}`;
      });
    }
    return;
  }
  if(action.startsWith("playlist:")){ openPlaylistDetail(action.slice(9)); return; }
  if(action.startsWith("addSongs:")){ openAddSongs(action.slice(9)); return; }
  if(action.startsWith("addToPlaylist:")){
    const parts = action.split(":"); const playlistId = parts[1]; const trackId = decodeURIComponent(parts.slice(2).join(":"));
    const playlist = playlists.find(p=>p.id===playlistId);
    if (playlist && !playlist.trackIds.includes(trackId)) { playlist.trackIds.push(trackId); savePlaylist(playlist).then(async()=>{playlists=await loadPlaylists();const updated=playlists.find(p=>p.id===playlistId);const available=library.filter(t=>!(updated.trackIds||[]).includes(t.id));pages.addSongs={title:"Add Songs",items:available.length?available.map(t=>[t.title,`addToPlaylist:${playlistId}:${encodeURIComponent(t.id)}`]):[["All library songs added","empty"]]};selected=0;render();footerHint.textContent="Song added to playlist";}); }
    return;
  }
  if(action.startsWith("removePlaylistTrack:")){
    const parts = action.split(":"); const playlistId=parts[1]; const trackId=decodeURIComponent(parts.slice(2).join(":"));
    const playlist=playlists.find(p=>p.id===playlistId);
    if(playlist && confirm("Remove this song from the playlist? The original music stays in your library.")){playlist.trackIds=playlist.trackIds.filter(id=>id!==trackId);savePlaylist(playlist).then(async()=>{playlists=await loadPlaylists();stack.pop();openPlaylistDetail(playlistId);footerHint.textContent="Song removed";});}
    return;
  }
  if(action.startsWith("renamePlaylist:")){
    const id=action.slice(15); const playlist=playlists.find(p=>p.id===id); if(!playlist)return;
    const name=prompt("Rename playlist:",playlist.name);
    if(name && name.trim()){playlist.name=name.trim();savePlaylist(playlist).then(async()=>{playlists=await loadPlaylists();stack.pop();openPlaylistDetail(id);footerHint.textContent="Playlist renamed";});}
    return;
  }
  if(action.startsWith("deletePlaylist:")){
    const id=action.slice(15); const playlist=playlists.find(p=>p.id===id); if(!playlist)return;
    if(confirm(`Delete playlist "${playlist.name}"? Your music files will not be deleted.`)){removePlaylist(id).then(async()=>{playlists=await loadPlaylists();stack.pop();rebuildPlaylistPage();selected=0;render();footerHint.textContent="Playlist deleted";});}
    return;
  }
  if(action.startsWith("playPlaylist:")){
    const id=action.slice(13); const playlist=playlists.find(p=>p.id===id); if(!playlist)return;
    playbackQueue=(playlist.trackIds||[]).filter(trackId=>library.some(t=>t.id===trackId));
    if(!playbackQueue.length){footerHint.textContent="This playlist is empty";return;}
    queueIndex=0;currentTrackIndex=library.findIndex(t=>t.id===playbackQueue[0]);playCurrent();return;
  }
  if(action.startsWith("playlistPlayTrack:")){
    const parts=action.split(":");const id=parts[1];const trackId=decodeURIComponent(parts.slice(2).join(":"));const playlist=playlists.find(p=>p.id===id);if(!playlist)return;
    playbackQueue=(playlist.trackIds||[]).filter(trackId=>library.some(t=>t.id===trackId));queueIndex=playbackQueue.indexOf(trackId);currentTrackIndex=library.findIndex(t=>t.id===trackId);if(currentTrackIndex>=0)playCurrent();return;
  }
  if(action === "pickFiles"){ filePicker.click(); return; }
  if(action === "pickFolder"){ folderPicker.click(); return; }
  if(action === "shufflePlay"){ if(library.length){ const ids=library.map(t=>t.id); for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];} playbackQueue=ids;queueIndex=0;currentTrackIndex=library.findIndex(t=>t.id===playbackQueue[0]);playCurrent(); } return; }
  if(action.startsWith("trackDetail:")){ openTrackDetail(decodeURIComponent(action.slice(12))); return; }
  if(action.startsWith("track:")){ const id=action.slice(6); playbackQueue=library.slice().sort((a,b)=>a.title.localeCompare(b.title)).map(t=>t.id);queueIndex=playbackQueue.indexOf(id);currentTrackIndex=library.findIndex(t=>t.id===id); playCurrent(); return; }
  if(action.startsWith("artist:") || action.startsWith("album:") || action.startsWith("genre:")){
    const [kind,...rest]=action.split(":"); const value=rest.join(":");
    const matches=library.filter(t=>(t[kind]|| (kind==="genre"?"Unknown Genre":""))===value);
    pages.collection={title:value,items:matches.map(t=>[t.title,`trackDetail:${encodeURIComponent(t.id)}`])}; stack.push("collection"); selected=0; render(); return;
  }
  if(action==="finish"){ const options=["Black","Silver","Red","Blue"]; finish=options[(options.indexOf(finish)+1)%options.length]; localStorage.setItem("pp-finish",finish); rebuildThemePages(); }
  else if(action==="highlight"){ const options=["Blue","Green","Red","Purple","Orange","Pink"]; highlight=options[(options.indexOf(highlight)+1)%options.length]; localStorage.setItem("pp-highlight",highlight); rebuildThemePages(); }
  else if(action==="wheelcolor"){ const options=["Silver","Black","Red","Blue"]; wheelColor=options[(options.indexOf(wheelColor)+1)%options.length]; localStorage.setItem("pp-wheel",wheelColor); rebuildThemePages(); }
  else if(action==="repeat"){ repeatMode=repeatMode==="off"?"all":repeatMode==="all"?"one":"off"; pages.playback.items[0][0]=`Repeat: ${repeatMode==="off"?"Off":repeatMode==="one"?"One":"All"}`; }
  else if(action==="shuffleSetting"){ shuffle=!shuffle; pages.playback.items[1][0]=`Shuffle: ${shuffle?"On":"Off"}`; }
  else if(pages[action]){ stack.push(action); selected=0; }
  render();
}
function formatTime(seconds){ if(!Number.isFinite(seconds)) return "0:00"; return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,"0")}`; }
function updateMediaSession(track){
  if (!("mediaSession" in navigator) || !track) return;
  try {
    const artSrc = currentRemoteTrack?.artworkUrl || currentArtUrl;
    const artwork = artSrc ? [{ src: artSrc, sizes: "512x512", type: track.artBlob?.type || "image/jpeg" }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Unknown Title", artist: track.artist || "Unknown Artist",
      album: track.album || "", artwork
    });
    navigator.mediaSession.setActionHandler("play", () => togglePlayback());
    navigator.mediaSession.setActionHandler("pause", () => togglePlayback());
    navigator.mediaSession.setActionHandler("previoustrack", () => previousTrack());
    navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
    navigator.mediaSession.setActionHandler("seekbackward", details => { if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10)); });
    navigator.mediaSession.setActionHandler("seekforward", details => { if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + (details.seekOffset || 10)); });
    navigator.mediaSession.setActionHandler("seekto", details => { if (audio.duration && Number.isFinite(details.seekTime)) audio.currentTime = Math.max(0, Math.min(audio.duration, details.seekTime)); });
  } catch (err) { console.debug("Media Session metadata unavailable", err); }
}
function updateMediaPosition(){
  if (!("mediaSession" in navigator) || !Number.isFinite(audio.duration) || !audio.duration || !navigator.mediaSession.setPositionState) return;
  try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch (_) {}
}
function showNowPlaying(){
  menuEl.classList.add("hidden"); nowPlayingEl.classList.remove("hidden"); titleEl.textContent="Now Playing";
  const track=currentRemoteTrack || library[currentTrackIndex];
  trackNameEl.textContent=track?track.title:"Nothing Playing";
  trackArtistEl.textContent=currentRemoteTrack?`${track.artist || "MP3.pm"} · MP3.pm · not saved locally`:track?`${track.artist} · ${track.album}${track.releaseYear?` (${track.releaseYear})`:""}`:"Import music to get started";
  const streamBadge=document.getElementById("stream-badge");if(streamBadge)streamBadge.classList.toggle("hidden",!currentRemoteTrack);
  albumArt.innerHTML = "";
  if (currentArtUrl) { URL.revokeObjectURL(currentArtUrl); currentArtUrl=null; }
  if (track?.artBlob) { const img=document.createElement("img"); img.alt=`Artwork for ${track.title}`; currentArtUrl=URL.createObjectURL(track.artBlob); img.src=currentArtUrl; albumArt.appendChild(img); }
  else if(currentRemoteTrack?.artworkUrl){const img=document.createElement("img");img.alt=`Artwork for ${track.title}`;img.src=currentRemoteTrack.artworkUrl;img.loading="eager";img.referrerPolicy="no-referrer";albumArt.appendChild(img);}
  else { const fallback=document.createElement("span"); fallback.textContent="♪"; albumArt.appendChild(fallback); }
  if (track) updateMediaSession(track);
  document.getElementById("np-shuffle").textContent=`Shuffle: ${shuffle?"On":"Off"}`;
  document.getElementById("np-repeat").textContent=`Repeat: ${repeatMode=== "off"?"Off":repeatMode=== "one"?"One":"All"}`;
  footerHint.textContent=playing?(currentRemoteTrack?"Streaming · MP3.pm":"Playing"):"Not Playing";
}
function playCurrent(){
  const track=library[currentTrackIndex]; if(!track) return;
  currentRemoteTrack = null;
  if(currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl=URL.createObjectURL(track.blob); audio.src=currentObjectUrl;
  progressFill.style.width="0%"; elapsedEl.textContent="0:00"; durationEl.textContent="0:00";
  audio.play().then(()=>{playing=true;showNowPlaying();}).catch(()=>{playing=false;showNowPlaying();footerHint.textContent="Tap Play to start";});
}
function togglePlayback(){
  if(!currentRemoteTrack && !library.length){ footerHint.textContent="Import music first or open a stream"; return; }
  if(currentTrackIndex<0 && !currentRemoteTrack){currentTrackIndex=0;playCurrent();return;}
  if(audio.paused){audio.play().then(()=>{playing=true;footerHint.textContent="Playing";}).catch(()=>{});} else {audio.pause();playing=false;footerHint.textContent="Paused";}
}
function nextTrack(){
  if(upNextQueue.length){playUpNext(0);return;}
  if(currentRemoteTrack){
    if(playbackQueue&&playbackQueue.length){currentRemoteTrack=null;nextTrack();return;}
    audio.pause();playing=false;footerHint.textContent="Stream finished · queue is empty";return;
  }
  if(!library.length)return;
  if(playbackQueue && playbackQueue.length){
    if(queueIndex < playbackQueue.length-1) queueIndex++;
    else if(repeatMode === "all") queueIndex=0;
    else { playbackQueue=null;queueIndex=-1;audio.pause();audio.currentTime=0;playing=false;footerHint.textContent="Playlist finished";return; }
    currentTrackIndex=library.findIndex(t=>t.id===playbackQueue[queueIndex]);
  } else if(shuffle && library.length>1){let next=currentTrackIndex;while(next===currentTrackIndex)next=Math.floor(Math.random()*library.length);currentTrackIndex=next;}
  else currentTrackIndex=(currentTrackIndex+1)%library.length;
  playCurrent();
}
function previousTrack(){
  if(currentRemoteTrack){if(audio.currentTime>3){audio.currentTime=0;return;}const previous=recentlyStreamed.find(t=>t.id!==currentRemoteTrack.id);if(previous){playMp3PmStreamUrl(previous.url,previous);return;}footerHint.textContent="No previous streamed track";return;}
  if(!library.length)return;
  if(audio.currentTime>3){audio.currentTime=0;return;}
  if(playbackQueue && playbackQueue.length){queueIndex=Math.max(0,queueIndex-1);currentTrackIndex=library.findIndex(t=>t.id===playbackQueue[queueIndex]);}
  else currentTrackIndex=(currentTrackIndex-1+library.length)%library.length;
  playCurrent();
}
function keepSelectedRowVisible(){
  const row = menuEl.querySelector(".menu-row.selected");
  if (!row) return;
  const menuRect = menuEl.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const margin = 6;
  let target = menuEl.scrollTop;
  if (rowRect.top < menuRect.top + margin) target -= (menuRect.top + margin - rowRect.top);
  else if (rowRect.bottom > menuRect.bottom - margin) target += (rowRect.bottom - (menuRect.bottom - margin));
  if (Math.abs(target - menuEl.scrollTop) < 1) return;
  menuEl.scrollTo({ top: Math.max(0, target), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
function move(delta){ const count=currentPage().items.length; if(!count)return; selected=(selected+delta+count)%count; render(); }

document.getElementById("np-shuffle").addEventListener("click",()=>{shuffle=!shuffle;localStorage.setItem("pp-shuffle",String(shuffle));pages.playback.items[1][0]=`Shuffle: ${shuffle?"On":"Off"}`;showNowPlaying();});
document.getElementById("np-repeat").addEventListener("click",()=>{repeatMode=repeatMode==="off"?"all":repeatMode==="all"?"one":"off";localStorage.setItem("pp-repeat-mode",repeatMode);pages.playback.items[0][0]=`Repeat: ${repeatMode==="off"?"Off":repeatMode==="one"?"One":"All"}`;showNowPlaying();});
document.getElementById("np-queue").addEventListener("click",()=>{rebuildQueuePage();stack.push("queue");selected=0;render();});
function seekFromPointer(e){if(!audio.duration)return;const r=progressEl.getBoundingClientRect();audio.currentTime=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*audio.duration;}
progressEl.addEventListener("click",seekFromPointer);
progressEl.addEventListener("keydown",e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();if(audio.duration)audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+(e.key==="ArrowRight"?5:-5)));}});
let swipeStart=null;
nowPlayingEl.addEventListener("touchstart",e=>{if(e.touches.length===1)swipeStart={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
nowPlayingEl.addEventListener("touchend",e=>{if(!swipeStart||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-swipeStart.x;const dy=e.changedTouches[0].clientY-swipeStart.y;swipeStart=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.25){if(dx<0)nextTrack();else previousTrack();}},{passive:true});
document.getElementById("select-button").addEventListener("click",activate);
document.getElementById("select-button").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate();}});
document.querySelector(".menu-key").addEventListener("click",back);
document.querySelectorAll(".wheel-hit").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.action==="previous")previousTrack();if(b.dataset.action==="next")nextTrack();if(b.dataset.action==="play")togglePlayback();}));
document.addEventListener("keydown",e=>{
  const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"");
  if(typing){if(e.key==="Escape"){e.preventDefault();document.activeElement.blur();}return;}
  if(e.key==="ArrowDown"){e.preventDefault();move(1);} if(e.key==="ArrowUp"){e.preventDefault();move(-1);}
  if(e.key==="Enter"){e.preventDefault();activate();} if(e.key==="Escape"||e.key==="Backspace"){e.preventDefault();back();}
  if(e.code==="Space"){e.preventDefault();togglePlayback();}
});
let lastAngle=null,accumulated=0,wheelDidDrag=false,suppressWheelClick=false;
function angleFromEvent(e){const r=wheel.getBoundingClientRect();return Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2));}
wheel.addEventListener("pointerdown",e=>{
  if(e.target.closest(".wheel-center"))return;
  lastAngle=angleFromEvent(e);accumulated=0;wheelDidDrag=false;
});
document.addEventListener("pointermove",e=>{
  if(lastAngle===null)return;
  const a=angleFromEvent(e);let diff=a-lastAngle;
  if(diff>Math.PI)diff-=Math.PI*2;if(diff< -Math.PI)diff+=Math.PI*2;
  accumulated+=diff;lastAngle=a;
  if(Math.abs(accumulated)>.24){move(accumulated>0?1:-1);accumulated=0;wheelDidDrag=true;}
});
function endWheel(){
  if(wheelDidDrag){suppressWheelClick=true;setTimeout(()=>{suppressWheelClick=false;},450);}
  lastAngle=null;accumulated=0;wheelDidDrag=false;
}
document.addEventListener("pointerup",endWheel);document.addEventListener("pointercancel",endWheel);
wheel.addEventListener("click",e=>{if(suppressWheelClick){e.preventDefault();e.stopImmediatePropagation();suppressWheelClick=false;}},true);
filePicker.addEventListener("change",e=>{importFiles(e.target.files);e.target.value="";});
folderPicker.addEventListener("change",e=>{importFiles(e.target.files);e.target.value="";});
artworkPicker.addEventListener("change",async e=>{
  const file=e.target.files?.[0]; const id=artworkTargetId; e.target.value=""; artworkTargetId=null;
  if(!file || !id || !file.type.startsWith("image/")) return;
  const track=library.find(t=>t.id===id); if(!track)return;
  track.artBlob=file; track.artworkManuallySet=true; await saveTrack(track); library=await loadLibrary();
  if(library[currentTrackIndex]?.id===id) showNowPlaying();
  if(stack[stack.length-1]==="trackDetail") render();
  footerHint.textContent="Album artwork saved";
});
audio.addEventListener("timeupdate",()=>{if(audio.duration){const pct=audio.currentTime/audio.duration*100;progressFill.style.width=`${pct}%`;progressEl.setAttribute("aria-valuenow",String(Math.round(pct)));elapsedEl.textContent=formatTime(audio.currentTime);durationEl.textContent=formatTime(audio.duration);updateMediaPosition();}});
audio.addEventListener("ended",()=>{if(repeatMode==="one"){audio.currentTime=0;audio.play();}else nextTrack();});
audio.addEventListener("error",()=>{if(currentRemoteTrack){playing=false;footerHint.textContent="MP3.pm stream failed or expired · search again for a fresh result";}});
audio.addEventListener("play",()=>{playing=true;footerHint.textContent="Playing";if ("mediaSession" in navigator) navigator.mediaSession.playbackState="playing";});audio.addEventListener("pause",()=>{playing=false;if(!audio.ended)footerHint.textContent="Paused";if ("mediaSession" in navigator) navigator.mediaSession.playbackState="paused";});
function tickClock(){document.getElementById("clock").textContent=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});}
tickClock();setInterval(tickClock,30000);
(async()=>{try{db=await openDatabase();library=await loadLibrary();playlists=await loadPlaylists();rebuildPages();rebuildStreamRecentPage();rebuildQueuePage();rebuildThemePages();render();}catch(err){console.error(err);footerHint.textContent="Library storage unavailable";render();}})();
