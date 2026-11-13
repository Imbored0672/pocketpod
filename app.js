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
let playing = false;
let repeatMode = "off";
let shuffle = false;
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
  music: { title: "Music", items: [["Playlists","playlists"],["Artists","artists"],["Albums","albums"],["Cover Flow","coverFlow"],["Songs","songs"],["Genres","genres"],["Recently Added","recent"],["Search Library","searchLibrary"],["Sort Library","sortLibrary"],["Find Missing Album Info","bulkAlbums"],["Shuffle Songs","shufflePlay"]] },
  extras: { title: "Extras", items: [["Recently Added","recent"],["Search Library","searchLibrary"],["Sort Library","sortLibrary"],["Shuffle Songs","shufflePlay"],["About PocketPod","about"]] },
  recent: { title: "Recently Added", items: [] },
  sortLibrary: { title: "Sort Library", items: [["Song Title (A–Z)","sort:title"],["Artist (A–Z)","sort:artist"],["Album (A–Z)","sort:album"],["Recently Added (Newest)","sort:recent"]] },
  artists: { title: "Artists", items: [] }, albums: { title: "Albums", items: [] }, songs: { title: "Songs", items: [] }, genres: { title: "Genres", items: [] }, coverFlow: { title: "Cover Flow", items: [] },
  playlists: { title: "Playlists", items: [["+ Create Playlist","createPlaylist"],["No Playlists Yet","empty"]] },
  import: { title: "Import Music", items: [["Choose Music Files","pickFiles"],["Import a Music Folder","pickFolder"],["Import copies files into PocketPod","empty"],["Supported: MP3, M4A, AAC, WAV, FLAC","empty"]] },
  settings: { title: "Settings", items: [["Theme Studio","themeStudio"],["Appearance","appearance"],["Navigation: Touch + Wheel","navigationMode"],["Playback","playback"],["About PocketPod","about"]] },
  themeStudio: { title: "Theme Studio", items: [] },
  themePacks: { title: "Theme Packs", items: [] },
  appearance: { title: "Appearance", items: [] },
  playback: { title: "Playback", items: [["Repeat: Off","repeat"],["Shuffle: Off","shuffleSetting"],["Play Queue","queue"]] },
  about: { title: "About PocketPod", items: [["PocketPod V0.9.1","empty"],["Ad-free. Your music. Your device.","empty"],["Songs stored on this device","empty"],["Album lookup powered by MusicBrainz","empty"]] }
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
  pages.trackDetail = { title: track.title, trackId:id, items: [["▶ Play Song",`track:${id}`],["Find Album Info Online",`lookupAlbum:${encodeURIComponent(id)}`],["Edit Song Details",`editTrack:${encodeURIComponent(id)}`],["Change Album Artwork",`changeArt:${encodeURIComponent(id)}`],["Remove from PocketPod",`removeTrack:${encodeURIComponent(id)}`]] };
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
  const ids = playbackQueue && playbackQueue.length ? playbackQueue : library.map(t=>t.id);
  const start = playbackQueue && playbackQueue.length ? queueIndex : Math.max(0, ids.indexOf(library[currentTrackIndex]?.id));
  pages.queue = { title: "Play Queue", items: ids.length ? ids.map((id,i)=>{const t=library.find(x=>x.id===id);return [`${i===start?"▶ ":""}${t?.title || "Unavailable song"}`,`queueTrack:${encodeURIComponent(id)}`];}) : [["Queue is empty","empty"],["Play a song to build your queue","empty"]] };
}
function currentPage(){ return pages[stack[stack.length-1]]; }
function rebuildThemePages() {
  pages.settings.items = [["Theme Studio","themeStudio"],["Appearance","appearance"],[`Navigation: ${navigationMode === "wheel" ? "Wheel Only" : "Touch + Wheel"}`,"navigationMode"],["Playback","playback"],["About PocketPod","about"]];
  pages.themeStudio.items = [[`Theme Pack: ${themePack}`,"themePacks"],["Customize Device & Colors","appearance"],["Preview Current Theme","themePreview"]];
  pages.themePacks.items = [
    [`${themePack === "Classic" ? "✓ " : ""}Classic — Original iPod`,"setTheme:Classic"],
    [`${themePack === "Modern" ? "✓ " : ""}Modern — Cover Flow`,"setTheme:Modern"]
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
  if (stack[stack.length-1] === "coverFlow") {
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
}
function back(){ if(stack.length>1){ const leaving=stack.pop(); if(leaving==="addSongs" && stack[stack.length-1]==="playlistDetail" && pages.playlistDetail) buildPlaylistDetail(pages.playlistDetail.playlistId); selected=0; render(); } else { selected=0; render(); } }
function activate(){
  const item = currentPage().items[selected]; if(!item) return;
  const action = item[1];
  if(action === "now"){ showNowPlaying(); return; }
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
      pages.trackDetail={title:t.title,trackId:id,items:[["▶ Play Song",`track:${id}`],["Find Album Info Online",`lookupAlbum:${encodeURIComponent(id)}`],["Edit Song Details",`editTrack:${encodeURIComponent(id)}`],["Change Album Artwork",`changeArt:${encodeURIComponent(id)}`],["Remove from PocketPod",`removeTrack:${encodeURIComponent(id)}`]]};
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
    const artwork = currentArtUrl ? [{ src: currentArtUrl, sizes: "512x512", type: track.artBlob?.type || "image/jpeg" }] : [];
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
  const track=library[currentTrackIndex];
  trackNameEl.textContent=track?track.title:"Nothing Playing";
  trackArtistEl.textContent=track?`${track.artist} · ${track.album}${track.releaseYear?` (${track.releaseYear})`:""}`:"Import music to get started";
  albumArt.innerHTML = "";
  if (currentArtUrl) { URL.revokeObjectURL(currentArtUrl); currentArtUrl=null; }
  if (track?.artBlob) { const img=document.createElement("img"); img.alt=`Artwork for ${track.title}`; currentArtUrl=URL.createObjectURL(track.artBlob); img.src=currentArtUrl; albumArt.appendChild(img); }
  else { const fallback=document.createElement("span"); fallback.textContent="♪"; albumArt.appendChild(fallback); }
  if (track) updateMediaSession(track);
  document.getElementById("np-shuffle").textContent=`Shuffle: ${shuffle?"On":"Off"}`;
  document.getElementById("np-repeat").textContent=`Repeat: ${repeatMode=== "off"?"Off":repeatMode=== "one"?"One":"All"}`;
  footerHint.textContent=playing?"Playing":"Not Playing";
}
function playCurrent(){
  const track=library[currentTrackIndex]; if(!track) return;
  if(currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl=URL.createObjectURL(track.blob); audio.src=currentObjectUrl;
  progressFill.style.width="0%"; elapsedEl.textContent="0:00"; durationEl.textContent="0:00";
  audio.play().then(()=>{playing=true;showNowPlaying();}).catch(()=>{playing=false;showNowPlaying();footerHint.textContent="Tap Play to start";});
}
function togglePlayback(){
  if(!library.length){ footerHint.textContent="Import music first"; return; }
  if(currentTrackIndex<0){currentTrackIndex=0;playCurrent();return;}
  if(audio.paused){audio.play().then(()=>{playing=true;footerHint.textContent="Playing";}).catch(()=>{});} else {audio.pause();playing=false;footerHint.textContent="Paused";}
}
function nextTrack(){
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
  if(!library.length)return;
  if(audio.currentTime>3){audio.currentTime=0;return;}
  if(playbackQueue && playbackQueue.length){queueIndex=Math.max(0,queueIndex-1);currentTrackIndex=library.findIndex(t=>t.id===playbackQueue[queueIndex]);}
  else currentTrackIndex=(currentTrackIndex-1+library.length)%library.length;
  playCurrent();
}
function move(delta){ const count=currentPage().items.length; if(!count)return; selected=(selected+delta+count)%count; render(); }

document.getElementById("np-shuffle").addEventListener("click",()=>{shuffle=!shuffle;pages.playback.items[1][0]=`Shuffle: ${shuffle?"On":"Off"}`;showNowPlaying();});
document.getElementById("np-repeat").addEventListener("click",()=>{repeatMode=repeatMode==="off"?"all":repeatMode==="all"?"one":"off";pages.playback.items[0][0]=`Repeat: ${repeatMode==="off"?"Off":repeatMode==="one"?"One":"All"}`;showNowPlaying();});
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
  if(e.key==="ArrowDown"){e.preventDefault();move(1);} if(e.key==="ArrowUp"){e.preventDefault();move(-1);}
  if(e.key==="Enter"){e.preventDefault();activate();} if(e.key==="Escape"||e.key==="Backspace"){e.preventDefault();back();}
  if(e.code==="Space"&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){e.preventDefault();togglePlayback();}
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
audio.addEventListener("play",()=>{playing=true;footerHint.textContent="Playing";if ("mediaSession" in navigator) navigator.mediaSession.playbackState="playing";});audio.addEventListener("pause",()=>{playing=false;if(!audio.ended)footerHint.textContent="Paused";if ("mediaSession" in navigator) navigator.mediaSession.playbackState="paused";});
function tickClock(){document.getElementById("clock").textContent=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});}
tickClock();setInterval(tickClock,30000);
(async()=>{try{db=await openDatabase();library=await loadLibrary();playlists=await loadPlaylists();rebuildPages();rebuildThemePages();render();}catch(err){console.error(err);footerHint.textContent="Library storage unavailable";render();}})();
