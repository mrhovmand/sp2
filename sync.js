/* SP2 Dåsekontrol – deling med holdet via Supabase (fælles kode)
 *
 * Princip: Telefonen er altid hovedkilden. Alt gemmes først lokalt (virker offline)
 * og sendes op, når der er dækning. Ændringer fra de andre hentes ned ved start,
 * hvert minut mens appen er åben, og når dækningen kommer tilbage.
 * Konflikter: den senest ændrede udgave vinder (pr. registrering / pr. linje).
 *
 * Den "fælles kode" er adgangskoden til én fælles bruger i Supabase (e-mail i config.js).
 * Kun den bruger kan læse/skrive data (Row Level Security i opsaetning.sql).
 */
"use strict";
const SYNC = window.SP2_SYNC || {};
const syncConfigured = () => !!(SYNC.url && SYNC.key && SYNC.email);
let SESSION = null;           // { access_token, refresh_token, expires_at }
let MY_NAME = "";
const SYNC_STATE = { busy: false, last: null, error: null, pending: 0, again: false };

// Postgres-tidsstempler har 6 decimaler – Safari vil kun have 3
const parseTs = (t) => new Date(String(t).replace(/(\.\d{3})\d+/, "$1"));

/* ---------- Auth ---------- */
async function authCall(grant, body) {
  const r = await fetch(`${SYNC.url}/auth/v1/token?grant_type=${grant}`, {
    method: "POST", headers: { apikey: SYNC.key, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.msg || j.message || `Fejl ${r.status}`); e.status = r.status; throw e; }
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600) };
}
async function syncLogin(code, name) {
  SESSION = await authCall("password", { email: SYNC.email, password: code });
  MY_NAME = (name || "").trim();
  await metaSet("session", SESSION); await metaSet("myName", MY_NAME);
  // Første gang på denne telefon: send alt lokalt op
  if (!(await metaGet("syncInit", false))) { await markAllDirty(); await metaSet("syncInit", true); }
  syncNow();
}
async function syncLogout() {
  SESSION = null; await metaSet("session", null);
}
async function ensureToken() {
  if (!SESSION) throw new Error("Ikke forbundet");
  if (SESSION.expires_at - 60 > Date.now() / 1000) return;
  try { SESSION = await authCall("refresh_token", { refresh_token: SESSION.refresh_token }); await metaSet("session", SESSION); }
  catch (e) { if (e.status === 400 || e.status === 401) { SESSION = null; await metaSet("session", null); SYNC_STATE.error = "Koden skal skrives igen"; } throw e; }
}
async function api(path, opts = {}, retry = true) {
  await ensureToken();
  const r = await fetch(SYNC.url + path, { ...opts, headers: { apikey: SYNC.key, Authorization: `Bearer ${SESSION.access_token}`, ...(opts.headers || {}) } });
  if (r.status === 401 && retry) { SESSION.expires_at = 0; return api(path, opts, false); }
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`Server ${r.status}: ${t.slice(0, 120)}`); }
  return r;
}
const upsert = (table, rows) => rows.length ? api(`/rest/v1/${table}`, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) }) : null;
async function pullTable(table, cols) {
  const cur = await metaGet("cursor:" + table, null);
  // 2 min overlap, så samtidige ændringer ikke smutter forbi
  const since = cur ? new Date(parseTs(cur).getTime() - 120000).toISOString() : "1970-01-01T00:00:00Z";
  let out = [], max = cur;
  for (let off = 0; ; off += 1000) {
    const r = await api(`/rest/v1/${table}?select=${cols}&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc&offset=${off}&limit=1000`);
    const rows = await r.json();
    out = out.concat(rows);
    for (const x of rows) if (!max || parseTs(x.updated_at) > parseTs(max)) max = x.updated_at;
    if (rows.length < 1000) break;
  }
  return { rows: out, save: () => max && metaSet("cursor:" + table, max) };
}

/* ---------- Ændringssporing ---------- */
// Lås: læs-ret-skriv på delte lister sker én ad gangen, så samtidige ændringer ikke overskriver hinanden
let lockChain = Promise.resolve();
function locked(fn) { const r = lockChain.then(fn); lockChain = r.catch(() => {}); return r; }
function markMetaDirty(key) {
  return locked(async () => { const d = new Set(await metaGet("dirtyMeta", [])); d.add(key); await metaSet("dirtyMeta", [...d]); }).then(() => syncSoon());
}
function markRegDeleted(id) {
  return locked(async () => { const d = new Set(await metaGet("pendingDel", [])); d.add(id); await metaSet("pendingDel", [...d]); }).then(() => syncSoon());
}
// Fjern kun de nøgler, der faktisk blev sendt (nye kan være kommet til imens)
const removeKeys = (store, keys) => locked(async () => { const k = new Set(keys); await metaSet(store, (await metaGet(store, [])).filter((x) => !k.has(x))); });
function markAllDirty() { return locked(markAllDirtyInner); }
async function markAllDirtyInner() {
  for (const r of REGS.values()) { r.dirty = true; await dbPut("regs", r); }
  const keys = [...Object.keys(NAMES).map((k) => "name:" + k), ...Object.keys(CONFIRMED).map((k) => "conf:" + k), ...Object.keys(TAG).map((k) => "tag:" + k)];
  const d = new Set(await metaGet("dirtyMeta", [])); keys.forEach((k) => d.add(k)); await metaSet("dirtyMeta", [...d]);
  const mats = await metaGet("materials", {}); for (const m of Object.values(mats)) m.dirty = true; await metaSet("materials", mats);
}
function metaValue(key) {
  const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  if (kind === "name") return NAMES[id] ?? null;
  if (kind === "conf") return CONFIRMED[id] ? true : null;
  if (kind === "tag") return TAG[id] || null;
  return null;
}
function applyMeta(key, value) {
  const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  const obj = kind === "name" ? NAMES : kind === "conf" ? CONFIRMED : kind === "tag" ? TAG : null;
  if (!obj) return null;
  if (value === null || value === undefined) delete obj[id]; else obj[id] = value;
  return kind === "name" ? "names" : kind === "conf" ? "confirmed" : "tag";
}

/* ---------- Synkronisering ---------- */
let syncT;
function syncSoon(ms = 2500) { if (!syncConfigured()) return; clearTimeout(syncT); syncT = setTimeout(syncNow, ms); }
async function syncNow() {
  if (!syncConfigured() || !SESSION || !navigator.onLine) { updateSyncBadge(); return; }
  if (SYNC_STATE.busy) { SYNC_STATE.again = true; return; }
  SYNC_STATE.busy = true; updateSyncBadge();
  let changed = false;
  try {
    // 1. Registreringer op
    const dirty = [...REGS.values()].filter((r) => r.dirty);
    const strip = (r) => { const { dirty: _d, saved: _s, ...rest } = r; return rest; };
    await upsert("regs", dirty.map((r) => ({ id: r.id, data: strip(r), deleted: false })));
    for (const r of dirty) { const cur = REGS.get(r.id); if (cur && cur.updated === r.updated) { cur.dirty = false; await dbPut("regs", cur); } }
    // 2. Sletninger op
    const del = await metaGet("pendingDel", []);
    if (del.length) { await upsert("regs", del.map((id) => ({ id, data: { id }, deleted: true }))); await removeKeys("pendingDel", del); }
    // 3. Billeder op
    const photos = await dbGetAll("photos");
    for (const p of photos.filter((x) => !x.uploaded)) {
      await api(`/storage/v1/object/photos/${encodeURIComponent(p.id)}.jpg`, { method: "POST", headers: { "Content-Type": "image/jpeg", "x-upsert": "true" }, body: p.blob });
      p.uploaded = true; await dbPut("photos", p);
    }
    // 4. Navne, bekræftelser og tagnoter op
    const dm = await metaGet("dirtyMeta", []);
    if (dm.length) { await upsert("meta", dm.map((k) => { const v = metaValue(k); return { key: k, value: v, deleted: v === null }; })); await removeKeys("dirtyMeta", dm); }
    // 5. Materialeliste op
    const mats = await metaGet("materials", {});
    const dmat = Object.values(mats).filter((m) => m.dirty);
    if (dmat.length) {
      await upsert("materials", dmat.map((m) => { const { dirty: _d, ...rest } = m; return { id: m.id, data: rest, deleted: !!m.deleted }; }));
      await locked(async () => {
        const now = await metaGet("materials", {});
        for (const m of dmat) if (now[m.id] && now[m.id].updated === m.updated) now[m.id].dirty = false;
        await metaSet("materials", now);
      });
    }

    // 6. Hent de andres ændringer
    const pr = await pullTable("regs", "id,data,deleted,updated_at");
    for (const row of pr.rows) {
      const loc = REGS.get(row.id);
      if (row.deleted) {
        if (loc && !loc.dirty) { for (const pid of loc.photos || []) await dbDel("photos", pid); await dbDel("regs", row.id); REGS.delete(row.id); changed = true; }
        continue;
      }
      const remote = normReg({ ...row.data, saved: true, dirty: false });
      if (!loc || (!loc.dirty && loc.updated !== remote.updated) || (loc.dirty && (remote.updated || "") > (loc.updated || ""))) {
        REGS.set(remote.id, remote); await dbPut("regs", remote); changed = true;
      }
    }
    await pr.save();
    const pm = await pullTable("meta", "key,value,deleted,updated_at");
    const dmNow = new Set(await metaGet("dirtyMeta", []));
    const touched = new Set();
    for (const row of pm.rows) {
      if (dmNow.has(row.key)) continue;
      const before = JSON.stringify(metaValue(row.key));
      const store = applyMeta(row.key, row.deleted ? null : row.value);
      if (store && JSON.stringify(metaValue(row.key)) !== before) { touched.add(store); changed = true; }
    }
    if (touched.has("names")) await metaSet("names", NAMES);
    if (touched.has("confirmed")) await metaSet("confirmed", CONFIRMED);
    if (touched.has("tag")) await metaSet("tag", TAG);
    await pm.save();
    const pmat = await pullTable("materials", "id,data,deleted,updated_at");
    if (pmat.rows.length) await locked(async () => {
      const cur = await metaGet("materials", {});
      for (const row of pmat.rows) {
        const loc = cur[row.id];
        const remote = { ...row.data, deleted: row.deleted, dirty: false };
        const same = loc && loc.updated === remote.updated && !!loc.deleted === !!remote.deleted && !!loc.done === !!remote.done && loc.text === remote.text;
        if (!loc || (!loc.dirty && !same) || (loc.dirty && (remote.updated || "") > (loc.updated || ""))) { cur[row.id] = remote; changed = true; }
      }
      await metaSet("materials", cur);
    });
    await pmat.save();
    SYNC_STATE.last = new Date(); SYNC_STATE.error = null;
  } catch (e) {
    console.warn("Synk fejlede", e);
    SYNC_STATE.error = navigator.onLine ? e.message : null;
  }
  SYNC_STATE.busy = false;
  await countPending();
  updateSyncBadge();
  if (changed) onRemoteChange();
  if (SYNC_STATE.again) { SYNC_STATE.again = false; syncSoon(500); }
}
async function countPending() {
  let n = [...REGS.values()].filter((r) => r.dirty).length;
  n += (await metaGet("pendingDel", [])).length + (await metaGet("dirtyMeta", [])).length;
  n += Object.values(await metaGet("materials", {})).filter((m) => m.dirty).length;
  n += (await dbGetAll("photos")).filter((p) => !p.uploaded).length;
  SYNC_STATE.pending = n; return n;
}
// Opdater skærmen når andre har ændret noget – men ikke midt i en indtastning
let pendingRerender = false;
function onRemoteChange() {
  const p = parseRoute();
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (p[0] === "d" || typing || !$("#viewer").hidden || !$("#dialog").hidden) { pendingRerender = true; return; }
  render();
}

/* ---------- Billeder: hentes fra holdet når de mangler lokalt ---------- */
async function getPhoto(pid) {
  const p = await dbGet("photos", pid);
  if (p || !syncConfigured() || !SESSION || !navigator.onLine) return p;
  try {
    const r = await api(`/storage/v1/object/authenticated/photos/${encodeURIComponent(pid)}.jpg`);
    const blob = await r.blob();
    const rec = { id: pid, blob, uploaded: true, created: nowIso() };
    await dbPut("photos", rec); return rec;
  } catch (e) { console.warn("Kunne ikke hente billede", pid, e); return null; }
}

/* ---------- Status-visning ---------- */
function syncStatusText() {
  if (!syncConfigured()) return "";
  if (!SESSION) return "⚪ Ikke forbundet til holdet";
  if (SYNC_STATE.busy) return "🔄 Deler med holdet …";
  if (!navigator.onLine) return `📴 Offline${SYNC_STATE.pending ? ` – ${SYNC_STATE.pending} ændringer venter` : ""}`;
  if (SYNC_STATE.error) return `⚠️ Kunne ikke dele: ${SYNC_STATE.error}`;
  if (SYNC_STATE.pending) return `⏳ ${SYNC_STATE.pending} ændringer venter på at blive delt`;
  return `✅ Delt med holdet${SYNC_STATE.last ? ` · ${SYNC_STATE.last.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}` : ""}`;
}
function updateSyncBadge() { const e = $("#syncLine"); if (e) e.textContent = syncStatusText(); }

/* ---------- Start ---------- */
async function initSync() {
  if (!syncConfigured()) return;
  SESSION = await metaGet("session", null);
  MY_NAME = await metaGet("myName", "");
  await countPending();
  window.addEventListener("online", () => syncSoon(500));
  window.addEventListener("offline", updateSyncBadge);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncSoon(300); });
  document.addEventListener("focusout", () => { if (pendingRerender) setTimeout(() => { if (pendingRerender && parseRoute()[0] !== "d") { pendingRerender = false; render(); } }, 400); });
  setInterval(() => { if (document.visibilityState === "visible") syncNow(); }, 60000);
  syncNow();
}
