import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, doc, collection, onSnapshot, setDoc, arrayUnion, arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCg1Knc4Bm8xbq73aQWxpd-E1Cxx8daQZg",
  authDomain: "etincle.firebaseapp.com",
  projectId: "etincle",
  storageBucket: "etincle.firebasestorage.app",
  messagingSenderId: "1046506841133",
  appId: "1:1046506841133:web:3a6e16bf55f290f9f584a4",
};

const PEOPLE = ["Ali", "Jibran", "Ayan"];
const SHORT = { Ali: "Al", Jibran: "Ji", Ayan: "Ay" };
const imgSrc = (id) => `images/${id}.jpg`;

const cfg = await (await fetch("round2.json")).json();
const CATS = cfg.categories;
const TOTAL = CATS.reduce((s, c) => s + c.quota, 0);
const SPLIT = new Set(cfg.round1Split);

const db = getFirestore(initializeApp(firebaseConfig));

// picks[person][categoryKey] = ["P044", ...]
const picks = {};
let me = load("me");
let catKey = CATS.some((c) => c.key === load("r2cat")) ? load("r2cat") : CATS[0].key;
let loaded = false;

const $ = (s) => document.querySelector(s);
function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch {} }

const cat = () => CATS.find((c) => c.key === catKey);
const picksOf = (p, key) => picks[p]?.[key] || [];
const pickers = (id, key) => PEOPLE.filter((p) => picksOf(p, key).includes(id));
const usedBy = (p) => CATS.reduce((s, c) => s + picksOf(p, c.key).length, 0);
const dotsFor = (id, key) => {
  const who = pickers(id, key);
  return PEOPLE.map((p) => `<i class="${who.includes(p) ? "yes" : ""}" title="${p}">${SHORT[p]}</i>`).join("");
};

/* ---------- standings ---------- */

// Rank by pick count, then by Round 1 strength (3/3 beats 2–1). Only 2+ picks can make it in.
function standings(c) {
  const rows = c.ids.map((id) => {
    const n = pickers(id, c.key).length;
    return { id, n, score: n * 10 + (SPLIT.has(id) ? 2 : 3) };
  });
  rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const cands = rows.filter((r) => r.n >= 2);
  if (cands.length <= c.quota) {
    cands.forEach((r) => (r.status = "in"));
  } else {
    const cut = cands[c.quota - 1].score;
    const above = cands.filter((r) => r.score > cut).length;
    const level = cands.filter((r) => r.score === cut).length;
    cands.forEach((r) => {
      r.status = r.score > cut ? "in" : r.score < cut ? "out" : above + level <= c.quota ? "in" : "tie";
    });
  }
  rows.forEach((r) => (r.status ??= "out"));
  const inCount = rows.filter((r) => r.status === "in").length;
  const ties = rows.filter((r) => r.status === "tie");
  return { rows, inCount, ties, tieSpots: c.quota - inCount };
}

/* ---------- screens ---------- */

function showWho() {
  $("#who").hidden = false;
  $("#main").hidden = true;
}

function setMe(name) {
  me = name;
  save("me", name);
  $("#who").hidden = true;
  $("#main").hidden = false;
  $("#me").textContent = name;
  render();
}

function setTab(tab) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  $("#view-pick").hidden = tab !== "pick";
  $("#view-results").hidden = tab !== "results";
  window.scrollTo(0, 0);
  render();
}

function setCat(key) {
  catKey = key;
  save("r2cat", key);
  renderPick();
  window.scrollTo(0, 0);
  $(`.cats [data-cat="${key}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

/* ---------- rendering ---------- */

function render() {
  if (!me) return;
  renderPick();
  renderResults();
}

function renderPick() {
  const c = cat();
  const mine = picksOf(me, c.key);

  $("#cats").innerHTML = CATS.map((k) => {
    const used = picksOf(me, k.key).length;
    const cls = [k.key === c.key && "on", used === k.quota && "full"].filter(Boolean).join(" ");
    return `<button data-cat="${k.key}" class="${cls}">${k.name} <small>${used}/${k.quota}</small></button>`;
  }).join("");

  $("#brief").innerHTML = `Pick your top <b>${c.quota}</b> of ${c.ids.length} ${c.name.toLowerCase()}.`;

  // Build the grid once per category; live updates only patch tiles so photos don't flicker.
  const grid = $("#pgrid");
  if (grid.dataset.cat !== c.key) {
    grid.dataset.cat = c.key;
    grid.innerHTML = c.ids.map((id) => {
      const note = cfg.notes[id] ? `<span class="note">${cfg.notes[id]}</span>` : "";
      return `<button class="ptile" data-id="${id}">
        <span class="pimg"><img loading="lazy" src="${imgSrc(id)}" alt="${id}">${note}
          <span class="check">&#10003;</span>
          <span class="zoombtn" data-zoom="${id}" aria-label="View larger"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></span>
        </span>
        <span class="tmeta"><span class="tid">${id}${SPLIT.has(id) ? ' <em class="r1">2–1</em>' : ""}</span><span class="dots"></span></span>
      </button>`;
    }).join("");
  }
  grid.querySelectorAll(".ptile").forEach((t) => {
    const on = mine.includes(t.dataset.id);
    t.classList.toggle("on", on);
    t.setAttribute("aria-pressed", on);
    t.querySelector(".dots").innerHTML = dotsFor(t.dataset.id, c.key);
  });

  $("#usedText").textContent = `${mine.length} of ${c.quota} picked · ${usedBy(me)}/${TOTAL} overall`;
  const i = CATS.indexOf(c);
  const next = CATS[(i + 1) % CATS.length];
  $("#nextCat").textContent = `${next.name} ›`;
  $("#nextCat").dataset.cat = next.key;
}

function renderResults() {
  $("#people").innerHTML = PEOPLE.map((p) => {
    const n = usedBy(p);
    return `<div class="person ${n === TOTAL ? "done" : ""}"><b>${p}</b><span>${n}/${TOTAL}</span><div class="bar"><i style="width:${(n / TOTAL) * 100}%"></i></div></div>`;
  }).join("");

  let totalIn = 0, totalTies = 0;
  $("#standings").innerHTML = CATS.map((c) => {
    const { rows, inCount, ties, tieSpots } = standings(c);
    totalIn += inCount;
    totalTies += ties.length;
    const shown = rows.filter((r) => r.n > 0);
    const unpicked = rows.length - shown.length;
    const tieNote = ties.length ? ` · <span class="tienote">${ties.length} tied for ${tieSpots}</span>` : "";
    return `<section class="scard">
      <h3>${c.name}<span>${inCount}/${c.quota} in${tieNote}</span></h3>
      ${shown.map((r) => `<button class="srow ${r.status}" data-zoom="${r.id}">
        <img loading="lazy" src="${imgSrc(r.id)}" alt="">
        <span class="sid">${r.id}${SPLIT.has(r.id) ? ' <em class="r1">2–1</em>' : ""}</span>
        <span class="dots">${dotsFor(r.id, c.key)}</span>
        <span class="pill ${r.status === "in" ? "keep" : r.status === "tie" ? "tie" : "waiting"}">${r.status === "in" ? "In" : r.status === "tie" ? "Tie" : "Out"}</span>
      </button>`).join("")}
      ${unpicked ? `<p class="unpicked">${unpicked} ${shown.length ? "more" : ""} with no picks yet</p>` : ""}
    </section>`;
  }).join("");

  $("#overall").innerHTML = `<b>${totalIn}</b> of ${TOTAL} spots filled${totalTies ? ` · <span class="tienote">${totalTies} tied</span>` : ""}`;

  $("#asideTitle").textContent = `Set aside before Round 2 (${cfg.setAside.length})`;
  $("#asideList").innerHTML = cfg.setAside.map((s) => `<button class="srow" data-zoom="${s.id}">
      <img loading="lazy" src="${imgSrc(s.id)}" alt=""><span class="sid">${s.id}</span><span class="reason">${s.reason}</span>
    </button>`).join("");
}

/* ---------- actions ---------- */

function toggle(id) {
  const c = cat();
  const mine = picksOf(me, c.key);
  const has = mine.includes(id);
  if (!has && mine.length >= c.quota) {
    toast(`All ${c.quota} ${c.name.toLowerCase()} picks used. Unpick one first.`);
    return;
  }
  setDoc(doc(db, "picks", me), { [c.key]: has ? arrayRemove(id) : arrayUnion(id) }, { merge: true })
    .catch((e) => banner(`Couldn't save your pick: ${e.message}`));
  if (!has && mine.length + 1 === c.quota) toast(`${c.name} done ✓`);
}

function zoom(id) {
  const z = $("#zoom");
  z.querySelector("img").src = imgSrc(id);
  z.hidden = false;
}

function banner(msg) {
  const b = $("#banner");
  b.textContent = msg;
  b.hidden = !msg;
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

async function copyList() {
  const lines = [];
  let n = 0;
  for (const c of CATS) {
    const { rows, ties, tieSpots } = standings(c);
    const ins = rows.filter((r) => r.status === "in").map((r) => r.id);
    n += ins.length;
    let line = `${c.name} (${ins.length}/${c.quota}): ${ins.join(", ") || "none"}`;
    if (ties.length) line += ` | Tie for ${tieSpots}: ${ties.map((r) => r.id).join(", ")}`;
    lines.push(line);
  }
  const text = `Etincele final picks (${n}/${TOTAL})\n` + lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    prompt("Copy this:", text);
  }
}

/* ---------- events ---------- */

document.querySelectorAll("[data-name]").forEach((b) => b.addEventListener("click", () => setMe(b.dataset.name)));
$("#me").addEventListener("click", showWho);
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

$("#cats").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (b) setCat(b.dataset.cat);
});
$("#nextCat").addEventListener("click", (e) => setCat(e.currentTarget.dataset.cat));

$("#pgrid").addEventListener("click", (e) => {
  const z = e.target.closest("[data-zoom]");
  if (z) return zoom(z.dataset.zoom);
  const tile = e.target.closest(".ptile");
  if (tile) toggle(tile.dataset.id);
});
$("#view-results").addEventListener("click", (e) => {
  const z = e.target.closest("[data-zoom]");
  if (z) zoom(z.dataset.zoom);
});
$("#copy").addEventListener("click", copyList);
$("#zoom").addEventListener("click", () => ($("#zoom").hidden = true));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#zoom").hidden = true; });

/* ---------- live data ---------- */

// Firestore quietly queues writes while it can't reach the server, so surface that state.
function setSync(state) {
  const el = $("#sync");
  el.className = `sync ${state}`;
  el.textContent = { ok: "Live", saving: "Saving…", offline: "Not connected" }[state];
  if (state === "ok") banner("");
}
setSync("offline");
const offlineWarning = setTimeout(() => {
  if (!loaded) banner("Can't reach the database, so picks aren't being saved. Check your connection and reload.");
}, 10000);

onSnapshot(
  collection(db, "picks"),
  { includeMetadataChanges: true },
  (snap) => {
    snap.docChanges().forEach((c) => {
      if (c.type === "removed") delete picks[c.doc.id];
      else picks[c.doc.id] = c.doc.data();
    });
    const { fromCache, hasPendingWrites } = snap.metadata;
    if (!fromCache && !loaded) {
      loaded = true;
      clearTimeout(offlineWarning);
    }
    setSync(fromCache ? "offline" : hasPendingWrites ? "saving" : "ok");
    render();
  },
  (err) => {
    clearTimeout(offlineWarning);
    setSync("offline");
    banner(`Can't reach the database (${err.code}). ${err.message}`);
  }
);

if (PEOPLE.includes(me)) setMe(me);
else showWho();
