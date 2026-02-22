const STORAGE_KEY = "bandSchedulerDataV1";
const SESSION_KEY = "bandSchedulerSessionV1";
const DAY_MS = 24 * 60 * 60 * 1000;
const START_MIN = 11 * 60;
const END_MIN = 23 * 60;
const STEP_MIN = 15;
const REMOTE_DB_ENDPOINT = "/api/db";
const REMOTE_DB_HEALTH_ENDPOINT = "/api/health";
const REMOTE_DB_CACHE_MS = 1500;

let remoteDbMode = null;
let remoteDbCache = null;
let remoteDbCacheAt = 0;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function syncXHR(method, url, body) {
  const xhr = new XMLHttpRequest();
  xhr.open(method, url, false);
  if (body != null) xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(body != null ? JSON.stringify(body) : null);
  return xhr;
}

function detectRemoteDBMode() {
  if (remoteDbMode !== null) return remoteDbMode;
  if (typeof window === "undefined" || window.location.protocol === "file:") {
    remoteDbMode = false;
    return remoteDbMode;
  }
  try {
    const xhr = syncXHR("GET", REMOTE_DB_HEALTH_ENDPOINT);
    remoteDbMode = xhr.status >= 200 && xhr.status < 300;
  } catch {
    remoteDbMode = false;
  }
  return remoteDbMode;
}

function loadRemoteDB(force = false) {
  const now = Date.now();
  if (!force && remoteDbCache && now - remoteDbCacheAt < REMOTE_DB_CACHE_MS) {
    return deepClone(remoteDbCache);
  }
  try {
    const xhr = syncXHR("GET", REMOTE_DB_ENDPOINT);
    if (!(xhr.status >= 200 && xhr.status < 300)) return null;
    const parsed = JSON.parse(xhr.responseText || "{}");
    remoteDbCache = parsed;
    remoteDbCacheAt = now;
    return deepClone(parsed);
  } catch {
    return null;
  }
}

function saveRemoteDB(db) {
  try {
    const payload = deepClone(db);
    const xhr = syncXHR("PUT", REMOTE_DB_ENDPOINT, payload);
    if (!(xhr.status >= 200 && xhr.status < 300)) return false;
    remoteDbCache = payload;
    remoteDbCacheAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

function defaultBandEPK(bandName = "") {
  return {
    customTitle: bandName || "",
    useLogoTitle: false,
    logoDataUrl: null,
    bgColor: "#102a43",
    fontColor: "#ffffff",
    accentColor: "#f08b2d",
    bookingName: "",
    bookingEmail: "",
    bookingPhone: "",
    videos: [],
    audioLinks: []
  };
}

function normalizeBandEPK(epk, bandName = "") {
  const base = defaultBandEPK(bandName);
  const src = epk && typeof epk === "object" ? epk : {};
  const out = { ...base, ...src };
  out.customTitle = String(out.customTitle || bandName || "").trim();
  out.useLogoTitle = !!out.useLogoTitle;
  out.logoDataUrl = out.logoDataUrl || null;
  out.bgColor = String(out.bgColor || base.bgColor);
  out.fontColor = String(out.fontColor || base.fontColor);
  out.accentColor = String(out.accentColor || base.accentColor);
  out.bookingName = String(out.bookingName || "").trim();
  out.bookingEmail = String(out.bookingEmail || "").trim();
  out.bookingPhone = String(out.bookingPhone || "").trim();
  out.videos = (Array.isArray(out.videos) ? out.videos : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 12);
  out.audioLinks = (Array.isArray(out.audioLinks) ? out.audioLinks : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 20);
  return out;
}

function ensureDBShape(db) {
  let changed = false;

  for (const key of ["users", "bands", "memberships", "availabilities", "events", "rehearsalSpaces", "helpRequests"]) {
    if (!Array.isArray(db[key])) {
      db[key] = [];
      changed = true;
    }
  }

  db.users.forEach((user) => {
    if (typeof user.photoDataUrl === "undefined") {
      user.photoDataUrl = null;
      changed = true;
    }
    if (typeof user.mobilePhone !== "string") {
      user.mobilePhone = "";
      changed = true;
    }
    if (typeof user.homeAddress !== "string") {
      user.homeAddress = user.location?.address || "";
      changed = true;
    }
    if (typeof user.homeLat === "undefined") {
      user.homeLat = user.location?.lat ?? null;
      changed = true;
    }
    if (typeof user.homeLon === "undefined") {
      user.homeLon = user.location?.lon ?? null;
      changed = true;
    }
    if (typeof user.location === "undefined") {
      user.location = user.homeAddress
        ? { address: user.homeAddress, lat: user.homeLat ?? null, lon: user.homeLon ?? null }
        : null;
      changed = true;
    }
  });

  db.memberships.forEach((m) => {
    if (typeof m.role !== "string") {
      m.role = "";
      changed = true;
    }
    if (typeof m.hideFromProfile !== "boolean") {
      m.hideFromProfile = false;
      changed = true;
    }
  });

  db.bands.forEach((band) => {
    const normalized = normalizeBandEPK(band.epk, band.name);
    const current = band.epk && typeof band.epk === "object" ? band.epk : null;
    if (!current || JSON.stringify(current) !== JSON.stringify(normalized)) {
      band.epk = normalized;
      changed = true;
    }
  });

  return changed;
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function nowISO() {
  return new Date().toISOString();
}

function loadDB() {
  if (detectRemoteDBMode()) {
    const remote = loadRemoteDB();
    if (remote && typeof remote === "object") {
      if (ensureDBShape(remote)) saveRemoteDB(remote);
      return remote;
    }
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const base = {
      users: [],
      bands: [],
      memberships: [],
      availabilities: [],
      events: [],
      rehearsalSpaces: [],
      helpRequests: []
    };
    ensureDBShape(base);
    saveDB(base);
    return base;
  }
  try {
    const db = JSON.parse(raw);
    if (ensureDBShape(db)) saveDB(db);
    return db;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return loadDB();
  }
}

function saveDB(db) {
  if (detectRemoteDBMode()) {
    if (saveRemoteDB(db)) return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSession(userId) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function getCurrentUser() {
  const session = getSession();
  if (!session?.userId) return null;
  const db = loadDB();
  return db.users.find((u) => u.id === session.userId) || null;
}

function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  return user;
}

function hashHexFromBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashString(value) {
  const enc = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return hashHexFromBuffer(digest);
}

async function registerUser({ username, email, password }) {
  const db = loadDB();
  const cleanUser = username.trim();
  const cleanEmail = normalizeEmail(email);
  if (!cleanUser || !cleanEmail || !password) {
    return { ok: false, message: "All fields are required." };
  }
  const existing = db.users.find(
    (u) => u.username.toLowerCase() === cleanUser.toLowerCase() || u.email === cleanEmail
  );
  if (existing) return { ok: false, message: "Username or email already exists." };

  const passwordHash = await hashString(password);
  db.users.push({
    id: uid("user"),
    username: cleanUser,
    email: cleanEmail,
    passwordHash,
    photoDataUrl: null,
    mobilePhone: "",
    homeAddress: "",
    homeLat: null,
    homeLon: null,
    location: null,
    createdAt: nowISO()
  });
  saveDB(db);
  return { ok: true };
}

async function loginUser({ login, password }) {
  const db = loadDB();
  const raw = (login || "").trim();
  const byEmail = raw.includes("@");
  const user = db.users.find((u) =>
    byEmail ? u.email === normalizeEmail(raw) : u.username.toLowerCase() === raw.toLowerCase()
  );
  if (!user) return { ok: false, message: "No user found." };
  const passHash = await hashString(password || "");
  if (passHash !== user.passwordHash) return { ok: false, message: "Invalid password." };
  setSession(user.id);
  return { ok: true };
}

function navItems() {
  return [
    ["dashboard.html", "Dashboard"],
    ["account.html", "Account"],
    ["availability.html", "Availability"],
    ["calendar.html", "Calendar"],
    ["bands.html", "Bands"],
    ["gigs.html", "Gigs"],
    ["rehearsal_spaces.html", "Rehearsal Spaces"],
    ["help.html", "Help"]
  ];
}

function renderNav(activeHref) {
  const user = getCurrentUser();
  if (!user) return;
  const nav = document.createElement("nav");
  nav.className = "nav";
  const links = navItems()
    .map(([href, label]) => `<a href="${href}" class="${activeHref === href ? "active" : ""}">${label}</a>`)
    .join("");
  nav.innerHTML = `
    <div class="nav-inner">
      ${links}
      <span class="spacer"></span>
      <span>${user.username}</span>
      <button id="logoutBtn" type="button">Logout</button>
    </div>
  `;
  document.body.prepend(nav);
  nav.querySelector("#logoutBtn").addEventListener("click", () => {
    clearSession();
    window.location.href = "index.html";
  });
}

function getUserBands(userId) {
  const db = loadDB();
  const bandIds = db.memberships.filter((m) => m.userId === userId).map((m) => m.bandId);
  return db.bands.filter((b) => bandIds.includes(b.id));
}

function userInBand(userId, bandId, db = loadDB()) {
  return !!db.memberships.find((m) => m.userId === userId && m.bandId === bandId);
}

function getBandMembers(bandId, db = loadDB()) {
  const memberships = db.memberships
    .filter((m) => m.bandId === bandId)
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  return memberships
    .map((m) => {
      const user = db.users.find((u) => u.id === m.userId);
      if (!user) return null;
      return { ...user, joinedAt: m.joinedAt, role: m.role || "" };
    })
    .filter(Boolean);
}

function getMembership(userId, bandId, db = loadDB()) {
  return db.memberships.find((m) => m.userId === userId && m.bandId === bandId) || null;
}

function usersShareBand(userIdA, userIdB, db = loadDB()) {
  if (!userIdA || !userIdB) return false;
  const aBands = new Set(db.memberships.filter((m) => m.userId === userIdA).map((m) => m.bandId));
  return db.memberships.some((m) => m.userId === userIdB && aBands.has(m.bandId));
}

function canViewPrivateUserDetails(viewerUserId, targetUserId, db = loadDB()) {
  if (!viewerUserId || !targetUserId) return false;
  if (viewerUserId === targetUserId) return true;
  return usersShareBand(viewerUserId, targetUserId, db);
}

function getUserPublicView(targetUserId, viewerUserId = getCurrentUser()?.id || null, db = loadDB()) {
  const user = db.users.find((u) => u.id === targetUserId);
  if (!user) return null;
  const bandIds = db.memberships
    .filter((m) => m.userId === targetUserId && !m.hideFromProfile)
    .map((m) => m.bandId);
  const bands = db.bands
    .filter((b) => bandIds.includes(b.id))
    .map((b) => ({ id: b.id, name: b.name }));
  const canViewPrivate = canViewPrivateUserDetails(viewerUserId, targetUserId, db);
  return {
    id: user.id,
    username: user.username,
    photoDataUrl: user.photoDataUrl || null,
    bands,
    homeAddress: canViewPrivate ? user.homeAddress || user.location?.address || "" : null,
    mobilePhone: canViewPrivate ? user.mobilePhone || "" : null,
    canViewPrivate
  };
}

function getBandUpcomingGigs(bandId, fromDate = new Date(), limit = 12, db = loadDB()) {
  return db.events
    .filter((e) => !e.removed && e.bandId === bandId && e.type === "gig" && new Date(e.endISO) >= fromDate)
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO))
    .slice(0, Math.max(1, limit));
}

function readImageFileAsDataUrl(file, maxDim = 700) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Invalid image file."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function parseMultilineUrls(text, max = 20) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function dateAddDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function clampToWindow(min) {
  return Math.min(END_MIN, Math.max(START_MIN, min));
}

function snapMinutes(min) {
  return Math.round(min / STEP_MIN) * STEP_MIN;
}

function makeDateAt(dayDate, minFromMidnight) {
  const d = new Date(dayDate);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minFromMidnight);
  return d;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

function getAvailabilitiesForUser(userId, rangeStart, rangeEnd) {
  const db = loadDB();
  const output = [];
  const slots = db.availabilities.filter((a) => a.userId === userId);

  for (const slot of slots) {
    if (!slot.recurring) {
      if (overlaps(slot.startISO, slot.endISO, rangeStart.toISOString(), rangeEnd.toISOString())) {
        output.push({ ...slot, instanceStartISO: slot.startISO, instanceEndISO: slot.endISO });
      }
      continue;
    }

    const start = new Date(rangeStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd);
    const recurStart = new Date(slot.recurrenceStartISO || slot.startISO);
    const recurEnd = slot.recurrenceEndISO ? new Date(slot.recurrenceEndISO) : null;

    for (let d = new Date(start); d <= end; d = dateAddDays(d, 1)) {
      if (d < startOfDay(recurStart)) continue;
      if (recurEnd && d > startOfDay(recurEnd)) continue;
      if (d.getDay() !== slot.dayOfWeek) continue;

      const instStart = makeDateAt(d, slot.startMin);
      const instEnd = makeDateAt(d, slot.endMin);
      if (instEnd <= rangeStart || instStart >= rangeEnd) continue;
      output.push({
        ...slot,
        instanceStartISO: instStart.toISOString(),
        instanceEndISO: instEnd.toISOString(),
        instanceDateKey: startOfDay(instStart).toISOString()
      });
    }
  }
  return output;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEventsForUserInRange(userId, rangeStart, rangeEnd) {
  const db = loadDB();
  return db.events.filter((e) => {
    if (e.removed) return false;
    if (!userInBand(userId, e.bandId, db)) return false;
    if (!overlaps(e.startISO, e.endISO, rangeStart.toISOString(), rangeEnd.toISOString())) return false;
    return true;
  });
}

function getConfirmedBusyEvents(userId, rangeStart, rangeEnd) {
  const all = getEventsForUserInRange(userId, rangeStart, rangeEnd);
  return all.filter((e) => e.statusByUser?.[userId] === "confirmed");
}

function getBandRegularDuration(band) {
  if (band.nextRehearsalOverrideEnabled) return band.nextRehearsalDurationMin || band.regularDurationMin || 120;
  return band.regularDurationMin || 120;
}

function consumeNextRehearsalOverrideIfNeeded(bandId) {
  const db = loadDB();
  const band = db.bands.find((b) => b.id === bandId);
  if (!band || !band.nextRehearsalOverrideEnabled) return;
  const now = new Date();
  const futureRehearsals = db.events
    .filter((e) => !e.removed && e.bandId === bandId && e.type === "rehearsal")
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  const upcoming = futureRehearsals.find((e) => new Date(e.endISO) > now);
  if (!upcoming) {
    band.nextRehearsalOverrideEnabled = false;
    saveDB(db);
    return;
  }
  if (now > new Date(upcoming.endISO)) {
    band.nextRehearsalOverrideEnabled = false;
    saveDB(db);
  }
}

function computeNextCommonSlots(bandId, fromDate = new Date(), maxDays = 30) {
  const db = loadDB();
  const band = db.bands.find((b) => b.id === bandId);
  if (!band) return [];
  const members = getBandMembers(bandId, db);
  if (!members.length) return [];
  const duration = getBandRegularDuration(band);

  const startScan = new Date(fromDate);
  startScan.setSeconds(0, 0);
  const endScan = dateAddDays(startScan, maxDays);
  const out = [];

  for (let t = new Date(startScan); t < endScan; t = new Date(t.getTime() + STEP_MIN * 60000)) {
    const min = minutesSinceMidnight(t);
    if (min < START_MIN || min + duration > END_MIN) continue;
    const candStart = new Date(t);
    const candEnd = new Date(t.getTime() + duration * 60000);

    let ok = true;
    for (const member of members) {
      const memberAvail = getAvailabilitiesForUser(member.id, candStart, candEnd).filter(
        (a) => new Date(a.instanceStartISO) <= candStart && new Date(a.instanceEndISO) >= candEnd
      );
      if (!memberAvail.length) {
        ok = false;
        break;
      }
      const busy = getConfirmedBusyEvents(member.id, candStart, candEnd).find((e) =>
        overlaps(e.startISO, e.endISO, candStart.toISOString(), candEnd.toISOString())
      );
      if (busy) {
        ok = false;
        break;
      }
    }

    if (ok) {
      out.push({ startISO: candStart.toISOString(), endISO: candEnd.toISOString() });
      if (out.length >= 8) break;
      t = new Date(candEnd.getTime() - STEP_MIN * 60000);
    }
  }
  return out;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatMiles(miles) {
  if (miles == null || Number.isNaN(miles)) return "N/A";
  return `${miles.toFixed(1)} mi`;
}

async function searchAddressSuggestions(query, limit = 6) {
  const clean = (query || "").trim();
  if (!clean) return { ok: false, message: "Address is required.", results: [] };
  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 6));

  async function lookupNominatim() {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${safeLimit}&q=${encodeURIComponent(clean)}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return { ok: false, reason: "failed", message: "Address lookup failed." };
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) {
        return { ok: false, reason: "empty", message: "No matching addresses found." };
      }
      return {
        ok: true,
        results: data.map((item) => ({
          address: item.display_name,
          lat: Number(item.lat),
          lon: Number(item.lon)
        }))
      };
    } catch {
      return { ok: false, reason: "network", message: "Address lookup failed (network)." };
    }
  }

  async function lookupPhoton() {
    const url = `https://photon.komoot.io/api/?limit=${safeLimit}&q=${encodeURIComponent(clean)}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return { ok: false, reason: "failed", message: "Address lookup failed." };
      const data = await res.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      if (!features.length) {
        return { ok: false, reason: "empty", message: "No matching addresses found." };
      }
      return {
        ok: true,
        results: features
          .map((feature) => {
            const props = feature?.properties || {};
            const coords = feature?.geometry?.coordinates || [];
            const lon = Number(coords[0]);
            const lat = Number(coords[1]);
            const line1 = [props.housenumber, props.street].filter(Boolean).join(" ").trim();
            const locality = [props.city || props.town || props.village, props.state, props.postcode]
              .filter(Boolean)
              .join(", ")
              .trim();
            const address = [line1 || props.name, locality, props.country].filter(Boolean).join(", ");
            if (!address || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
            return { address, lat, lon };
          })
          .filter(Boolean)
      };
    } catch {
      return { ok: false, reason: "network", message: "Address lookup failed (network)." };
    }
  }

  const primary = await lookupNominatim();
  if (primary.ok && primary.results.length) return primary;

  const fallback = await lookupPhoton();
  if (fallback.ok && fallback.results.length) return fallback;

  if (primary.reason === "network" && fallback.reason === "network") {
    return { ok: false, message: "Address lookup failed (network).", results: [] };
  }
  if (primary.reason === "empty" && fallback.reason === "empty") {
    return { ok: false, message: "No matching addresses found.", results: [] };
  }
  return {
    ok: false,
    message: fallback.message || primary.message || "Address lookup failed.",
    results: []
  };
}

async function verifyAddress(address) {
  const lookup = await searchAddressSuggestions(address, 1);
  if (!lookup.ok) {
    if (lookup.message === "No matching addresses found.") {
      return { ok: false, message: "Address could not be verified." };
    }
    if (lookup.message.includes("(network)")) {
      return { ok: false, message: "Address verification failed (network)." };
    }
    return { ok: false, message: "Address verification failed." };
  }

  const best = lookup.results[0];
  return {
    ok: true,
    normalizedAddress: best.address,
    lat: best.lat,
    lon: best.lon
  };
}

function addHelpRequest(userId, text) {
  const db = loadDB();
  db.helpRequests.push({ id: uid("help"), userId, text, createdAt: nowISO() });
  saveDB(db);
}

function createWeekView(target, weekStart, options = {}) {
  const { onEmptyClick, interactive = false } = options;
  target.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "week-grid";

  const header = document.createElement("div");
  header.className = "week-header";
  header.innerHTML = "<div>Time</div>";
  for (let i = 0; i < 7; i++) {
    const d = dateAddDays(weekStart, i);
    const cell = document.createElement("div");
    cell.textContent = formatDayLabel(d);
    header.appendChild(cell);
  }
  wrapper.appendChild(header);

  const body = document.createElement("div");
  body.className = "week-body";

  const timeCol = document.createElement("div");
  timeCol.className = "time-col";
  for (let h = START_MIN; h <= END_MIN; h += 60) {
    const lab = document.createElement("div");
    lab.className = "time-label";
    lab.textContent = formatTime(makeDateAt(weekStart, h));
    lab.style.top = `${((h - START_MIN) / (END_MIN - START_MIN)) * 100}%`;
    timeCol.appendChild(lab);
  }
  body.appendChild(timeCol);

  const dayCols = [];
  for (let i = 0; i < 7; i++) {
    const d = dateAddDays(weekStart, i);
    const col = document.createElement("div");
    col.className = "day-col";
    col.dataset.dayIndex = String(i);
    col.dataset.dateISO = startOfDay(d).toISOString();
    if (interactive && onEmptyClick) {
      col.addEventListener("click", (evt) => {
        if (evt.target.closest(".slot")) return;
        const rect = col.getBoundingClientRect();
        const pct = (evt.clientY - rect.top) / rect.height;
        const mins = snapMinutes(START_MIN + pct * (END_MIN - START_MIN));
        onEmptyClick(d, clampToWindow(mins));
      });
    }
    body.appendChild(col);
    dayCols.push(col);
  }

  wrapper.appendChild(body);
  target.appendChild(wrapper);

  return {
    dayCols,
    minutesToTopPct(min) {
      return ((min - START_MIN) / (END_MIN - START_MIN)) * 100;
    }
  };
}

function createBand(name, leaderId) {
  const db = loadDB();
  const joinCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  return hashString(joinCode).then((joinCodeHash) => {
    const band = {
      id: uid("band"),
      name: name.trim(),
      leaderId,
      joinCode,
      joinCodeHash,
      regularDurationMin: 120,
      nextRehearsalDurationMin: 120,
      nextRehearsalOverrideEnabled: false,
      epk: defaultBandEPK(name.trim()),
      createdAt: nowISO()
    };
    db.bands.push(band);
    db.memberships.push({
      id: uid("m"),
      bandId: band.id,
      userId: leaderId,
      role: "Band Leader",
      hideFromProfile: false,
      joinedAt: nowISO()
    });
    saveDB(db);
    return band;
  });
}

async function joinBandByCode(userId, code) {
  const db = loadDB();
  const hash = await hashString((code || "").trim().toUpperCase());
  const band = db.bands.find((b) => b.joinCodeHash === hash);
  if (!band) return { ok: false, message: "Invalid join code." };
  if (userInBand(userId, band.id, db)) return { ok: false, message: "Already in band." };
  db.memberships.push({
    id: uid("m"),
    bandId: band.id,
    userId,
    role: "",
    hideFromProfile: false,
    joinedAt: nowISO()
  });
  saveDB(db);
  return { ok: true };
}

function quitBand(userId, bandId) {
  const db = loadDB();
  db.memberships = db.memberships.filter((m) => !(m.bandId === bandId && m.userId === userId));
  const band = db.bands.find((b) => b.id === bandId);
  if (band && band.leaderId === userId) {
    const next = db.memberships
      .filter((m) => m.bandId === bandId)
      .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0];
    if (next) {
      band.leaderId = next.userId;
      next.role = next.role || "Band Leader";
    }
  }
  if (!db.memberships.find((m) => m.bandId === bandId)) {
    db.bands = db.bands.filter((b) => b.id !== bandId);
    db.events = db.events.filter((e) => e.bandId !== bandId);
    db.rehearsalSpaces = db.rehearsalSpaces.filter((s) => s.bandId !== bandId);
  }
  saveDB(db);
}

function removeMemberFromBand(actorUserId, targetUserId, bandId) {
  const db = loadDB();
  const band = db.bands.find((b) => b.id === bandId);
  if (!band || band.leaderId !== actorUserId) return { ok: false };
  if (targetUserId === actorUserId) return { ok: false, message: "Use quit instead." };
  db.memberships = db.memberships.filter((m) => !(m.bandId === bandId && m.userId === targetUserId));
  saveDB(db);
  return { ok: true };
}

function transferLeadership(actorUserId, targetUserId, bandId) {
  const db = loadDB();
  const band = db.bands.find((b) => b.id === bandId);
  if (!band || band.leaderId !== actorUserId) return { ok: false };
  if (!userInBand(targetUserId, bandId, db)) return { ok: false };
  const previousLeaderMembership = db.memberships.find((m) => m.bandId === bandId && m.userId === actorUserId);
  if (previousLeaderMembership && previousLeaderMembership.role === "Band Leader") {
    previousLeaderMembership.role = "";
  }
  const newLeaderMembership = db.memberships.find((m) => m.bandId === bandId && m.userId === targetUserId);
  if (newLeaderMembership) newLeaderMembership.role = "Band Leader";
  band.leaderId = targetUserId;
  saveDB(db);
  return { ok: true };
}

function setBandDurations(actorUserId, bandId, regularDurationMin, nextDurationMin, overrideEnabled) {
  const db = loadDB();
  const band = db.bands.find((b) => b.id === bandId);
  if (!band || band.leaderId !== actorUserId) return { ok: false };
  band.regularDurationMin = regularDurationMin;
  band.nextRehearsalDurationMin = nextDurationMin;
  band.nextRehearsalOverrideEnabled = !!overrideEnabled;
  saveDB(db);
  return { ok: true };
}

function setMembershipRole(actorUserId, bandId, targetUserId, roleText) {
  const db = loadDB();
  const band = db.bands.find((b) => b.id === bandId);
  if (!band) return { ok: false, message: "Band not found." };
  const membership = db.memberships.find((m) => m.bandId === bandId && m.userId === targetUserId);
  if (!membership) return { ok: false, message: "Member not found." };
  if (actorUserId !== targetUserId && band.leaderId !== actorUserId) {
    return { ok: false, message: "Only the band leader can edit other members." };
  }
  membership.role = String(roleText || "").trim().slice(0, 80);
  saveDB(db);
  return { ok: true };
}

function updateBandEPK(actorUserId, bandId, patch) {
  const db = loadDB();
  const band = db.bands.find((b) => b.id === bandId);
  if (!band) return { ok: false, message: "Band not found." };
  if (band.leaderId !== actorUserId) return { ok: false, message: "Only the band leader can edit EPK settings." };
  band.epk = normalizeBandEPK({ ...(band.epk || {}), ...(patch || {}) }, band.name);
  saveDB(db);
  return { ok: true, band };
}

function setEventStatus(eventId, userId, status) {
  const db = loadDB();
  const e = db.events.find((event) => event.id === eventId);
  if (!e || e.removed) return { ok: false };
  if (!["pending", "confirmed", "unavailable"].includes(status)) return { ok: false };
  e.statusByUser = e.statusByUser || {};
  e.statusByUser[userId] = status;
  saveDB(db);
  return { ok: true };
}

function removeEvent(eventId, actorUserId) {
  const db = loadDB();
  const e = db.events.find((event) => event.id === eventId);
  if (!e || e.removed) return { ok: false };
  if (e.creatorId !== actorUserId) return { ok: false };
  e.removed = true;
  saveDB(db);
  return { ok: true };
}

function saveAvailabilitySlot(slot) {
  const db = loadDB();
  const idx = db.availabilities.findIndex((a) => a.id === slot.id);
  if (idx === -1) db.availabilities.push(slot);
  else db.availabilities[idx] = slot;
  saveDB(db);
}

function deleteAvailabilitySlot(slotId, userId) {
  const db = loadDB();
  db.availabilities = db.availabilities.filter((a) => !(a.id === slotId && a.userId === userId));
  saveDB(db);
}

function endRecurringFromInstance(slotId, userId, instanceStartISO) {
  const db = loadDB();
  const slot = db.availabilities.find((a) => a.id === slotId && a.userId === userId && a.recurring);
  if (!slot) return { ok: false };
  const instStart = new Date(instanceStartISO);
  slot.recurrenceEndISO = instStart.toISOString();
  saveDB(db);
  return { ok: true };
}

function createEventForBand({ bandId, type, creatorId, startISO, endISO, title, venue, address, lat, lon, compensation, setDurationMin }) {
  const db = loadDB();
  const members = getBandMembers(bandId, db);
  const statusByUser = {};
  members.forEach((m) => {
    statusByUser[m.id] = "pending";
  });
  const event = {
    id: uid("evt"),
    bandId,
    type,
    creatorId,
    startISO,
    endISO,
    title,
    venue: venue || null,
    address: address || null,
    lat: lat ?? null,
    lon: lon ?? null,
    compensation: compensation || null,
    setDurationMin: setDurationMin || null,
    statusByUser,
    removed: false,
    createdAt: nowISO()
  };
  db.events.push(event);
  saveDB(db);
  return event;
}
