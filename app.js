/* SP2 Dåsekontrol – app
 * Data gemmes lokalt i IndexedDB ("sp2-daasekontrol"). Databasen må kun udvides:
 * nye versioner må tilføje stores/felter, men aldrig slette eller nulstille.
 */
"use strict";

/* ---------------- Hjælpere ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();
const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("da-DK") + " " + d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let toastT;
function toast(msg, ms = 2200) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }

function dialog(text, buttons) {
  return new Promise((res) => {
    const d = $("#dialog");
    $("#dText").textContent = text;
    const b = $("#dBtns"); b.innerHTML = "";
    buttons.forEach((x) => {
      const el = document.createElement("button");
      el.className = "btn " + (x.cls || "");
      el.textContent = x.label;
      el.onclick = () => { d.hidden = true; res(x.value); };
      b.appendChild(el);
    });
    d.hidden = false;
  });
}
const confirmBox = (text, yes = "Ja", cls = "danger") => dialog(text, [{ label: yes, value: true, cls }, { label: "Annullér", value: false }]);

/* ---------------- Database ---------------- */
const DB_NAME = "sp2-daasekontrol";
let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      // Kun oprettelse – aldrig sletning.
      if (!d.objectStoreNames.contains("regs")) d.createObjectStore("regs", { keyPath: "id" }).createIndex("unit", "unit");
      if (!d.objectStoreNames.contains("photos")) d.createObjectStore("photos", { keyPath: "id" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "key" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function st(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const r = fn(s);
    if (r) r.onsuccess = () => (out = r.result);
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error("Afbrudt"));
  });
}
const dbGetAll = (s) => st(s, "readonly", (o) => o.getAll());
const dbGet = (s, k) => st(s, "readonly", (o) => o.get(k));
const dbPut = (s, v) => st(s, "readwrite", (o) => o.put(v));
const dbDel = (s, k) => st(s, "readwrite", (o) => o.delete(k));
async function metaGet(key, def) { const r = await dbGet("meta", key); return r ? r.value : def; }
async function metaSet(key, value) { await dbPut("meta", { key, value }); }

/* ---------------- Projektdata ---------------- */
const FLOOR_ORDER = ["Kælder", "Stue", "1. sal", "2. sal", "3. sal", "4. sal", "5. sal", "Tag"];
const FLOOR_SHORT = { "Kælder": "kl.", "Stue": "st.", "1. sal": "1.", "2. sal": "2.", "3. sal": "3.", "4. sal": "4.", "5. sal": "5.", "Tag": "tag" };
const TYPES = ["Lampeudtag", "Stikkontakt", "Afbryder", "Netværk", "Generelt", "Andet"];
const DEFAULT_ROOMS = ["Alle rum", "Køkken/alrum", "Stue", "Soveværelse", "Værelse", "Bad", "Gang", "Entré"];
const UNITS = new Map();      // id -> unit
const OPG = new Map();        // opgang-id -> {id,b,floors[],units[]}
const BUILDINGS = window.SP2_BUILDINGS;

(function buildIndex() {
  for (const u of window.SP2_UNITS) {
    u.real = true; u.img = `tegninger/${u.id}.png`;
    UNITS.set(u.id, u);
    if (!OPG.has(u.o)) OPG.set(u.o, { id: u.o, b: u.b, units: [], maxFloor: 1 });
    const o = OPG.get(u.o);
    o.units.push(u);
    for (const f of u.f) o.maxFloor = Math.max(o.maxFloor, FLOOR_ORDER.indexOf(f));
  }
  for (const o of OPG.values()) {
    o.floors = ["Kælder", ...FLOOR_ORDER.slice(1, o.maxFloor + 1), "Tag"];
    for (const f of o.floors) {
      const id = `F|${o.id}|${f}`;
      const name = f === "Kælder" ? "Kælder / fællesareal" : f === "Tag" ? "Tag" : "Trappe / fællesareal";
      UNITS.set(id, { id, b: o.b, o: o.id, f: [f], n: name, k: "", r: [], real: false, img: null });
    }
  }
})();
const unitsOn = (opgId, floor) => {
  const o = OPG.get(opgId);
  // tv. – mf. – th. i den rækkefølge, ellers efter tegningens sidenummer
  const rank = (u) => { const n = unitName(u); return /\btv\./.test(n) ? 0 : /\bmf\./.test(n) ? 1 : /\bth\./.test(n) ? 2 : 3; };
  const list = o.units.filter((u) => u.f.includes(floor)).sort((a, b) => rank(a) - rank(b) || parseInt(a.id.split("-")[1]) - parseInt(b.id.split("-")[1]));
  list.push(UNITS.get(`F|${opgId}|${floor}`));
  return list;
};
const primaryFloor = (u) => u.f[0];
const ovImg = (b) => `tegninger/${b}-2.png`;
const SIG_IMG = "tegninger/signatur.png";
const PLANS = window.SP2_PLANS || [];
const ALL_DRAWINGS = () => [...new Set([...[...UNITS.values()].filter((u) => u.img).map((u) => u.img), ...BUILDINGS.map(ovImg), SIG_IMG, ...PLANS.flatMap((p) => [p.img, p.full])])];
// Etage-/kældertegninger for en opgang og etage
const plansFor = (opgId, floor) => { const o = OPG.get(opgId); return o ? PLANS.filter((p) => p.b.includes(o.b) && p.f.includes(floor)) : []; };
// Knap der åbner en tegning med kontekst (opgang/etage/bolig) til "Tegninger"-menuen i viseren
function drawBtn(cls, label, d, ctx) {
  return `<button class="${cls}" data-draw="${esc(d.src)}" data-dtitle="${esc(d.title)}"${d.full ? ` data-full="${esc(d.full)}"` : ""}${ctx.unit ? ` data-unit="${esc(ctx.unit)}"` : ""}${ctx.opg ? ` data-opg="${esc(ctx.opg)}"` : ""}${ctx.floor ? ` data-floor="${esc(ctx.floor)}"` : ""}>${label}</button>`;
}
const planDraw = (p) => ({ src: p.img, full: p.full, title: `${p.t} (${p.nr})` });
// Bedste tegning for en bolig: boligtegning, ellers etageplan, ellers oversigtsplan
function unitDraw(u) {
  if (u.img) return { src: u.img, title: `${u.o} ${unitName(u)} – side ${u.id}` };
  const p = plansFor(u.o, u.f[0])[0];
  if (p) return planDraw(p);
  return { src: ovImg(u.b), title: `Oversigtsplan ${u.b}` };
}

/* ---------------- Tilstand i hukommelsen ---------------- */
let REGS = new Map(); // id -> reg
let NAMES = {}, CONFIRMED = {}, TAG = {};
async function loadAll() {
  const regs = await dbGetAll("regs");
  REGS = new Map(regs.map((r) => [r.id, normReg(r)]));
  NAMES = await metaGet("names", {});
  CONFIRMED = await metaGet("confirmed", {});
  TAG = await metaGet("tag", {});
}
const unitName = (u) => NAMES[u.id] || u.n;
const isProposed = (u) => u.real && !NAMES[u.id] && !CONFIRMED[u.id];
const regsOf = (unitId) => [...REGS.values()].filter((r) => r.unit === unitId).sort((a, b) => a.created.localeCompare(b.created));
// Ældre registreringer (v1.0–1.2) havde én type i "type" og ingen "anden afvigelse"
function normReg(r) {
  if (!Array.isArray(r.types)) r.types = r.type ? [r.type] : [];
  if (r.devOther === undefined) { r.devOther = false; r.devOtherNote = ""; }
  return r;
}
const isDev = (r) => r.devBox || r.devPipe || r.devOther;
const CHECKS = { devBox: "Afvigelse dåse", devPipe: "Afvigelse rør/udsparing", devOther: "Anden afvigelse" };
function stats(regs) { return { n: regs.length, dev: regs.filter(isDev).length }; }
function statsUnits(units) {
  let n = 0, dev = 0, done = 0;
  for (const u of units) { const s = stats(regsOf(u.id)); n += s.n; dev += s.dev; if (s.n) done++; }
  return { n, dev, done };
}
const opgLabel = (id) => id.includes("-") ? `Opgang ${id}` : `Bygning ${id}`;
const typeParts = (r) => normReg(r).types.map((t) => t === "Andet" ? (r.typeOther ? `Andet: ${r.typeOther}` : "Andet") : t);
const typeLabel = (r) => typeParts(r).join(" + ") || "Ingen type";

/* ---------------- Navigation ---------------- */
function go(hash) { location.hash = hash; }
function parseRoute() {
  const h = decodeURIComponent(location.hash.slice(1) || "/");
  const p = h.split("/").filter(Boolean);
  return p;
}
window.addEventListener("hashchange", render);
const lastFloor = {}; // senest viste etage pr. opgang (bruges for boliger over flere etager)
function parentRoute() {
  const p = parseRoute();
  if (p[0] === "d") {
    const unit = p[1] === "new" ? p.slice(2).join("/") : REGS.get(p[1])?.unit || draft?.unit;
    return unit ? "/u/" + encodeURIComponent(unit) : "/";
  }
  if (p[0] === "u") {
    const u = UNITS.get(p.slice(1).join("/")); if (!u) return "/";
    const f = u.f.includes(lastFloor[u.o]) ? lastFloor[u.o] : u.f[0];
    return `/o/${encodeURIComponent(u.o)}/e/${encodeURIComponent(f)}`;
  }
  if (p[0] === "o" && p[2] === "e") return "/o/" + encodeURIComponent(p[1]);
  if (p[0] === "ov" && p[1]) return "/o/" + encodeURIComponent(p[1]);
  if (p[0] === "rapport" || p[0] === "ov") return "/menu";
  return "/";
}
// Tilbage går ét niveau op (dåse → bolig → etage → opgang → oversigt) i stedet for gennem historikken
$("#btnBack").onclick = () => location.replace("#" + parentRoute());
$("#btnHome").onclick = () => location.replace("#/");
$("#btnMenu").onclick = () => go("/menu");

function setTop(title, sub = "", back = true) {
  $("#title").textContent = title;
  $("#subtitle").textContent = sub;
  $("#btnBack").hidden = !back;
  $("#btnHome").hidden = !back;
  document.title = title === "SP2 Dåsekontrol" ? title : `${title} – SP2`;
}

let renderSeq = 0;
async function render() {
  const p = parseRoute();
  const seq = ++renderSeq;
  const m = $("#main");
  // Gem evt. ufærdige ændringer før skærmen skiftes
  if (draft) { clearTimeout(saveT); try { await saveDraft(); } catch (e) { console.error(e); } if (p[0] !== "d") draft = null; }
  if (seq !== renderSeq) return;
  $("#viewer").hidden = true; $("#photoView").hidden = true;
  window.scrollTo(0, 0);
  try {
    if (p[0] === "o" && p[1] && OPG.has(p[1])) return p[2] === "e" && p[3] ? viewFloor(m, p[1], p[3]) : viewOpgang(m, p[1]);
    if (p[0] === "u" && UNITS.has(p.slice(1).join("/"))) return viewUnit(m, p.slice(1).join("/"));
    if (p[0] === "d" && p[1]) return viewReg(m, p[1], p[2]);
    if (p[0] === "ov") return viewOverview(m, p[1]);
    if (p[0] === "menu") return viewMenu(m);
    if (p[0] === "rapport") return viewReport(m);
    if (p[0] === "materialer") return viewMaterials(m);
    return viewHome(m);
  } catch (e) { console.error(e); m.innerHTML = `<div class="card">Der skete en fejl: ${esc(e.message)}</div>`; }
}

/* ---------------- Forside ---------------- */
async function viewHome(m) {
  const my = renderSeq;
  setTop("SP2 Dåsekontrol", "Stejlepladsen – vælg opgang", false);
  const cached = await countCachedDrawings();
  const nudge = await backupNudge();
  if (my !== renderSeq) return;
  const total = ALL_DRAWINGS().length;
  const mats = await metaGet("materials", {});
  if (my !== renderSeq) return;
  let h = homeSyncHtml() + materialsCardHtml(mats);
  h += `<div class="status small">${cached >= total
    ? `✅ Alle ${total} tegninger er gemt på telefonen.`
    : `Tegninger gemt offline: <b>${cached} / ${total}</b><div class="btnrow"><button class="btn yellow small" id="hHent">Hent alle tegninger</button></div>`}
    ${nudge}</div>`;
  for (const b of BUILDINGS) {
    const ops = [...OPG.values()].filter((o) => o.b === b);
    h += `<h2>Bygning ${b}</h2><div class="grid">`;
    for (const o of ops) {
      const all = []; for (const f of o.floors) all.push(...unitsOn(o.id, f));
      const s = statsUnits([...new Set(all)]);
      h += `<button class="tile" data-go="/o/${encodeURIComponent(o.id)}"><b>${esc(o.id)}</b>
        <span class="sub">${o.units.length} boliger</span>
        <span class="sub">${s.n ? `${s.n} reg.${s.dev ? ` · <span class="badge b-afv">${s.dev} afv.</span>` : ""}` : "Ingen registreringer"}</span></button>`;
    }
    h += `</div>`;
  }
  m.innerHTML = h;
  const hb = $("#hHent"); if (hb) hb.onclick = () => go("/menu");
  bindLoginCard();
}
/* ---------------- Deling: login-kort og status på forsiden ---------------- */
let loginSkipped = false;
function homeSyncHtml() {
  if (!syncConfigured()) return "";
  if (SESSION) return `<div class="small" id="syncLine" style="margin:0 4px 10px">${esc(syncStatusText())}</div>`;
  if (loginSkipped) return `<div class="small" style="margin:0 4px 10px"><button class="chip" id="showLogin">⚪ Ikke forbundet – tryk for at skrive fælles kode</button></div>`;
  return `<div class="card" id="loginCard"><b>Del registreringer med holdet</b>
    <div class="small muted">Skriv den fælles kode én gang. Så ser I hinandens registreringer, navne, tagnoter og materialeliste.</div>
    <label class="lbl" for="lgName">Dit navn</label><input type="text" id="lgName" value="${esc(MY_NAME)}" placeholder="Fx Tommy" autocomplete="name">
    <label class="lbl" for="lgCode">Fælles kode</label><input type="text" id="lgCode" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
    <div class="btnrow"><button class="btn primary" id="lgGo">Forbind</button></div>
    <div class="btnrow"><button class="btn small" id="lgSkip">Ikke nu</button></div>
    <div class="small" id="lgMsg"></div></div>`;
}
function bindLoginCard() {
  const sl = $("#showLogin"); if (sl) sl.onclick = () => { loginSkipped = false; render(); };
  const go_ = $("#lgGo"); if (!go_) return;
  $("#lgSkip").onclick = () => { loginSkipped = true; render(); };
  go_.onclick = async () => {
    const code = $("#lgCode").value.trim(), name = $("#lgName").value.trim();
    if (!code) return toast("Skriv den fælles kode");
    if (!navigator.onLine) return toast("Der skal være dækning første gang");
    go_.disabled = true; $("#lgMsg").textContent = "Forbinder …";
    try { await syncLogin(code, name); toast("Forbundet – deler med holdet"); render(); }
    catch (e) { go_.disabled = false; $("#lgMsg").textContent = e.status === 400 ? "Forkert kode – prøv igen." : "Kunne ikke forbinde: " + e.message; }
  };
}

/* ---------------- Materialeliste ---------------- */
const openMats = (mats) => Object.values(mats).filter((x) => !x.deleted && !x.done).sort((a, b) => a.created.localeCompare(b.created));
function materialsCardHtml(mats) {
  const open = openMats(mats);
  const lines = open.slice(0, 3).map((x) => `<div class="matline">• ${esc(x.text)}</div>`).join("");
  return `<button class="card matcard" data-go="/materialer"><div class="mattitle"><b>Materialeliste</b><span class="count ${open.length ? "has" : ""}">${open.length}</span></div>
    ${lines || `<div class="matline muted">Tom – tryk for at tilføje</div>`}${open.length > 3 ? `<div class="matline muted">+ ${open.length - 3} mere …</div>` : ""}</button>`;
}
function saveMat(item) {
  return locked(async () => {
    const mats = await metaGet("materials", {});
    item.updated = nowIso(); item.dirty = true; mats[item.id] = { ...item };
    await metaSet("materials", mats);
  }).then(() => syncSoon(1500));
}
async function viewMaterials(m) {
  const my = renderSeq;
  setTop("Materialeliste", syncConfigured() ? "Delt med holdet" : "");
  const mats = await metaGet("materials", {});
  if (my !== renderSeq) return;
  const open = openMats(mats);
  const done = Object.values(mats).filter((x) => !x.deleted && x.done).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  const row = (x) => `<div class="matrow">
      <button class="check ${x.done ? "on done" : ""}" data-mtog="${esc(x.id)}"><span class="box">${x.done ? "✓" : ""}</span><span class="mattext">${esc(x.text)}<span class="small muted">${x.by ? esc(x.by) + " · " : ""}${fmtDate(x.created)}</span></span></button>
      <button class="btn danger matdel" data-mdel="${esc(x.id)}" aria-label="Slet">✕</button></div>`;
  m.innerHTML = `
    <div class="matadd"><input type="text" id="matText" placeholder="Fx 100 m PVL 3G1,5, clips, skruer …" enterkeyhint="done" autocomplete="off">
      <button class="btn primary" id="matAdd">Tilføj</button></div>
    <h2>Mangler (${open.length})</h2>
    <div class="list">${open.map(row).join("") || `<p class="muted">Intet på listen.</p>`}</div>
    ${done.length ? `<h2>Afkrydset (${done.length})</h2><div class="list">${done.map(row).join("")}</div>
      <div class="btnrow"><button class="btn small" id="matClear">Ryd afkrydsede</button></div>` : ""}
    ${syncConfigured() ? `<p class="small muted" id="syncLine">${esc(syncStatusText())}</p>` : ""}`;
  const add = async () => {
    const t = $("#matText").value.trim(); if (!t) return $("#matText").focus();
    await saveMat({ id: uid(), text: t, done: false, by: MY_NAME || "", created: nowIso() });
    await viewMaterials(m); $("#matText").focus();
  };
  $("#matAdd").onclick = add;
  $("#matText").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } };
  m.querySelectorAll("[data-mtog]").forEach((b) => b.onclick = async () => { const x = mats[b.dataset.mtog]; x.done = !x.done; await saveMat(x); viewMaterials(m); });
  m.querySelectorAll("[data-mdel]").forEach((b) => b.onclick = async () => { const x = mats[b.dataset.mdel]; x.deleted = true; await saveMat(x); viewMaterials(m); });
  const c = $("#matClear"); if (c) c.onclick = async () => { if (!(await confirmBox(`Slet ${done.length} afkrydsede linjer?`, "Slet"))) return; for (const x of done) { x.deleted = true; await saveMat(x); } viewMaterials(m); };
}

async function backupNudge() {
  if (!REGS.size || (syncConfigured() && SESSION)) return "";
  const last = await metaGet("lastBackup", null);
  const days = last ? (Date.now() - new Date(last)) / 864e5 : 999;
  if (days < 7) return "";
  return `<div style="margin-top:8px">⚠️ ${last ? `Sidste backup: ${fmtDate(last)}.` : "Der er ikke taget backup endnu."} Tag en backup under Menu, så data også findes uden for telefonen.</div>`;
}

/* ---------------- Opgang ---------------- */
async function viewOpgang(m, opgId) {
  const o = OPG.get(opgId);
  setTop(opgLabel(opgId), "Vælg etage");
  let h = `<div class="btnrow"><button class="btn small" data-go="/ov/${encodeURIComponent(opgId)}">Overblik</button>
    <button class="btn small" data-draw="${ovImg(o.b)}" data-dtitle="Oversigtsplan ${o.b}">Oversigtsplan</button></div><div class="list">`;
  for (const f of o.floors) {
    const us = unitsOn(opgId, f);
    const s = statsUnits(us.filter((u) => primaryFloor(u) === f));
    const nb = us.filter((u) => u.real).length;
    h += `<button class="row" data-go="/o/${encodeURIComponent(opgId)}/e/${encodeURIComponent(f)}">
      <div class="main"><div class="name">${esc(f)}</div><div class="sub">${nb ? `${nb} boliger` : "Ingen boliger på tegningerne"}${plansFor(opgId, f).length ? " · 📐 etageplan" : ""}${s.n ? ` · ${s.n} dåser` : ""}${f === "Tag" && TAG[opgId] ? " · har tagnoter" : ""}</div></div>
      ${s.dev ? `<span class="badge b-afv">${s.dev} afv.</span>` : ""}<span class="count ${s.n ? "has" : ""}">${s.n}</span><span class="chev">›</span></button>`;
  }
  h += `</div>${tagNoteHtml(opgId)}`;
  m.innerHTML = h;
  bindTagNote(opgId);
}
function tagNoteHtml(opgId) {
  return `<label class="lbl" for="tagNote">Noter om tag – ${esc(opgId)}</label>
    <textarea id="tagNote" rows="4" placeholder="Fx gennemføringer, rør til solceller, ventilation …">${esc(TAG[opgId] || "")}</textarea>
    <div class="small muted" id="tagSaved">Gemmes automatisk</div>`;
}
function bindTagNote(opgId) {
  const t = $("#tagNote"); if (!t) return;
  let tm;
  t.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { TAG[opgId] = t.value; await metaSet("tag", TAG); markMetaDirty("tag:" + opgId); $("#tagSaved").textContent = "Gemt " + new Date().toLocaleTimeString("da-DK"); }, 400); };
}

/* ---------------- Etage ---------------- */
async function viewFloor(m, opgId, floor) {
  setTop(`${opgId} · ${floor}`, "Vælg bolig");
  lastFloor[opgId] = floor;
  const us = unitsOn(opgId, floor);
  const pl = plansFor(opgId, floor);
  let h = pl.length
    ? `<div class="list" style="margin-bottom:14px">${pl.map((p) => drawBtn("btn", `📐 ${esc(p.s)}`, planDraw(p), { opg: opgId, floor })).join("")}</div>`
    : `<p class="small muted">Ingen etageplan for denne etage i appen endnu.</p>`;
  h += `<div class="list">`;
  for (const u of us) {
    const s = stats(regsOf(u.id));
    const span = u.f.length > 1 && primaryFloor(u) !== floor ? ` · (registreres samlet, start ${primaryFloor(u)})` : "";
    h += `<button class="row" data-go="/u/${encodeURIComponent(u.id)}">
      <div class="main"><div class="name">${esc(unitName(u))} ${isProposed(u) ? `<span class="badge b-prop">foreslået</span>` : ""}</div>
      <div class="sub">${u.real ? `Side ${esc(u.id)} · ${esc(u.k)}${span}` : "Uden boligtegning"}</div></div>
      ${s.dev ? `<span class="badge b-afv">${s.dev} afv.</span>` : ""}<span class="count ${s.n ? "has" : ""}">${s.n}</span><span class="chev">›</span></button>`;
  }
  h += `</div>`;
  if (floor === "Tag") h += tagNoteHtml(opgId);
  m.innerHTML = h;
  if (floor === "Tag") bindTagNote(opgId);
}

/* ---------------- Bolig ---------------- */
async function viewUnit(m, unitId) {
  const u = UNITS.get(unitId);
  setTop(`${u.o} · ${unitName(u)}`, u.real ? `Side ${u.id} · ${u.k}` : u.f[0]);
  const regs = regsOf(unitId);
  let h = `<div class="btnrow"><button class="btn primary" data-go="/d/new/${encodeURIComponent(unitId)}">＋ Ny registrering</button></div>
    <div class="btnrow">${drawBtn("btn", "📐 Tegning", unitDraw(u), { unit: u.id })}</div>`;
  if (u.real) {
    h += `<div class="card"><div><b>Navn:</b> ${esc(unitName(u))} ${isProposed(u) ? `<span class="badge b-prop">foreslået</span>` : ""}</div>
      <div class="small muted">Tegningen viser ikke tv./th. – tjek på stedet og ret navnet hvis det er forkert.</div>
      <div class="btnrow"><button class="btn small" id="uRename">Ret navn</button>${isProposed(u) ? `<button class="btn small" id="uConfirm">Navnet er rigtigt</button>` : ""}</div>
      <div id="renameBox" hidden><input type="text" id="uName" value="${esc(unitName(u))}" autocomplete="off">
      <div class="btnrow"><button class="btn primary small" id="uSave">Gem navn</button><button class="btn small" id="uReset">Brug forslag (${esc(u.n)})</button></div></div></div>`;
  }
  if (u.f.includes("Tag")) h += tagNoteHtml(u.o);
  h += `<h2>Registreringer (${regs.length})</h2>`;
  if (!regs.length) h += `<p class="muted">Ingen registreringer endnu.</p>`;
  h += `<div class="list">`;
  regs.forEach((r, i) => {
    h += `<button class="row" data-go="/d/${encodeURIComponent(r.id)}"><div class="main">
      <div class="name">Registrering ${i + 1} · ${esc(typeLabel(r))}</div>
      <div class="sub">${esc(r.room || "Intet rum angivet")} · ${r.photos.length} billede${r.photos.length === 1 ? "" : "r"}${r.by ? ` · ${esc(r.by)}` : ""}</div>
      <div>${r.devBox ? `<span class="badge b-afv">Afv. dåse</span>` : `<span class="badge b-ok">Dåse OK</span>`}${r.devPipe ? `<span class="badge b-afv">Afv. rør/udsp.</span>` : `<span class="badge b-ok">Rør/udsp. OK</span>`}${r.devOther ? `<span class="badge b-afv">Anden afv.</span>` : ""}</div>
      </div><span class="chev">›</span></button>`;
  });
  h += `</div>`;
  m.innerHTML = h;
  if (u.f.includes("Tag")) bindTagNote(u.o);
  if (u.real) {
    $("#uRename").onclick = () => { $("#renameBox").hidden = false; $("#uName").focus(); };
    const c = $("#uConfirm"); if (c) c.onclick = async () => { CONFIRMED[u.id] = true; await metaSet("confirmed", CONFIRMED); markMetaDirty("conf:" + u.id); render(); };
    $("#uSave").onclick = async () => {
      const v = $("#uName").value.trim();
      if (!v) return toast("Skriv et navn");
      if (v === u.n) { delete NAMES[u.id]; CONFIRMED[u.id] = true; } else NAMES[u.id] = v;
      await metaSet("names", NAMES); await metaSet("confirmed", CONFIRMED); markMetaDirty("name:" + u.id); markMetaDirty("conf:" + u.id); toast("Navn gemt"); render();
    };
    $("#uReset").onclick = async () => { delete NAMES[u.id]; delete CONFIRMED[u.id]; await metaSet("names", NAMES); await metaSet("confirmed", CONFIRMED); markMetaDirty("name:" + u.id); markMetaDirty("conf:" + u.id); render(); };
  }
}

/* ---------------- Dåse (registrering) ---------------- */
let draft = null; // registrering under redigering
function blankReg(unitId) {
  const u = UNITS.get(unitId);
  return { id: uid(), unit: unitId, opg: u.o, floor: u.f[0], type: "", types: [], typeOther: "", room: "", devBox: false, devBoxNote: "", devPipe: false, devPipeNote: "", devOther: false, devOtherNote: "", photos: [], by: MY_NAME || "", created: nowIso(), updated: nowIso(), saved: false };
}
const regHasContent = (r) => r.types.length || r.room.trim() || r.devBox || r.devPipe || r.devOther || r.devBoxNote.trim() || r.devPipeNote.trim() || r.devOtherNote.trim() || r.photos.length;
async function saveDraft() {
  if (!draft) return;
  if (!draft.saved && !regHasContent(draft)) return;
  draft.updated = nowIso(); draft.saved = true;
  draft.type = draft.types.join(", "); // læsbar tekst til ældre versioner/backup
  const copy = { ...draft, photos: [...draft.photos], types: [...draft.types], dirty: true };
  REGS.set(copy.id, copy);
  await dbPut("regs", copy);
  syncSoon();
  const p = parseRoute();
  if (p[0] === "d" && p[1] === "new") history.replaceState(null, "", "#/d/" + encodeURIComponent(draft.id));
}
let saveT;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveDraft, 300); }

async function viewReg(m, idOrNew, unitArg) {
  if (idOrNew === "new") {
    if (!UNITS.has(unitArg)) return go("/");
    if (!draft || draft.unit !== unitArg || draft.saved) draft = blankReg(unitArg);
  } else {
    const r = REGS.get(idOrNew);
    if (!r) { m.innerHTML = `<div class="card">Registreringen findes ikke (måske slettet).</div>`; return; }
    if (!draft || draft.id !== r.id) { normReg(r); draft = { ...r, photos: [...r.photos], types: [...r.types] }; }
  }
  const r = draft, u = UNITS.get(r.unit);
  const idx = regsOf(u.id).findIndex((x) => x.id === r.id);
  setTop(`${u.o} · ${unitName(u)}`, idx >= 0 ? `Registrering ${idx + 1}` : "Ny registrering");
  const rooms = [...new Set(["Alle rum", ...u.r, ...DEFAULT_ROOMS, ...regsOf(u.id).map((x) => x.room).filter(Boolean)])];
  m.innerHTML = `
    <label class="lbl">Type <span class="small muted">(vælg en eller flere)</span></label>
    <div class="types">${TYPES.map((t) => `<button class="typebtn ${r.types.includes(t) ? "on" : ""}" data-type="${t}">${t}</button>`).join("")}</div>
    <div id="otherBox" ${r.types.includes("Andet") ? "" : "hidden"}><label class="lbl" for="fOther">Hvilken type?</label>
      <input type="text" id="fOther" value="${esc(r.typeOther)}" autocomplete="off"></div>
    <label class="lbl" for="fRoom">Rum</label>
    <input type="text" id="fRoom" value="${esc(r.room)}" placeholder="Fx Køkken/alrum" autocomplete="off">
    <div class="chips">${rooms.map((x) => `<button class="chip ${r.room === x ? "on" : ""}" data-room="${esc(x)}">${esc(x)}</button>`).join("")}</div>

    <label class="lbl">Kontrol</label>
    <div class="devblock">${checkHtml("devBox", "Afvigelse dåse", r.devBox)}
      <textarea id="fBoxNote" placeholder="Note om dåsen">${esc(r.devBoxNote)}</textarea></div>
    <div class="devblock">${checkHtml("devPipe", CHECKS.devPipe, r.devPipe)}
      <textarea id="fPipeNote" placeholder="Note om rør/udsparing">${esc(r.devPipeNote)}</textarea></div>
    <div class="devblock">${checkHtml("devOther", CHECKS.devOther, r.devOther)}
      <textarea id="fOtherNote" placeholder="Note om anden afvigelse">${esc(r.devOtherNote)}</textarea></div>

    <label class="lbl">Billeder (${r.photos.length})</label>
    <div class="thumbs" id="thumbs"></div>
    <div class="btnrow">
      <button class="btn yellow" id="bPhoto">📷 Tilføj billede</button>
      ${drawBtn("btn", "📐 Tegning", unitDraw(u), { unit: u.id })}
    </div>
    <input type="file" id="fFile" accept="image/*" capture="environment" hidden>
    <div id="photoBusy" class="small" hidden><span class="spinner"></span> Komprimerer billede …</div>

    <div class="btnrow" style="margin-top:22px"><button class="btn primary" id="bDone">Færdig</button></div>
    <div class="btnrow"><button class="btn" id="bNext">Gem og ny registrering</button></div>
    <div class="btnrow"><button class="btn danger small" id="bDel">Slet denne registrering</button></div>
    <p class="small muted">Alt gemmes automatisk på telefonen.</p>`;
  renderThumbs();

  m.querySelectorAll("[data-type]").forEach((b) => b.onclick = () => {
    const t = b.dataset.type;
    r.types = r.types.includes(t) ? r.types.filter((x) => x !== t) : TYPES.filter((x) => x === t || r.types.includes(x));
    b.classList.toggle("on", r.types.includes(t));
    $("#otherBox").hidden = !r.types.includes("Andet");
    if (t === "Andet" && r.types.includes("Andet")) $("#fOther").focus();
    saveSoon();
  });
  $("#fOther").oninput = (e) => { r.typeOther = e.target.value; saveSoon(); };
  $("#fRoom").oninput = (e) => { r.room = e.target.value; m.querySelectorAll("[data-room]").forEach((x) => x.classList.toggle("on", x.dataset.room === r.room)); saveSoon(); };
  m.querySelectorAll("[data-room]").forEach((b) => b.onclick = () => { r.room = b.dataset.room; $("#fRoom").value = r.room; m.querySelectorAll("[data-room]").forEach((x) => x.classList.toggle("on", x === b)); saveSoon(); });
  viewRegRebindChecks(m, r);
  $("#fBoxNote").oninput = (e) => { r.devBoxNote = e.target.value; saveSoon(); };
  $("#fPipeNote").oninput = (e) => { r.devPipeNote = e.target.value; saveSoon(); };
  $("#fOtherNote").oninput = (e) => { r.devOtherNote = e.target.value; saveSoon(); };
  $("#bPhoto").onclick = () => $("#fFile").click();
  $("#fFile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    $("#photoBusy").hidden = false;
    try {
      const blob = await compressImage(f);
      const pid = uid();
      await dbPut("photos", { id: pid, reg: r.id, blob, created: nowIso() });
      r.photos.push(pid);
      await saveDraft();
      renderThumbs();
      toast(`Billede gemt (${Math.round(blob.size / 1024)} kB)`);
    } catch (err) { console.error(err); toast("Kunne ikke gemme billedet: " + err.message, 4000); }
    $("#photoBusy").hidden = true;
  };
  $("#bDone").onclick = async () => { await saveDraft(); const uidd = r.unit; draft = null; go("/u/" + encodeURIComponent(uidd)); };
  $("#bNext").onclick = async () => {
    if (!regHasContent(r)) return toast("Udfyld mindst type, rum eller billede");
    await saveDraft(); const uidd = r.unit; draft = blankReg(uidd);
    history.replaceState(null, "", "#/d/new/" + encodeURIComponent(uidd)); render(); toast("Gemt – klar til næste registrering");
  };
  $("#bDel").onclick = async () => {
    if (!(await confirmBox("Slet denne registrering og dens billeder?", "Slet registrering"))) return;
    if (REGS.has(r.id)) { for (const pid of r.photos) await dbDel("photos", pid); await dbDel("regs", r.id); REGS.delete(r.id); if (syncConfigured()) await markRegDeleted(r.id); }
    const uidd = r.unit; draft = null; toast("Registrering slettet");
    go("/u/" + encodeURIComponent(uidd));
  };
}
function checkHtml(key, label, on) {
  return `<button class="check ${on ? "on" : ""}" data-check="${key}"><span class="box">${on ? "✓" : ""}</span>${label}<span class="state">${on ? "AFVIGELSE" : "OK"}</span></button>`;
}
function viewRegRebindChecks(m, r) {
  m.querySelectorAll("[data-check]").forEach((b) => b.onclick = () => {
    const k = b.dataset.check; r[k] = !r[k];
    b.outerHTML = checkHtml(k, CHECKS[k], r[k]);
    viewRegRebindChecks(m, r); saveSoon();
  });
}
const thumbUrls = [];
async function renderThumbs() {
  const box = $("#thumbs"); if (!box || !draft) return;
  thumbUrls.splice(0).forEach(URL.revokeObjectURL);
  box.innerHTML = "";
  for (const pid of draft.photos) {
    const p = await getPhoto(pid);
    if (!p) { const b = document.createElement("button"); b.innerHTML = `<span class="small muted">Billedet hentes, når der er dækning</span>`; box.appendChild(b); continue; }
    const url = URL.createObjectURL(p.blob); thumbUrls.push(url);
    const b = document.createElement("button");
    b.innerHTML = `<img src="${url}" alt="Billede">`;
    b.onclick = () => openPhoto(pid, url);
    box.appendChild(b);
  }
  const l = box.previousElementSibling; if (l) l.textContent = `Billeder (${draft.photos.length})`;
}
function openPhoto(pid, url) {
  const v = $("#photoView"); $("#pvImg").src = url; v.hidden = false;
  $("#pvClose").onclick = () => (v.hidden = true);
  $("#pvDelete").onclick = async () => {
    if (!(await confirmBox("Slet dette billede?", "Slet billede"))) return;
    draft.photos = draft.photos.filter((x) => x !== pid);
    await dbDel("photos", pid); await saveDraft(); v.hidden = true; renderThumbs();
  };
}

/* Komprimering: længste side max 1600 px, JPEG kvalitet 0,7 (typisk 150–350 kB) */
async function compressImage(file, maxSide = 1600, q = 0.7) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    let w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, maxSide / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
    c.width = c.height = 0;
    if (!blob) throw new Error("Billedet kunne ikke komprimeres");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

/* ---------------- Overblik ---------------- */
async function viewOverview(m, opgId) {
  if (opgId && OPG.has(opgId)) {
    const o = OPG.get(opgId);
    setTop(`Overblik ${opgId}`, "Pr. etage og bolig");
    let h = "";
    for (const f of o.floors) {
      const us = unitsOn(opgId, f).filter((u) => primaryFloor(u) === f);
      const s = statsUnits(us);
      h += `<h3>${esc(f)} – ${s.n} registreringer${s.dev ? `, <span class="badge b-afv">${s.dev} afv.</span>` : ""}</h3>
        <div class="tablewrap"><table class="sumtable"><tr><th>Bolig</th><th>Reg.</th><th>Afv.</th><th>Typer</th></tr>`;
      for (const u of us) {
        const regs = regsOf(u.id), su = stats(regs);
        const types = {}; regs.forEach((r) => typeParts(r).forEach((t) => { types[t] = (types[t] || 0) + 1; }));
        h += `<tr data-go="/u/${encodeURIComponent(u.id)}"><td><b>${esc(unitName(u))}</b>${isProposed(u) ? " <span class='badge b-prop'>foreslået</span>" : ""}<div class="small muted">${u.real ? "Side " + esc(u.id) : ""}</div></td>
          <td class="n">${su.n || "–"}</td><td class="n">${su.dev ? `<span class="badge b-afv">${su.dev}</span>` : "–"}</td>
          <td class="small">${Object.entries(types).map(([t, n]) => `${esc(t)} ${n}`).join(", ")}</td></tr>`;
      }
      h += `</table></div>`;
    }
    h += tagNoteHtml(opgId);
    m.innerHTML = h; bindTagNote(opgId);
    return;
  }
  setTop("Overblik", "Alle opgange");
  let h = `<p class="small muted">Tryk på en opgang for detaljer.</p><div class="tablewrap"><table class="sumtable"><tr><th>Opgang</th>${FLOOR_ORDER.map((f) => `<th>${FLOOR_SHORT[f]}</th>`).join("")}<th>I alt</th></tr>`;
  for (const o of OPG.values()) {
    let tot = { n: 0, dev: 0 };
    h += `<tr data-go="/ov/${encodeURIComponent(o.id)}"><td><b>${esc(o.id)}</b></td>`;
    for (const f of FLOOR_ORDER) {
      if (!o.floors.includes(f)) { h += `<td class="n muted">·</td>`; continue; }
      const s = statsUnits(unitsOn(o.id, f).filter((u) => primaryFloor(u) === f));
      tot.n += s.n; tot.dev += s.dev;
      h += `<td class="n">${s.n ? s.n : "–"}${s.dev ? `<br><span class="badge b-afv">${s.dev}</span>` : ""}</td>`;
    }
    h += `<td class="n"><b>${tot.n}</b>${tot.dev ? `<br><span class="badge b-afv">${tot.dev}</span>` : ""}</td></tr>`;
  }
  h += `</table></div><p class="small muted">Tal = antal registreringer. Rødt = antal med afvigelse.</p>`;
  m.innerHTML = h;
}

/* ---------------- Menu ---------------- */
async function viewMenu(m) {
  const my = renderSeq;
  setTop("Menu", "");
  const total = ALL_DRAWINGS().length, cached = await countCachedDrawings();
  const last = await metaGet("lastBackup", null);
  let est = "";
  try { if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); est = `Brugt plads: ${(e.usage / 1e6).toFixed(0)} MB${e.quota ? ` af ca. ${(e.quota / 1e9).toFixed(1)} GB` : ""}`; } } catch {}
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  if (my !== renderSeq) return;
  m.innerHTML = `
    <h2>Offline</h2>
    <div class="card"><div>Tegninger på telefonen: <b id="cCount">${cached} / ${total}</b></div>
      <progress id="cProg" max="${total}" value="${cached}"></progress>
      <div class="btnrow"><button class="btn yellow" id="mHent">Hent alle tegninger (ca. 50 MB)</button></div>
      <div class="small muted">Gør det på wifi. Appen selv gemmes automatisk. ${esc(est)}${persisted ? " · Lagring er markeret som varig." : ""}</div></div>
    ${syncConfigured() ? `<h2>Deling med holdet</h2>
    <div class="card"><div id="syncLine">${esc(syncStatusText())}</div>
      ${SESSION ? `<div class="small muted" style="margin-top:6px">Dit navn: <b>${esc(MY_NAME || "ikke angivet")}</b></div>
      <div class="btnrow"><button class="btn small primary" id="mSync">Del nu</button><button class="btn small" id="mName">Skift navn</button></div>
      <div class="btnrow"><button class="btn small danger" id="mLogout">Afbryd deling på denne telefon</button></div>`
      : `<div class="btnrow"><button class="btn small primary" data-go="/">Skriv fælles kode på forsiden</button></div>`}</div>` : ""}
    <h2>Overblik og rapport</h2>
    <div class="list">
      <button class="btn" data-go="/ov">Overblik – alle opgange</button>
      <button class="btn" data-go="/rapport">Rapport (print / PDF)</button>
      <button class="btn" id="mCsv">Eksportér CSV</button>
    </div>
    <h2>Backup</h2>
    <div class="card small">${last ? `Sidste backup: <b>${fmtDate(last)}</b>` : "Der er ikke taget backup endnu."}<br>
      Backup-filen indeholder alle registreringer, navne, tagnoter og billeder. Gem den i Filer/iCloud eller send den på mail.</div>
    <div class="list">
      <button class="btn primary" id="mBackup">Tag backup (fil)</button>
      <button class="btn" id="mRestore">Gendan fra backup-fil</button>
      <input type="file" id="mRestoreFile" accept=".zip,application/zip" hidden>
    </div>
    <h2>Om</h2>
    <div class="card small">SP2 Dåsekontrol · version <b id="mVer">…</b><br>
      ${REGS.size} registreringer i alt.<br>Tegninger: Artelia N930 (I1, J1, J2, K1, K3) og N931 rev. 1 (F1, F2, F3, F5, F6).
      <div class="btnrow"><button class="btn small" id="mUpd">Søg efter ny version</button></div></div>`;
  swVersion().then((v) => { const e = $("#mVer"); if (e) e.textContent = v || "ukendt"; });
  $("#mHent").onclick = downloadAll;
  const ms = $("#mSync"); if (ms) ms.onclick = () => syncNow();
  const mn = $("#mName"); if (mn) mn.onclick = async () => { const v = prompt("Dit navn (vises ved dine registreringer og materialer)", MY_NAME); if (v !== null) { MY_NAME = v.trim(); await metaSet("myName", MY_NAME); render(); } };
  const ml = $("#mLogout"); if (ml) ml.onclick = async () => { if (await confirmBox("Afbryd deling på denne telefon? Dine registreringer bliver liggende her. Ændringer, der ikke er delt endnu, bliver først delt, når koden skrives igen.", "Afbryd deling")) { await syncLogout(); render(); } };
  $("#mCsv").onclick = exportCsv;
  $("#mBackup").onclick = makeBackup;
  $("#mRestore").onclick = () => $("#mRestoreFile").click();
  $("#mRestoreFile").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) restoreBackup(f); };
  $("#mUpd").onclick = async () => { const r = await navigator.serviceWorker?.getRegistration(); if (!r) return toast("Ikke tilgængelig her"); await r.update().catch(() => {}); setTimeout(() => toast(r.waiting ? "Ny version fundet" : "Du har den nyeste version"), 1500); };
}

/* ---------------- Offline: tegninger ---------------- */
const DRAW_CACHE = "sp2-tegninger-v1";
async function countCachedDrawings() {
  if (!("caches" in window)) return 0;
  try { const c = await caches.open(DRAW_CACHE); const keys = await c.keys(); const want = new Set(ALL_DRAWINGS().map((x) => new URL(x, location.href).href)); return keys.filter((k) => want.has(k.url.split("?")[0])).length; } catch { return 0; }
}
let downloading = false;
async function downloadAll() {
  if (downloading) return;
  if (!("caches" in window)) return toast("Browseren understøtter ikke offline-lagring");
  downloading = true;
  try { await navigator.storage?.persist?.(); } catch {}
  const btn = $("#mHent"); if (btn) { btn.disabled = true; btn.textContent = "Henter …"; }
  const c = await caches.open(DRAW_CACHE);
  const list = ALL_DRAWINGS();
  const have = new Set((await c.keys()).map((k) => k.url.split("?")[0]));
  const todo = list.filter((x) => !have.has(new URL(x, location.href).href));
  let done = list.length - todo.length, failed = 0;
  const upd = () => { const p = $("#cProg"), t = $("#cCount"); if (p) p.value = done; if (t) t.textContent = `${done} / ${list.length}`; };
  upd();
  let i = 0;
  async function worker() {
    while (i < todo.length) {
      const url = todo[i++];
      try { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw 0; await c.put(url, r); done++; } catch { failed++; }
      upd();
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  downloading = false;
  if (btn) { btn.disabled = false; btn.textContent = "Hent alle tegninger (ca. 50 MB)"; }
  toast(failed ? `${failed} tegninger kunne ikke hentes – prøv igen med bedre dækning` : "Alle tegninger er gemt på telefonen", 3500);
}

/* ---------------- Tegningsviser (pinch-zoom på canvas = altid skarp) ---------------- */
const V = { img: null, mip: null, s: 1, tx: 0, ty: 0, rot: 0, pts: new Map(), raf: 0, lastTap: 0, ctx: {}, base: null, cur: null };
document.addEventListener("click", (e) => {
  const d = e.target.closest("[data-draw]");
  if (d) { e.preventDefault(); const ds = d.dataset; openDrawing({ src: ds.draw, title: ds.dtitle, full: ds.full }, { unit: ds.unit, opg: ds.opg, floor: ds.floor }); return; }
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); go(g.dataset.go); }
});
async function openDrawing(d, ctx) {
  $("#viewer").hidden = false;
  if (ctx) V.ctx = ctx;
  V.base = d; V.whole = false;
  $("#vtitle").textContent = d.title || "";
  await loadImg(d.src);
}
// Tegninger der hører til det, man står i: bolig, etageplan(er), oversigtsplan, signatur
function relatedDrawings() {
  const u = V.ctx.unit && UNITS.get(V.ctx.unit);
  const opg = V.ctx.opg || u?.o;
  const floors = V.ctx.floor ? [V.ctx.floor] : u ? u.f : [];
  const out = [];
  if (u?.img) out.push({ src: u.img, title: `${u.o} ${unitName(u)} – side ${u.id}`, label: `Bolig: ${unitName(u)} (side ${u.id})` });
  for (const f of floors) for (const p of plansFor(opg, f)) out.push({ ...planDraw(p), label: p.s });
  const b = OPG.get(opg)?.b || u?.b;
  if (b) out.push({ src: ovImg(b), title: `Oversigtsplan ${b}`, label: `Oversigtsplan bygning ${b}` });
  out.push({ src: SIG_IMG, title: "Signaturforklaring", label: "Signaturforklaring (boliger)" });
  return out;
}
async function loadImg(src) {
  if (V.cur === src && V.img) { fitView(); return; }
  V.cur = src; V.img = null; V.mip = null; V.rot = 0;
  const msg = $("#vmsg"); msg.hidden = false; msg.innerHTML = `<span class="spinner"></span> Åbner tegning …`;
  draw();
  try {
    const img = new Image(); img.decoding = "async"; img.src = src; await img.decode();
    if (V.cur !== src) return;
    V.img = img;
    // Nedskaleret udgave til oversigtsvisning (pænere og hurtigere når der er zoomet ud)
    const k = 0.25, c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height);
    V.mip = c;
    msg.hidden = true; fitView();
  } catch (e) {
    msg.innerHTML = `Tegningen kunne ikke åbnes.<br>${navigator.onLine ? "" : "Du er offline, og tegningen er ikke hentet. "}Brug <b>Menu → Hent alle tegninger</b> når du har dækning.`;
  }
}
function vSize() { const c = $("#vcanvas"); const r = c.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  return { W: r.width, H: r.height, dpr }; }
function contentSize() { const w = V.img.naturalWidth, h = V.img.naturalHeight; return V.rot % 2 ? { cw: h, ch: w } : { cw: w, ch: h }; }
function fitScale() { const { W, H } = vSize(); const { cw, ch } = contentSize(); return Math.min(W / cw, H / ch); }
// Udsnit (0–1) af tegningen der indeholder selve planen – uden titelfelt
function planRect() {
  const f = window.SP2_FIT && window.SP2_FIT[(V.cur || "").split("/").pop().replace(".png", "")];
  const w = V.img.naturalWidth, h = V.img.naturalHeight;
  if (!f || V.whole) return [0, 0, ...Object.values(contentSize())];
  const u0 = f[0] * w, v0 = f[1] * h, u1 = f[2] * w, v1 = f[3] * h;
  if (V.rot === 1) return [h - v1, u0, h - v0, u1];
  if (V.rot === 2) return [w - u1, h - v1, w - u0, h - v0];
  if (V.rot === 3) return [v0, w - u1, v1, w - u0];
  return [u0, v0, u1, v1];
}
function fitView() {
  if (!V.img) return;
  const { W, H } = vSize(); const [x0, y0, x1, y1] = planRect();
  V.s = Math.min(W / (x1 - x0), H / (y1 - y0));
  V.tx = (W - (x1 - x0) * V.s) / 2 - x0 * V.s; V.ty = (H - (y1 - y0) * V.s) / 2 - y0 * V.s;
  const b = $("#vFitBtn"); if (b) b.textContent = V.whole ? "Udsnit" : "Hele ark";
  draw();
}
function draw() { cancelAnimationFrame(V.raf); V.raf = requestAnimationFrame(paint); }
function paint() {
  const c = $("#vcanvas"); const { W, H, dpr } = vSize(); const x = c.getContext("2d");
  x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  if (!V.img) return;
  const w = V.img.naturalWidth, h = V.img.naturalHeight;
  x.setTransform(dpr * V.s, 0, 0, dpr * V.s, dpr * V.tx, dpr * V.ty);
  if (V.rot === 1) { x.translate(h, 0); x.rotate(Math.PI / 2); }
  else if (V.rot === 2) { x.translate(w, h); x.rotate(Math.PI); }
  else if (V.rot === 3) { x.translate(0, w); x.rotate(-Math.PI / 2); }
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  if (V.mip && V.s * dpr < 0.3) x.drawImage(V.mip, 0, 0, w, h); else x.drawImage(V.img, 0, 0);
}
function clampScale(s) { const f = fitScale(); return Math.max(f * 0.8, Math.min(s, 3)); }
function zoomAt(px, py, ns) { ns = clampScale(ns); const k = ns / V.s; V.tx = px - (px - V.tx) * k; V.ty = py - (py - V.ty) * k; V.s = ns; draw(); }
(function bindViewer() {
  const c = $("#vcanvas");
  const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  let prev = null;
  const state = () => { const p = [...V.pts.values()]; if (p.length >= 2) return { cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) }; if (p.length === 1) return { cx: p[0].x, cy: p[0].y, d: 0 }; return null; };
  c.addEventListener("pointerdown", (e) => {
    c.setPointerCapture(e.pointerId); V.pts.set(e.pointerId, pos(e)); prev = state();
    if (V.pts.size === 1) {
      const t = Date.now(), p = pos(e);
      if (t - V.lastTap < 300 && V.img) { const s0 = V.s; fitView(); if (s0 <= V.s * 1.2) zoomAt(p.x, p.y, V.s * 2.5); V.lastTap = 0; }
      else V.lastTap = t;
    }
  });
  c.addEventListener("pointermove", (e) => {
    if (!V.pts.has(e.pointerId) || !V.img) return;
    V.pts.set(e.pointerId, pos(e)); const s = state(); if (!s || !prev) { prev = s; return; }
    if (s.d && prev.d) { const ns = clampScale(V.s * (s.d / prev.d)); const k = ns / V.s; V.tx = s.cx - (prev.cx - V.tx) * k; V.ty = s.cy - (prev.cy - V.ty) * k; V.s = ns; }
    else { V.tx += s.cx - prev.cx; V.ty += s.cy - prev.cy; }
    prev = s; draw();
  });
  const up = (e) => { V.pts.delete(e.pointerId); prev = state(); };
  c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
  c.addEventListener("wheel", (e) => { e.preventDefault(); if (!V.img) return; const p = pos(e); zoomAt(p.x, p.y, V.s * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  ["gesturestart", "gesturechange"].forEach((n) => c.addEventListener(n, (e) => e.preventDefault()));
  window.addEventListener("resize", () => { if (!$("#viewer").hidden) fitView(); });
  $("#viewer").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]"); if (!b) return;
    const a = b.dataset.v;
    if (a === "close") { $("#viewer").hidden = true; V.pts.clear(); }
    if (a === "fit") {
      V.whole = !V.whole;
      // Etage-/kældertegninger: skift mellem skarpt udsnit og hele arket (med signaturer og titelfelt)
      if (V.base?.full) loadImg(V.whole ? V.base.full : V.base.src); else fitView();
    }
    if (a === "rot" && V.img) { V.rot = (V.rot + 1) % 4; fitView(); }
    if (a === "list") {
      const list = relatedDrawings();
      dialog("Vælg tegning", [...list.map((d, i) => ({ label: (d.src === V.base?.src ? "● " : "") + d.label, value: i, cls: d.src === V.base?.src ? "primary" : "" })), { label: "Annullér", value: null }])
        .then((i) => { if (i !== null && i !== undefined) openDrawing(list[i]); });
    }
  });
})();

/* ---------------- CSV ---------------- */
function allRegsSorted(filterOpg) {
  const order = [...UNITS.keys()];
  return [...REGS.values()].filter((r) => !filterOpg || r.opg === filterOpg)
    .sort((a, b) => order.indexOf(a.unit) - order.indexOf(b.unit) || a.created.localeCompare(b.created));
}
async function exportCsv() {
  const q = (v) => { v = String(v ?? ""); return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const rows = [["Bygning", "Opgang", "Etage", "Bolig", "Navn foreslået", "Tegning side", "Registrering nr.", "Type", "Rum", "Dåse", "Note dåse", "Rør/udsparing", "Note rør/udsparing", "Anden afvigelse", "Note anden afvigelse", "Antal billeder", "Registreret af", "Oprettet", "Senest ændret"]];
  const counters = {};
  for (const r of allRegsSorted()) {
    const u = UNITS.get(r.unit); counters[r.unit] = (counters[r.unit] || 0) + 1;
    rows.push([u.b, u.o, u.f.join("–"), unitName(u), isProposed(u) ? "ja" : "", u.real ? u.id : "", counters[r.unit], typeLabel(r), r.room,
      r.devBox ? "AFVIGELSE" : "OK", r.devBoxNote, r.devPipe ? "AFVIGELSE" : "OK", r.devPipeNote, r.devOther ? "AFVIGELSE" : "", r.devOtherNote, r.photos.length, r.by || "", fmtDate(r.created), fmtDate(r.updated)]);
  }
  rows.push([]); rows.push(["Tagnoter"]);
  for (const [o, t] of Object.entries(TAG)) if (t && t.trim()) rows.push(["", o, "Tag", "", "", "", "", "", "", "", t]);
  const csv = "﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n");
  await offerFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), `SP2-daasekontrol-${today()}.csv`, `CSV med ${REGS.size} registreringer er klar.`);
}

/* Filudlevering: del-ark på iPhone, ellers download */
async function offerFile(blob, name, text) {
  const file = new File([blob], name, { type: blob.type });
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  const choice = await dialog(`${text}\n${name} (${(blob.size / 1e6).toFixed(1)} MB)`,
    [...(canShare ? [{ label: "Del / gem i Filer", value: "share", cls: "primary" }] : []), { label: "Download", value: "dl", cls: canShare ? "" : "primary" }, { label: "Luk", value: null }]);
  if (choice === "share") { try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e.name !== "AbortError") toast("Deling mislykkedes – prøv Download"); return false; } }
  if (choice === "dl") { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000); return true; }
  return false;
}

/* ---------------- Rapport ---------------- */
let repUrls = [];
async function viewReport(m) {
  const my = renderSeq;
  setTop("Rapport", "Print eller gem som PDF");
  const saved = await metaGet("repOpts", {});
  const opts = { opg: saved.opg || "", photos: saved.photos || "dev", cats: saved.cats || { devBox: true, devPipe: true, devOther: true }, withOk: saved.withOk ?? !saved.onlyDev };
  if (my !== renderSeq) return;
  const chk = (id, label, on) => `<button class="check ${on ? "on" : ""}" id="${id}"><span class="box">${on ? "✓" : ""}</span>${label}</button>`;
  m.innerHTML = `
    <label class="lbl" for="rOpg">Omfang</label>
    <select id="rOpg"><option value="">Alle opgange</option>${[...OPG.keys()].map((o) => `<option ${opts.opg === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
    <label class="lbl">Afvigelser i rapporten</label>
    <div class="list">${Object.entries(CHECKS).map(([k, l]) => chk("rc-" + k, l, opts.cats[k])).join("")}</div>
    <label class="lbl">Øvrige registreringer</label>
    ${chk("rOk", "Medtag også registreringer uden afvigelse", opts.withOk)}
    <label class="lbl" for="rPh">Billeder</label>
    <select id="rPh"><option value="none">Ingen billeder</option><option value="dev">Kun ved afvigelser</option><option value="all">Alle billeder</option></select>
    <div class="btnrow" style="margin-top:18px"><button class="btn primary" id="rPrint">Udskriv / gem som PDF</button></div>
    <div class="btnrow"><button class="btn" id="rFile">Gem rapport som fil (HTML)</button></div>
    <p class="small muted">På iPhone: tryk Udskriv, knib ud på forhåndsvisningen eller vælg Del → Gem i Filer for at få en PDF. Virker print ikke i appen, så brug "Gem rapport som fil" og åbn den i Safari.</p>
    <div class="reppreview" id="rPrev"></div>`;
  $("#rPh").value = opts.photos;
  const on = (id) => $("#" + id).classList.contains("on");
  const read = () => ({ opg: $("#rOpg").value, photos: $("#rPh").value, withOk: on("rOk"), cats: Object.fromEntries(Object.keys(CHECKS).map((k) => [k, on("rc-" + k)])) });
  const refresh = async () => { const o = read(); await metaSet("repOpts", o); $("#rPrev").innerHTML = await reportHtml(o, false); };
  $("#rOpg").onchange = refresh; $("#rPh").onchange = refresh;
  m.querySelectorAll("[id^=rc-], #rOk").forEach((b) => b.onclick = () => { b.classList.toggle("on"); b.querySelector(".box").textContent = b.classList.contains("on") ? "✓" : ""; refresh(); });
  $("#rPrint").onclick = async () => {
    const p = $("#print"); p.innerHTML = await reportHtml(read(), false);
    await Promise.all([...p.querySelectorAll("img")].map((i) => i.decode().catch(() => {})));
    window.print();
  };
  $("#rFile").onclick = async () => {
    toast("Laver rapport …");
    const body = await reportHtml(read(), true);
    const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } }).filter((t) => t.startsWith(".rep")).join("\n");
    const html = `<!DOCTYPE html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SP2 Dåsekontrol rapport ${today()}</title><style>body{margin:0;font-family:Arial,sans-serif}${css}@page{size:A4;margin:12mm}</style></head><body>${body}</body></html>`;
    await offerFile(new Blob([html], { type: "text/html" }), `SP2-rapport-${today()}.html`, "Rapporten er klar.");
  };
  refresh();
}
const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
async function reportHtml(o, embed) {
  if (!embed && repUrls.length > 400) repUrls.splice(0, 200).forEach(URL.revokeObjectURL);
  // Valgte afvigelsestyper (dåse / rør / anden)
  const cats = Object.keys(CHECKS).filter((k) => o.cats?.[k]);
  const relDev = (r) => cats.some((k) => r[k]);
  const regs = allRegsSorted(o.opg).filter((r) => o.withOk || relDev(r));
  const opgs = o.opg ? [o.opg] : [...OPG.keys()];
  const all = allRegsSorted(o.opg);
  const COLS = { devBox: ["Dåse", "devBoxNote", "OK"], devPipe: ["Rør/udsparing", "devPipeNote", "OK"], devOther: ["Anden afvigelse", "devOtherNote", "–"] };
  let h = `<div class="rep"><h1>SP2 Dåsekontrol – Stejlepladsen</h1>
    <div>Rapport ${new Date().toLocaleString("da-DK")} · ${o.opg ? esc(opgLabel(o.opg)) : "Alle opgange"} · ${all.length} registreringer · <span class="afv">${all.filter(relDev).length} med valgte afvigelser</span></div>
    <div>Viser: ${cats.length ? cats.map((k) => CHECKS[k].toLowerCase()).join(", ") : "ingen afvigelsestyper valgt"}${o.withOk ? " + registreringer uden afvigelse" : ""}</div>
    <h2>Opsummering</h2><table><tr><th>Opgang</th><th>Etage</th><th>Boliger med registrering</th><th>Registreringer</th>${cats.map((k) => `<th>${COLS[k][0]}</th>`).join("")}</tr>`;
  for (const oid of opgs) {
    const og = OPG.get(oid);
    for (const f of og.floors) {
      const us = unitsOn(oid, f).filter((u) => primaryFloor(u) === f);
      const s = statsUnits(us); if (!s.n) continue;
      const rr = us.flatMap((u) => regsOf(u.id));
      h += `<tr><td>${esc(oid)}</td><td>${esc(f)}</td><td>${s.done} / ${us.length}</td><td>${s.n}</td>${cats.map((k) => { const c = rr.filter((r) => r[k]).length; return `<td class="${c ? "afv" : ""}">${c}</td>`; }).join("")}</tr>`;
    }
  }
  h += `</table>`;
  const tags = opgs.filter((x) => TAG[x] && TAG[x].trim());
  if (tags.length) { h += `<h2>Noter om tag</h2><table>`; for (const x of tags) h += `<tr><th style="width:80px">${esc(x)}</th><td style="white-space:pre-wrap">${esc(TAG[x])}</td></tr>`; h += `</table>`; }
  h += `<h2>Registreringer</h2>`;
  if (!regs.length) h += `<p>Ingen registreringer at vise.</p>`;
  let curUnit = null, n = 0;
  const numbering = {}; for (const r of all) { numbering[r.unit] = (numbering[r.unit] || 0) + 1; r._nr = numbering[r.unit]; }
  for (const r of regs) {
    const u = UNITS.get(r.unit);
    if (r.unit !== curUnit) {
      if (curUnit) h += `</table>`;
      curUnit = r.unit;
      h += `<h3>${esc(u.o)} · ${esc(u.f.join("–"))} · ${esc(unitName(u))}${isProposed(u) ? " (foreslået navn)" : ""}${u.real ? ` · tegning side ${esc(u.id)}` : ""}</h3>
        <table><tr><th style="width:34px">Nr.</th><th style="width:22%">Type / rum</th>${cats.map((k) => `<th>${COLS[k][0]}</th>`).join("")}</tr>`;
    }
    let ph = "";
    if (o.photos === "all" || (o.photos === "dev" && relDev(r))) {
      for (const pid of r.photos) {
        const p = await getPhoto(pid); if (!p) continue;
        let src; if (embed) src = await blobToDataUrl(p.blob); else { src = URL.createObjectURL(p.blob); repUrls.push(src); }
        ph += `<img src="${src}" alt="">`;
      }
    }
    h += `<tr><td>${r._nr}</td><td><b>${esc(typeLabel(r))}</b><br>${esc(r.room)}</td>
      ${cats.map((k) => `<td>${r[k] ? `<span class="afv">AFVIGELSE</span>` : COLS[k][2]}${r[COLS[k][1]] ? `<br>${esc(r[COLS[k][1]])}` : ""}</td>`).join("")}</tr>
      ${ph ? `<tr><td></td><td colspan="${1 + cats.length}"><div class="ph">${ph}</div></td></tr>` : ""}`;
    n++;
  }
  if (curUnit) h += `</table>`;
  h += `</div>`;
  return h;
}

/* ---------------- Backup (ZIP uden komprimering) ---------------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function zipBlob(files) { // files: [{name, data:Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, nm, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    central.push(ch.buffer, nm);
    off += 30 + nm.length + sz;
  }
  const cs = central.reduce((a, b) => a + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}
async function unzip(file) {
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Ikke en gyldig backup-fil");
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder(), out = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Beskadiget backup-fil");
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
    if (method !== 0) throw new Error("Backup-filen er pakket om af et andet program. Brug den originale fil.");
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    out[name] = buf.subarray(ds, ds + size);
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function makeBackup() {
  toast("Laver backup …", 10000);
  const PRIVATE = (k) => k === "session" || k === "syncInit" || k === "dirtyMeta" || k === "pendingDel" || k.startsWith("cursor:");
  const regs = await dbGetAll("regs"), photos = await dbGetAll("photos"), meta = (await dbGetAll("meta")).filter((x) => !PRIVATE(x.key));
  const files = [];
  const pmeta = [];
  for (const p of photos) { files.push({ name: `billeder/${p.id}.jpg`, data: new Uint8Array(await p.blob.arrayBuffer()) }); pmeta.push({ id: p.id, reg: p.reg, created: p.created }); }
  const data = { app: "sp2-daasekontrol", format: 1, exported: nowIso(), regs, photos: pmeta, meta };
  files.unshift({ name: "data.json", data: new TextEncoder().encode(JSON.stringify(data, null, 1)) });
  const blob = await zipBlob(files);
  $("#toast").hidden = true;
  const ok = await offerFile(blob, `SP2-backup-${today()}.zip`, `Backup med ${regs.length} registreringer og ${photos.length} billeder er klar.`);
  if (ok) { await metaSet("lastBackup", nowIso()); if (parseRoute()[0] === "menu") render(); }
}
async function restoreBackup(file) {
  try {
    const z = await unzip(file);
    if (!z["data.json"]) throw new Error("Filen er ikke en SP2-backup");
    const data = JSON.parse(new TextDecoder().decode(z["data.json"]));
    if (data.app !== "sp2-daasekontrol") throw new Error("Filen er ikke en SP2-backup");
    if (!(await confirmBox(`Backup fra ${fmtDate(data.exported)} med ${data.regs.length} registreringer.\n\nDen flettes ind i det, der allerede er på telefonen. Intet bliver slettet. Er samme registrering ændret begge steder, beholdes den nyeste udgave.`, "Gendan", "primary"))) return;
    let added = 0, updated = 0, ph = 0;
    for (const p of data.photos) {
      if (await dbGet("photos", p.id)) continue;
      const bytes = z[`billeder/${p.id}.jpg`]; if (!bytes) continue;
      await dbPut("photos", { ...p, blob: new Blob([bytes.slice()], { type: "image/jpeg" }) }); ph++;
    }
    for (const r of data.regs) {
      const ex = await dbGet("regs", r.id);
      normReg(r);
      if (!ex) { await dbPut("regs", r); added++; }
      else if ((r.updated || "") > (ex.updated || "")) { await dbPut("regs", { ...r, photos: [...new Set([...r.photos, ...ex.photos])] }); updated++; }
    }
    const m = Object.fromEntries(data.meta.map((x) => [x.key, x.value]));
    const names = await metaGet("names", {}); await metaSet("names", { ...(m.names || {}), ...names });
    const conf = await metaGet("confirmed", {}); await metaSet("confirmed", { ...(m.confirmed || {}), ...conf });
    const tag = await metaGet("tag", {});
    for (const [k, v] of Object.entries(m.tag || {})) { if (!v || !v.trim()) continue; if (!tag[k] || !tag[k].trim()) tag[k] = v; else if (!tag[k].includes(v)) tag[k] = tag[k] + "\n--- fra backup ---\n" + v; }
    await metaSet("tag", tag);
    if (m.materials) { const cur = await metaGet("materials", {}); for (const [k, v] of Object.entries(m.materials)) if (!cur[k] || (v.updated || "") > (cur[k].updated || "")) cur[k] = v; await metaSet("materials", cur); }
    await loadAll();
    if (syncConfigured() && SESSION) { await markAllDirty(); syncSoon(500); }
    await dialog(`Gendannelse færdig.\n${added} nye registreringer, ${updated} opdateret, ${ph} billeder tilføjet.`, [{ label: "OK", value: 1, cls: "primary" }]);
    render();
  } catch (e) { console.error(e); dialog("Kunne ikke gendanne: " + e.message, [{ label: "OK", value: 1 }]); }
}

/* ---------------- Service worker og opdatering ---------------- */
function swVersion() {
  return new Promise((res) => {
    const c = navigator.serviceWorker?.controller; if (!c) return res(null);
    const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data); c.postMessage("version", [ch.port2]); setTimeout(() => res(null), 1500);
  });
}
async function initSW() {
  if (!("serviceWorker" in navigator)) return;
  let reloading = false, updateRequested = false;
  // Genindlæs kun når brugeren selv har trykket "Opdater nu" (ikke ved første installation)
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!updateRequested || reloading) return; reloading = true; location.reload(); });
  try {
    const reg = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
    const showUpdate = (w) => {
      $("#updateBar").hidden = false;
      $("#btnUpdate").onclick = async () => { await saveDraft(); updateRequested = true; $("#btnUpdate").textContent = "Opdaterer …"; w.postMessage("skipWaiting"); };
    };
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdate(w); });
    });
    const check = () => reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    setInterval(check, 30 * 60 * 1000);
  } catch (e) { console.warn("SW fejlede", e); }
}

/* ---------------- Start ---------------- */
(async function start() {
  try { await loadAll(); } catch (e) { $("#main").innerHTML = `<div class="card">Kan ikke åbne den lokale database: ${esc(e.message)}<br>Privat browsing understøttes ikke.</div>`; return; }
  try { await initSync(); } catch (e) { console.warn(e); }
  render();
  initSW();
  try { if (REGS.size) await navigator.storage?.persist?.(); } catch {}
})();
